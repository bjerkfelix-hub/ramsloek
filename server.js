const express = require('express');
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
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ orders: [], inquiries: [], boxes: [] }, null, 2));
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { orders: [], inquiries: [], boxes: [] };
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

// ── E-post (Resend) ──
// Når domenet er verifisert i Resend: sett FROM_EMAIL=bestillinger@dittdomene.no i Railway
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


  res.json({ ok: true, id: order.id });
});

app.put('/api/orders/:id', async (req, res) => {
  const store = loadStore();
  const idx = store.orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Ikke funnet' });
  const prev = store.orders[idx];
  const updated = { ...prev, ...req.body };
  store.orders[idx] = updated;
  saveStore(store);

  // Send bekreftelse til kunden når status settes til bekreftet
  if (req.body.status === 'bekreftet' && updated.email) {
    const itemsText = (updated.items || []).map(i => `  - ${i.name}: ${i.qty} × ${i.unit}`).join('\n');
    const pickupInfo = updated.pickupTime
      ? `\nHentested: ${updated.pickupPlace || '–'}\nTidspunkt: ${updated.pickupTime}`
      : '';
    const noteInfo = updated.adminNote ? `\nMelding fra oss: ${updated.adminNote}` : '';

    await sendEmail(
      'Ramsløk-bestillingen din er bekreftet! 🌿',
      `Hei ${updated.name}!\n\nBestillingen din er bekreftet.\n\nDu har bestilt:\n${itemsText}\nTotal: ${updated.total} kr${pickupInfo}${noteInfo}\n\nHar du spørsmål? Ta kontakt på ${process.env.GMAIL_USER || 'bjerkfelix@gmail.com'}.\n\nMed vennlig hilsen,\nRamsløk Nesodden`,
      updated.email
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

// ── Lager/Esker-API ──
app.get('/api/boxes', (req, res) => {
  const store = loadStore();
  res.json(store.boxes || []);
});

app.post('/api/boxes', (req, res) => {
  const store = loadStore();
  if (!store.boxes) store.boxes = [];
  const num = (store.boxes.length + 1).toString().padStart(3, '0');
  const box = { id: Date.now().toString(), trackingId: `ESK-${num}`, timestamp: new Date().toISOString(), status: 'på lager', ...req.body };
  store.boxes.push(box);
  saveStore(store);
  res.json({ ok: true, id: box.id, trackingId: box.trackingId });
});

app.put('/api/boxes/:id', (req, res) => {
  const store = loadStore();
  if (!store.boxes) store.boxes = [];
  const idx = store.boxes.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Ikke funnet' });
  store.boxes[idx] = { ...store.boxes[idx], ...req.body };
  saveStore(store);
  res.json({ ok: true });
});

app.delete('/api/boxes/:id', (req, res) => {
  const store = loadStore();
  if (!store.boxes) store.boxes = [];
  store.boxes = store.boxes.filter(b => b.id !== req.params.id);
  saveStore(store);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`🌿 Server kjører på port ${PORT}`));
