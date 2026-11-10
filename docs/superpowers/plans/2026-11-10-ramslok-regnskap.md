# Ramsløk bookkeeping (regnskap) Implementation Plan

> **For agentic workers:** Implement ONE task per run, in order. Steps use checkbox (`- [ ]`) syntax.
> Work only on branch `regnskap`. Never push, never merge, never touch `main`. Commit at the end
> of each task with the message given. If a step's expected output differs, stop and report.

**Goal:** A ramsløk subledger in `/admin/regnskap`: expenses with receipts, daily takings per
market day, other income, owner overview with MVA meter, entry management, categories, and
Excel + receipt-zip export.

**Architecture:** Four new Postgres tables with guard triggers and RLS (database is the final
guard, same style as `20261106000003_packing_stock.sql`). Receipts live in a private Supabase
Storage bucket behind `src/lib/storage/receipts.ts`. Pages are server components under
`src/app/admin/(app)/regnskap/`, mutations are server actions using the user's session client
(RLS applies); only receipt bytes use the service-role client.

**Tech Stack:** Next.js 16.4.5 (read `node_modules/next/dist/docs/` before using any Next API —
this is NOT the Next.js in your training data), React 19, Supabase (Postgres, Storage), pgTAP,
Vitest, Playwright, `exceljs`, `fflate`.

**Spec:** `docs/superpowers/specs/2026-11-10-ramslok-regnskap-design.md` — read it before every task.

## Global Constraints

- UI text Norwegian bokmål; code, comments, identifiers English.
- Money is integer øre everywhere (DB and TS). Max single amount 100 000 000 øre. Amounts > 0.
- Dates are Europe/Oslo calendar dates; use `todayOslo()` from `src/lib/domain/time.ts` in TS and
  `(now() at time zone 'Europe/Oslo')::date` in SQL.
- No MVA fields anywhere. MVA limit constant: `MVA_LIMIT_ORE = 5_000_000`.
- Entry numbers: `R-YYYY-NNN` (NNN zero-padded to at least 3), series key `'ledger'`, year of `entry_date`.
- Nothing in the ledger tables is ever deleted; no delete grants; delete-blocking triggers.
- Every SQL function: `security definer set search_path = ''` (or `security invoker` where stated),
  then `revoke all ... from public, anon, authenticated` and grant only what is listed.
- Admin UI uses existing components in `src/features/admin/ui/` (`Page`, `LargeTitle`, `Sheet`,
  `ResponsiveSheet`, `useToast`) and existing form patterns (`src/app/admin/(app)/marked/`).
- Server actions return `ActionResult` from `src/lib/action-result.ts`; client calls go through `callAction`.
- New guard error codes are added to `dbErrorToMessage` in `src/lib/errors.ts` (Task 1 lists them).
- Test commands: `npm test` (Vitest), `npm run test:db` (pgTAP, needs `npm run db:start`),
  `npm run test:e2e` (Playwright, needs local Supabase and `.env.local` pointing at it), `npm run lint`,
  `npx tsc --noEmit`.

## Review Focus

1. A seller reading another seller's entries, receipts or any totals through PostgREST directly (not the UI) — must return nothing. Pinned in Task 1/2 pgTAP.
2. A receipt URL (`/api/receipts/<id>`) opened by a picker, a different seller, or after 30 days by the uploading seller — must 404. Pinned in Task 4 e2e.
3. Amount typed as `1 234,50`, `1234.5`, `kr 300`, `0`, `-5`, `12,345` — parse to øre or a clear error; never silently ×100 wrong. Pinned in Task 3.
4. Double tap on "Lagre" on a slow phone — exactly one entry (client_key) and one takings per market day. Pinned in Task 1 pgTAP and Task 6 e2e.
5. A file renamed `.jpg` that is really HTML/SVG uploaded as a receipt — rejected by magic bytes; never served inline as HTML. Pinned in Task 3 unit and Task 4 action test.

---

### Task 1: Ledger core migration (categories, entries, audit, RLS)

**Files:**
- Create: `supabase/migrations/20261110000008_ledger.sql`
- Create: `supabase/tests/ledger.test.sql`
- Modify: `src/lib/errors.ts`, `src/lib/errors.test.ts`

**Interfaces:**
- Produces tables `public.ledger_categories`, `public.ledger_entries` exactly as spec §3.1, §3.3,
  plus `client_key uuid unique` (nullable) on `ledger_entries`.
- Produces `public.audit_row_with_old()` (spec §3.5) and `public.ledger_no_delete()`.
- Error codes raised (message text exactly): `LEDGER_NO_DELETE`, `LEDGER_IMMUTABLE`,
  `LEDGER_VOIDED`, `LEDGER_FUTURE_DATE`, `LEDGER_CATEGORY_MISMATCH`, `LEDGER_CATEGORY_INACTIVE`,
  `LEDGER_INCOME_VIA_TAKINGS`, `LEDGER_VOID_REASON`, `LEDGER_SETTLE_INVALID`. Role failures use
  `raise exception 'insufficient_privilege' using errcode = '42501'`.

