# Ramsløk Phase 1 — Foundation, Harvest, Packing, Stock & Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working web app where pickers log harvest batches, sign the sorting check, pack products into stock and print labels, and the owner manages users, settings, harvest areas and products.

**Architecture:** Next.js App Router app talking to a Supabase Postgres database. Business rules that must never be broken (sorting check before packing, no over-packing, no negative stock, numbering, role access) live in Postgres triggers, constraints and Row Level Security; the app calls them through server actions and shows Norwegian error messages. Pure helpers (GS1 check digits, weight parsing) live in `src/lib/domain` with unit tests.

**Tech Stack:** Next.js (create-next-app@latest, App Router, TypeScript, Tailwind, `src/` dir), Supabase (CLI as dev dependency, local stack in Docker, `@supabase/ssr`, `@supabase/supabase-js`), pgTAP via `supabase test db`, Vitest, Playwright, pdf-lib, bwip-js.

**Spec:** `docs/superpowers/specs/2026-11-06-ramslok-system-design.md` (sections 2, 3.1–3.4, 4, 5, 6). This plan covers build-order steps 1–2 of spec §9.

**Not in this plan (later plans):** prices (§3.2, built with sales), FIFO selection (§3.4, built with sales), SSCC/pallet labels (§3.3, built with deliveries), ledger, market sales, orders, reports, dashboard, bank import.

## Global Constraints

- All user-facing text is Norwegian bokmål. Code identifiers, table names and comments are English.
- Weights are stored as integer grams; money as integer øre (no money in this plan).
- Dates derived from timestamps use `Europe/Oslo`, never UTC.
- Lot number format `RL-YY-NNN`, sequential per Oslo calendar year, zero-padded to at least 3 digits, never truncated.
- Roles: `owner`, `picker`, `seller` exactly. Access is enforced by RLS, not only by the UI.
- Public sign-up is disabled; users join only by owner invite (or the `create-owner` script for the first owner).
- Nothing is hard-deleted from batches, sorting checks, packings, stock movements or waste records; every insert/update on business tables is written to `audit_log`.
- Supabase project region for hosting: EU.
- Sorting check text, verbatim: `Sortert og kontrollert for liljekonvall og andre arter`.
- Label text, verbatim: `Opprinnelse: Norge`; storage instruction comes from the product's `storage_text` (default `Oppbevares kjølig`).

## Review Focus

1. **Decimal comma on Norwegian phones** — a picker types `2,5` kg; the app must store 2500 g, not reject it or store 25 000 g. Pinned in Task 2 and Task 8.
2. **Double-tap on submit with poor signal** — tapping "Lagre" twice must create one batch, not two with consecutive lot numbers. Pinned in Task 4 (client-supplied id) and Task 8.
3. **More than 999 batches in a year** — lot number 1000 must be `RL-27-1000`, not truncated to `RL-27-100`. Pinned in Task 4.
4. **Harvest logged just after midnight Oslo time** — lot year and best-before must use the Oslo date, not the UTC date. Pinned in Task 4 and Task 5.
5. **Two people packing the last of a batch at the same moment** — the second packing must fail with "not enough left", not over-pack. Pinned in Task 5 (row lock + sequential test).

---

## File Structure

```
package.json, next.config.ts, tsconfig.json, vitest.config.ts, playwright.config.ts, .env.example
supabase/
  config.toml                         # from `supabase init`; signup disabled
  migrations/
    20261106000001_foundation.sql     # profiles, app_role(), settings, number_series, next_number(), audit
    20261106000002_harvest.sql        # harvest_areas, batches, sorting_checks, temperature_logs
    20261106000003_packing_stock.sql  # products, packings, stock_movements, waste_records, views
  seed.sql                            # demo owner/picker/seller, areas, products (local only)
  tests/
    00_helpers.sql                    # test helper: tests.login_as(role)
    foundation.test.sql
    harvest.test.sql
    packing_stock.test.sql
scripts/create-owner.ts
src/
  lib/
    supabase/server.ts                # createServerClient for RSC/server actions
    supabase/browser.ts               # createBrowserClient
    supabase/admin.ts                 # service-role client (server only)
    auth.ts                           # getCurrentUser(), requireRole()
    errors.ts                         # dbErrorToMessage()
    domain/gs1.ts                     # check digits, GTIN normalisation, GS1-128 text
    domain/weight.ts                  # parseKgToGrams(), formatGrams()
  middleware.ts                       # session refresh + redirect to /login
  app/
    login/page.tsx, auth/callback/route.ts
    (app)/layout.tsx                  # role-aware nav
    (app)/page.tsx                    # home: shortcuts per role
    (app)/settings/{page.tsx,actions.ts}
    (app)/users/{page.tsx,actions.ts}
    (app)/areas/{page.tsx,actions.ts}
    (app)/products/{page.tsx,actions.ts}
    (app)/batches/{page.tsx,new/page.tsx,[id]/page.tsx,actions.ts}
    (app)/stock/{page.tsx,actions.ts}
    api/labels/[packingId]/route.ts   # label PDF
  features/labels/render.ts           # renderLabelPdf()
tests/e2e/{helpers.ts,admin.spec.ts,batches.spec.ts,stock.spec.ts,labels.spec.ts}
README.md
```

