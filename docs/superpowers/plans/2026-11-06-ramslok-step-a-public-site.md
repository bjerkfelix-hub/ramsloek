# Ramsløk Step A — Public Site and /admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ramsløk.no shows a public bilingual site (front page with season status, story, recipes, market calendar, privacy, season sign-up) and the existing internal system lives under `/admin`.

**Architecture:** Next.js route groups split `(public)` and `admin` with separate layouts. Public pages read only `market_days` through the anon-key server client; sign-ups are written by a server action with the service-role client. Season status is a pure function of upcoming market days. Texts live in typed NO/EN dictionaries.

**Tech Stack:** existing (Next.js 16.4, React 19, TS, Tailwind, Supabase, Vitest, pgTAP, Playwright) plus `next/font` (Fraunces + Inter) and `next/og`.

**Spec:** `docs/superpowers/specs/2026-11-06-ramslok-public-site-design.md`. Phase-1 spec and code are the baseline.

## Global Constraints

- Norwegian at `/`, English under `/en`; every public page exists in both; admin is Norwegian only.
- Public pages never require login and never read batches, stock, users, settings secrets or sign-ups. The only table `anon` can read is `market_days` (published, upcoming).
- `season_signups`: no grants to `anon` or `authenticated`; written only server-side with the service-role client.
- Dates use `Europe/Oslo`; "upcoming" means `market_date >= today (Oslo)`.
- Season window constant: 14 days.
- Old internal paths redirect with 308 to `/admin/...`; `/auth/callback` keeps its path and redirects to `/admin`.
- Never edit migrations 1–4 (applied to hosted DB). New DB work goes in `supabase/migrations/20261106000005_public_site.sql`, pasteable into the Supabase SQL editor.
- Brand: wordmark "Nesodden Ramsløk"; serif display (Fraunces) + sans body (Inter) via `next/font`; colours as CSS variables; WCAG AA contrast; no tracking cookies.
- `npm run build` must pass with no Supabase env vars set.

## Review Focus

1. **Bookmarked old URLs** — a picker's phone has `/batches/new` bookmarked; it must land on `/admin/batches/new` (after login), not a 404. Pinned in Task 1.
2. **Database unreachable** — if Supabase is down, the public front page must still render with a friendly calendar message, not a 500. Pinned in Task 5.
3. **Midnight / Oslo date boundaries** — a market day "today" must count as upcoming and "in season" until midnight Oslo time, not until midnight UTC. Pinned in Tasks 2 and 3.
4. **Sign-up enumeration and repeats** — signing up twice, or after unsubscribing, shows the same success message and never reveals whether an email exists. Pinned in Task 7.
5. **English page with a missing translation** — a key missing in `en` must fail the build/tests, not render `undefined`. Pinned in Task 3.

---

## File Structure (new or moved)

```
src/app/
  (public)/layout.tsx, page.tsx, historien/, oppskrifter/, oppskrifter/[slug]/, marked/, personvern/, avmelding/[token]/
  (public)/en/... (story, recipes, recipes/[slug], markets, privacy) — or a shared [locale]-free component per page rendered by both routes
  (public)/not-found.tsx
  admin/layout.tsx, admin/page.tsx, admin/login/, admin/batches/, admin/stock/, admin/products/, admin/areas/, admin/users/, admin/settings/, admin/marked/, admin/pameldinger/
  sitemap.ts, robots.ts, opengraph-image.tsx
src/content/no.ts, en.ts, recipes.ts, types.ts
src/lib/domain/season.ts, email.ts
src/lib/public/market-days.ts            # anon read with graceful failure
src/features/public/*                    # Header, Footer, LanguageSwitch, SeasonBanner, MarketList, SignupForm, Wordmark, LeafIllustration
supabase/migrations/20261106000005_public_site.sql
supabase/tests/public_site.test.sql
tests/e2e/public.spec.ts, market-admin.spec.ts, signup.spec.ts, redirects.spec.ts
```

---

### Task 1: Move the internal system under /admin

**Files:** move `src/app/(app)/*` → `src/app/admin/*`; move `src/app/login` → `src/app/admin/login`; modify `src/proxy.ts`, `next.config.ts` (redirects), `src/app/auth/callback/route.ts`, every internal `href`/`redirect()`/`revalidatePath()`; update all files in `tests/e2e/*` and `tests/e2e/helpers.ts`.

**Interfaces:**
- Produces: all internal routes at `/admin/...`; `requireRole` redirects signed-out users to `/admin/login`; proxy protects `/admin/:path*` except `/admin/login`; callback success → `Location: /admin`, error → `/admin/login?error=callback`. Root `/` is temporarily a minimal public placeholder page (replaced in Task 5).