- [ ] **Step 1: Write `supabase/tests/ledger.test.sql`** (pgTAP, same structure as
  `packing_stock.test.sql`, `\ir helpers.psql`, `tests.login_as(role)`). Tests, each one assertion:
  1. seeded categories: 3 income, 9 expense; `Salg marked` has `system_key='market_sales'`, account `3000`.
  2. owner inserts expense (Emballasje, 12345 øre, payment `card`) → `number` matches `^R-\d{4}-\d{3,}$`.
  3. second insert same year → number suffix is previous + 1.
  4. entry dated next year gets a series starting at `001` for that year.
  5. seller inserts own expense → ok; `created_by` = seller id.
  6. seller inserting with `created_by` of another user → 42501.
  7. seller inserting `kind='income'` → `LEDGER_INCOME_VIA_TAKINGS`.
  8. seller inserting with a non-null `takings_id` → `LEDGER_INCOME_VIA_TAKINGS` (only trigger depth > 1 may set it; for an expense raise the same code).
  9. picker insert → 42501.
  10. `entry_date` = Oslo today + 2 → `LEDGER_FUTURE_DATE`; today + 1 → ok.
  11. expense with an income category → `LEDGER_CATEGORY_MISMATCH`.
  12. inactive category → `LEDGER_CATEGORY_INACTIVE`.
  13. `payment_method='unpaid'` with null `due_date` → check violation (23514).
  14. income with `payment_method='private'` → 23514.
  15. amount 0 and 100000001 → 23514 (two `throws_ok`).
  16. seller A sees own entry (count 1), seller B sees 0 of A's, picker sees 0, anon (`tests.logout()` then `set local role anon`) sees 0.
  17. seller's own entry with `created_at` set (as postgres) to now() - 31 days → seller sees 0.
  18. seller update of own entry → 0 rows affected or 42501 (assert row unchanged).
  19. owner update `amount_ore` → ok; `audit_log` latest row for that id has `data->'old'->>'amount_ore'` = old value and `data->'new'->>'amount_ore'` = new.
  20. owner update of `number`, `created_by`, `kind` → `LEDGER_IMMUTABLE` (three asserts).
  21. owner void without reason → `LEDGER_VOID_REASON`; with reason `'Feil beløp'` → ok.
  22. owner update of a voided entry (any column, incl. clearing `voided_at`) → `LEDGER_VOIDED`.
  23. owner sets `settled_at` on a `card` entry → `LEDGER_SETTLE_INVALID`; on `private` → ok and `settled_by` = owner.
  24. owner `delete from ledger_entries` → `LEDGER_NO_DELETE` (as postgres too: raise for every role).
  25. same `client_key` twice → 23505.
  26. category: owner insert/rename ok; seller insert → 42501; owner change `kind` or `system_key` → `LEDGER_IMMUTABLE`; delete → `LEDGER_NO_DELETE`.
  27. seller selects categories → only active ones.

- [ ] **Step 2: Run** `npm run test:db` → FAIL (relations missing).

- [ ] **Step 3: Write the migration.** Header comment: `-- Ledger (subledger for ramsløk): categories, entries, audit with old values.`
  Contents, in order:
  - `audit_row_with_old()`: on INSERT writes `jsonb_build_object('new', to_jsonb(new))`, on UPDATE
    `jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))`; actor `auth.uid()`; row_id `new.id`.
  - `ledger_no_delete()`: `raise exception 'LEDGER_NO_DELETE'`. Before-delete trigger on every ledger table (this task: categories, entries).
  - Tables per spec with the checks listed. `ledger_entries.takings_id` is a plain `uuid` column here;
    Task 2 adds the foreign key to `market_takings` with `alter table`. `ledger_entries.payment_method` check plus
    `check (kind = 'expense' or payment_method in ('vipps','card','cash','bank'))`,
    `check (payment_method <> 'unpaid' or due_date is not null)`,
    `check ((voided_at is null) = (voided_by is null))`.
    Unique index `ledger_categories_kind_name on (kind, lower(name))`.
  - Seed categories (spec §3.1) with `sort` 10, 20, 30… in listed order.
  - `ledger_entries_number()` before insert: `new.number := 'R-' || y || '-' || lpad(public.next_number('ledger', y)::text, 3, '0')` where `y = extract(year from new.entry_date)::int`. Ignore any client-supplied number.
  - `ledger_entries_guard()` before insert or update (logic below — not determined by tests alone):

