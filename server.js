const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Trust Railway proxy (nødvendig for korrekt rate limiting) ──
app.set('trust proxy', 1);

// ── Sikkerhetshoder ──
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'"],   // inline-script påkrevd av HTML-filene
      scriptSrcAttr:  ["'unsafe-inline'"],             // onclick/onchange-attributter
      styleSrc:       ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:        ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:         ["'self'", 'data:'],
      connectSrc:     ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc:      ["'none'"],
      baseUri:        ["'self'"],
      formAction:     ["'self'"],
      upgradeInsecureRequests: [],
    }
  }
}));
app.use((req, res, next) => {
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()');
  next();
});

// ── Body-størrelse maks 20kb ──
app.use(express.json({ limit: '20kb' }));

// ── Skjult admin-URL (MÅ være før express.static) ──
const ADMIN_PATH = process.env.ADMIN_PATH || '/bellevue';
app.get(ADMIN_PATH, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// ── Blokker direkte tilgang til admin.html ──
app.use((req, res, next) => {
  if (req.path.toLowerCase() === '/admin.html') return res.status(404).send('Not found');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ── Database (Postgres) ──
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// ── Backup-database (valgfri) ──
const backupPool = process.env.BACKUP_DATABASE_URL ? new Pool({
  connectionString: process.env.BACKUP_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
}) : null;

async function backupWrite(query, params) {
  if (!backupPool) return;
  try {
    await backupPool.query(query, params);
  } catch (e) {
    console.error('⚠️  Backup-skriving feilet:', e.message);
  }
}

async function initBackupDB() {
  if (!backupPool) return;
  await backupPool.query(`
    CREATE TABLE IF NOT EXISTS orders    (id TEXT PRIMARY KEY, data JSONB NOT NULL);
    CREATE TABLE IF NOT EXISTS inquiries (id TEXT PRIMARY KEY, data JSONB NOT NULL);
    CREATE TABLE IF NOT EXISTS consents  (id TEXT PRIMARY KEY, data JSONB NOT NULL);
  `);
  console.log('✅ Backup-database klar');
}

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders    (id TEXT PRIMARY KEY, data JSONB NOT NULL);
    CREATE TABLE IF NOT EXISTS inquiries (id TEXT PRIMARY KEY, data JSONB NOT NULL);
    CREATE TABLE IF NOT EXISTS boxes     (id TEXT PRIMARY KEY, data JSONB NOT NULL);
    CREATE TABLE IF NOT EXISTS consents  (id TEXT PRIMARY KEY, data JSONB NOT NULL);
    CREATE TABLE IF NOT EXISTS bags      (id TEXT PRIMARY KEY, data JSONB NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions  (
      token TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      role TEXT NOT NULL,
      display TEXT NOT NULL,
      initials TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      resource_id TEXT,
      details JSONB
    );
    CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value BIGINT NOT NULL DEFAULT 0);
    INSERT INTO counters (name, value) VALUES ('orders', 0) ON CONFLICT (name) DO NOTHING;
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      product TEXT NOT NULL,
      qty INTEGER NOT NULL,
      customer TEXT NOT NULL,
      picked_by TEXT,
      note TEXT,
      timestamp TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✅ Database klar');
}

async function nextCounter(name) {
  const { rows } = await pool.query(
    'UPDATE counters SET value = value + 1 WHERE name = $1 RETURNING value',
    [name]
  );
  return Number(rows[0].value);
}

// ── Input-validering ──
function str(val, max = 200) {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, max);
}
function isEmail(val) {
  // Exclude characters that can break HTML attributes or be used for injection
  return typeof val === 'string' && /^[^\s@"'<>&]+@[^\s@"'<>&]+\.[^\s@"'<>&]+$/.test(val.trim()) && val.length <= 200;
}

// ── Prisliste (eneste gyldige produkter og priser) ──
const PRICE_LIST = {
  'stilk':          { name: 'Blader + løk/stilk – Frossen',        price: 50,  unit: '100g' },
  'stilk250':       { name: 'Blader + løk/stilk 250g – Frossen',   price: 100, unit: '250g' },
  'pose':           { name: 'Familiepose – Frossen',                price: 200, unit: '500g' },
  'stilk_fersk':    { name: 'Blader + løk/stilk – Fersk',          price: 60,  unit: '100g' },
  'stilk250_fersk': { name: 'Blader + løk/stilk 250g – Fersk',     price: 120, unit: '250g' },
  'pose_fersk':     { name: 'Familiepose – Fersk',                  price: 240, unit: '500g' },
};
const MAX_QTY = 50;

// ── Auth ──
const USERS = {
  'FelixWilliam':    { password: process.env.PW_FELIX,  role: 'admin',      initials: 'FW', display: 'FelixWilliam' },
  'SverreFredriksen':{ password: process.env.PW_SVERRE, role: 'admin',      initials: 'SF', display: 'Sverre' },
  'EirikNordtug':    { password: process.env.PW_EIRIK,  role: 'admin',      initials: 'EN', display: 'Eirik' },
  'Edvard':          { password: process.env.PW_EDVARD,      role: 'admin', initials: 'ED', display: 'Edvard' },
  'Aleksander':      { password: process.env.PW_ALEKSANDER, role: 'admin', initials: 'AL', display: 'Aleksander' }
};

const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 timer

// Hash passordene ved oppstart (kjøres én gang)
const hashedPasswords = {};
async function initPasswords() {
  for (const [username, user] of Object.entries(USERS)) {
    if (user.password) {
      hashedPasswords[username] = await bcrypt.hash(user.password, 10);
    }
  }
  console.log('✅ Passord-hashing klar');
}

// Rydd utløpte sesjoner i DB hvert 30. minutt
setInterval(async () => {
  try {
    await pool.query('DELETE FROM sessions WHERE created_at < $1', [Date.now() - SESSION_TTL]);
  } catch (e) { console.error('⚠️ Sesjon-opprydding feilet:', e.message); }
}, 30 * 60 * 1000);

// Audit-logg
async function auditLog(username, action, resource, resourceId, details) {
  try {
    const id = crypto.randomUUID();
    await pool.query(
      'INSERT INTO audit_log (id, username, action, resource, resource_id, details) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, username, action, resource, resourceId || null, JSON.stringify(details || {})]
    );
  } catch (e) { console.error('⚠️ Audit-logg feilet:', e.message); }
}

// ── Rate limiting ──
const loginLimiter  = rateLimit({ windowMs: 15 * 60 * 1000, max: 5,  skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false });
const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const logoutLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

app.post('/api/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Mangler felt' });
    const user = USERS[username];
    const hash = hashedPasswords[username];
    const ok = hash && await bcrypt.compare(password, hash);
    if (!user || !ok) {
      return res.status(401).json({ error: 'Feil brukernavn eller passord' });
    }
    const token = crypto.randomUUID();
    await pool.query(
      'INSERT INTO sessions (token, username, role, display, initials, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [token, username, user.role, user.display, user.initials, Date.now()]
    );
    await auditLog(username, 'login', 'sesjon', null, {});
    res.json({ ok: true, token, role: user.role, display: user.display, initials: user.initials });
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