- [ ] **Step 1: Write failing e2e** `tests/e2e/redirects.spec.ts`: requesting `/batches`, `/batches/new`, `/stock`, `/products`, `/areas`, `/users`, `/settings`, `/login` with `maxRedirects: 0` returns 308 with `Location` = same path under `/admin`; signed-out `GET /` returns 200 (no login redirect); signed-out `/admin/batches` → ends at `/admin/login`.
- [ ] **Step 2:** Update existing e2e paths to `/admin/...` and `loginAs` to use `/auth/callback` then expect `/admin`. Run `npm run test:e2e` → new redirect tests FAIL.
- [ ] **Step 3:** Move the files (git mv), add `redirects()` in `next.config.ts` (`permanent: true`) for the old paths incl. `/:path*` children, update proxy matcher, callback locations, login `emailRedirectTo` unchanged (`/auth/callback`), all internal links. Callback location test from phase 1 updated to `/admin`.
- [ ] **Step 4:** `npm test && npm run test:e2e && npm run build` → all pass (phase-1 specs green under `/admin`).
- [ ] **Step 5:** Commit `refactor: move internal system under /admin`.

---

### Task 2: Database — market_days and season_signups

**Files:** create `supabase/migrations/20261106000005_public_site.sql`, `supabase/tests/public_site.test.sql`.

**Interfaces (SQL):**
- `market_days` exactly as spec §5 (columns, checks, defaults). RLS: policy `market_days_public_select` for `anon, authenticated` using `published and market_date >= (now() at time zone 'Europe/Oslo')::date`; `market_days_owner_select` for authenticated using `app_role() = 'owner'`; insert/update policies owner only with `created_by = (select auth.uid())` on insert. Grants: `revoke all … from anon, authenticated; grant select on market_days to anon, authenticated; grant insert, update on market_days to authenticated;`. Audit trigger.
- `season_signups(id uuid pk default gen_random_uuid(), email text not null unique check (email = lower(email)), language text not null check (language in ('no','en')), consent_text text not null, consented_at timestamptz not null default now(), unsubscribe_token text not null unique default encode(extensions.gen_random_bytes(32),'hex'), unsubscribed_at timestamptz)` (pgcrypto lives in the `extensions` schema on Supabase, locally and hosted). RLS enabled, no policies; `revoke all on season_signups from anon, authenticated`.
- `public.purge_unsubscribed_signups() returns int` — security definer, search_path '', raises 42501 unless `app_role() = 'owner'`, deletes rows with `unsubscribed_at < now() - interval '30 days'`, returns count. Execute granted to authenticated only.
- The migration does not insert into `supabase_migrations.schema_migrations` (the CLI records versions itself); recording it after a manual paste is a deploy step (Task 9 README).

- [ ] **Step 1: Write failing pgTAP** (`public_site.test.sql`, use `\ir helpers.psql`; for anon use `set local role anon` with empty claims):
  - anon selects a published day dated today (Oslo) and one tomorrow; does not see yesterday's, nor an unpublished one; sees a cancelled upcoming one with `cancelled = true`.
  - Day dated "today" in Oslo when UTC is already the next day is still visible (set `market_date` from `(now() at time zone 'Europe/Oslo')::date`).
  - anon insert/update on market_days → 42501; picker insert → 42501; owner insert/update ok; owner sees past days; `ends_at <= starts_at` → 23514; delete by owner → 42501.
  - anon and picker `select` on season_signups → 42501; owner select → 42501.
  - picker calling purge → 42501; owner purge deletes a 31-day-old unsubscribed row and keeps a 29-day-old one.
  - Insert into market_days writes an audit_log row.
- [ ] **Step 2:** `npm run db:reset && npm run test:db` → FAIL.
- [ ] **Step 3:** Write the migration.
- [ ] **Step 4:** `npm run db:reset && npm run test:db` → all pass (phase-1 74 + new).
- [ ] **Step 5:** Commit `feat(db): market days and season sign-ups`.

---

### Task 3: Domain — season status, content dictionaries, email validation

**Files:** create `src/lib/domain/season.ts` (+test), `src/lib/domain/email.ts` (+test), `src/content/types.ts`, `src/content/no.ts`, `src/content/en.ts`, `src/content/recipes.ts`, `src/content/content.test.ts`.