```sql
if tg_op = 'INSERT' then
  if auth.uid() is not null then
    if coalesce(public.app_role()::text,'') not in ('owner','seller') then
      raise exception 'insufficient_privilege' using errcode = '42501'; end if;
    if new.created_by is distinct from auth.uid() then
      raise exception 'insufficient_privilege' using errcode = '42501'; end if;
  end if;
  if new.takings_id is not null and pg_trigger_depth() < 2 then raise exception 'LEDGER_INCOME_VIA_TAKINGS'; end if;
  if new.kind = 'income' and new.takings_id is null and public.app_role() is distinct from 'owner' and auth.uid() is not null then
    raise exception 'LEDGER_INCOME_VIA_TAKINGS'; end if;
  if new.entry_date > (now() at time zone 'Europe/Oslo')::date + 1 then raise exception 'LEDGER_FUTURE_DATE'; end if;
  -- category: exists, active, same kind
  new.voided_at := null; new.voided_by := null; new.void_reason := null;
  new.settled_at := null; new.settled_by := null; new.created_at := now();
  return new;
end if;
-- UPDATE
-- Trusted maintenance (postgres / service role, auth.uid() is null) may update freely: tests and
-- support fixes use this. Deletes stay blocked for everyone (ledger_no_delete).
if auth.uid() is null then return new; end if;
if public.app_role() is distinct from 'owner' then
  raise exception 'insufficient_privilege' using errcode = '42501'; end if;
if old.voided_at is not null then raise exception 'LEDGER_VOIDED'; end if;
if new.number is distinct from old.number or new.kind is distinct from old.kind
   or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
   or new.takings_id is distinct from old.takings_id or new.client_key is distinct from old.client_key
   then raise exception 'LEDGER_IMMUTABLE'; end if;
if old.takings_id is not null and (new.amount_ore, new.entry_date, new.category_id, new.payment_method)
   is distinct from (old.amount_ore, old.entry_date, old.category_id, old.payment_method)
   then raise exception 'LEDGER_IMMUTABLE'; end if;
if new.voided_at is not null then
  if length(coalesce(trim(new.void_reason),'')) < 3 then raise exception 'LEDGER_VOID_REASON'; end if;
  new.voided_by := auth.uid();
end if;
if new.settled_at is not null and old.settled_at is null then
  if new.payment_method not in ('unpaid','private') then raise exception 'LEDGER_SETTLE_INVALID'; end if;
  new.settled_by := auth.uid();
end if;
-- re-check future date and category (same as insert) when changed
return new;
```
  - `ledger_categories_guard()` before insert/update: owner only (when `auth.uid()` not null); on update `kind` and `system_key` immutable (`LEDGER_IMMUTABLE`).
  - Audit triggers (`after insert or update`) using `audit_row_with_old()` on both tables.
  - RLS enabled on both. Policies:
    - categories: select for authenticated using `app_role()='owner' or (app_role()='seller' and active)`; insert/update for owner.
    - entries: select using `app_role()='owner' or (app_role()='seller' and created_by = auth.uid() and created_at > now() - interval '30 days')`; insert with check `app_role() in ('owner','seller')`; update using/with check `app_role()='owner'`.
  - Grants: `revoke all on <tables> from anon, authenticated;` then `grant select, insert, update on ledger_categories, ledger_entries to authenticated;` No delete.

- [ ] **Step 4: Run** `npm run db:reset && npm run test:db` → all files PASS.

- [ ] **Step 5: Errors.** Add tests in `src/lib/errors.test.ts` and mappings in `dbErrorToMessage`:
  `LEDGER_NO_DELETE` → 'Poster og kvitteringer kan ikke slettes. Annuller i stedet.';
  `LEDGER_IMMUTABLE` → 'Dette feltet kan ikke endres.';
  `LEDGER_VOIDED` → 'Posten er annullert og kan ikke endres.';
  `LEDGER_FUTURE_DATE` → 'Datoen kan ikke være i fremtiden.';
  `LEDGER_CATEGORY_MISMATCH` → 'Kategorien passer ikke til typen post.';
  `LEDGER_CATEGORY_INACTIVE` → 'Kategorien er ikke i bruk lenger.';
  `LEDGER_INCOME_VIA_TAKINGS` → 'Inntekt fra marked registreres som dagsoppgjør.';
  `LEDGER_VOID_REASON` → 'Skriv en grunn for annulleringen.';
  `LEDGER_SETTLE_INVALID` → 'Bare ubetalte regninger og utlegg kan markeres som oppgjort.'.
  Run `npm test` → PASS.

- [ ] **Step 6: Commit** `git add -A supabase src/lib && git commit -m "feat(ledger): categories and entries with guards, RLS and audit"`

---

### Task 2: Takings, receipts metadata, report functions, bucket

**Files:**
- Create: `supabase/migrations/20261110000009_ledger_takings.sql`
- Create: `supabase/tests/ledger_takings.test.sql`
- Modify: `src/lib/errors.ts`, `src/lib/errors.test.ts`

**Interfaces:**
- Consumes: Task 1 tables, `audit_row_with_old()`, `ledger_no_delete()`.
- Produces: `public.market_takings`, `public.ledger_receipts` (spec §3.2, §3.4);
  functions `ledger_totals(p_from date, p_to date) returns table(income_ore bigint, expense_ore bigint, profit_ore bigint)`,
  `ledger_by_category(p_from date, p_to date) returns table(kind text, category text, account_no text, total_ore bigint)`,
  `ledger_by_month(p_from date, p_to date) returns table(month date, income_ore bigint, expense_ore bigint, profit_ore bigint)`,
  `mva_meter() returns table(income_ore bigint, limit_ore bigint, window_from date)`;
  storage bucket `receipts`.
- New error codes: `TAKINGS_FUTURE_DAY`, `TAKINGS_CANCELLED_DAY`, `TAKINGS_EMPTY`,
  `RECEIPT_PARENT_INVALID`.