app.post('/api/logout', logoutLimiter, async (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token) await pool.query('DELETE FROM sessions WHERE token = $1', [token]).catch(() => {});
  res.json({ ok: true });
});

async function requireAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token) return res.status(401).json({ error: 'Ikke autorisert' });
  try {
    const { rows } = await pool.query('SELECT * FROM sessions WHERE token = $1', [token]);
    if (!rows.length) return res.status(401).json({ error: 'Ikke autorisert' });
    const session = rows[0];
    if (Date.now() - session.created_at > SESSION_TTL) {
      await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
      return res.status(401).json({ error: 'Sesjon utløpt – logg inn på nytt' });
    }
    req.user = session;
    next();
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Ikke tilgang' });
    next();
  });
}

// ── E-post (Resend) ──
const FROM_ADDRESS = process.env.FROM_EMAIL
  ? `Ramsløk Nesodden <${process.env.FROM_EMAIL}>`
  : 'Ramsløk Nesodden <onboarding@resend.dev>';

async function sendEmail(subject, text, to) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.warn('⚠️  RESEND_API_KEY mangler – e-post deaktivert'); return; }
  const adminEmail = process.env.ADMIN_EMAIL || process.env.GMAIL_USER;
  const recipient = to || adminEmail;
  if (!recipient) { console.warn('⚠️  Ingen mottaker – sett ADMIN_EMAIL i Railway'); return; }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_ADDRESS, to: recipient, subject, text })
    });
    const data = await res.json();
    if (res.ok) console.log(`✅ E-post sendt til ${recipient}`);
    else console.error('❌ E-postfeil:', JSON.stringify(data));
  } catch (e) {
    console.error('❌ E-postfeil:', e.message);
  }
}

