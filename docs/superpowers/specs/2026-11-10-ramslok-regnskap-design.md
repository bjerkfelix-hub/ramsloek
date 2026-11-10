# Ramsløk bookkeeping (regnskap) — design spec

Date: 2026-11-10
Status: Approved in conversation, awaiting written review
Builds on: `2026-11-06-ramslok-system-design.md` (phase 1 live) and
`2026-11-06-ramslok-public-site-design.md` (Step A live)
Replaces for now: §3.7–3.9 of the system spec (full double-entry ledger). See §11.

## 1. Purpose

Ramsløk is a department of DONTPANIC AS (org.nr 937 308 493). The AS's main books are kept
elsewhere (today by hand). This module is a **subledger for ramsløk**: it records ramsløk's
income and costs with their receipts, shows profit live, and exports clean figures and
receipts that whoever keeps the main books can post from.

### What the owner decided

- Ramsløk only; the rest of DONTPANIC stays out of the app.
- Approach "income and expense book with account numbers", not double-entry.
- Income enters as **daily takings per market day** (totals per payment method), plus free
  "other income" entries. No per-sale registration.
- Sellers register daily takings and expenses with receipts; only the owner sees figures,
  reports and export. Pickers have no access.
- Nothing can be deleted. Owner corrections are logged; mistakes are voided with a reason.
- DONTPANIC AS is not MVA-registered: no MVA fields. A meter warns towards the
  NOK 50 000 / 12-month registration limit.
- Export: Excel (.xlsx) plus a zip of receipts, per chosen period.
- Built by Codex task by task on branch `regnskap`; Claude writes spec and plan and reviews.

### Success criteria

- A seller at the market registers the day's takings (Vipps, card, cash + photo of the
  report) on a phone in under a minute.
- An expense with a receipt photo is registered from a phone in under a minute.
- The owner sees income, costs and profit for this month and this year, the number of
  entries missing a receipt, unpaid bills, money owed back to people who paid privately,
  and the MVA meter — on one screen.
- A seller can never read another person's entries, any totals, or the export; a picker
  cannot read anything in this module. Enforced by RLS, tested with pgTAP.
- No entry or receipt can be deleted by any role, through the UI or the API.
- An owner correction keeps the old values in the audit log.
- The export for a period opens in Excel and its category totals equal the sum of its lines;
  every line with a receipt has a file with that entry number in the zip.

## 2. Concepts

| Term (UI, Norwegian) | Meaning |
|---|---|
| Post (entry) | One income or expense line, numbered `R-YYYY-NNN` |
| Utgift (expense) | Money out: date, amount, category, supplier, description, payment, receipt |
| Dagsoppgjør (daily takings) | Totals for one market day per payment method; creates income entries |
| Annen inntekt (other income) | A free income entry (e.g. a restaurant paid by bank transfer) |
| Kategori | Income or expense category with an NS 4102 account number |
| Kvittering / bilag (receipt) | Image or PDF attached to an entry or to a daily takings |
| Annullert (voided) | Entry kept but excluded from all totals; has a reason |

Money is integer øre. Dates are Europe/Oslo calendar dates (existing `src/lib/domain/time.ts`).

## 3. Data model (migration `20261110000008_ledger.sql`)

### 3.1 `ledger_categories`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk default gen_random_uuid() | |
| kind | text not null check in ('income','expense') | |
| name | text not null | unique per kind (case-insensitive) |
| account_no | text not null check (account_no ~ '^[0-9]{4}$') | NS 4102 |
| active | boolean not null default true | inactive = hidden in forms, kept in reports |
| sort | int not null default 0 | |
| system_key | text unique | set for categories code depends on (`market_sales`) |

Seed (name, account):
- income: Salg marked 3000 (`system_key = 'market_sales'`), Salg restaurant/butikk 3000,
  Annen inntekt 3900.
- expense: Emballasje 4300, Etiketter og trykk 4300, Standleie 6300, Utstyr og verktøy 6540,
  Drivstoff og transport 7000, Bompenger og parkering 7140, Reklame og nettside 7320,
  Gebyrer (Vipps, kort, bank) 7770, Annet 7790.

Owner may insert and update (name, account_no, active, sort). `system_key` and `kind` are
immutable after insert (guard trigger). No deletes.