**Interfaces:**
- `type MarketDay = { id: string; marketDate: string /* YYYY-MM-DD */; startsAt: string /* HH:MM */; endsAt: string; placeName: string; address: string; noteNo: string | null; noteEn: string | null; cancelled: boolean }`
- `type SeasonStatus = { kind: 'in_season'; next: MarketDay } | { kind: 'soon'; next: MarketDay } | { kind: 'off_season' }`
- `seasonStatus(days: MarketDay[], todayOslo: string): SeasonStatus` — ignores cancelled and past days; `in_season` if next ≤ today + 14 days.
- `SEASON_WINDOW_DAYS = 14`
- `isValidEmail(input: string): boolean`; `normalizeEmail(input: string): string` (trim + lowercase).
- `type Dictionary` (all UI strings, typed nested object); `no: Dictionary`, `en: Dictionary`.
- `type Recipe = { slug: string; image: null; time: { no: string; en: string }; servings: number; title: {no,en}; intro: {no,en}; ingredients: {no: string[], en: string[]}; steps: {no: string[], en: string[]} }`; `recipes: Recipe[]` (6 recipes per spec §4.3, Claude-written, accurate cooking).
- `getDictionary(locale: 'no' | 'en'): Dictionary`

- [ ] **Step 1: Write failing tests:**
  - season: no days → off_season; only cancelled → off_season; next today → in_season; next in 14 days → in_season; next in 15 days → soon; past days ignored; picks the earliest non-cancelled.
  - email: `' Ola@Eksempel.NO '` normalizes to `ola@eksempel.no`; valid: `a@b.no`; invalid: `''`, `a@`, `@b.no`, `a b@c.no`, 300-char address.
  - content: `no` and `en` have identical key sets (deep), no empty strings; every recipe has both languages, ≥3 ingredients, ≥2 steps, unique slugs matching `^[a-z0-9-]+$`.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implement. **Step 4:** `npm test` → pass.
- [ ] **Step 5:** Commit `feat: season status, bilingual content and recipes`.

---

### Task 4: Admin market calendar

**Files:** create `src/app/admin/marked/{page.tsx,actions.ts}`, `tests/e2e/market-admin.spec.ts`; add "Marked" to the owner nav and home shortcuts.

**Interfaces:**
- Server actions (`requireRole('owner')`, return `ActionResult`): `saveMarketDay(form)` (create/update by optional `id`; fields date, starts, ends, place, address, note_no, note_en, published), `setMarketDayCancelled(id, cancelled)`.
- Validation messages: missing field → "Fyll inn dato, tid, sted og adresse."; ends ≤ starts → "Sluttid må være etter starttid."

- [ ] **Step 1: Write failing e2e:** owner adds a market day 7 days ahead "Bondens marked Test <ts>" → appears in the upcoming list; edit time → updated; cancel → shows "Avlyst" and un-cancel works; picker/seller `/admin/marked` → 404; ends before starts → error text.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement (list upcoming first, past collapsed). **Step 4:** run → pass.
- [ ] **Step 5:** Commit `feat: market calendar in admin`.

---

### Task 5: Public layout, design system and front page

**Files:** create `src/app/(public)/layout.tsx`, `src/app/(public)/page.tsx`, `src/app/(public)/en/page.tsx`, `src/app/(public)/not-found.tsx`, `src/features/public/*` (Header, Footer, LanguageSwitch, Wordmark, LeafIllustration, SeasonBanner, MarketList), `src/lib/public/market-days.ts`, `src/app/globals.css` (tokens), `tests/e2e/public.spec.ts`.

**Interfaces:**
- `getUpcomingMarketDays(limit?: number): Promise<{ ok: true; days: MarketDay[] } | { ok: false }>` — anon server client, `cancelled` included, ordered by date; catches every error → `{ ok: false }`.
- `todayOslo(): string`.
- `<SeasonBanner status locale />`, `<MarketList days locale />` (date as "lørdag 9. mai" / "Saturday 9 May", time "10–15", map link `https://www.google.com/maps/search/?api=1&query=<encoded address>`).
- Front page per spec §4.1 (sign-up form slot is rendered by Task 7; leave a placeholder component that Task 7 replaces).
- Root layout: `<html lang>` set per route group (`nb` for NO, `en` for `/en`); public layout uses Fraunces/Inter.