// ── Ordre-API ──
app.get('/api/orders', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT data FROM orders ORDER BY (data->>'timestamp') DESC");
    res.json(rows.map(r => r.data));
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

app.post('/api/orders', publicLimiter, async (req, res) => {
  try {
    const name     = str(req.body.name, 100);
    const phone    = str(req.body.phone, 20);
    const email    = isEmail(req.body.email) ? req.body.email.trim() : '';
    const note            = str(req.body.note, 500);
    const delivery        = str(req.body.delivery, 100);
    const deliveryAddress = str(req.body.deliveryAddress, 200);
    const items = Array.isArray(req.body.items)
      ? req.body.items.slice(0, 20)
          .filter(i => PRICE_LIST[i.id] || PRICE_LIST[str(i.name, 100)])
          .map(i => {
            const product = PRICE_LIST[i.id] || Object.values(PRICE_LIST).find(p => p.name === str(i.name, 100));
            const qty = typeof i.qty === 'number' ? Math.min(Math.max(1, Math.floor(i.qty)), MAX_QTY) : 0;
            return product && qty >= 1 ? { name: product.name, qty, unit: product.unit, price: product.price } : null;
          })
          .filter(Boolean)
      : [];
    const total = Math.round(items.reduce((sum, i) => sum + i.qty * i.price, 0));

    if (!name || !phone) return res.status(400).json({ error: 'Navn og telefon er påkrevd' });
    if (!items.length) return res.status(400).json({ error: 'Ingen gyldige produkter i bestillingen' });

    const num = await nextCounter('orders');
    const orderNumber   = 'RS-' + String(num).padStart(4, '0');
    const trackingNumber = 'SP-' + String(num).padStart(4, '0');
    const order = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), status: 'venter', orderNumber, trackingNumber, name, phone, email, note, delivery, deliveryAddress, total, items };
    await pool.query('INSERT INTO orders (id, data) VALUES ($1, $2)', [order.id, JSON.stringify(order)]);
    backupWrite('INSERT INTO orders (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data', [order.id, JSON.stringify(order)]);

    // Lagre samtykke til kjøpsvilkår
    const consent = { id: crypto.randomUUID(), name, email, phone, timestamp: order.timestamp, termsVersion: '2026-04', orderId: order.id };
    await pool.query('INSERT INTO consents (id, data) VALUES ($1, $2)', [consent.id, JSON.stringify(consent)]);
    backupWrite('INSERT INTO consents (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data', [consent.id, JSON.stringify(consent)]);

    const itemsText = items.map(i => `  - ${i.name}: ${i.qty} × ${i.unit} = ${i.qty * i.price} kr`).join('\n');
    await sendEmail(
      `Salg! – ${name}`,
      `Ny ramsløk-bestilling!\n\nNavn: ${name}\nTelefon: ${phone}\nE-post: ${email}\n\nProdukter:\n${itemsText}\n\nTotal: ${total} kr\nLevering: ${delivery}\nKommentar: ${note || '–'}\n\nOrdre-ID: ${order.id}\nBestillingsnr: ${orderNumber}\nTidspunkt: ${new Date(order.timestamp).toLocaleString('nb-NO')}`
    );

    res.json({ ok: true, id: order.id });
  } catch (err) {
    console.error('POST /api/orders feil:', err);
    res.status(500).json({ error: 'Serverfeil' });
  }
});