- [ ] **Step 1: Write `supabase/tests/ledger_takings.test.sql`.** Fixtures: a past market day,
  a cancelled past market day, a future market day (insert as postgres into `market_days`).
  1. seller inserts takings (vipps 435000, card 210000, cash 0) → 2 entries created, both `kind='income'`, category `market_sales`, `entry_date` = market date, `takings_id` set, `created_by` = seller, payment methods vipps and card, description starts `Dagsoppgjør `.
  2. all amounts 0 → `TAKINGS_EMPTY`.
  3. future market day → `TAKINGS_FUTURE_DAY`; cancelled → `TAKINGS_CANCELLED_DAY`.
  4. second non-voided takings same market day → 23505.
  5. picker insert → 42501.
  6. seller update of takings → 42501/0 rows; owner update of `vipps_ore` → `LEDGER_IMMUTABLE`.
  7. owner voids takings (`voided_at = now()`, `void_reason='Feil dag'`) → both its entries voided with the same reason; then a new takings for the same day is allowed.
  8. owner direct void of a takings-created entry → ok; owner change of its amount → `LEDGER_IMMUTABLE`.
  9. receipts: seller inserts receipt on own entry → ok; on another seller's entry → `RECEIPT_PARENT_INVALID`; with both or neither parent → 23514; on own takings → ok; picker → 42501; update → 42501 or 0 rows; delete → `LEDGER_NO_DELETE`.
  10. seller B selects receipts of seller A → 0; owner → all.
  11. `ledger_totals` over the fixture month as owner = sums of non-voided rows; voided excluded; as seller → 42501.
  12. `ledger_by_category` returns `account_no` and totals; `ledger_by_month` buckets by `date_trunc('month', entry_date)`.
  13. `mva_meter()` counts non-voided income with `entry_date > today - 12 months` and `<= today`; an entry exactly 12 months ago is excluded; `limit_ore = 5000000`.
  14. `storage.buckets` has `receipts` with `public = false`.

- [ ] **Step 2: Run** `npm run test:db` → new file FAILS.

- [ ] **Step 3: Write the migration.**
  - `alter table public.ledger_entries add constraint ledger_entries_takings_fk foreign key (takings_id) references public.market_takings(id);`
  - Takings guard update branch: same trusted-maintenance rule as entries (`auth.uid() is null` → return new).
  - `market_takings` per spec; partial unique index `market_takings_day_active on (market_day_id) where voided_at is null` (no plain unique); checks: each amount between 0 and 100000000, `vipps_ore + card_ore + cash_ore > 0` is NOT a check (raise `TAKINGS_EMPTY` in guard so the message maps), void columns as entries.
  - `market_takings_guard()` before insert/update: insert — role owner/seller, `created_by = auth.uid()`, market day exists, not cancelled (`TAKINGS_CANCELLED_DAY`), `market_date <= Oslo today` (`TAKINGS_FUTURE_DAY`), sum > 0 (`TAKINGS_EMPTY`); update — owner only, only `voided_at`/`void_reason` may change (`LEDGER_IMMUTABLE`), voided cannot change (`LEDGER_VOIDED`), reason ≥ 3 chars, set `voided_by`.
  - `market_takings_to_entries()` after insert: one `ledger_entries` insert per non-zero amount with `payment_method` vipps/card/cash, category id from `system_key='market_sales'`, description `'Dagsoppgjør ' || place_name || ' ' || to_char(market_date,'DD.MM.YYYY')`, `created_by = new.created_by`, `takings_id = new.id`.
  - `market_takings_void_entries()` after update when `voided_at` went from null to non-null: `update ledger_entries set voided_at = new.voided_at, void_reason = new.void_reason where takings_id = new.id and voided_at is null`.
  - `ledger_receipts` per spec; `check ((entry_id is null) <> (takings_id is null))`; guard before insert: role owner/seller; seller must own the parent (`created_by = auth.uid()`) and parent not voided, else `RECEIPT_PARENT_INVALID`; `uploaded_by = auth.uid()`; before update → `raise exception 'insufficient_privilege' using errcode='42501'`.
  - Delete triggers (`ledger_no_delete`) and audit triggers (`audit_row_with_old`) on both tables.
  - RLS: takings select like entries; insert owner/seller; update owner. Receipts select: owner, or seller where the parent entry/takings is visible to them (`exists (select 1 from ledger_entries e where e.id = entry_id)` or same for takings — RLS of the parent applies); insert owner/seller.
  - Grants: select, insert, update on `market_takings`; select, insert on `ledger_receipts` to authenticated.
  - Report functions: `language sql stable security invoker set search_path = ''`, each begins with a guard: wrap in plpgsql or use `public.require_owner()` — create `public.require_owner()` (plpgsql, raises 42501 unless `app_role()='owner'`) and call it first. Grant execute to authenticated.
  - Bucket: `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('receipts','receipts', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','application/pdf']) on conflict (id) do nothing;` No storage.objects policies.

- [ ] **Step 4: Run** `npm run db:reset && npm run test:db` → all PASS.

- [ ] **Step 5: Errors.** Map `TAKINGS_FUTURE_DAY` → 'Markedsdagen har ikke vært ennå.', `TAKINGS_CANCELLED_DAY` → 'Markedsdagen er avlyst.', `TAKINGS_EMPTY` → 'Fyll inn minst ett beløp.', `RECEIPT_PARENT_INVALID` → 'Du kan bare legge kvittering på dine egne poster.'. Tests + `npm test` PASS.

- [ ] **Step 6: Commit** `git commit -am "feat(ledger): daily takings, receipt records, reports and bucket"` (add new files first).