---

### Task 1: Project scaffold and tooling

**Files:**
- Create: everything from `create-next-app`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `supabase/config.toml`, `src/lib/domain/smoke.test.ts`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `test` (vitest run), `test:db` (`supabase test db`), `test:e2e` (playwright), `db:start` (`supabase start`), `db:reset` (`supabase db reset`).

- [ ] **Step 1:** In the repo root run `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm` (the folder already has `docs/`; move it aside and back if the tool refuses a non-empty dir).
- [ ] **Step 2:** `npm i @supabase/supabase-js @supabase/ssr pdf-lib bwip-js` and `npm i -D supabase vitest @playwright/test tsx`; `npx playwright install chromium`.
- [ ] **Step 3:** `npx supabase init`. In `supabase/config.toml` set `[auth] enable_signup = false` and `[auth.email] enable_signup = false`; set `site_url = "http://localhost:3000"` and add `http://localhost:3000/auth/callback` to `additional_redirect_urls`.
- [ ] **Step 4:** Write `src/lib/domain/smoke.test.ts` asserting `expect(1 + 1).toBe(2)`; configure `vitest.config.ts` with `include: ['src/**/*.test.ts']`, alias `@` → `src`.
- [ ] **Step 5:** Add the scripts above to `package.json`. Write `.env.example` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] **Step 6:** Run `npm test` → 1 passed. Run `npm run db:start` → prints API URL and keys; copy them into `.env.local` (git-ignored). Run `npm run build` → succeeds.
- [ ] **Step 7:** Commit: `chore: scaffold Next.js app with Supabase, Vitest and Playwright`.

---

### Task 2: Domain helpers — GS1 and weights

**Files:**
- Create: `src/lib/domain/gs1.ts`, `src/lib/domain/gs1.test.ts`, `src/lib/domain/weight.ts`, `src/lib/domain/weight.test.ts`
- Delete: `src/lib/domain/smoke.test.ts`

**Interfaces:**
- Produces:
  - `gs1CheckDigit(digitsWithoutCheck: string): number`
  - `normalizeGtin(input: string): string | null` — accepts 8/12/13/14 digits (spaces ignored) with valid check digit; returns 14-digit GTIN, else `null`.
  - `ean13FromGtin(gtin14: string): string | null` — 13 digits if `gtin14` starts with `0`, else `null`.
  - `gs1_128Text(a: { gtin14: string; bestBefore: string /* YYYY-MM-DD */; lot: string }): string` — bwip-js bracketed element string `(01)…(15)YYMMDD(10)…`.
  - `parseKgToGrams(input: string): number | null`
  - `formatGrams(grams: number): string`

- [ ] **Step 1: Write failing tests**

```ts
// gs1.test.ts
expect(gs1CheckDigit('703801005569')).toBe(0)
expect(gs1CheckDigit('1703801005570')).toBe(3)
expect(normalizeGtin('7038010055690')).toBe('07038010055690')
expect(normalizeGtin('703 8010 05569 0')).toBe('07038010055690')
expect(normalizeGtin('17038010055703')).toBe('17038010055703')
expect(normalizeGtin('7038010055691')).toBeNull()   // wrong check digit
expect(normalizeGtin('70380100556')).toBeNull()     // 11 digits
expect(normalizeGtin('abc')).toBeNull()
expect(ean13FromGtin('07038010055690')).toBe('7038010055690')
expect(ean13FromGtin('17038010055703')).toBeNull()
expect(gs1_128Text({ gtin14: '17038010055703', bestBefore: '2027-05-20', lot: 'RL-27-014' }))
  .toBe('(01)17038010055703(15)270520(10)RL-27-014')

// weight.test.ts
expect(parseKgToGrams('2,5')).toBe(2500)
expect(parseKgToGrams('2.5')).toBe(2500)
expect(parseKgToGrams(' 12 ')).toBe(12000)
expect(parseKgToGrams('2,5 kg')).toBe(2500)
expect(parseKgToGrams('0,125')).toBe(125)
expect(parseKgToGrams('0')).toBeNull()
expect(parseKgToGrams('-1')).toBeNull()
expect(parseKgToGrams('')).toBeNull()
expect(parseKgToGrams('1,2,3')).toBeNull()
expect(parseKgToGrams('0,0001')).toBeNull()        // rounds to 0 g
expect(formatGrams(2500)).toBe('2,5 kg')
expect(formatGrams(12000)).toBe('12 kg')
expect(formatGrams(100)).toBe('100 g')
```