### 3.2 `market_takings` (dagsoppgjør)

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| market_day_id | uuid not null unique references market_days | one takings per market day |
| vipps_ore, card_ore, cash_ore | int not null default 0, each ≥ 0 | |
| note | text | |
| created_by | uuid not null default auth.uid() | guard: must equal auth.uid() |
| created_at | timestamptz default now() | |
| voided_at, voided_by, void_reason | | as entries |

- Check: at least one amount > 0; each amount ≤ 100 000 000 øre (NOK 1 000 000).
- Guard: the market day's date is not in the future (Oslo date) and the market day is not
  cancelled.
- After insert trigger creates one `ledger_entries` row per non-zero amount: kind income,
  category `market_sales`, `entry_date` = market day date, payment method vipps/card/cash,
  description "Dagsoppgjør <place> <date>", `takings_id` set, `created_by` = takings creator.
- Voiding a takings (owner) voids its entries in the same transaction. Its amounts cannot be
  updated; a wrong takings is voided and registered again (the unique constraint is on
  non-voided rows: partial unique index `where voided_at is null`).

### 3.3 `ledger_entries`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| number | text not null unique | `R-YYYY-NNN`, YYYY = year of entry_date, assigned by trigger with `next_number('ledger', year)` |
| kind | text not null check in ('income','expense') | must match category kind |
| entry_date | date not null | guard: not more than 1 day in the future (Oslo) |
| category_id | uuid not null references ledger_categories | |
| amount_ore | int not null check (amount_ore > 0 and amount_ore <= 100000000) | |
| counterparty | text | supplier (expense) or customer (income) |
| description | text not null, 1–200 chars | |
| payment_method | text not null check in ('vipps','card','cash','bank','private','unpaid') | |
| due_date | date | required when payment_method = 'unpaid' (check) |
| settled_at | timestamptz | owner sets: bill paid (`unpaid`) or person repaid (`private`) |
| settled_by | uuid | |
| takings_id | uuid references market_takings | set only by the takings trigger |
| created_by | uuid not null default auth.uid() | guard: must equal auth.uid() |
| created_at | timestamptz default now() | |
| voided_at, voided_by | timestamptz, uuid | |
| void_reason | text | required (≥ 3 chars) when voided |

Meanings:
- `private` (Lagt ut privat): someone paid with their own money and must be repaid. Shown
  with the creator's name in "Skyldes tilbake" until settled.
- `unpaid` (Ubetalt regning): a bill to pay later. Shown in "Ubetalte regninger" until settled.
- Income entries use vipps/card/cash/bank only (check).

Guards (before insert/update trigger, security definer, existing style):
- Insert: role owner or seller; `created_by = auth.uid()`; `takings_id` must be null unless
  inserted by the takings trigger (`pg_trigger_depth() > 1`); sellers may only insert
  `kind = 'expense'` directly (their income comes through takings); category active and
  kind matches.
- Update: owner only. `number`, `kind`, `created_by`, `created_at`, `takings_id` never change.
  Entries with a `takings_id` may only be voided (amounts come from the takings).
  A voided entry cannot be changed or un-voided.
- Delete: blocked by trigger for every role (in addition to no grant).

### 3.4 `ledger_receipts`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| entry_id | uuid references ledger_entries | exactly one of entry_id / takings_id |
| takings_id | uuid references market_takings | |
| storage_key | text not null unique | `receipts/<yyyy>/<uuid>.<ext>` |
| file_name | text not null | original name, sanitised |
| mime_type | text not null check in ('image/jpeg','image/png','image/webp','image/heic','application/pdf') | |
| size_bytes | int not null check (size_bytes between 1 and 10485760) | 10 MB |
| sha256 | text not null | |
| uploaded_by | uuid not null default auth.uid() | |
| uploaded_at | timestamptz default now() | |

- Several receipts per entry are allowed.
- Insert: owner, or a seller attaching to an entry/takings they created. No update, no delete
  (trigger + no grant).

### 3.5 Audit with old values

New trigger function `public.audit_row_with_old()` writing
`data = jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))` on update, and the
row on insert. Applied to `ledger_categories`, `ledger_entries`, `market_takings`,
`ledger_receipts`. Existing `audit_row()` stays unchanged for older tables.

