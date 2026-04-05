const express = require('express');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── Filbasert lagring ──
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

function loadStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ orders: [], inquiries: [] }, null, 2));
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { orders: [], inquiries: [] };
  }
}

function saveStore(data) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Kunne ikke lagre data:', e);
  }
}

// ── E-post (Gmail) ──
function createTransporter() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
  });
}

async function sendEmail(subject, text, to) {
  const transporter = createTransporter();
  if (!transporter) { console.log('E-post ikke konfigurert – hopper over:', subject); return; }
  try {
    await transporter.sendMail({
      from: `"Ramsløk Nesodden" <${process.env.GMAIL_USER}>`,
      to: to || process.env.GMAIL_USER,
      subject,
      text
    });
  } catch (e) {
    console.error('E-postfeil:', e.message);
  }
}

// ── Ordre-API ──
app.get('/api/orders', (req, res) => {
  res.json(loadStore().orders);
});

app.post('/api/orders', async (req, res) => {
  const order = { id: Date.now().toString(), timestamp: new Date().toISOString(), status: 'venter', ...req.body };
  const store = loadStore();
  store.orders.push(order);
  saveStore(store);

  const itemsText = (order.items || []).map(i => `  - ${i.name}: ${i.qty} × ${i.unit} = ${i.qty * i.price} kr`).join('\n');

  // E-post til admin
  await sendEmail(
    `Salg! – ${order.name}`,
    `Ny ramsløk-bestilling!\n\nNavn: ${order.name}\nTelefon: ${order.phone}\nE-post: ${order.email}\n\nProdukter:\n${itemsText}\n\nTotal: ${order.total} kr\nLevering: ${order.delivery}\nKommentar: ${order.note || '–'}\n\nOrdre-ID: ${order.id}\nTidspunkt: ${new Date(order.timestamp).toLocaleString('nb-NO')}`
  );

  // Mottaksbekreftelse til kunde
  if (order.email) {
    await sendEmail(
      'Vi har mottatt bestillingen din! 🌿',
      `Hei ${order.name}!\n\nTakk for bestillingen – vi har mottatt den og behandler den så snart som mulig.\n\nDu har bestilt:\n${itemsText}\n\nTotal: ${order.total} kr\nLeveringsmåte: ${order.delivery}${order.note ? `\nKommentar: ${order.note}` : ''}\n\nDu vil få en ny e-post når bestillingen er bekreftet med forslag til hentested og tidspunkt.\n\nMed vennlig hilsen,\nNesodden Ramsløk 🌿`,
      order.email
    );
  }

  res.json({ ok: true, id: order.id });
});

app.put('/api/orders/:id', async (req, res) => {
  const store = loadStore();
  const idx = store.orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Ikke funnet' });
  const prev = store.orders[idx];
  store.orders[idx] = { ...prev, ...req.body };
  saveStore(store);

  // Send kundebekreftelse når status endres til bekreftet
  if (req.body.status === 'bekreftet' && prev.status !== 'bekreftet' && prev.email) {
    const o = store.orders[idx];
    const itemsText = (o.items || []).map(i => `  - ${i.name}: ${i.qty} × ${i.unit} = ${i.qty * i.price} kr`).join('\n');
    const pickupLine = o.pickupTime
      ? `\nHentested: ${o.pickupPlace || 'Nesodden'}\nForeslått tidspunkt: ${o.pickupTime}`
      : `\nVi kontakter deg for å avtale tidspunkt og hentested.`;
    await sendEmail(
      'Ramsløk-bestillingen din er bekreftet! 🌿',
      `Hei ${o.name}!\n\nBestillingen din er bekreftet.\n\nDu har bestilt:\n${itemsText}\n\nTotal: ${o.total} kr\nLeveringsmåte: ${o.delivery}${pickupLine}\n${o.adminNote ? `\nMelding fra oss: ${o.adminNote}\n` : ''}\nBetal på Vipps når du henter.\n\nMed vennlig hilsen,\nNesodden Ramsløk 🌿`,
      prev.email
    );
  }

  res.json({ ok: true });
});

app.delete('/api/orders/:id', (req, res) => {
  const store = loadStore();
  store.orders = store.orders.filter(o => o.id !== req.params.id);
  saveStore(store);
  res.json({ ok: true });
});

// ── Henvendelses-API ──
app.get('/api/inquiries', (req, res) => {
  const store = loadStore();
  res.json(store.inquiries || []);
});

app.post('/api/inquiries', async (req, res) => {
  const inquiry = { id: Date.now().toString(), timestamp: new Date().toISOString(), status: 'ny', ...req.body };
  const store = loadStore();
  if (!store.inquiries) store.inquiries = [];
  store.inquiries.push(inquiry);
  saveStore(store);

  await sendEmail(
    `Spørsmål – ${inquiry.name}`,
    `Ny henvendelse!\n\nNavn: ${inquiry.name}\nE-post: ${inquiry.email}\nTelefon: ${inquiry.phone || '–'}\n\nMelding:\n${inquiry.message}\n\nID: ${inquiry.id}\nTidspunkt: ${new Date(inquiry.timestamp).toLocaleString('nb-NO')}`
  );

  res.json({ ok: true, id: inquiry.id });
});

app.put('/api/inquiries/:id', (req, res) => {
  const store = loadStore();
  if (!store.inquiries) store.inquiries = [];
  const idx = store.inquiries.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Ikke funnet' });
  store.inquiries[idx] = { ...store.inquiries[idx], ...req.body };
  saveStore(store);
  res.json({ ok: true });
});

app.delete('/api/inquiries/:id', (req, res) => {
  const store = loadStore();
  if (!store.inquiries) store.inquiries = [];
  store.inquiries = store.inquiries.filter(o => o.id !== req.params.id);
  saveStore(store);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`🌿 Server kjører på port ${PORT}`));