- [ ] **Step 2:** `npm test` → FAIL (modules not found).
- [ ] **Step 3:** Implement. Check digit: weights 3,1,3,… from the rightmost digit; `(10 - sum % 10) % 10`. `parseKgToGrams`: trim, strip trailing `kg` (case-insensitive), accept one `,` or `.` as decimal separator, `Math.round(kg * 1000)`, return `null` if result ≤ 0 or not finite. `formatGrams`: < 1000 → `"N g"`; else kg with `Intl.NumberFormat('nb-NO', { maximumFractionDigits: 3 })` + `" kg"`.
- [ ] **Step 4:** `npm test` → all pass.
- [ ] **Step 5:** Commit: `feat: add GS1 and weight helpers`.

---

### Task 3: Database foundation — roles, settings, numbering, audit

**Files:**
- Create: `supabase/migrations/20261106000001_foundation.sql`, `supabase/tests/00_helpers.sql`, `supabase/tests/foundation.test.sql`

**Interfaces:**
- Produces (SQL):
  - `type app_role as enum ('owner','picker','seller')`
  - `profiles(id uuid pk references auth.users on delete cascade, full_name text not null, role app_role not null, active boolean not null default true, created_at timestamptz default now())`
  - Trigger on `auth.users` insert → creates `profiles` row from `raw_user_meta_data->>'full_name'` (default email) and `->>'role'` (default `picker`). Safe because sign-up is disabled; only admin invites set metadata.
  - `app_role() returns app_role` — `security definer`, `stable`, role of `auth.uid()` if active, else null.
  - `settings` — single row (`id boolean pk default true check (id)`): `company_name text`, `org_nr text`, `address text`, `gs1_company_prefix text`, `lot_prefix text not null default 'RL'`, `best_before_warning_days int not null default 1`.
  - `number_series(series text, year int, last int not null, pk(series, year))`
  - `next_number(p_series text, p_year int) returns int` — `insert … on conflict do update set last = number_series.last + 1 returning last`; first call returns 1.
  - `audit_log(id bigserial pk, at timestamptz default now(), actor uuid, table_name text, row_id text, action text, data jsonb)`; trigger function `audit_row()` for `after insert or update or delete`, attached to `profiles` and `settings` here and to every business table in later migrations.
  - RLS: `profiles` select for all authenticated; update only by owner. `settings` select for all authenticated; update only by owner. `audit_log` select only owner; no insert/update/delete policies (trigger is `security definer`). `number_series` no direct access.
- Test helper `tests.login_as(p_role app_role) returns uuid` in `00_helpers.sql`: creates an `auth.users` row with that role, `set local role authenticated`, sets `request.jwt.claims` with its `sub`, returns the id. `tests.logout()` resets to `postgres`.

- [ ] **Step 1: Write failing pgTAP tests** (`foundation.test.sql`), each a named assertion:
  - `next_number('lot', 2027)` returns 1, then 2; `next_number('lot', 2028)` returns 1.
  - Inserting into `auth.users` with metadata `{"role":"seller","full_name":"Kari"}` creates a profile with role `seller`.
  - As picker: `select app_role()` = `picker`; `update settings set company_name='X'` affects 0 rows; `select * from audit_log` returns 0 rows.
  - As owner: update of `settings.company_name` succeeds and writes one `audit_log` row with `action = 'UPDATE'` and `actor` = owner id.
  - Profile with `active = false` → `app_role()` is null.
- [ ] **Step 2:** `npm run db:reset && npm run test:db` → FAIL.
- [ ] **Step 3:** Write the migration as specified in Interfaces. Insert the single `settings` row in the migration.
- [ ] **Step 4:** `npm run db:reset && npm run test:db` → all pass.
- [ ] **Step 5:** Commit: `feat(db): roles, settings, number series and audit log`.

---

### Task 4: Database — harvest areas, batches, sorting checks, temperatures

**Files:**
- Create: `supabase/migrations/20261106000002_harvest.sql`, `supabase/tests/harvest.test.sql`