---

### Task 3: Domain helpers (money, periods, meter, sniffing, file names, summaries)

**Files:**
- Create: `src/lib/domain/money.ts` + `.test.ts`, `src/lib/domain/periods.ts` + `.test.ts`,
  `src/lib/domain/ledger.ts` + `.test.ts`, `src/lib/domain/file-sniff.ts` + `.test.ts`

**Interfaces (produces):**
```ts
// money.ts
export function parseKr(input: string): number | null          // øre, null if invalid/≤0/>100_000_000
export function formatKr(ore: number): string                  // 'kr 1 234,50' (nb-NO, always 2 decimals, NBSP group sep allowed)
export function oreToKrNumber(ore: number): number             // 1234.5 for Excel cells
// periods.ts
export type Period = { from: string; to: string }              // inclusive YYYY-MM-DD
export type PeriodPreset = 'this-month' | 'last-month' | 'this-year' | 'last-year'
export function presetPeriod(p: PeriodPreset, today: string): Period
export function parsePeriod(from: string | null, to: string | null): Period | null // valid dates, from <= to, span ≤ 3 years
export function monthKey(date: string): string                 // 'YYYY-MM'
// ledger.ts
export const MVA_LIMIT_ORE = 5_000_000
export type MeterLevel = 'ok' | 'warn' | 'over'
export function meterLevel(incomeOre: number): MeterLevel      // warn from 80 %, over from 100 %
export type LedgerKind = 'income' | 'expense'
export type PaymentMethod = 'vipps' | 'card' | 'cash' | 'bank' | 'private' | 'unpaid'
export const PAYMENT_LABEL: Record<PaymentMethod, string>       // Vipps, Kort, Kontant, Bank, Lagt ut privat, Ubetalt regning
export type ExportEntry = { number: string; entryDate: string; kind: LedgerKind; category: string; accountNo: string;
  counterparty: string | null; description: string; paymentMethod: PaymentMethod; amountOre: number;
  voided: boolean; voidReason: string | null; receiptNames: string[] }
export function summarize(entries: ExportEntry[]): {
  totals: { incomeOre: number; expenseOre: number; profitOre: number }
  byCategory: { accountNo: string; category: string; incomeOre: number; expenseOre: number }[] // sorted by accountNo, category
  byMonth: { month: string; incomeOre: number; expenseOre: number; profitOre: number }[]      // sorted ascending
}                                                              // voided entries excluded
export function receiptFileName(parts: { number: string; category: string; counterparty: string | null; suffix?: string; ext: string }): string
export function uniqueNames(names: string[]): string[]         // 'a.jpg','a.jpg' -> 'a.jpg','a-2.jpg'
// file-sniff.ts
export type ReceiptMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'application/pdf'
export function sniffMime(bytes: Uint8Array): ReceiptMime | null
export const MIME_EXT: Record<ReceiptMime, string>              // jpg png webp heic pdf
```

- [ ] **Step 1: Write the tests.** Exact cases:
  - `parseKr`: `'1234,50'`→123450, `'1 234,50'`→123450, `'1234.5'`→123450, `'kr 300'`→30000, `'300,-'`→30000, `' 45 '`→4500, `'0'`→null, `'-5'`→null, `'12,345'`→null (3 decimals), `'1.234,50'`→null (ambiguous), `'abc'`→null, `''`→null, `'1000000'`→100000000, `'1000000,01'`→null.
  - `formatKr(123450)` matches `/^kr 1\s234,50$/`; `formatKr(0)` = `'kr 0,00'`.
  - `presetPeriod('this-month','2027-03-15')` = `{from:'2027-03-01',to:'2027-03-31'}`; `'last-month'` on `'2027-01-10'` = Dec 2026; `'this-year'`, `'last-year'`; February 2028 ends `'2028-02-29'`.
  - `parsePeriod('2027-02-30','2027-03-01')`→null; reversed →null; span 4 years → null.
  - `meterLevel(3_999_999)`='ok', `4_000_000`='warn', `5_000_000`='over'.
  - `summarize`: two income (one voided), two expense in two months, two categories → exact totals, voided excluded, sort orders.
  - `receiptFileName({number:'R-2027-014',category:'Emballasje',counterparty:'Bunnpris / Nesodden',ext:'jpg'})` = `'R-2027-014 Emballasje Bunnpris Nesodden.jpg'` (strip `/\\:*?"<>|` and control chars, collapse spaces, max 120 chars before extension); with `suffix:'rapport'` → `'R-2027-014-rapport Salg marked.jpg'` when counterparty null.
  - `sniffMime`: JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, WEBP `RIFF....WEBP`, PDF `%PDF-`, HEIC bytes 4–11 `ftypheic` / `ftypheix` / `ftypmif1`; `<svg`, `<!DOCTYPE html`, empty, 3 random bytes → null.

- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement** the four files. `parseKr` rule: strip `kr`, spaces/NBSP and a trailing `,-`; then accept `^\d+([.,]\d{1,2})?$` only.
- [ ] **Step 4: Run** `npm test` → PASS; `npx tsc --noEmit` → no errors.
- [ ] **Step 5: Commit** `git add src/lib/domain && git commit -m "feat(ledger): money, period, meter, export naming and file sniffing helpers"`

