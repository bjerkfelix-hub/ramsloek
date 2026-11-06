# Ramsløk system — design spec

Date: 2026-11-06
Status: Draft, awaiting owner review

## 1. Purpose

An AS sells wild garlic (ramsløk) harvested on the owner's private land on Nesodden to
customers in Oslo. Sales channels today: market stands at Bondens marked. Planned:
wholesale to BAMA, ASKO and NorgesGruppen.

The system replaces paper and ad-hoc spreadsheets with one web app that:

1. Registers harvest batches and makes every bag and box traceable to its batch.
2. Packs products, prints labels (GS1 barcodes when available) and keeps stock.
3. Handles market-day sales and wholesaler orders, deliveries and invoices.
4. Keeps the company's books (double-entry, NS 4102) inside the app.
5. Shows a live dashboard and exports everything to Excel.

### Success criteria

- Any lot number can be traced, in one search, to harvest area, date, picker, sorting
  check, and every customer who received it — and back again from a customer.
- No bag or box can be packed from a batch whose sorting check is not signed.
- Sales, deliveries and payments create bookkeeping vouchers automatically; the owner
  only enters expenses by hand.
- Posted vouchers cannot be changed or deleted; corrections are reversing entries.
- MVA figures per term and year-end figures (resultat, balanse) can be read straight
  off the reports and typed into Altinn.
- The dashboard updates without reloading when someone registers a sale on a phone.
- Every report downloads as an .xlsx file.

### What the owner decided (from the brainstorming conversation)

- Used on phones in the field and at market, and on a computer at home; several people.
- The company is an AS; assumed MVA-registered (food rate 15 %) — to be confirmed.
- The books live in the app's database; Excel is an export, not the master.
- No external accounting program (Fiken/Tripletex) in version 1.

### Assumptions (owner to correct)

- App UI language is Norwegian bokmål. Code and this spec are in English.
- MVA term is bimonthly (6 terms a year).
- Product range starts small (e.g. 100 g bag, 1 kg box) and is configurable.

## 2. Architecture

One web application, installable on phone home screens (PWA), backed by a hosted
Postgres database.

| Concern | Choice | Why |
|---|---|---|
| Web app | Next.js (App Router) + TypeScript | One codebase for phone and desktop, server-side rendering for reports/PDFs |
| Database | Supabase Postgres, EU region | Real database with constraints and triggers for bookkeeping rules; data stays in the EEA |
| Login | Supabase Auth (email magic link) | No passwords to manage for helpers |
| Access control | Postgres Row Level Security per role | Rules enforced in the database, not only in the UI |
| Live dashboard | Supabase Realtime | Dashboard updates as rows change |
| Files | Supabase Storage | Receipt photos (bilag), invoice PDFs, delivery notes |
| PDFs | Server-side PDF generation | Labels, delivery notes, invoices |
| Barcodes | bwip-js | EAN-13, GS1-128, SSCC |
| Excel | exceljs | .xlsx export of every report |
| Hosting | Vercel (Pro, commercial use) | Simple deploys from git |
| Tests | Vitest (unit), Playwright (end-to-end) | |

Money is stored as integer øre. Dates and periods use Europe/Oslo time.

### Roles

| Role | Access |
|---|---|
| `owner` | Everything: books, reports, users, settings, period locking |
| `picker` | Harvest batches, sorting check, temperature log, packing, labels, waste |
| `seller` | Market sales, closing market days, picking/delivering orders |

### Module flow

```
Harvest batch → Packing & labels → Stock → Sales & deliveries → Books
                                     ↘ Live dashboard ↙
```

Each module talks to the next only through database records (a packing creates stock
movements; a delivery creates stock movements and an invoice; an invoice creates a
voucher). Bookkeeping posting lives in one module (`ledger`) that every other module
calls; nothing else writes journal lines.

## 3. Modules

### 3.1 Harvest batches

- Lot number assigned automatically: `RL-YY-NNN` (e.g. `RL-27-014`), sequential per year.
- Fields: harvested at (date/time), harvest area, pickers, gross weight (kg), notes.
- Harvest areas are set up once by the owner: name, optional map pin.
- **Sorting check:** a named user signs "Sortert og kontrollert for liljekonvall og andre
  arter" with timestamp. Required before any packing from the batch (enforced in the
  database, not only the UI).
- Optional temperature readings (time, °C, who) for the cold-chain log.
- Remaining unpacked weight = gross weight − packed weight − discarded weight.

### 3.2 Products and packing