**Interfaces:**
- Consumes: `app_role()`, `next_number()`, `audit_row()`, `settings.lot_prefix`.
- Produces (SQL):
  - `harvest_areas(id uuid pk default gen_random_uuid(), name text unique not null, lat double precision, lng double precision, active boolean default true)`
  - `batches(id uuid pk` — **no default; the client supplies it** so a repeated submit is an idempotent insert`, lot_number text unique not null, harvested_at timestamptz not null, harvest_date date not null, area_id uuid not null references harvest_areas, pickers text not null, gross_weight_g int not null check (gross_weight_g > 0), notes text, created_by uuid not null default auth.uid(), created_at timestamptz default now())`
  - Before-insert trigger on `batches`: `harvest_date := (harvested_at at time zone 'Europe/Oslo')::date`; `lot_number := prefix || '-' || to_char(harvest_date,'YY') || '-' || lpad(n::text, greatest(3, length(n::text)), '0')` where `n = next_number('lot', extract(year from harvest_date))`.
  - `sorting_checks(batch_id uuid pk references batches, statement text not null default 'Sortert og kontrollert for liljekonvall og andre arter', checked_by uuid not null default auth.uid(), checked_at timestamptz not null default now())` — one per batch.
  - `temperature_logs(id uuid pk default gen_random_uuid(), batch_id uuid not null references batches, measured_at timestamptz not null default now(), celsius numeric(4,1) not null check (celsius between -30 and 50), logged_by uuid not null default auth.uid())`
  - RLS: all four selectable by any active role. Insert on `batches`, `sorting_checks`, `temperature_logs` for `owner`/`picker`. `harvest_areas` insert/update owner only. Update on `batches` owner only (notes correction); no delete policies anywhere.
  - Audit trigger on all four tables.

- [ ] **Step 1: Write failing pgTAP tests:**
  - As picker, insert batch with `harvested_at = '2027-04-20 10:00+02'` → `lot_number = 'RL-27-001'`, `harvest_date = '2027-04-20'`.
  - Second batch same year → `RL-27-002`.
  - `harvested_at = '2027-04-20 23:30:00+00'` (01:30 on 21 April in Oslo) → `harvest_date = '2027-04-21'`.
  - After `update number_series set last = 999 where series='lot' and year=2027`, next batch → `RL-27-1000`.
  - Inserting the same `id` twice with `on conflict (id) do nothing` → exactly one row with that `id`, and its `lot_number` is the one from the first insert.
  - As seller: inserting a batch raises `42501` (RLS).
  - As picker: `delete from batches` affects 0 rows; `update batches set notes='x'` affects 0 rows.
  - Sorting check inserted twice for same batch → unique violation.
  - `temperature_logs.celsius = 80` → check violation.
- [ ] **Step 2:** `npm run db:reset && npm run test:db` → FAIL.
- [ ] **Step 3:** Write the migration.
- [ ] **Step 4:** `npm run db:reset && npm run test:db` → all pass.
- [ ] **Step 5:** Commit: `feat(db): harvest areas, batches with lot numbers, sorting checks, temperature log`.

> Note for Step 1, bullet 5: a duplicate submit should be retried by the app with the same `id`; the server action uses `upsert(..., { onConflict: 'id', ignoreDuplicates: true })`. Because the before-insert trigger runs before the conflict check, a duplicate may consume a lot number (a gap). Gaps in *lot* numbers are acceptable; gaps in *invoice* numbers (later plan) are not.

---

### Task 5: Database — products, packing, stock, waste

**Files:**
- Create: `supabase/migrations/20261106000003_packing_stock.sql`, `supabase/tests/packing_stock.test.sql`