---

### Task 4: Receipt storage, upload action, viewing route

**Files:**
- Create: `src/lib/storage/receipts.ts`
- Create: `src/app/admin/(app)/regnskap/receipt-actions.ts`
- Create: `src/app/api/receipts/[id]/route.ts`
- Create: `src/features/regnskap/downscale.ts`, `src/features/regnskap/ReceiptInput.tsx`
- Modify: `next.config.ts` (server action body limit, only if the Next 16 docs say the default is below 11 MB)
- Test: `src/app/admin/(app)/regnskap/receipt-actions.test.ts` (Vitest with mocked storage + supabase), `tests/e2e/regnskap-receipts.spec.ts`

**Interfaces:**
- Produces:
```ts
// src/lib/storage/receipts.ts  ('server-only')
export async function putReceipt(key: string, bytes: Uint8Array, mime: ReceiptMime): Promise<void>
export async function getReceipt(key: string): Promise<{ body: ReadableStream<Uint8Array>; mime: string } | null>
export async function removeOrphanReceipt(key: string): Promise<void>   // best effort, never throws
// receipt-actions.ts ('use server')
export async function uploadReceipt(form: FormData): Promise<ActionResult & { receiptId?: string }>
//   form fields: parent ('entry' | 'takings'), parent_id (uuid), file (File)
// downscale.ts (client)
export async function prepareReceiptFile(file: File): Promise<File>    // images → JPEG ≤2000px long side, q=0.85; PDF unchanged
// ReceiptInput.tsx (client)
export function ReceiptInput(props: { name?: string; onChange?: (f: File | null) => void }): JSX.Element
//   <input type="file" accept="image/*,application/pdf" capture="environment">, shows thumbnail/filename, "Ta bilde" label
```
- Route: `GET /api/receipts/[id]` → 200 stream with the stored mime, `Content-Disposition: inline; filename="<file_name>"`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`; 404 when not found via the user's session client (RLS) or signed out.

- [ ] **Step 1: Write the Vitest for `uploadReceipt`** (mock `@/lib/auth`, `@/lib/supabase/server`, `@/lib/storage/receipts`): rejects role picker; rejects invalid uuid; rejects file > 10 485 760 bytes with 'Filen er for stor (maks 10 MB).'; rejects HTML bytes named `x.jpg` with 'Filtypen støttes ikke. Bruk bilde eller PDF.'; on DB insert error calls `removeOrphanReceipt` with the same key and returns the mapped message; on success stores key `receipts/<yyyy>/<uuid>.<ext>` (ext from sniffed mime, not the file name) and returns `receiptId`.
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement** storage (service-role client from `src/lib/supabase/admin.ts`, bucket `receipts`), action (validate → sniff → sha256 via `crypto.subtle` → `putReceipt` → insert `ledger_receipts` with session client → on error `removeOrphanReceipt`), route, downscale (canvas; if `createImageBitmap` fails, e.g. HEIC on desktop, return the original file), `ReceiptInput`.
  Read `node_modules/next/dist/docs/` for route handler params (async `params`) and the server action body size option before writing.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: e2e** `tests/e2e/regnskap-receipts.spec.ts` (uses API-level setup with `adminClient()` to create an expense entry owned by the seed seller and a receipt row + object): seller opens `/api/receipts/<id>` → 200 and `content-type` `image/jpeg`; picker → 404; owner → 200; signed out → 404 (or redirect to login — assert not 200); after setting the entry's `created_at` to 31 days ago (adminClient) seller → 404. Storage objects created by the test may be removed with the service client in `afterAll` (test-only; the app never deletes).
  Note: rows in ledger tables cannot be deleted even by service role (trigger). Use unique descriptions prefixed `E2E ` and leave rows; tests must not depend on empty tables.
- [ ] **Step 6: Run** `npm run test:e2e -- regnskap-receipts` → PASS.
- [ ] **Step 7: Commit** `git add -A && git commit -m "feat(ledger): receipt storage, upload and protected viewing"`

---

### Task 5: Regnskap tab and overview page

**Files:**
- Modify: `src/features/admin/ui/nav-items.ts`, `src/features/admin/ui/icons.tsx` (add `'coins'` icon)
- Create: `src/app/admin/(app)/regnskap/page.tsx`, `src/features/regnskap/queries.ts`,
  `src/features/regnskap/MvaMeter.tsx`, `src/features/regnskap/SellerHome.tsx`, `src/features/regnskap/OwnerHome.tsx`
- Test: `src/features/admin/ui/nav-items.test.ts` (create if absent), `tests/e2e/regnskap-overview.spec.ts`

**Interfaces:**
- Produces nav item `{ href: '/admin/regnskap', label: 'Regnskap', icon: 'coins', roles: ['owner','seller'], tab: true }` placed after Marked.
- `queries.ts` ('server-only'): `getOwnerOverview(today: string)` → `{ month: Totals; year: Totals; missingReceipts: number; unpaid: { count: number; totalOre: number }; owedBack: { name: string; totalOre: number }[]; meter: { incomeOre: number; level: MeterLevel } }` (uses the Task 2 RPCs; missing receipts = non-voided entries without any receipt and without a takings receipt); `getMyRecent()` → own entries + takings (RLS limits to 30 days), newest first, each with `hasReceipt`.

- [ ] **Step 1: Tests.** nav: seller and owner get Regnskap, picker does not. e2e: picker visiting `/admin/regnskap` gets 404; seller sees buttons "Dagsoppgjør" and "Ny utgift" and heading "Mine registreringer" and no text "Resultat"; owner sees "Resultat", "Mangler kvittering", the meter text 'Grensen gjelder hele DONTPANIC AS – ta med annen omsetning.'.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Page calls `requireRole('owner','seller')` and renders `OwnerHome` or `SellerHome`. Meter: bar with `formatKr` of income / `kr 50 000,00`; class/colour amber at `warn`, red at `over`; respects existing tokens and dark mode.
- [ ] **Step 4: Run** unit + `npm run test:e2e -- regnskap-overview` → PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat(ledger): Regnskap tab with owner overview, MVA meter and seller home"`

