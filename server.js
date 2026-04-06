const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
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

// ── Brukere (passord aldri eksponert til klient) ──
const USERS = {
  'FelixWilliam':    { password: 'ramsloek2026',  role: 'admin',      initials: 'FW', display: 'FelixWilliam' },
  'SverreFredriksen':{ password: 'ramsloek2026',  role: 'leveranser', initials: 'SF', display: 'Sverre' },
  'EirikNordtug':    { password: 'ramsloekeirik', role: 'admin',      initials: 'EN', display: 'Eirik' }
};

const sessions = new Map(); // token -> brukerinfo

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = USERS[username];
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Feil brukernavn eller passord' });
  }
  const token = crypto.randomUUID();
  sessions.set(token, { ...user, username });
  res.json({ ok: true, token, role: user.role, display: user.display, initials: user.initials });
});

function requireAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || !sessions.has(token)) return res.status(401).json({ error: 'Ikke autorisert' });
  req.user = sessions.get(token);
  next();
}

// ── Rate limiting (beskytter mot spam) ──
const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const loginLimiter  = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

// ── E-post (Resend) ──
const FROM_ADDRESS = process.env.FROM_EMAIL
  ? `Ramsløk Nesodden <${process.env.FROM_EMAIL}>`
  : 'Ramsløk Nesodden <onboarding@resend.dev>';

async function sendEmail(subject, text, to) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.warn('⚠️  RESEND_API_KEY mangler – e-post deaktivert'); return; }
  const recipient = to || process.env.GMAIL_USER;
  console.log(`📤 Sender e-post til ${recipient}: "${subject}"`);
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
  const { rows } = await pool.query("SELECT data FROM orders ORDER BY (data->>'id') DESC");
  res.json(rows.map(r => r.data));
});

app.post('/api/orders', publicLimiter, async (req, res) => {
  const order = { id: Date.now().toString(), timestamp: new Date().toISOString(), status: 'venter', ...req.body };
  await pool.query('INSERT INTO orders (id, data) VALUES ($1, $2)', [order.id, JSON.stringify(order)]);

  const itemsText = (order.items || []).map(i => `  - ${i.name}: ${i.qty} × ${i.unit} = ${i.qty * i.price} kr`).join('\n');
  await sendEmail(
    `Salg! – ${order.name}`,
    `Ny ramsløk-bestilling!\n\nNavn: ${order.name}\nTelefon: ${order.phone}\nE-post: ${order.email}\n\nProdukter:\n${itemsText}\n\nTotal: ${order.total} kr\nLevering: ${order.delivery}\nKommentar: ${order.note || '–'}\n\nOrdre-ID: ${order.id}\nTidspunkt: ${new Date(order.timestamp).toLocaleString('nb-NO')}`
  );

  res.json({ ok: true, id: order.id });
});

app.put('/api/orders/:id', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT data FROM orders WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Ikke funnet' });
  const updated = { ...rows[0].data, ...req.body };
  await pool.query('UPDATE orders SET data = $1 WHERE id = $2', [JSON.stringify(updated), req.params.id]);

  if (req.body.status === 'bekreftet' && updated.email) {
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
});

app.delete('/api/orders/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ── Henvendelses-API ──
app.get('/api/inquiries', requireAuth, async (req, res) => {
  const { rows } = await pool.query("SELECT data FROM inquiries ORDER BY (data->>'id') DESC");
  res.json(rows.map(r => r.data));
});

app.post('/api/inquiries', publicLimiter, async (req, res) => {
  const inquiry = { id: Date.now().toString(), timestamp: new Date().toISOString(), status: 'ny', ...req.body };
  await pool.query('INSERT INTO inquiries (id, data) VALUES ($1, $2)', [inquiry.id, JSON.stringify(inquiry)]);

  await sendEmail(
    `Spørsmål – ${inquiry.name}`,
    `Ny henvendelse!\n\nNavn: ${inquiry.name}\nE-post: ${inquiry.email}\nTelefon: ${inquiry.phone || '–'}\n\nMelding:\n${inquiry.message}\n\nID: ${inquiry.id}\nTidspunkt: ${new Date(inquiry.timestamp).toLocaleString('nb-NO')}`
  );

  res.json({ ok: true, id: inquiry.id });
});

app.put('/api/inquiries/:id', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT data FROM inquiries WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Ikke funnet' });
  const updated = { ...rows[0].data, ...req.body };
  await pool.query('UPDATE inquiries SET data = $1 WHERE id = $2', [JSON.stringify(updated), req.params.id]);
  res.json({ ok: true });
});

app.delete('/api/inquiries/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM inquiries WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ── Lager/Esker-API ──
app.get('/api/boxes', requireAuth, async (req, res) => {
  const { rows } = await pool.query("SELECT data FROM boxes ORDER BY (data->>'id') DESC");
  res.json(rows.map(r => r.data));
});

app.post('/api/boxes', requireAuth, async (req, res) => {
  const { rows: existing } = await pool.query('SELECT COUNT(*) FROM boxes');
  const num = (parseInt(existing[0].count) + 1).toString().padStart(3, '0');
  const box = { id: Date.now().toString(), trackingId: `ESK-${num}`, timestamp: new Date().toISOString(), status: 'på lager', ...req.body };
  await pool.query('INSERT INTO boxes (id, data) VALUES ($1, $2)', [box.id, JSON.stringify(box)]);
  res.json({ ok: true, id: box.id, trackingId: box.trackingId });
});

app.put('/api/boxes/:id', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT data FROM boxes WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Ikke funnet' });
  const updated = { ...rows[0].data, ...req.body };
  await pool.query('UPDATE boxes SET data = $1 WHERE id = $2', [JSON.stringify(updated), req.params.id]);
  res.json({ ok: true });
});

app.delete('/api/boxes/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM boxes WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ── Start ──
initDB().then(() => {
  app.listen(PORT, () => console.log(`🌿 Server kjører på port ${PORT}`));
}).catch(err => {
  console.error('❌ Kunne ikke koble til database:', err.message);
  process.exit(1);
});