**Interfaces:**
- Consumes: `batches`, `sorting_checks`, `app_role()`, `audit_row()`.
- Produces (SQL):
  - `type unit_kind as enum ('consumer','trade')`
  - `products(id uuid pk default gen_random_uuid(), name text unique not null, net_weight_g int not null check (> 0), unit_kind unit_kind not null, gtin char(14) unique check (gtin ~ '^[0-9]{14}$'), shelf_life_days int not null check (shelf_life_days between 1 and 60), storage_text text not null default 'Oppbevares kjølig', active boolean default true)` — GTIN check-digit validity is enforced in the app (Task 7) via `normalizeGtin`.
  - `packings(id uuid pk` (client-supplied)`, batch_id uuid not null references batches, product_id uuid not null references products, units int not null check (units > 0), weight_g int not null, best_before date not null, packed_by uuid not null default auth.uid(), packed_at timestamptz default now())`
  - Before-insert trigger on `packings`, in this order:
    1. `select … from batches where id = new.batch_id for update` (serialises concurrent packings of one batch).
    2. No row in `sorting_checks` → `raise exception 'SORTING_CHECK_MISSING'`.
    3. `new.weight_g := new.units * products.net_weight_g`.
    4. If `new.weight_g > batch_remaining_g(new.batch_id)` → `raise exception 'NOT_ENOUGH_LEFT'`.
    5. `new.best_before := batches.harvest_date + products.shelf_life_days`.
  - After-insert trigger on `packings` → inserts `stock_movements(kind 'pack', +units, packing_id)`.
  - `type movement_kind as enum ('pack','sell','deliver','waste','adjust')`
  - `stock_movements(id uuid pk default gen_random_uuid(), product_id uuid not null, batch_id uuid not null, kind movement_kind not null, units int not null check (units <> 0), packing_id uuid references packings, waste_id uuid` (FK to `waste_records` added after that table is created)`, created_by uuid default auth.uid(), created_at timestamptz default now())`
  - Before-insert trigger on `stock_movements`: lock with `pg_advisory_xact_lock(hashtext(product_id::text || batch_id::text))`; if resulting balance < 0 → `raise exception 'STOCK_NEGATIVE'`.
  - `waste_records(id uuid pk` (client-supplied)`, batch_id uuid not null references batches, product_id uuid references products, units int check (units > 0), weight_g int check (weight_g > 0), reason text not null check (reason in ('visnet','skadet','utgått','annet')), note text, created_by uuid default auth.uid(), created_at timestamptz default now(), check ((product_id is not null and units is not null and weight_g is null) or (product_id is null and units is null and weight_g is not null)))` — either packed units or loose kilos from the batch.
  - Before-insert trigger on `waste_records` for loose kilos: same batch lock + `NOT_ENOUGH_LEFT` check. After-insert for units → `stock_movements(kind 'waste', -units, waste_id)`.
  - `batch_remaining_g(p_batch uuid) returns int` = gross − sum(packings.weight_g) − sum(loose waste weight_g).
  - View `stock_levels` (security_invoker): `product_id, product_name, batch_id, lot_number, best_before (min over packings for product+batch), units (sum of movements), near_expiry boolean (best_before - current_date (Oslo) <= settings.best_before_warning_days)`, only rows with units > 0.
  - RLS: products select all, write owner. packings/waste insert owner+picker; stock_movements insert only via triggers (no insert policy; triggers `security definer`); all selectable by active roles; no update/delete.
  - Audit trigger on products, packings, stock_movements, waste_records.

- [ ] **Step 1: Write failing pgTAP tests** (fixture: batch 10 000 g harvested 2027-04-20, product "Ramsløk 100 g pose", 100 g, shelf life 6):
  - Packing 10 units before sorting check → raises `SORTING_CHECK_MISSING`.
  - After sorting check, packing 10 units → `weight_g = 1000`, `best_before = '2027-04-26'`, one `pack` movement of +10, `batch_remaining_g = 9000`.
  - Packing 91 units → raises `NOT_ENOUGH_LEFT`; packing 90 units → succeeds; `batch_remaining_g = 0`.
  - Batch harvested `'2027-04-20 23:30+00'` (Oslo 21 April) → best_before `'2027-04-27'`.
  - Waste 3 units reason `visnet` → stock 97; waste 98 units → raises `STOCK_NEGATIVE`.
  - Loose waste 500 g on a fresh 1 000 g batch → remaining 500; loose waste 600 g → `NOT_ENOUGH_LEFT`.
  - Waste with both `units` and `weight_g` → check violation.
  - `stock_levels` row for the product/batch shows `units = 97`, `lot_number = 'RL-27-001'`.
  - As seller: insert into packings → `42501`; select from `stock_levels` → returns rows.
- [ ] **Step 2:** `npm run db:reset && npm run test:db` → FAIL.
- [ ] **Step 3:** Write the migration.
- [ ] **Step 4:** `npm run db:reset && npm run test:db` → all pass.
- [ ] **Step 5:** Commit: `feat(db): products, packing with sorting-check and weight guards, stock and waste`.

---

### Task 6: Auth, app shell and error messages

**Files:**
- Create: `src/lib/supabase/{server,browser,admin}.ts`, `src/lib/auth.ts`, `src/lib/errors.ts`, `src/lib/errors.test.ts`, `src/middleware.ts`, `src/app/login/page.tsx`, `src/app/auth/callback/route.ts`, `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`, `scripts/create-owner.ts`, `supabase/seed.sql`, `tests/e2e/helpers.ts`, `tests/e2e/auth.spec.ts`
- Modify: `package.json` (script `create-owner`: `tsx scripts/create-owner.ts`)

