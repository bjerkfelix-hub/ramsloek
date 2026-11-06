# Ramsløk public site (Step A) — design spec

Date: 2026-11-06
Status: Draft, awaiting owner review
Builds on: `docs/superpowers/specs/2026-11-06-ramslok-system-design.md` (phase 1 is live)

## 1. Purpose

ramsløk.no becomes the public face of Nesodden Ramsløk. The internal system moves to
ramsløk.no/admin. Step A is the first of three steps towards an online shop:

- **A (this spec):** public website, editable market calendar, automatic season status,
  season sign-up; internal system moved under `/admin`.
- **B (later):** online orders paid with Vipps, picked up at a market day.
- **C (later):** restaurants and shops order online and pay by invoice (with the ledger).

### Success criteria

- A visitor on a phone can see, within one screen, whether ramsløk is in season and when
  and where the next market day is.
- The owner adds or edits a market day in `/admin` and it shows on the public site on the
  next page load, without a deploy.
- A visitor can sign up for "si fra når sesongen starter" with email + consent, and can
  unsubscribe with one click from a link.
- Every existing internal feature works unchanged under `/admin`; old internal URLs redirect.
- The public site works without login and never exposes internal data (batches, stock,
  users, sign-up emails).
- Norwegian is the default; every public page has an English version.

### What the owner decided

- Build the new shop (not restore the old Express page), in steps A → B → C.
- Story and recipe texts live in code; the market calendar is editable in admin.
- No logo yet: Claude designs a clean look with the name "Nesodden Ramsløk" set in type.

### Assumptions (owner to correct)

- Business name on the site: "Nesodden Ramsløk" (from the old sales page).
- Claude drafts the story and 4–6 recipes; the owner corrects facts about the farm.
- No real photos yet; neutral illustrations until the owner supplies photos.

## 2. Structure and routing

| Path | Who | What |
|---|---|---|
| `/` | public | Forside (NO) |
| `/historien` | public | Our story (NO) |
| `/oppskrifter`, `/oppskrifter/[slug]` | public | Recipes (NO) |
| `/marked` | public | Market calendar (NO) |
| `/personvern` | public | Privacy (NO) |
| `/avmelding/[token]` | public | One-click unsubscribe (NO/EN text) |
| `/en`, `/en/story`, `/en/recipes`, `/en/recipes/[slug]`, `/en/markets`, `/en/privacy` | public | English versions |
| `/admin/...` | staff | Everything that exists today (batches, stock, products, areas, users, settings) |
| `/admin/login` | staff | Login (moved from `/login`) |
| `/admin/marked` | owner | Market calendar editor (new) |
| `/admin/pameldinger` | owner | Season sign-up list + CSV export (new) |
| `/auth/callback` | — | Unchanged (registered in Supabase); redirects to `/admin` |

- Old internal paths (`/login`, `/batches…`, `/stock`, `/products`, `/areas`, `/users`,
  `/settings`) permanently redirect (308) to their `/admin` equivalents.
- The proxy protects only `/admin/*` (except `/admin/login`) and `/api/labels/*` keeps its
  own check. Public paths never require a session.
- The label route stays at `/api/labels/[packingId]` (no change).
- Implementation: Next.js route groups `(public)` and `admin/`, each with its own layout.
  Public and admin share nothing visual except fonts and colour tokens.

## 3. Language

- Norwegian at the root, English under `/en`. A NO/EN switch in the header links to the
  matching page in the other language.
- Texts live in typed dictionaries (`src/content/no.ts`, `src/content/en.ts`) with the same
  keys; a missing key is a type error. Recipes are typed objects with both languages.
- `<html lang>` is `nb` or `en` per page; `hreflang` alternate links on every public page.
- Admin stays Norwegian only.

## 4. Public pages

### 4.1 Forside
1. Season status banner (§6).
2. Next 3 upcoming market days (date, time, place, map link) + link to full calendar.
3. Short intro: wild garlic from a private estate on Nesodden, picked by hand, sorted and
   checked for lily-of-the-valley, sold fresh in Oslo.
4. Season sign-up form (§7).
5. Footer: company name, org.nr (from settings), contact email, links to story, recipes,
   markets, privacy; language switch.

### 4.2 Historien / Our story
The estate, harvest by hand, the sorting check against liljekonvall (with a short safety
note on how to tell them apart), from forest to market the same day. Placeholder images.

### 4.3 Oppskrifter / Recipes
4–6 recipes at launch (pesto, ramsløksmør, ramsløkolje, suppe, ramsløk i eggerøre,
lakefermentert ramsløk). Each: title, short intro, ingredients, steps, time, servings;
JSON-LD `Recipe` structured data. List page with cards.

### 4.4 Marked / Markets
All upcoming published market days, grouped by month, each with date, weekday, time,
place, address, note, and a map link (Google Maps search URL for the address). Empty state
explains the season and points to the sign-up.

### 4.5 Personvern / Privacy
What is collected (email, language, consent time), why (season notice), legal basis
(consent), retention (until unsubscribe; deleted 30 days after), who processes it
(Supabase EU, Railway EU, and the email sender when set up), contact for requests,
the right to complain to Datatilsynet.

## 5. Market calendar (data + admin)

Table `market_days` (designed to be reused by Step B pickup orders and the spec's §3.5
market sales):