### 3.6 RLS and grants

| Table | owner | seller | picker / anon |
|---|---|---|---|
| ledger_categories | select, insert, update | select active | none |
| market_takings | select all, insert, update (void only) | select own created in last 30 days, insert | none |
| ledger_entries | select all, insert, update | select own created in last 30 days, insert (expense) | none |
| ledger_receipts | select all, insert | select/insert for own entries/takings in last 30 days | none |

No delete grants anywhere. `anon` has no grants on any ledger table.

### 3.7 Reporting functions (owner only, security invoker)

- `ledger_totals(p_from date, p_to date)` → income, expense, profit (non-voided).
- `ledger_by_category(p_from, p_to)` → kind, category, account_no, total.
- `ledger_by_month(p_from, p_to)` → month, income, expense, profit.
- `mva_meter()` → income in the last 12 months (Oslo date window) and the limit 5 000 000 øre.

Totals are also computed in TypeScript for the export and checked against these in tests.

## 4. Receipt storage

- `src/lib/storage/receipts.ts` exposes `putReceipt(key, bytes, mime)` and
  `getReceipt(key) → { stream, mime }`. Today it uses a **private** Supabase Storage bucket
  `receipts` through the service-role client, server side only. Moving to Railway means
  replacing this one file (e.g. S3-compatible bucket or volume).
- The bucket has no public access and no storage RLS policies for anon/authenticated; all
  access goes through the app.
- Upload path: client picks or photographs a file (`<input type="file" accept="image/*,application/pdf" capture="environment">`).
  Images are downscaled in the browser to max 2000 px long side, JPEG quality 0.85, before
  upload, keeping files well under the server-action body limit. PDFs upload as is (max 10 MB;
  check the Next 16 docs in `node_modules/next/dist/docs/` for the server-action body size
  setting and raise it to 11 MB if needed).
- Server action validates role, ownership, mime by magic bytes (not only the header), size,
  computes sha256, stores the file, then inserts the `ledger_receipts` row with the user's
  session client (so RLS applies). If the row insert fails, the stored object is removed
  (best effort) — this is the only delete the app ever performs, on an orphan file.
- Viewing: `GET /api/receipts/[id]` reads the row with the user's session client (RLS decides
  access), then streams the object with `Content-Disposition: inline` and
  `Cache-Control: private, no-store`. 404 when RLS hides the row.

## 5. Screens (admin, Norwegian)

New tab **Regnskap** in the admin shell for owner and seller (hidden for pickers).

### 5.1 `/admin/regnskap`
- **Seller view:** two large buttons "Dagsoppgjør" and "Ny utgift", then "Mine registreringer"
  (own entries and takings, last 30 days, with receipt status).
- **Owner view:**
  - Cards: Inntekt / Kostnader / Resultat for denne måneden and i år.
  - Alerts: "N poster mangler kvittering", "Ubetalte regninger (sum)", "Skyldes tilbake"
    (per person, sum).
  - MVA meter: income last 12 months vs NOK 50 000, with text "Grensen gjelder hele
    DONTPANIC AS – ta med annen omsetning." Amber from 80 %, red from 100 %.
  - The same two buttons, and links to Poster, Kategorier, Eksport.

### 5.2 `/admin/regnskap/dagsoppgjor`
Market day select (past and today, not cancelled, without non-voided takings), three amount
fields (kr, comma or dot decimals), total shown live, note, attach report (optional but
warned). Saves, then shows the created entry numbers.

### 5.3 `/admin/regnskap/utgift/ny`
Date (default today), amount, category, supplier, description, payment (Kort, Vipps, Kontant,
Bank, Lagt ut privat, Ubetalt regning → due date), receipt photo. Sellers' form is the same.
After save: "Registrert som R-2027-014" with "Ny utgift" again.

### 5.4 `/admin/regnskap/inntekt/ny` (owner)
Date, amount, category (income), customer, description, payment (Vipps, Kort, Kontant, Bank),
optional attachment.

### 5.5 `/admin/regnskap/poster` (owner)
Table/cards with filters: period, kind, category, "mangler kvittering", "ubetalt",
"lagt ut privat", "vis annullerte". Row opens `/admin/regnskap/poster/[id]`: all fields,
receipts (thumbnail/PDF link), history from audit log, actions: Rediger, Marker betalt /
Marker tilbakebetalt, Last opp kvittering, Annuller (reason required).