---

### Task 6: Forms — daily takings, new expense, other income

**Files:**
- Create: `src/app/admin/(app)/regnskap/actions.ts`
- Create: `src/app/admin/(app)/regnskap/dagsoppgjor/page.tsx`, `src/features/regnskap/TakingsForm.tsx`
- Create: `src/app/admin/(app)/regnskap/utgift/ny/page.tsx`, `src/features/regnskap/ExpenseForm.tsx`
- Create: `src/app/admin/(app)/regnskap/inntekt/ny/page.tsx`, `src/features/regnskap/IncomeForm.tsx`
- Test: `src/app/admin/(app)/regnskap/actions.test.ts`, `tests/e2e/regnskap-forms.spec.ts`

**Interfaces:**
```ts
export async function saveTakings(form: FormData): Promise<ActionResult & { takingsId?: string; numbers?: string[] }>
//   fields market_day_id, vipps, card, cash (kr text), note
export async function saveExpense(form: FormData): Promise<ActionResult & { entryId?: string; number?: string }>
//   fields client_key (uuid, generated once per form mount), entry_date, amount, category_id, counterparty, description,
//   payment_method, due_date
export async function saveIncome(form: FormData): Promise<ActionResult & { entryId?: string; number?: string }>  // owner only
```
- Forms submit the entry first, then call `uploadReceipt` (Task 4) if a file is chosen. If the upload fails, the form shows 'Posten er lagret som R-…, men kvitteringen ble ikke lastet opp.' with a "Prøv igjen" button that retries only the upload.
- Duplicate handling: `saveExpense` on 23505 for `client_key` looks up the existing entry by `client_key` and returns it as success (idempotent). `saveTakings` on 23505 returns 'Dagsoppgjør for denne markedsdagen er allerede registrert.'.
- Takings market-day select: past/today, not cancelled, no non-voided takings; label `<weekday dd.mm> – <place>`; newest first; max 30.

- [ ] **Step 1: Vitest for actions** (mock supabase): invalid amount text → 'Skriv beløpet i kroner, for eksempel 1250,50.'; expense description empty → 'Skriv hva utgiften gjelder.'; `unpaid` without due date → 'Velg forfallsdato.'; seller calling `saveIncome` → not allowed (requireRole throws/notFound); duplicate client_key returns the first entry's number.
- [ ] **Step 2: e2e (phone viewport 390×844):** seller registers takings on an E2E past market day (created via adminClient, place `E2E Regnskap <timestamp>`) with vipps `4350`, card `2100,50`, a JPEG fixture (`tests/e2e/fixtures/receipt.jpg`, create a small valid JPEG) → sees two numbers; registering again for the same day → error text above; seller registers expense "Lagt ut privat" with receipt → success text 'Registrert som R-'; double-clicking Lagre creates one entry (assert via adminClient count by client_key/description); owner registers income via `/admin/regnskap/inntekt/ny`; seller visiting that URL → 404.
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement.** **Step 5: Run** `npm test && npm run test:e2e -- regnskap-forms` → PASS.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat(ledger): daily takings, expense and income forms with receipts"`

---

### Task 7: Entries list, entry detail actions, categories

**Files:**
- Create: `src/app/admin/(app)/regnskap/poster/page.tsx`, `.../poster/[id]/page.tsx`, `.../poster/actions.ts`
- Create: `src/app/admin/(app)/regnskap/kategorier/page.tsx`, `.../kategorier/actions.ts`
- Create: `src/features/regnskap/EntryFilters.tsx`, `EntryEditSheet.tsx`, `VoidSheet.tsx`, `EntryHistory.tsx`
- Test: `tests/e2e/regnskap-entries.spec.ts`, actions Vitest as in Task 6