**Interfaces:**
- Consumes: `profiles`, `app_role`.
- Produces:
  - `getCurrentUser(): Promise<{ id: string; fullName: string; role: 'owner'|'picker'|'seller' } | null>`
  - `requireRole(...roles: Role[]): Promise<CurrentUser>` — redirects to `/login` if signed out, throws `notFound()` if role not allowed.
  - `dbErrorToMessage(err: { code?: string; message?: string }): string`
  - e2e `loginAs(page: Page, role: Role): Promise<void>` — uses admin `generateLink({ type: 'magiclink', email })` for the seeded user of that role and opens the link.
  - Seeded users (local only): `eier@test.local` (owner), `plukker@test.local` (picker), `selger@test.local` (seller); 2 areas ("Bekken", "Skogen nord"); products "Ramsløk 100 g pose" (consumer, 100 g, GTIN `07038010055690`, 6 days) and "Ramsløk 1 kg kasse" (trade, 1000 g, GTIN `17038010055703`, 6 days).

- [ ] **Step 1: Write failing tests**

```ts
// errors.test.ts
expect(dbErrorToMessage({ message: 'SORTING_CHECK_MISSING' })).toBe('Partiet må sorteringskontrolleres før pakking.')
expect(dbErrorToMessage({ message: 'NOT_ENOUGH_LEFT' })).toBe('Det er ikke nok igjen av partiet.')
expect(dbErrorToMessage({ message: 'STOCK_NEGATIVE' })).toBe('Det er ikke nok på lager.')
expect(dbErrorToMessage({ code: '42501' })).toBe('Du har ikke tilgang til dette.')
expect(dbErrorToMessage({ code: '23505' })).toBe('Dette finnes allerede.')
expect(dbErrorToMessage({ message: 'anything else' })).toBe('Noe gikk galt. Prøv igjen.')
```

```ts
// auth.spec.ts
test('signed-out user is sent to login', …)          // goto('/') → URL ends with /login, heading "Logg inn"
test('picker sees picker nav only', …)                // loginAs picker → nav has "Partier", "Lager"; not "Innstillinger", "Brukere"
test('owner sees owner nav', …)                       // has "Partier", "Lager", "Produkter", "Områder", "Brukere", "Innstillinger"
test('picker opening /settings gets 404', …)
```

- [ ] **Step 2:** `npm test` and `npm run test:e2e` → FAIL.
- [ ] **Step 3:** Implement. Login page: email field + "Send innloggingslenke", calls `signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: <origin>/auth/callback } })`, then shows "Sjekk e-posten din". Callback exchanges the code and redirects to `/`. Middleware refreshes the session per `@supabase/ssr` docs and redirects unauthenticated requests (except `/login`, `/auth/*`) to `/login`. Layout: mobile-first top bar + nav links per role. `create-owner` script: `tsx scripts/create-owner.ts <email> "<full name>"` → admin `inviteUserByEmail` with metadata `{ role: 'owner', full_name }`.
- [ ] **Step 4:** `npm test` and `npm run test:e2e` (with `npm run dev` started by Playwright `webServer`) → pass.
- [ ] **Step 5:** Commit: `feat: magic-link login, role-aware app shell and Norwegian error messages`.

---

### Task 7: Owner admin — settings, users, areas, products