| Column | Type | Notes |
|---|---|---|
| id | uuid pk default gen_random_uuid() | |
| market_date | date not null | Oslo date |
| starts_at | time not null | |
| ends_at | time not null, check (ends_at > starts_at) | |
| place_name | text not null | e.g. "Bondens marked Vinkelplassen" |
| address | text not null | |
| note_no | text | optional |
| note_en | text | optional |
| published | boolean not null default true | |
| cancelled | boolean not null default false | shows "Avlyst" publicly |
| created_by | uuid default auth.uid() | |
| created_at | timestamptz default now() | |

- RLS: `anon` and `authenticated` may select rows where `published` and
  `market_date >= (now() at time zone 'Europe/Oslo')::date`; owner may select all and
  insert/update. No deletes (cancel instead). Audit trigger on.
- Grants: `anon` gets select only on this table (first table exposed to anon — keep it that
  narrow). Public pages read it with the anon key through the server client.
- `/admin/marked`: list (upcoming first, then past, collapsed), add form, edit, cancel /
  un-cancel, publish toggle. Validation in Norwegian.

## 6. Season status (automatic)

Computed on each request from `market_days` (public rows):
- **I sesong:** there is a non-cancelled market day today or within the next 14 days →
  "I sesong – neste marked: <weekday dd. month, place>".
- **Snart sesong:** the next market day is more than 14 days away → "Sesongen starter
  <month>" with the sign-up.
- **Utenfor sesong:** no upcoming market days → "Sesongen starter til våren" with the
  sign-up.
The 14-day window is a constant in code.

## 7. Season sign-up

Table `season_signups`: id, email (text, stored lower-cased, unique), language
('no'|'en'), consent_text (the exact text shown), consented_at, unsubscribe_token
(random 32-byte hex, unique), unsubscribed_at.

- Insert only through a server action using the service-role client after validation
  (email format, consent box ticked, honeypot field empty, simple per-IP rate limit in
  memory). `anon` has no grants on this table at all.
- Re-signing an unsubscribed email clears `unsubscribed_at` and records new consent.
- Duplicate active email → same friendly success message (no account enumeration).
- `/avmelding/[token]` sets `unsubscribed_at`; shows confirmation. Rows unsubscribed for 30+
  days are deleted by `public.purge_unsubscribed_signups()` (security definer, owner-only),
  which `/admin/pameldinger` calls each time it loads (no cron infrastructure in Step A).
- `/admin/pameldinger`: owner-only count + table (email, language, signed up) and CSV export
  of active sign-ups. Sending the season email is out of scope until custom SMTP exists.

## 8. Look and feel

- Typography-led, no logo: wordmark "Nesodden Ramsløk" in a serif display face
  (e.g. Fraunces) with a sans body (e.g. Inter), via `next/font` (self-hosted).
- Palette: forest green primary, warm off-white background, dark text; one accent.
  Colour tokens defined once in CSS variables; meets WCAG AA contrast.
- Mobile-first, one column on phones; max content width ~70ch on desktop.
- Simple line illustrations of the leaf (SVG, inline) instead of stock photos; image
  slots ready for real photos later (`next/image`).
- No cookie banner needed: no tracking or analytics cookies in Step A.

## 9. Search and sharing

- Per-page `metadata` (title, description) in both languages, canonical URLs on the
  punycode host, `hreflang` alternates.
- Open Graph / Twitter image generated with `next/og` (wordmark on green).
- `sitemap.xml` and `robots.txt` (disallow `/admin`).
- Structured data: `LocalBusiness` on the front page, `Event` per market day on `/marked`,
  `Recipe` on recipe pages.

## 10. Error handling

- Public pages render even if the database is unreachable: calendar section shows
  "Markedsdagene kunne ikke lastes akkurat nå" and season status falls back to the
  sign-up variant.
- Sign-up errors show Norwegian/English messages; never reveal whether an email exists.
- 404 page in both languages.

## 11. Testing

- Unit: season status rules (in season / soon / off-season, cancelled days ignored,
  Oslo date boundaries), dictionary key parity NO/EN, email validation.
- pgTAP: anon sees only published upcoming days (cancelled ones included, with
  `cancelled = true`); anon cannot insert/update market_days; owner can; picker/seller
  cannot write; anon and authenticated have no access to season_signups; audit rows written.
- e2e: public pages load signed out in both languages; owner adds a market day in admin
  and it appears on `/marked` and the front page; cancel shows "Avlyst"; sign-up +
  unsubscribe flow; old internal URLs redirect to `/admin/...`; every phase-1 e2e passes
  under `/admin`.

## 12. Deployment

- New migration `20261106000005_public_site.sql`, applied to hosted Supabase via SQL
  editor (as before) and recorded in `supabase_migrations.schema_migrations`.
- Supabase redirect URL list unchanged (`/auth/callback`). Site URL stays ramsløk.no.
- No new env vars.

## 13. Out of scope for Step A

Ordering and payment (Step B), business ordering and invoices (Step C), sending season
emails (needs SMTP), CMS for story/recipes, analytics, real photography.

## 14. Open questions for the owner

1. Confirm the public business name "Nesodden Ramsløk".
2. Contact email to show on the site.
3. Any facts about the estate/harvest the story must include or avoid.