app.put('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT data FROM orders WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Ikke funnet' });
    const existing = rows[0].data;

    const VALID_ORDER_STATUSES = new Set(['venter', 'bekreftet', 'avbestilt', 'arkivert']);
    const fieldLimits = {
      name: 100, phone: 20, email: 100, delivery: 100,
      status: 50, pickupPlace: 100, pickupTime: 100,
      adminNote: 500, note: 500,
      boxId: 100, bagId: 100, paid: 10, paidAt: 50
    };
    const allowedStr = Object.keys(fieldLimits);
    const updates = {};
    allowedStr.forEach(k => {
      if (req.body[k] !== undefined) updates[k] = str(String(req.body[k]), fieldLimits[k]);
    });
    if (updates.status !== undefined && !VALID_ORDER_STATUSES.has(updates.status)) delete updates.status;
    if (updates.email !== undefined && updates.email && !isEmail(updates.email)) delete updates.email;

    // pickedBy: nå et map { itemIndex: pukkerNavn } per pose i bestillingen
    if (req.body.pickedBy !== undefined) {
      if (req.body.pickedBy && typeof req.body.pickedBy === 'object' && !Array.isArray(req.body.pickedBy)) {
        const cleaned = {};
        for (const [k, v] of Object.entries(req.body.pickedBy)) {
          const key = str(String(k), 50);
          const val = str(String(v ?? ''), 100);
          if (key && val) cleaned[key] = val;
        }
        updates.pickedBy = cleaned;
      } else {
        updates.pickedBy = {};
      }
    }

    // Items + auto-rekalkulert total
    if (Array.isArray(req.body.items)) {
      const rawItems = req.body.items.slice(0, 20);
      const items = rawItems.map(i => {
        const qty = typeof i.qty === 'number' ? Math.min(Math.max(1, Math.floor(i.qty)), MAX_QTY) : 1;
        const byId = PRICE_LIST[str(i.id, 50)];
        if (byId) return { name: byId.name, qty, unit: byId.unit, price: byId.price };
        const byName = Object.values(PRICE_LIST).find(p => p.name === str(i.name, 100));
        if (byName) return { name: byName.name, qty, unit: byName.unit, price: byName.price };
        const label = str(i.name || i.id || '', 100);
        return label ? { name: label, qty, unit: str(i.unit || 'stk', 50), price: typeof i.price === 'number' ? i.price : 0 } : null;
      }).filter(Boolean);
      if (items.length) {
        updates.items = items;
        updates.total = Math.round(items.reduce((sum, i) => sum + i.qty * i.price, 0));
      }
    }

    // Atomisk pose-swap: håndterer både frigjøring av gammel pose og kobling av ny
    const oldBagId = existing.bagId || '';
    const newBagId = updates.bagId !== undefined ? updates.bagId : oldBagId;
    if (newBagId !== oldBagId) {
      // Frigjør gammel pose for denne bestillingen
      if (oldBagId) {
        const r = await pool.query('SELECT data FROM bags WHERE id = $1', [oldBagId]);
        if (r.rows.length) {
          const updatedBag = { ...r.rows[0].data, status: 'ledig' };
          delete updatedBag.orderId;
          await pool.query('UPDATE bags SET data = $1 WHERE id = $2', [JSON.stringify(updatedBag), oldBagId]);
        }
      }
      // Tildel ny pose – og hvis posen var koblet til en annen bestilling, fjern koblingen der
      if (newBagId) {
        const r = await pool.query('SELECT data FROM bags WHERE id = $1', [newBagId]);
        if (r.rows.length) {
          const bagData = r.rows[0].data;
          if (bagData.orderId && bagData.orderId !== req.params.id) {
            const otherR = await pool.query('SELECT data FROM orders WHERE id = $1', [bagData.orderId]);
            if (otherR.rows.length) {
              const otherOrder = { ...otherR.rows[0].data };
              delete otherOrder.bagId;
              await pool.query('UPDATE orders SET data = $1 WHERE id = $2', [JSON.stringify(otherOrder), bagData.orderId]);
            }
          }
          const updatedBag = { ...bagData, status: 'tildelt', orderId: req.params.id };
          await pool.query('UPDATE bags SET data = $1 WHERE id = $2', [JSON.stringify(updatedBag), newBagId]);
        }
      }
    }

    const updated = { ...existing, ...updates };
    if (updates.bagId === '') delete updated.bagId;
    if (updates.boxId === '') delete updated.boxId;

    await pool.query('UPDATE orders SET data = $1 WHERE id = $2', [JSON.stringify(updated), req.params.id]);
    auditLog(req.user.username, 'oppdater', 'ordre', req.params.id, updates);

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/orders/:id feil:', err);
    res.status(500).json({ error: 'Serverfeil' });
  }
});