**Interfaces:**
```ts
// poster/actions.ts (owner only)
export async function updateEntry(form: FormData): Promise<ActionResult>   // id, entry_date, amount, category_id, counterparty, description, payment_method, due_date
export async function voidEntry(id: string, reason: string): Promise<ActionResult>
export async function voidTakings(id: string, reason: string): Promise<ActionResult>
export async function settleEntry(id: string): Promise<ActionResult>       // sets settled_at = now()
// kategorier/actions.ts (owner only)
export async function saveCategory(form: FormData): Promise<ActionResult>  // id?, kind (insert only), name, account_no, sort
export async function setCategoryActive(id: string, active: boolean): Promise<ActionResult>
```
- List query params: `from`, `to` (via `parsePeriod`, default this year), `kind`, `category`, `flag` (`missing-receipt` | `unpaid` | `private`), `voided=1`. Server-rendered; filters are a GET form. Shows number, date, category, counterparty, amount (`formatKr`), badges "Mangler kvittering", "Ubetalt", "Lagt ut privat", "Annullert" (struck-through amount).
- Detail: all fields, receipts (image thumbnail via `/api/receipts/<id>`, PDF as link), upload another receipt (`ReceiptInput` + `uploadReceipt`), actions per spec §5.5, history from `audit_log` rows for this id (owner can read `audit_log` already): each update shows changed fields `old → new`. A takings-created entry shows "Fra dagsoppgjør" and only "Annuller dagsoppgjør" (voids the whole takings).
- Categories: grouped Inntekt / Kostnader, inline edit, account number validated `^\d{4}$` ('Kontonummer er fire siffer.'), deactivate/activate.

- [ ] **Step 1: e2e:** owner filters "Mangler kvittering" and sees an E2E entry without receipt; edits its amount from 100 to 120 kr → history shows `kr 100,00 → kr 120,00`; voids with reason 'E2E test' → shows "Annullert" and the overview's month total no longer includes it (compare before/after via `getByTestId('month-expense')`); a `private` entry → "Marker tilbakebetalt" → disappears from "Skyldes tilbake"; voiding a takings entry voids its sibling; categories: add "E2E Kategori <ts>" 6550, rename, deactivate → absent from the expense form's select; seller gets 404 on `/admin/regnskap/poster` and `/admin/regnskap/kategorier`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test && npm run test:e2e -- regnskap-entries` → PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat(ledger): entries list, detail with edit/void/settle/history, categories"`

---

### Task 8: Export (Excel + receipts zip)

**Files:**
- Modify: `package.json` (add `exceljs`, `fflate` — exact current versions, pinned without `^` is not required; use `npm install exceljs fflate`)
- Create: `src/features/regnskap/export-data.ts`, `src/features/regnskap/xlsx.ts`
- Create: `src/app/api/regnskap/export.xlsx/route.ts`, `src/app/api/regnskap/receipts.zip/route.ts`
- Create: `src/app/admin/(app)/regnskap/eksport/page.tsx`
- Test: `src/features/regnskap/xlsx.test.ts`, `tests/e2e/regnskap-export.spec.ts`

**Interfaces:**
```ts
export async function loadExportEntries(period: Period): Promise<ExportEntry[]>        // session client; includes voided
export async function loadExportReceipts(period: Period): Promise<{ name: string; key: string }[]> // names via receiptFileName + uniqueNames
export async function buildWorkbook(entries: ExportEntry[], period: Period): Promise<Uint8Array>
```
- Workbook: sheets `Poster`, `Per kategori`, `Per måned` (columns per spec §5.7), money columns numeric with `#,##0.00`, header row bold + frozen, a title cell row 1 `Nesodden Ramsløk – DONTPANIC AS (org.nr 937 308 493) – <from> til <to>` using `COMPANY` from `src/content/site.ts`, sum rows at the bottom of `Per kategori` and `Per måned` as values (not formulas). File name `ramslok-regnskap-<from>-<to>.xlsx`.
- Zip: streamed with `fflate`'s `Zip` + `ZipPassThrough` (receipts are already compressed), objects read one at a time via `getReceipt`; file name `ramslok-kvitteringer-<from>-<to>.zip`. Include receipts of voided entries too (the accountant should see what was voided).
- Both routes: `requireRole('owner')` semantics in a route handler (return 404 for non-owners), `parsePeriod` → 400 'Ugyldig periode.' on bad input, `Cache-Control: private, no-store`.
- Page: preset buttons + custom from/to, two download links, preview of totals from `summarize`.

- [ ] **Step 1: Vitest `xlsx.test.ts`:** build from 3 entries (one voided) → reload with ExcelJS → `Poster` has 3 data rows; `Per kategori` sum row equals `summarize().totals`; money cells are numbers; empty input yields headers only.
- [ ] **Step 2: e2e:** owner downloads both files for this year (`page.waitForEvent('download')`), xlsx file name matches, zip opens with `fflate.unzipSync` and contains a name starting with an E2E entry's number; seller requesting either URL → 404; `from=2027-13-01` → 400.
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement.** **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat(ledger): Excel and receipt zip export"`

---

### Task 9: Whole-branch verification and docs

**Files:**
- Modify: `README.md` (section "Regnskap": what it is, roles, export, that receipts can't be deleted)
- Create: `deploy-sql/` is git-ignored — do not commit hosted SQL.

- [ ] **Step 1: Run everything:** `npm run lint && npx tsc --noEmit && npm test && npm run db:reset && npm run test:db && npm run build && npm run test:e2e` → all PASS (existing suites included).
- [ ] **Step 2:** Visual check at 390×844 and 1280×800, light and dark, of `/admin/regnskap`, `dagsoppgjor`, `utgift/ny`, `poster`, `eksport` with Playwright screenshots saved to `shots/` (git-ignored). Fix any overflow.
- [ ] **Step 3: Commit** `git add -A && git commit -m "docs(ledger): README section and final fixes"`