### 5.6 `/admin/regnskap/kategorier` (owner)
List per kind, add, rename, change account number, deactivate/activate, reorder.

### 5.7 `/admin/regnskap/eksport` (owner)
Choose period (this month, last month, this year, last year, custom). Two downloads:
- `GET /api/regnskap/export.xlsx?from=&to=` — sheets **Poster** (number, date, kind, category,
  account, counterparty, description, payment, amount kr, receipt file names, voided + reason),
  **Per kategori** (account, category, income, expense), **Per måned**. Voided entries listed
  but excluded from sums; amounts as numbers with `#,##0.00` format; header row frozen.
- `GET /api/regnskap/receipts.zip?from=&to=` — every receipt of entries/takings in the
  period, named `<entry number> <category> <counterparty>.<ext>` (sanitised; takings receipts
  named after the takings' first entry number with suffix `-rapport`; duplicates get `-2`, `-3`).
  Streams; no temporary files.

Dependencies: `exceljs` for xlsx, `fflate` for zip.

All screens follow the existing admin design (Task 10: Apple style, dark mode, motion with
reduced-motion respected, tab bar on phone).

## 6. Error handling

- Database guards are the final word; their exceptions map to Norwegian messages through the
  existing `src/lib/errors.ts` pattern (add codes for every new guard).
- Upload failures keep the form values and say what went wrong; an entry saved without a
  receipt shows "Mangler kvittering" and can get one later.
- Double submit: forms disable on submit; takings uniqueness is enforced by the partial
  unique index; expense double-tap is prevented by a client-generated idempotency key
  (`client_key uuid unique` on `ledger_entries`, nullable).
- Export with no entries returns a valid file with headers only.

## 7. Testing

- **pgTAP** (`supabase/tests/ledger.test.sql`): every row of §3.6 for each role; delete blocked
  for owner; seller cannot read others' or older-than-30-days rows; seller cannot insert income
  directly; takings creates the right entries and voiding cascades; number series per year and
  gap-free under sequential inserts; immutability of posted columns; voided cannot change;
  audit row has old and new; category kind mismatch rejected; future-date guards.
- **Vitest:** kr parsing/formatting (comma, dot, spaces, negatives rejected), period helpers
  (month, year, rolling 12 months in Oslo time), MVA meter thresholds, export sums equal line
  sums, zip file naming and sanitising, magic-byte mime detection.
- **Playwright:** seller registers takings with a photo on a phone viewport and sees it in
  "Mine registreringer"; seller registers an expense "Lagt ut privat"; owner sees it under
  "Skyldes tilbake" and marks it repaid; owner voids an entry and totals change; owner edits an
  entry and history shows old value; picker gets no Regnskap tab and 404/redirect on the URLs;
  export downloads an .xlsx and a .zip with expected names.

## 8. Deployment

- Migration applied to hosted Supabase through the SQL editor as before (owner clicks Run);
  recorded in `supabase_migrations.schema_migrations`.
- Storage bucket `receipts` created private in the hosted project (SQL in the migration via
  `storage.buckets` insert, `public = false`).
- No new env vars.

## 9. Build process

- Claude writes the implementation plan with complete code per task.
- Codex (bundled with the ChatGPT app, run as `codex exec`) implements one task at a time on
  branch `regnskap`, runs the task's tests, and commits. It never pushes to `main`.
- Claude reviews each task's diff (spec compliance, security, tests) and sends fixes back.
- Merge to `main` and deploy only when the owner says so.

## 10. Out of scope

Double-entry ledger, balance sheet, MVA reporting, period locking, bank import, invoices,
per-sale market registration, wages and time tracking, the rest of DONTPANIC AS's activity,
automatic posting to an external accounting program.

## 11. Relationship to the system spec

The system spec's §3.7–3.9 (full NS 4102 double-entry books) assumed the app held the AS's
legal books. The owner chose a subledger instead. If the AS later moves its main books into
the app, entries carry date, account number, amount and receipt, so they can be converted to
vouchers. Market sales (§3.5) and invoices (§3.6), when built, will create `ledger_entries`
(income) instead of journal lines.