**Files:**
- Create: `src/app/(app)/{settings,users,areas,products}/{page.tsx,actions.ts}`, `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: `requireRole`, `dbErrorToMessage`, `normalizeGtin`, admin client.
- Produces server actions (all `requireRole('owner')`, return `{ ok: true } | { ok: false; error: string }`):
  - `saveSettings(form: FormData)`
  - `inviteUser(form: FormData)` — fields `email`, `full_name`, `role`; admin `inviteUserByEmail` with metadata.
  - `setUserActive(userId: string, active: boolean)`
  - `saveArea(form: FormData)` — create/update by optional `id`; "Bruk min posisjon" button fills lat/lng from `navigator.geolocation`.
  - `saveProduct(form: FormData)` — `gtin` optional; if present must pass `normalizeGtin`, stored normalised; net weight entered in grams; shelf life in days.

- [ ] **Step 1: Write failing e2e tests:**
  - Owner saves company name "Nesodden Ramsløk AS" and org.nr "999888777" → reload shows both.
  - Owner creates area "Lia" → appears in list.
  - Owner creates product "Ramsløk 250 g pose", 250 g, consumer, GTIN `7038010055714` → error text "Ugyldig GTIN (feil kontrollsiffer)."; with GTIN `7038010055713` → saved and listed with GTIN `07038010055713`.
  - Owner creates another product with the seeded GTIN `7038010055690` → error "Dette finnes allerede.".
  - Owner invites `ny@test.local` as picker → row appears with role "Plukker" and status "Invitert".
  - Owner deactivates the seeded seller → seller's next page load lands on `/login`.
- [ ] **Step 2:** `npm run test:e2e -- admin` → FAIL.
- [ ] **Step 3:** Implement pages: plain forms, list tables, mobile-friendly. Role labels: owner "Eier", picker "Plukker", seller "Selger".
- [ ] **Step 4:** `npm run test:e2e -- admin` → pass.
- [ ] **Step 5:** Commit: `feat: owner admin for settings, users, harvest areas and products`.

---

### Task 8: Batches — register, sorting check, temperature

**Files:**
- Create: `src/app/(app)/batches/{page.tsx,new/page.tsx,[id]/page.tsx,actions.ts}`, `tests/e2e/batches.spec.ts`

**Interfaces:**
- Consumes: `parseKgToGrams`, `formatGrams`, `dbErrorToMessage`, `requireRole`, tables from Task 4, `batch_remaining_g`.
- Produces server actions (`requireRole('owner','picker')`):
  - `createBatch(form: FormData)` — fields `id` (uuid generated in the form on first render via `crypto.randomUUID()`), `area_id`, `harvested_at` (defaults to now), `pickers`, `gross_weight` (text, parsed by `parseKgToGrams`), `notes`. Upsert with `ignoreDuplicates`; redirects to `/batches/[id]`.
  - `signSortingCheck(batchId: string)`
  - `logTemperature(batchId: string, celsius: string)` — accepts decimal comma.

- [ ] **Step 1: Write failing e2e tests:**
  - Picker registers batch in "Bekken", weight `2,5` → detail page shows lot `RL-` + current year + `-` and weight "2,5 kg".
  - Submitting the new-batch form twice quickly (`dblclick` on "Lagre") → batch list grows by exactly 1.
  - Weight `abc` → error "Skriv vekt i kg, f.eks. 2,5" and no batch created.
  - Detail page shows "Ikke sorteringskontrollert" and the pack section is disabled; after "Signer sorteringskontroll" it shows the verbatim statement, signer name and time, and the pack section is enabled.
  - Logging temperature `3,5` → list shows "3,5 °C".
  - Seller: `/batches` is readable, "Ny høsting" button absent, `/batches/new` → 404.
- [ ] **Step 2:** `npm run test:e2e -- batches` → FAIL.
- [ ] **Step 3:** Implement. List: newest first, lot, date, area, weight, remaining, sorting status badge. Disable "Lagre" while submitting (keep the stable `id` regardless).
- [ ] **Step 4:** `npm run test:e2e -- batches` → pass.
- [ ] **Step 5:** Commit: `feat: harvest batch registration, sorting check and temperature log`.

---

### Task 9: Packing, stock and waste

**Files:**
- Modify: `src/app/(app)/batches/[id]/page.tsx`, `src/app/(app)/batches/actions.ts`
- Create: `src/app/(app)/stock/{page.tsx,actions.ts}`, `tests/e2e/stock.spec.ts`

**Interfaces:**
- Consumes: Task 5 tables/views, `formatGrams`, `dbErrorToMessage`.
- Produces server actions (`requireRole('owner','picker')`):
  - `packBatch(form: FormData)` — `id` (client uuid), `batch_id`, `product_id`, `units`; returns `{ ok: true, packingId } | { ok: false, error }`.
  - `registerWaste(form: FormData)` — `id` (client uuid), `batch_id`, either (`product_id`, `units`) or (`weight` text → grams), `reason`, `note`.

- [ ] **Step 1: Write failing e2e tests** (seeded batch 2,5 kg, sorting signed in test setup):
  - Pack 10 × "Ramsløk 100 g pose" → batch remaining "1,5 kg"; packing row shows best-before = harvest date + 6 days; "Skriv ut etiketter" link present.
  - Pack 20 more × 100 g → error "Det er ikke nok igjen av partiet." and remaining still "1,5 kg".
  - `/stock` shows "Ramsløk 100 g pose", lot, 10 stk.
  - Waste 2 stk reason "Visnet" from stock page → 8 stk.
  - Loose waste "0,5" kg on the batch → remaining "1 kg".
  - With `settings.best_before_warning_days` set so the seeded packing is within the window → row has "Går ut snart" badge.
- [ ] **Step 2:** `npm run test:e2e -- stock` → FAIL.
- [ ] **Step 3:** Implement: pack form on batch detail (product select, units); stock page grouped by product, rows per lot sorted by best-before ascending, totals per product.
- [ ] **Step 4:** `npm run test:e2e -- stock` → pass.
- [ ] **Step 5:** Commit: `feat: packing into stock, stock overview and waste registration`.

---

### Task 10: Labels (PDF)

**Files:**
- Create: `src/features/labels/render.ts`, `src/features/labels/render.test.ts`, `src/app/api/labels/[packingId]/route.ts`, `tests/e2e/labels.spec.ts`

**Interfaces:**
- Consumes: `ean13FromGtin`, `gs1_128Text`, `formatGrams`, packings/products/batches/settings.
- Produces:
  - `type LabelData = { productName: string; netWeightG: number; unitKind: 'consumer'|'trade'; gtin14: string | null; lot: string; bestBefore: string; storageText: string; companyName: string; companyAddress: string }`
  - `renderLabelPdf(data: LabelData, copies: number): Promise<Uint8Array>` — one page per copy, page size 100 × 50 mm (283.46 × 141.73 pt).
  - `labelLines(data: LabelData): string[]` — exported for testing the text content.
  - `GET /api/labels/[packingId]?copies=N` — any active role; default `copies` = packing units, max 500; returns `application/pdf`, `Content-Disposition: inline; filename="etiketter-<lot>.pdf"`.

- [ ] **Step 1: Write failing tests**

```ts
// render.test.ts
const base = { productName: 'Ramsløk 100 g pose', netWeightG: 100, unitKind: 'consumer', gtin14: '07038010055690',
  lot: 'RL-27-014', bestBefore: '2027-05-20', storageText: 'Oppbevares kjølig',
  companyName: 'Nesodden Ramsløk AS', companyAddress: 'Nesodden' } as const
