const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

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

app.use(express.static(path.join(__dirname)));

// ── Database (Postgres) ──
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders    (id TEXT PRIMARY KEY, data JSONB NOT NULL);
    CREATE TABLE IF NOT EXISTS inquiries (id TEXT PRIMARY KEY, data JSONB NOT NULL);
    CREATE TABLE IF NOT EXISTS boxes     (id TEXT PRIMARY KEY, data JSONB NOT NULL);
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

// ── Auth ──
const USERS = {
  'FelixWilliam':    { password: process.env.PW_FELIX,  role: 'admin',      initials: 'FW', display: 'FelixWilliam' },
  'SverreFredriksen':{ password: process.env.PW_SVERRE, role: 'leveranser', initials: 'SF', display: 'Sverre' },
  'EirikNordtug':    { password: process.env.PW_EIRIK,  role: 'admin',      initials: 'EN', display: 'Eirik' }
};

const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 timer
const sessions = new Map();

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

// Rydd utløpte sesjoner hvert 30. minutt
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_TTL) sessions.delete(token);
  }
}, 30 * 60 * 1000);

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
    sessions.set(token, { ...user, username, createdAt: Date.now() });
    res.json({ ok: true, token, role: user.role, display: user.display, initials: user.initials });
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

app.post('/api/logout', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

function requireAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || !sessions.has(token)) return res.status(401).json({ error: 'Ikke autorisert' });
  const session = sessions.get(token);
  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Sesjon utløpt – logg inn på nytt' });
  }
  req.user = session;
  next();
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
    const note     = str(req.body.note, 500);
    const delivery = str(req.body.delivery, 100);
    const total    = typeof req.body.total === 'number' ? req.body.total : 0;
    const items    = Array.isArray(req.body.items)
      ? req.body.items.slice(0, 20).map(i => ({
          name:  str(i.name, 100),
          qty:   typeof i.qty   === 'number' ? i.qty   : 0,
          unit:  str(i.unit, 20),
          price: typeof i.price === 'number' ? i.price : 0
        }))
      : [];

    if (!name || !phone) return res.status(400).json({ error: 'Navn og telefon er påkrevd' });

    const order = { id: Date.now().toString(), timestamp: new Date().toISOString(), status: 'venter', name, phone, email, note, delivery, total, items };
    await pool.query('INSERT INTO orders (id, data) VALUES ($1, $2)', [order.id, JSON.stringify(order)]);

    const itemsText = items.map(i => `  - ${i.name}: ${i.qty} × ${i.unit} = ${i.qty * i.price} kr`).join('\n');
    await sendEmail(
      `Salg! – ${name}`,
      `Ny ramsløk-bestilling!\n\nNavn: ${name}\nTelefon: ${phone}\nE-post: ${email}\n\nProdukter:\n${itemsText}\n\nTotal: ${total} kr\nLevering: ${delivery}\nKommentar: ${note || '–'}\n\nOrdre-ID: ${order.id}\nTidspunkt: ${new Date(order.timestamp).toLocaleString('nb-NO')}`
    );

    res.json({ ok: true, id: order.id });
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

app.put('/api/orders/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT data FROM orders WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Ikke funnet' });

    // Kun tillatte felter kan oppdateres
    const allowed = ['status', 'pickupPlace', 'pickupTime', 'adminNote', 'boxId'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = str(String(req.body[k]), 500); });

    const updated = { ...rows[0].data, ...updates };
    await pool.query('UPDATE orders SET data = $1 WHERE id = $2', [JSON.stringify(updated), req.params.id]);

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

app.delete('/api/orders/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

// ── Henvendelses-API ──
app.get('/api/inquiries', requireAuth, async (req, res) => {
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

    await sendEmail(
      `Spørsmål – ${name}`,
      `Ny henvendelse!\n\nNavn: ${name}\nE-post: ${email}\nTelefon: ${phone || '–'}\n\nMelding:\n${message}\n\nID: ${inquiry.id}\nTidspunkt: ${new Date(inquiry.timestamp).toLocaleString('nb-NO')}`
    );

    res.json({ ok: true, id: inquiry.id });
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

app.put('/api/inquiries/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT data FROM inquiries WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Ikke funnet' });
    const updated = { ...rows[0].data, status: str(req.body.status, 20) };
    await pool.query('UPDATE inquiries SET data = $1 WHERE id = $2', [JSON.stringify(updated), req.params.id]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

app.delete('/api/inquiries/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM inquiries WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

// ── Lager/Esker-API ──
app.get('/api/boxes', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT data FROM boxes ORDER BY (data->>'id') DESC");
    res.json(rows.map(r => r.data));
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

app.post('/api/boxes', requireAuth, async (req, res) => {
  try {
    const pickDate     = str(req.body.pickDate, 20);
    const area         = str(req.body.area, 200);
    const bags         = typeof req.body.bags === 'number' ? Math.max(0, req.body.bags) : 0;
    const weightPerBag = typeof req.body.weightPerBag === 'number' ? Math.max(0, req.body.weightPerBag) : 0;
    const note         = str(req.body.note, 500);

    if (!pickDate || !area || !bags || !weightPerBag) return res.status(400).json({ error: 'Mangler påkrevde felt' });

    const { rows: existing } = await pool.query('SELECT COUNT(*) FROM boxes');
    const num = (parseInt(existing[0].count) + 1).toString().padStart(3, '0');
    const box = { id: Date.now().toString(), trackingId: `ESK-${num}`, timestamp: new Date().toISOString(), status: 'på lager', pickDate, area, bags, weightPerBag, totalWeight: bags * weightPerBag, note };
    await pool.query('INSERT INTO boxes (id, data) VALUES ($1, $2)', [box.id, JSON.stringify(box)]);
    res.json({ ok: true, id: box.id, trackingId: box.trackingId });
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

app.put('/api/boxes/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT data FROM boxes WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Ikke funnet' });
    const updated = { ...rows[0].data, status: str(String(req.body.status || ''), 50) };
    await pool.query('UPDATE boxes SET data = $1 WHERE id = $2', [JSON.stringify(updated), req.params.id]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

app.delete('/api/boxes/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM boxes WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Serverfeil' }); }
});

// ── Start ──
Promise.all([initDB(), initPasswords()]).then(() => {
  app.listen(PORT, () => console.log(`🌿 Server kjører på port ${PORT}`));
}).catch(err => {
  console.error('❌ Oppstartsfeil:', err.message || JSON.stringify(err));
  process.exit(1);
});