app.delete('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
    auditLog(req.user.username, 'slett', 'ordre', req.params.id, {});
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

// ── Salgsregister ──
app.get('/api/admin/sales', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, product, qty, customer, picked_by, note, timestamp FROM sales ORDER BY timestamp DESC');
    res.json(rows);
  } catch (err) {
    console.error('GET /api/admin/sales feil:', err);
    res.status(500).json({ error: 'Serverfeil' });
  }
});

app.post('/api/admin/sales', requireAdmin, async (req, res) => {
  try {
    const customer = str(req.body.customer, 100);
    const pickedBy = str(req.body.pickedBy ?? req.body.picked_by, 100);
    const note     = str(req.body.note, 500);

    // Aksepterer enten items-array (nytt) eller enkelt product+qty (bakoverkompatibel)
    let rawItems = [];
    if (Array.isArray(req.body.items) && req.body.items.length) {
      rawItems = req.body.items.slice(0, 20);
    } else if (req.body.product) {
      rawItems = [{ product: req.body.product, qty: req.body.qty }];
    }

    const items = rawItems.map(it => {
      const product = str(it.product || it.name, 100);
      const qty = typeof it.qty === 'number' ? Math.min(Math.max(1, Math.floor(it.qty)), MAX_QTY) : parseInt(it.qty);
      return product && qty >= 1 ? { product, qty } : null;
    }).filter(Boolean);

    if (!customer) return res.status(400).json({ error: 'Kundenavn er påkrevd' });
    if (!items.length) return res.status(400).json({ error: 'Minst ett produkt med antall ≥1 er påkrevd' });

    const ids = [];
    for (const item of items) {
      const id = crypto.randomUUID();
      await pool.query(
        'INSERT INTO sales (id, product, qty, customer, picked_by, note) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, item.product, item.qty, customer, pickedBy || null, note || null]
      );
      ids.push(id);
    }
    auditLog(req.user.username, 'opprett', 'salg', ids[0], { items, customer, count: ids.length });
    res.json({ ok: true, ids, count: ids.length });
  } catch (err) {
    console.error('POST /api/admin/sales feil:', err);
    res.status(500).json({ error: 'Serverfeil' });
  }
});