expect(labelLines(base)).toEqual([
  'Ramsløk 100 g pose', 'Netto 100 g', 'Parti: RL-27-014', 'Best før: 20.05.2027',
  'Opprinnelse: Norge', 'Oppbevares kjølig', 'Nesodden Ramsløk AS, Nesodden'])
// PDF has 3 pages of the right size
const pdf = await PDFDocument.load(await renderLabelPdf(base, 3))
expect(pdf.getPageCount()).toBe(3)
expect(Math.round(pdf.getPage(0).getWidth())).toBe(283)
// works without GTIN (no barcode, no throw)
await expect(renderLabelPdf({ ...base, gtin14: null }, 1)).resolves.toBeInstanceOf(Uint8Array)
// trade unit uses GS1-128 — assert renderer was asked for gs1-128 with the element string
```

For the last assertion, `render.ts` exports `barcodeSpec(data): { bcid: 'ean13' | 'gs1-128'; text: string } | null`; test: trade unit → `{ bcid: 'gs1-128', text: '(01)17038010055703(15)270520(10)RL-27-014' }`, consumer → `{ bcid: 'ean13', text: '7038010055690' }`, no GTIN → `null`.

- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement with pdf-lib (embed Helvetica; Norwegian æøå are in WinAnsi) and `bwip-js` `toBuffer` → PNG embedded on the right half of the label.
- [ ] **Step 4:** `npm test` → pass.
- [ ] **Step 5:** e2e: after packing 10 units, clicking "Skriv ut etiketter" opens a response with status 200, content-type `application/pdf`; `?copies=501` → 400 with "Maks 500 etiketter om gangen."; signed-out request → 401.
- [ ] **Step 6:** `npm run test:e2e -- labels` → pass.
- [ ] **Step 7:** Commit: `feat: printable product labels with GS1 barcodes`.

---

### Task 11: README and full verification

**Files:**
- Create/replace: `README.md`

- [ ] **Step 1:** README (Norwegian): what the app does in phase 1; local setup (`npm install`, Docker, `npm run db:start`, `.env.local`, `npm run db:reset`, `npm run dev`, seeded logins via local Mailpit at the URL `supabase start` prints); creating the first owner in production (`npm run create-owner`); deploy outline — create an EU Supabase project, `npx supabase link` + `npx supabase db push`, set the three env vars in Vercel, set Site URL / redirect URLs in Supabase Auth. Deployment itself needs the owner's own Supabase and Vercel accounts and is not done in this plan.
- [ ] **Step 2:** Run `npm run db:reset && npm test && npm run test:db && npm run build && npm run test:e2e` → all green.
- [ ] **Step 3:** Commit: `docs: setup, seed logins and deploy guide`.