- Product: name, net weight (g), GTIN (optional until GS1 membership), shelf life
  (days), storage text, active flag.
- Prices per customer type (market, wholesaler, per-customer override) with MVA rate.
- Packing: choose batch + product + quantity → creates stock in units for that batch,
  reduces the batch's unpacked weight. Cannot exceed remaining weight.
- Best-before = harvest date + product shelf life.

### 3.3 Labels

- **Consumer unit (bag):** product name, net weight, lot, best-before, "Opprinnelse:
  Norge", storage instruction, company name/address; EAN-13 barcode from GTIN when set.
- **Trade unit (box):** same text plus GS1-128 barcode with AIs (01) GTIN,
  (15) best-before, (10) lot.
- **Pallet / delivery unit:** SSCC label, GS1-128 with AI (00), generated per shipment
  unit from the company's GS1 prefix.
- Output: PDF sized for a label printer (e.g. 100×50 mm and 100×150 mm) or A4 sheets.
- Without a GTIN/GS1 prefix, labels print without barcodes; all else works.

### 3.4 Stock

- Stock is a movement ledger (`pack`, `sell`, `deliver`, `waste`, `adjust`), never an
  edited balance. Current stock = sum of movements per product per batch.
- Sales and picking suggest the oldest batch first (FIFO by best-before).
- Warning when stock is within N days (setting, default 1) of best-before.
- Waste (svinn): quantity, batch, reason (wilted, damaged, expired, other).

### 3.5 Market sales (Bondens marked)

- A market day is opened with place and date; stand fee is registered as an expense.
- Sales screen: tap products, quantity, payment method (Vipps, card, cash). Batch taken
  FIFO automatically, overridable.
- **Close market day:** totals per payment method; seller confirms against Vipps and
  card terminal; differences are recorded. Closing posts one voucher for the day.
- **Compliance open question — kassasystem:** Norwegian rules (kassasystemloven /
  bokføringsforskriften) may require an approved cash register system for
  point-of-sale cash, card and Vipps sales, with exemptions for small cash turnover
  and market trading. A self-built sales screen is not an approved kassasystem. Before
  this module is built, the owner confirms with an accountant or Skatteetaten which
  applies:
  - **Exempt:** the app's sales screen and day-close report are the documentation.
  - **Not exempt:** sales are taken on an approved POS/card terminal; the app imports
    its daily Z-report (CSV) instead of using its own sales screen, and stock is drawn
    from that import.
  The module is designed so both variants share the day-close and posting logic.

### 3.6 Customers, orders, deliveries, invoices

- Customer: name, organisation number, invoice address, delivery addresses, email,
  payment terms (days), price list, customer type.
- Order: customer, delivery date, lines (product, quantity, price).
- Picking: for each line choose batch(es); group units into shipment units (pallets or
  box groups), each with an SSCC.
- Delivery note (PDF): order, shipment units, SSCC, product, quantity, lot, best-before.
- Delivery sign-off: who, when, optional photo/signature → stock movements `deliver`.
- Invoice created from a delivered order:
  - Sequential, gap-free invoice number.
  - Content per bokføringsforskriften: seller name, org.nr + "MVA",
    "Foretaksregisteret", buyer name/address, invoice date, delivery date and place,
    description, quantity, unit price, MVA rate and amount, total, due date, bank
    account.
  - PDF stored and emailed to the customer.
- Credit note: references the invoice, reverses all or part of it; never edits it.
- Payments registered manually or matched from bank import (3.8).
- EHF e-invoicing and EDI orders are out of scope for v1. Orders, shipments and invoices
  carry GTIN, SSCC and lot data so an EDI/EHF provider can be added later.

### 3.7 Books (ledger)

- Chart of accounts seeded from NS 4102 (subset relevant to the business; owner can add).
- **Voucher (bilag):** series + sequential number, date, description, period, source
  (market day, invoice, payment, expense, manual), created by, posted at, attachments.
- **Journal lines:** account, debit/credit amount (øre), MVA code, customer/supplier ref.
- Rules enforced in the database:
  - A voucher's debits equal its credits (deferred constraint check at commit).
  - Posted vouchers and their lines cannot be updated or deleted (trigger).
  - Corrections are reversing vouchers linking to the original.
  - No posting into a locked period.
  - Every insert is recorded in an audit log (who, when, what).