// ── Henvendelses-API ──
app.get('/api/inquiries', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT data FROM inquiries ORDER BY (data->>'timestamp') DESC");
    res.json(rows.map(r => r.data));
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

app.post('/api/inquiries', publicLimiter, async (req, res) => {
  try {
    const name    = str(req.body.name, 100);
    const email   = isEmail(req.body.email) ? req.body.email.trim() : '';
    const phone   = str(req.body.phone, 20);
    const message = str(req.body.message, 2000);

    if (!name || !message) return res.status(400).json({ error: 'Navn og melding er påkrevd' });

    const inquiry = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), status: 'ny', name, email, phone, message };
    await pool.query('INSERT INTO inquiries (id, data) VALUES ($1, $2)', [inquiry.id, JSON.stringify(inquiry)]);
    backupWrite('INSERT INTO inquiries (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data', [inquiry.id, JSON.stringify(inquiry)]);

    await sendEmail(
      `Spørsmål – ${name}`,
      `Ny henvendelse!\n\nNavn: ${name}\nE-post: ${email}\nTelefon: ${phone || '–'}\n\nMelding:\n${message}\n\nID: ${inquiry.id}\nTidspunkt: ${new Date(inquiry.timestamp).toLocaleString('nb-NO')}`
    );

    res.json({ ok: true, id: inquiry.id });
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

app.put('/api/inquiries/:id', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT data FROM inquiries WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Ikke funnet' });
    const VALID_INQUIRY_STATUSES = new Set(['ny', 'lest']);
    const s = str(req.body.status, 20);
    const updated = { ...rows[0].data, ...(VALID_INQUIRY_STATUSES.has(s) ? { status: s } : {}) };
    await pool.query('UPDATE inquiries SET data = $1 WHERE id = $2', [JSON.stringify(updated), req.params.id]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

app.delete('/api/inquiries/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM inquiries WHERE id = $1', [req.params.id]);
    auditLog(req.user.username, 'slett', 'henvendelse', req.params.id, {});
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

// ── Samtykke-API ──
app.get('/api/consents', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT data FROM consents ORDER BY (data->>'timestamp') DESC");
    res.json(rows.map(r => r.data));
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

app.delete('/api/consents/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM consents WHERE id = $1', [req.params.id]);
    auditLog(req.user.username, 'slett', 'samtykke', req.params.id, {});
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

// ── Lager/Esker-API ──
app.get('/api/boxes', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT data FROM boxes ORDER BY (data->>'timestamp') DESC");
    res.json(rows.map(r => r.data));
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

app.post('/api/boxes', requireAdmin, async (req, res) => {
  try {
    const pickDate   = str(req.body.pickDate, 20);
    const area       = str(req.body.area, 200);
    const pickTime   = str(req.body.pickTime || '', 10);
    const packTime   = str(req.body.packTime || '', 10);
    const note       = str(req.body.note || '', 500);
    const kjølelager = req.body.kjølelager === true || req.body.kjølelager === 'true';

    if (!pickDate || !area) return res.status(400).json({ error: 'Mangler påkrevde felt' });

    // Generer neste tracking-nummer basert på høyeste eksisterende
    const { rows: all } = await pool.query("SELECT data->>'trackingId' AS tid FROM boxes");
    const nums = all.map(r => parseInt((r.tid || '').replace('ESK-', '')) || 0);
    const nextNum = (Math.max(0, ...nums) + 1).toString().padStart(3, '0');

    const box = {
      id: crypto.randomUUID(),
      trackingId: `ESK-${nextNum}`,
      timestamp: new Date().toISOString(),
      status: 'på lager',
      pickDate, area, pickTime, packTime, note, kjølelager,
      bags: 0, weightPerBag: 0, totalWeight: 0,
      poseList: []
    };
    await pool.query('INSERT INTO boxes (id, data) VALUES ($1, $2)', [box.id, JSON.stringify(box)]);
    res.json({ ok: true, id: box.id, trackingId: box.trackingId });
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

app.put('/api/boxes/:id', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT data FROM boxes WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Ikke funnet' });
    const box = rows[0].data;
    const updated = { ...box };

    // Oppdater status
    const VALID_BOX_STATUSES = new Set(['på lager', 'solgt', 'kassert']);
    if (req.body.status !== undefined) {
      const s = str(String(req.body.status), 50);
      if (VALID_BOX_STATUSES.has(s)) updated.status = s;
    }
    if (req.body.kjølelager !== undefined) {
      updated.kjølelager = req.body.kjølelager === true || req.body.kjølelager === 'true';
    }

    // Legg til en pose
    if (req.body.addBag !== undefined) {
      const poseList = Array.isArray(updated.poseList) ? [...updated.poseList] : [];
      const nr = poseList.length + 1;
      const vekt = typeof req.body.addBag.vekt === 'number' ? Math.max(0, req.body.addBag.vekt) : 0;
      const sporingsnummer = str(req.body.addBag.sporingsnummer || '', 100);
      poseList.push({ nr, vekt, sporingsnummer });
      updated.poseList = poseList;
      updated.bags = poseList.length;
      updated.totalWeight = poseList.reduce((s, p) => s + (p.vekt || 0), 0);
    }

    await pool.query('UPDATE boxes SET data = $1 WHERE id = $2', [JSON.stringify(updated), req.params.id]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

app.delete('/api/boxes/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM boxes WHERE id = $1', [req.params.id]);
    auditLog(req.user.username, 'slett', 'eske', req.params.id, {});
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

// ── Løse poser (uavhengige av esker) ──
app.get('/api/bags', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT data FROM bags ORDER BY (data->>'timestamp') DESC NULLS LAST");
    res.json(rows.map(r => r.data));
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

app.post('/api/bags', requireAdmin, async (req, res) => {
  try {
    const sporingsnummer = str(req.body.sporingsnummer || '', 100);
    const vekt           = typeof req.body.vekt === 'number' ? Math.max(0, req.body.vekt) : 0;
    const dato           = str(req.body.dato || '', 20);
    const note           = str(req.body.note || '', 500);
    if (!sporingsnummer || !vekt || !dato) return res.status(400).json({ error: 'Mangler påkrevde felt' });
    const bag = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), status: 'ledig', sporingsnummer, vekt, dato, note };
    await pool.query('INSERT INTO bags (id, data) VALUES ($1, $2)', [bag.id, JSON.stringify(bag)]);
    res.json({ ok: true, id: bag.id });
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

app.put('/api/bags/:id', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT data FROM bags WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Ikke funnet' });
    const updated = { ...rows[0].data };
    const VALID_BAG_STATUSES = new Set(['ledig', 'tildelt', 'levert']);
    if (req.body.status !== undefined) {
      const s = str(String(req.body.status), 50);
      if (VALID_BAG_STATUSES.has(s)) updated.status = s;
    }
    if (req.body.orderId !== undefined) updated.orderId = str(String(req.body.orderId), 50);
    if (req.body.pickedBy !== undefined) updated.pickedBy = str(String(req.body.pickedBy ?? ''), 100);
    await pool.query('UPDATE bags SET data = $1 WHERE id = $2', [JSON.stringify(updated), req.params.id]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

app.delete('/api/bags/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM bags WHERE id = $1', [req.params.id]);
    auditLog(req.user.username, 'slett', 'pose', req.params.id, {});
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

// ── Admin-opprettet ordre (bypasser samtykke og e-post) ──
app.post('/api/admin/orders', requireAdmin, async (req, res) => {
  try {
    const name     = str(req.body.name, 100);
    const phone    = str(req.body.phone, 20);
    const email    = isEmail(req.body.email) ? req.body.email.trim() : '';
    const note     = str(req.body.note, 500);
    const delivery = str(req.body.delivery, 100);

    if (!name || !phone) return res.status(400).json({ error: 'Navn og telefon er påkrevd' });

    const rawItems = Array.isArray(req.body.items) ? req.body.items.slice(0, 20) : [];
    console.log('POST /api/admin/orders – mottatt items:', JSON.stringify(rawItems));
    const items = rawItems.map(i => {
      const qty = typeof i.qty === 'number' ? Math.min(Math.max(1, Math.floor(i.qty)), MAX_QTY) : 1;
      // 1) Lookup by PRICE_LIST key (id-felt)
      const byId = PRICE_LIST[str(i.id, 50)];
      if (byId) return { name: byId.name, qty, unit: byId.unit, price: byId.price };
      // 2) Lookup by exact product name
      const byName = Object.values(PRICE_LIST).find(p => p.name === str(i.name, 100));
      if (byName) return { name: byName.name, qty, unit: byName.unit, price: byName.price };
      // 3) Free-form fallback (admin er autentisert – stol på input)
      const label = str(i.name || i.id || '', 100);
      return label ? { name: label, qty, unit: str(i.unit || 'stk', 50), price: 0 } : null;
    }).filter(Boolean);

    if (!items.length) return res.status(400).json({ error: 'Ingen gyldige produkter' });

    const total = Math.round(items.reduce((sum, i) => sum + i.qty * i.price, 0));
    const num = await nextCounter('orders');
    const orderNumber    = 'RS-' + String(num).padStart(4, '0');
    const trackingNumber = 'SP-' + String(num).padStart(4, '0');
    const order = {
      id: crypto.randomUUID(), timestamp: new Date().toISOString(),
      status: 'venter', orderNumber, trackingNumber, name, phone, email, note, delivery, total, items, source: 'admin'
    };

    await pool.query('INSERT INTO orders (id, data) VALUES ($1, $2)', [order.id, JSON.stringify(order)]);
    await auditLog(req.user.username, 'opprett', 'ordre', order.id, { name, source: 'admin' });

    res.json({ ok: true, id: order.id });
  } catch (err) {
    console.error('POST /api/admin/orders feil:', err);
    res.status(500).json({ error: 'Serverfeil' });
  }
});

// ── DIREKTE SALG (admin) ──
app.post('/api/admin/direct-sale', requireAdmin, async (req, res) => {
  try {
    const name    = str(req.body.name, 100);
    const phone   = str(req.body.phone, 20);
    const email   = isEmail(req.body.email) ? req.body.email.trim() : '';
    const note    = str(req.body.note, 500);
    const bagId   = req.body.bagId  ? str(req.body.bagId,  100) : null;
    const boxId   = req.body.boxId  ? str(req.body.boxId,  100) : null;
    const paid    = req.body.paid   ? true : false;
    const paymentMethod = str(req.body.paymentMethod || '', 50);

    if (!name || !phone) return res.status(400).json({ error: 'Navn og telefon er påkrevd' });

    const rawItems = Array.isArray(req.body.items) ? req.body.items.slice(0, 20) : [];
    const items = rawItems.map(i => {
      const qty = typeof i.qty === 'number' ? Math.min(Math.max(1, Math.floor(i.qty)), MAX_QTY) : 1;
      const byId = PRICE_LIST[str(i.id, 50)];
      if (byId) return { name: byId.name, qty, unit: byId.unit, price: byId.price };
      const byName = Object.values(PRICE_LIST).find(p => p.name === str(i.name, 100));
      if (byName) return { name: byName.name, qty, unit: byName.unit, price: byName.price };
      const label = str(i.name || i.id || '', 100);
      return label ? { name: label, qty, unit: str(i.unit || 'stk', 50), price: 0 } : null;
    }).filter(Boolean);

    if (!items.length) return res.status(400).json({ error: 'Ingen gyldige produkter' });

    // Valider pose om oppgitt
    if (bagId) {
      const { rows } = await pool.query('SELECT data FROM bags WHERE id = $1', [bagId]);
      if (!rows.length) return res.status(404).json({ error: 'Pose ikke funnet' });
      if (rows[0].data.status === 'kassert') return res.status(400).json({ error: 'Posen er kassert' });
    }

    const total = Math.round(items.reduce((sum, i) => sum + i.qty * i.price, 0));
    const num = await nextCounter('orders');
    const orderNumber    = 'RS-' + String(num).padStart(4, '0');
    const trackingNumber = 'SP-' + String(num).padStart(4, '0');
    const now = new Date().toISOString();

    const order = {
      id: crypto.randomUUID(), timestamp: now,
      status: 'bekreftet', orderNumber, trackingNumber,
      name, phone, email, note,
      delivery: 'Direkte salg',
      total, items, source: 'admin',
      ...(bagId && { bagId }),
      ...(boxId && { boxId }),
      ...(paid  && { paid: 'true', paidAt: now }),
      ...(paid && paymentMethod && { paymentMethod }),
    };

    await pool.query('INSERT INTO orders (id, data) VALUES ($1, $2)', [order.id, JSON.stringify(order)]);

    if (bagId) {
      const { rows } = await pool.query('SELECT data FROM bags WHERE id = $1', [bagId]);
      if (rows.length) {
        const updated = { ...rows[0].data, status: 'tildelt', orderId: order.id };
        await pool.query('UPDATE bags SET data = $1 WHERE id = $2', [JSON.stringify(updated), bagId]);
      }
    }
    if (boxId) {
      const { rows } = await pool.query('SELECT data FROM boxes WHERE id = $1', [boxId]);
      if (rows.length) {
        const updated = { ...rows[0].data, status: 'solgt' };
        await pool.query('UPDATE boxes SET data = $1 WHERE id = $2', [JSON.stringify(updated), boxId]);
      }
    }

    await auditLog(req.user.username, 'direkte-salg', 'ordre', order.id, { name, bagId, boxId, total });
    res.json({ ok: true, id: order.id, orderNumber, trackingNumber });
  } catch (err) {
    console.error('POST /api/admin/direct-sale feil:', err);
    res.status(500).json({ error: 'Serverfeil' });
  }
});

// ── 404 ──
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// ── Start ──
app.listen(PORT, () => {
  console.log(`🌿 Server kjører på port ${PORT}`);
  Promise.all([initDB(), initBackupDB(), initPasswords()]).catch(err => {
    console.error('❌ Oppstartsfeil:', err.message || JSON.stringify(err));
    process.exit(1);
  });
});