- [ ] **Step 1: Write failing e2e:** signed-out `/` shows wordmark "Nesodden Ramsløk", a season banner, and a market added via admin client (published, 3 days ahead) with its place name; `/en` shows the English banner text and the same market; language switch on `/` links to `/en` and back; a cancelled market shows "Avlyst"/"Cancelled"; unknown path `/finnes-ikke` → 404 page with Norwegian text. Unit tests (vitest): `getUpcomingMarketDays` returns `{ ok: false }` when its client throws or returns an error (inject the client as an optional parameter); a pure render helper for the calendar section returns "Markedsdagene kunne ikke lastes akkurat nå" / "Market days could not be loaded right now" for `{ ok: false }` and the season banner falls back to `off_season`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement, mobile-first; check contrast tokens. **Step 4:** run → pass; `npm run build` passes without env.
- [ ] **Step 5:** Commit `feat: public layout, design and front page`.

---

### Task 6: Story, recipes, markets and privacy pages (NO + EN)

**Files:** `src/app/(public)/{historien,oppskrifter,oppskrifter/[slug],marked,personvern}/page.tsx` and `src/app/(public)/en/{story,recipes,recipes/[slug],markets,privacy}/page.tsx` — each a thin route rendering a shared page component from `src/features/public/pages/*` with `locale`.

**Interfaces:**
- `generateStaticParams` for recipe slugs; unknown slug → 404.
- JSON-LD: `Recipe` on recipe pages; `Event` per market day on markets page (name, startDate/endDate with Oslo offset, location address, eventStatus `EventCancelled` when cancelled).
- Privacy text per spec §4.5 (both languages), contact email from `settings` or a constant `CONTACT_EMAIL` (placeholder `post@ramsløk.no`, flagged in report for owner confirmation).

- [ ] **Step 1: Write failing e2e:** each NO and EN page returns 200 signed out and shows its heading; recipe list shows 6 cards linking to detail pages; detail page contains `application/ld+json` with `"@type":"Recipe"`; markets page lists a seeded upcoming day and has `"@type":"Event"`; `/oppskrifter/finnes-ikke` → 404; hreflang alternate links present on each page.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → pass.
- [ ] **Step 5:** Commit `feat: story, recipes, markets and privacy pages`.

---

### Task 7: Season sign-up, unsubscribe, admin list

**Files:** create `src/features/public/SignupForm.tsx`, `src/app/(public)/signup-actions.ts`, `src/app/(public)/avmelding/[token]/page.tsx`, `src/app/admin/pameldinger/{page.tsx,export/route.ts}`, `tests/e2e/signup.spec.ts`; add "Påmeldinger" to owner nav.

**Interfaces:**
- `signUpForSeason(form: FormData): Promise<{ ok: true } | { ok: false; error: string }>` — fields `email`, `consent` ('on'), `language`, honeypot `website` (must be empty → silently return ok). Normalizes email; rejects invalid email ("Skriv en gyldig e-postadresse." / "Please enter a valid email address.") and missing consent ("Du må samtykke for å melde deg på." / "Please tick the consent box."). Upsert by email: new → insert; existing active → no change; existing unsubscribed → clear `unsubscribed_at`, update consent. Always the same success text ("Takk! Vi sier fra når sesongen starter." / "Thanks! We'll let you know when the season starts."). In-memory rate limit: max 5 per IP per 10 minutes → same generic error "Prøv igjen litt senere."
- `/avmelding/[token]`: valid token → sets `unsubscribed_at` (idempotent), shows "Du er meldt av." / "You have been unsubscribed." (language from the row); invalid token → same neutral page text without revealing anything ("Lenken er ugyldig eller allerede brukt.").
- `/admin/pameldinger` (`requireRole('owner')`): calls `purge_unsubscribed_signups()`, shows active count and table; `GET /admin/pameldinger/export` (owner check) returns `text/csv; charset=utf-8` with BOM, header `email,language,signed_up`.

- [ ] **Step 1: Write failing e2e:** sign up with a unique email on `/` → success text; same email again → same success text; read the row via admin client and open `/avmelding/<token>` → unsubscribed text; sign up again → active again; invalid email → error; no consent → error; honeypot filled → success shown but no row created; owner sees the email on `/admin/pameldinger` and CSV export contains it; picker `/admin/pameldinger` → 404; signed-out `/admin/pameldinger/export` → redirect/401 (not the CSV).
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → pass.
- [ ] **Step 5:** Commit `feat: season sign-up, unsubscribe and admin list`.

---

### Task 8: Metadata, sharing and search

**Files:** `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/opengraph-image.tsx` (and EN variant if needed), metadata exports on every public page, `LocalBusiness` JSON-LD on front pages, `src/lib/public/site.ts` (`SITE_URL = 'https://xn--ramslk-fya.no'`).