- **Automatic postings:**
  - Market day close: Dr 1920/1900 per payment method; Cr 3000 sales, Cr 2700 output MVA.
  - Invoice: Dr 1500 customers; Cr 3000, Cr 2700.
  - Customer payment: Dr 1920; Cr 1500.
  - Expense: Dr cost account + Dr 2710 input MVA; Cr 1920 or 2400 suppliers.
- **Expenses:** photo of receipt (required as bilag), supplier, date, amount, MVA,
  category → cost account. Paid now or later (supplier ledger).
- **Manual voucher** (owner only) for anything else, e.g. share capital, year-end entries.
- **Periods:** MVA terms; the owner locks a term after reporting to Altinn.
- **Retention:** vouchers and attachments kept at least 5 years after year end; storage
  in the EEA; nothing is hard-deleted.

### 3.8 Bank import

- Upload bank statement (CSV/Excel from the bank).
- App suggests matches against unpaid invoices and unpaid expenses; owner confirms;
  confirmed matches post payment vouchers. Unmatched lines can be posted manually.

### 3.9 Reports and Excel export

All reports filter by period and download as .xlsx:

- MVA report per term, laid out with the figures to enter in the MVA return in Altinn.
- Profit and loss (resultatregnskap).
- Balance sheet (balanse).
- General ledger (hovedbok) and voucher journal.
- Customer ledger (kundereskontro) and supplier ledger (leverandørreskontro).
- Year export for the accountant: all of the above plus voucher attachments as a zip.
- Traceability report for a lot number or a customer.

### 3.10 Live dashboard (owner)

- Sales today / this week / this season, by channel.
- Kg harvested vs. sold vs. wasted, per season.
- Stock per product with best-before warnings.
- Unpaid and overdue invoices.
- Profit so far this year; MVA owed for the current term.
- Traceability search box (lot number or customer).

## 4. Data model (main tables)

`profiles` (user, role) · `harvest_areas` · `batches` · `sorting_checks` ·
`temperature_logs` · `products` · `prices` · `packings` · `stock_movements` ·
`waste_records` · `market_days` · `market_sales` · `customers` · `orders` ·
`order_lines` · `shipment_units` (SSCC) · `shipment_items` (product, batch, qty) ·
`deliveries` · `invoices` · `invoice_lines` · `payments` · `suppliers` · `expenses` ·
`attachments` · `accounts` · `vouchers` · `journal_lines` · `periods` ·
`bank_imports` · `bank_lines` · `number_series` · `audit_log` · `settings`
(company name, org.nr, address, bank account, GS1 prefix, MVA term).

## 5. Error handling

- Database constraints are the final guard (sorting check before packing, stock never
  negative, balanced vouchers, immutable posted vouchers, locked periods). The UI shows
  their failures as plain Norwegian messages.
- Number series (lot, voucher, invoice, SSCC) are allocated inside the same database
  transaction as the record, so numbers are never skipped or duplicated.
- Phones at market may have poor signal: the sales screen queues sales locally and syncs
  when back online, showing a clear "not synced" badge. Day close is blocked until all
  sales are synced.
- Failed email of an invoice is shown on the invoice and can be retried; the invoice is
  still valid.

## 6. Testing

- Unit tests (Vitest): posting rules for each source, MVA calculations, rounding, FIFO
  batch selection, best-before, lot/SSCC/GTIN check digits.
- Database tests: each constraint and trigger in 3.7 and 5 rejects what it should.
- End-to-end (Playwright): harvest → sorting check → pack → label PDF → market sale →
  close day → voucher; order → pick → delivery → invoice → payment → reports.
- Report check: P&L and balance sheet totals reconcile with the general ledger.

## 7. Out of scope for version 1

EHF e-invoicing, EDI orders, live bank integration, automatic filing to Altinn, payroll,
online shop for private customers, multiple companies.

## 8. Open questions for the owner

1. Is the AS MVA-registered, and on which term?
2. Kassasystem requirement for market sales (see 3.5) — confirm with accountant or
   Skatteetaten.
3. Company details for labels and invoices: name, org.nr, address, bank account.
4. Products, net weights, prices and shelf life.
5. GS1 Norway membership: applied for or not yet?
6. Will an accountant (regnskapsfører) review the year-end accounts?

## 9. Suggested build order

1. Foundation: project, database, login, roles, settings.
2. Harvest batches, sorting check, products, packing, stock, labels.
3. Ledger core (accounts, vouchers, constraints, audit log) and expenses.
4. Market days and sales (variant decided by open question 2).
5. Customers, orders, picking, delivery notes, invoices, payments.
6. Reports, Excel export, dashboard, traceability search.
7. Bank import.
