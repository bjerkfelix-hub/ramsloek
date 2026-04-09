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
app.use(helmet({ contentSecurityPolicy: false })); // CSP av pga inline-script i HTML

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
  `);
  console.log('✅ Database klar');
}

// ── Input-validering ──
function str(val, max = 200) {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, max);
}
function isEmail(val) {
  return typeof val === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim()) && val.length <= 200;
}

// ── Prisliste (eneste gyldige produkter og priser) ──
const PRICE_LIST = {
  'stilk':    { name: 'Blader + løk/stilk',       price: 40,  unit: '100g' },
  'stilk250': { name: 'Blader + løk/stilk 250g',  price: 100, unit: '250g' },
  'pose':     { name: 'Familiepose',               price: 200, unit: '500g' },
};
const MAX_QTY = 50;

// ── Auth ──
const USERS = {
  'FelixWilliam':    { password: process.env.PW_FELIX,  role: 'admin',      initials: 'FW', display: 'FelixWilliam' },
  'SverreFredriksen':{ password: process.env.PW_SVERRE, role: 'leveranser', initials: 'SF', display: 'Sverre' },
  'EirikNordtug':    { password: process.env.PW_EIRIK,  role: 'admin',      initials: 'EN', display: 'Eirik' },
  'Edvard':          { password: process.env.PW_EDVARD, role: 'admin',      initials: 'ED', display: 'Edvard' }
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
    const id = Date.now().toString() + Math.random().toString(36).slice(2, 6);
    await pool.query(
      'INSERT INTO audit_log (id, username, action, resource, resource_id, details) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, username, action, resource, resourceId || null, JSON.stringify(details || {})]
    );
  } catch (e) { console.error('⚠️ Audit-logg feilet:', e.message); }
}

// ── Rate limiting ──
const loginLimiter  = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

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

app.post('/api/logout', async (req, res) => {
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
  const recipient = to || process.env.GMAIL_USER;
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
    const { rows } = await pool.query("SELECT data FROM orders ORDER BY (data->>'id') DESC");
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
            const qty = typeof i.qty === 'number' ? Math.min(Math.max(0, Math.floor(i.qty)), MAX_QTY) : 0;
            return product ? { name: product.name, qty, unit: product.unit, price: product.price } : null;
          })
          .filter(Boolean)
      : [];
    const total = Math.round(items.reduce((sum, i) => sum + i.qty * i.price, 0));

    if (!name || !phone) return res.status(400).json({ error: 'Navn og telefon er påkrevd' });

    const order = { id: Date.now().toString(), timestamp: new Date().toISOString(), status: 'venter', name, phone, email, note, delivery, deliveryAddress, total, items };
    await pool.query('INSERT INTO orders (id, data) VALUES ($1, $2)', [order.id, JSON.stringify(order)]);
    backupWrite('INSERT INTO orders (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data', [order.id, JSON.stringify(order)]);

    // Lagre samtykke til kjøpsvilkår
    const consent = { id: order.id, name, email, phone, timestamp: order.timestamp, termsVersion: '2026-04', orderId: order.id };
    await pool.query('INSERT INTO consents (id, data) VALUES ($1, $2)', [consent.id, JSON.stringify(consent)]);
    backupWrite('INSERT INTO consents (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data', [consent.id, JSON.stringify(consent)]);

    const itemsText = items.map(i => `  - ${i.name}: ${i.qty} × ${i.unit} = ${i.qty * i.price} kr`).join('\n');
    await sendEmail(
      `Salg! – ${name}`,
      `Ny ramsløk-bestilling!\n\nNavn: ${name}\nTelefon: ${phone}\nE-post: ${email}\n\nProdukter:\n${itemsText}\n\nTotal: ${total} kr\nLevering: ${delivery}\nKommentar: ${note || '–'}\n\nOrdre-ID: ${order.id}\nTidspunkt: ${new Date(order.timestamp).toLocaleString('nb-NO')}`
    );

    res.json({ ok: true, id: order.id });
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

app.put('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT data FROM orders WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Ikke funnet' });

    // Kun tillatte felter kan oppdateres
    const allowed = ['status', 'pickupPlace', 'pickupTime', 'adminNote', 'boxId', 'bagId'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = str(String(req.body[k]), 500); });

    const updated = { ...rows[0].data, ...updates };
    await pool.query('UPDATE orders SET data = $1 WHERE id = $2', [JSON.stringify(updated), req.params.id]);
    auditLog(req.user.username, 'oppdater', 'ordre', req.params.id, updates);

    if (updates.status === 'bekreftet' && updated.email) {
      const itemsText = (updated.items || []).map(i => `  - ${i.name}: ${i.qty} × ${i.unit}`).join('\n');
      const pickupInfo = updated.pickupTime ? `\nHentested: ${updated.pickupPlace || '–'}\nTidspunkt: ${updated.pickupTime}` : '';
      const noteInfo = updated.adminNote ? `\nMelding fra oss: ${updated.adminNote}` : '';
      await sendEmail(
        'Ramsløk-bestillingen din er bekreftet! 🌿',
        `Hei ${updated.name}!\n\nBestillingen din er bekreftet.\n\nDu har bestilt:\n${itemsText}\nTotal: ${updated.total} kr${pickupInfo}${noteInfo}\n\nHar du spørsmål? Ta kontakt på ${process.env.GMAIL_USER || 'bjerkfelix@gmail.com'}.\n\nMed vennlig hilsen,\nRamsløk Nesodden`,
        updated.email
      );
    }

    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

app.delete('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
    auditLog(req.user.username, 'slett', 'ordre', req.params.id, {});
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

// ── Henvendelses-API ──
app.get('/api/inquiries', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT data FROM inquiries ORDER BY (data->>'id') DESC");
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

    const inquiry = { id: Date.now().toString(), timestamp: new Date().toISOString(), status: 'ny', name, email, phone, message };
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
    const updated = { ...rows[0].data, status: str(req.body.status, 20) };
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
    const { rows } = await pool.query("SELECT data FROM boxes ORDER BY (data->>'id') DESC");
    res.json(rows.map(r => r.data));
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

app.post('/api/boxes', requireAdmin, async (req, res) => {
  try {
    const pickDate = str(req.body.pickDate, 20);
    const area     = str(req.body.area, 200);
    const pickTime = str(req.body.pickTime || '', 10);
    const packTime = str(req.body.packTime || '', 10);
    const note     = str(req.body.note || '', 500);

    if (!pickDate || !area) return res.status(400).json({ error: 'Mangler påkrevde felt' });

    // Generer neste tracking-nummer basert på høyeste eksisterende
    const { rows: all } = await pool.query("SELECT data->>'trackingId' AS tid FROM boxes");
    const nums = all.map(r => parseInt((r.tid || '').replace('ESK-', '')) || 0);
    const nextNum = (Math.max(0, ...nums) + 1).toString().padStart(3, '0');

    const box = {
      id: Date.now().toString(),
      trackingId: `ESK-${nextNum}`,
      timestamp: new Date().toISOString(),
      status: 'på lager',
      pickDate, area, pickTime, packTime, note,
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
    if (req.body.status !== undefined) {
      updated.status = str(String(req.body.status), 50);
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
    const { rows } = await pool.query("SELECT data FROM bags ORDER BY (data->>'timestamp') DESC");
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
    const bag = { id: Date.now().toString(), timestamp: new Date().toISOString(), status: 'ledig', sporingsnummer, vekt, dato, note };
    await pool.query('INSERT INTO bags (id, data) VALUES ($1, $2)', [bag.id, JSON.stringify(bag)]);
    res.json({ ok: true, id: bag.id });
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

app.put('/api/bags/:id', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT data FROM bags WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Ikke funnet' });
    const updated = { ...rows[0].data };
    if (req.body.status !== undefined) updated.status = str(String(req.body.status), 50);
    if (req.body.orderId !== undefined) updated.orderId = str(String(req.body.orderId), 50);
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

// ── Start ──
Promise.all([initDB(), initBackupDB(), initPasswords()]).then(() => {
  app.listen(PORT, () => console.log(`🌿 Server kjører på port ${PORT}`));
}).catch(err => {
  console.error('❌ Oppstartsfeil:', err.message || JSON.stringify(err));
  process.exit(1);
});