- [ ] **Step 1: Write failing tests:** e2e: `/sitemap.xml` lists every public NO and EN page and recipe detail; `/robots.txt` disallows `/admin`; front page has `og:image`, canonical URL on the punycode host, `hreflang` `nb` and `en`; `/admin/login` has `noindex`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → pass.
- [ ] **Step 5:** Commit `feat: metadata, sitemap and share images`.

---

### Task 9: README and full verification

- [ ] **Step 1:** README (Norwegian): new structure (`/` public, `/admin` internal), how to add market days, sign-up list/export, privacy notes, and the hosted deploy step: paste `20261106000005_public_site.sql` into the Supabase SQL editor and record version `20261106000005` in `supabase_migrations.schema_migrations`.
- [ ] **Step 2:** `npm run db:reset && npm test && npm run test:db && npm run build && npm run test:e2e` → all green; also `npm run build` with Supabase env vars unset.
- [ ] **Step 3:** Commit `docs: public site and admin structure`.

---

### Task 10: Admin redesign (Apple-style, dark mode, motion) — runs after Task 8, before Task 9

Owner request (2026-11-06): make /admin simple, minimalistic and nice, Apple-style, with animations and dark mode that follows the device plus a System/Lys/Mørk switch.

**Files:** `src/app/admin/layout.tsx`, `src/app/admin/(app)/layout.tsx`, admin styles (new `src/app/admin/admin.css` with tokens), `src/components/*` used by admin (ActionForm, buttons, inputs, badges), new `src/features/admin/ui/*` (AppShell, TabBar, Sidebar, LargeTitle, GroupedList/Row, Sheet, Toast, ThemeSwitch), every page under `src/app/admin/(app)/**` (markup/classes only), `tests/e2e/admin-ui.spec.ts`.

**Interfaces:**
- `type ThemePref = 'system' | 'light' | 'dark'`; cookie `theme` (1 year, path /admin); `<html data-theme>` set server-side from the cookie (no flash); `system` follows `prefers-color-scheme`.
- `setTheme(pref: ThemePref)` server action (any signed-in role) + `ThemeSwitch` (segmented control: System / Lys / Mørk) on `/admin/settings` for the owner and in a "Mer" (more) sheet/menu for every role.
- `Toast` API: `useToast().show(text)`; ActionForm shows "Lagret ✓" on success (role=status).
- `Sheet`: used for create forms on phones (≤ 640px) — "Ny høsting", add market day, add product/area, pack, waste; inline cards on desktop.

**Design rules (from the apple-design skill):** system-ui font stack (SF on Apple devices), size-specific tracking (large titles −0.02em, body 0), leading tight on titles / 1.5 on body; inset grouped lists with 10–12px radii; neutral gray backgrounds (light: #F2F2F7 / cards #FFF; dark: #000 / cards #1C1C1E, elevated #2C2C2E) with ramsløk green accent (light ≈ #2F7D4A, dark ≈ #4CC27A) — verify AA; translucent sticky top bar (`backdrop-filter: blur(20px) saturate(180%)`) with scroll-edge fade instead of a hard border; phone: bottom tab bar (Partier, Lager, Marked [owner], Mer) with safe-area insets; desktop ≥ 1024px: left sidebar. Feedback on pointer-down (`:active` scale .97, 100ms); springs critically damped (bounce 0, ~0.35s) via `motion` (motion/react) for sheet/toast; sheet drag-to-dismiss with 1:1 tracking, velocity handoff and projection (`project(v)=v/1000*0.998/(1-0.998)`), rubber-band above top; page cross-fade via View Transitions where supported; `prefers-reduced-motion` → opacity-only; `prefers-reduced-transparency` → solid bars; `prefers-contrast: more` → solid + borders. No behaviour changes: same routes, same actions, same validation and texts (except added "Lagret ✓").

- [ ] **Step 1: Write failing e2e** (`admin-ui.spec.ts`): owner sets "Mørk" → `html[data-theme="dark"]` persists after reload; "System" with `colorScheme: 'dark'` emulation renders dark tokens (check computed background of body is #000); phone viewport (390×844) shows the bottom tab bar and opening "Ny høsting" shows a dialog sheet (`role=dialog`) that closes with Escape; saving a form shows "Lagret ✓"; `reducedMotion: 'reduce'` emulation still completes the flows; picker sees no "Marked" tab.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** full `npm test`, `npm run test:e2e` (all earlier specs must still pass — update selectors only where markup changed, never weaken assertions), `npm run build` (also without env). Screenshots light/dark × phone/desktop of /admin/batches to the SDD workspace.
- [ ] **Step 5:** Commit `feat(admin): Apple-style redesign with dark mode and motion`.
