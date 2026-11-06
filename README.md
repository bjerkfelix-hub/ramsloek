# Nesodden Ramsløk – offentlig nettsted og internt system

Webapp for et lite ramsløk-firma: et offentlig, tospråklig nettsted og et internt system fra innhøsting til pakket vare på lager. Bygget med Next.js og Supabase (Postgres, Auth, Storage).

## Struktur

| Adresse  | Innhold                                                                  |
| -------- | ------------------------------------------------------------------------ |
| `/`      | Offentlig nettsted på norsk: sesongstatus, historie, oppskrifter, marked, personvern, sesongpåmelding og avmelding |
| `/en`    | Samme nettsted på engelsk                                                |
| `/admin` | Internt system (innlogging kreves): høsting, pakking, lager, svinn, etiketter, marked og påmeldinger |

De gamle interne adressene (f.eks. `/batches`, `/stock`) videresendes til tilsvarende side under `/admin`.

## Fase 1: det interne systemet (`/admin`)

Det interne systemet gjør:

- **Høstepartier**: registrer høsting (område, dato, vekt, plukker) og få et partinummer.
- **Sorteringskontroll**: kontroller partiet før pakking.
- **Pakking**: pakk fra parti til produkter (forbruker/storkjøkken) med riktig vekt og holdbarhet.
- **Lager**: se beholdning per produkt og parti.
- **Svinn**: registrer svinn med årsak.
- **Etiketter**: PDF-etiketter med GS1-strekkode (GTIN).
- **Eieradmin**: firmainnstillinger, høsteområder, produkter og brukere.
- **Marked**: kalender over markedsdager som vises på det offentlige nettstedet.
- **Påmeldinger**: liste over sesongpåmeldinger, med CSV-eksport.
- **Innlogging**: magisk lenke på e-post (ingen passord). Roller: eier, plukker, selger.

## Lokalt oppsett

Krav: Node 22, Docker.

```bash
npm install
npm run db:start      # starter lokal Supabase i Docker; skriver ut URL-er og nøkler
```

Opprett `.env.local` (se `.env.example`) med verdiene `supabase start` skrev ut:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

```bash
npm run db:reset      # kjører migrasjonene og supabase/seed.sql
npm run dev           # http://localhost:3000 (internt system: /admin)
```

### Seedede innlogginger (kun lokalt)

| Rolle   | E-post               |
| ------- | -------------------- |
| Eier    | eier@test.local      |
| Plukker | plukker@test.local   |
| Selger  | selger@test.local    |

Det finnes ingen passord. Skriv inn e-posten på innloggingssiden og åpne lenken i den lokale Mailpit-innboksen (URL-en står i utskriften fra `supabase start`, normalt http://127.0.0.1:54324).

**`supabase/seed.sql` skal aldri kjøres i produksjon.**

### Tester

```bash
npm test          # enhetstester (Vitest)
npm run test:db   # databasetester (pgTAP, krever lokal Supabase)
npm run build     # produksjonsbygg
npm run test:e2e  # ende-til-ende (Playwright, krever lokal Supabase)
```

- **Enhet** (Vitest): ren logikk, innhold og sesongregler.
- **db** (pgTAP): tabeller, RLS og funksjoner i databasen.
- **e2e** (Playwright): hele flyten i nettleseren. De kjører kun mot en lokal Supabase; en vakt i `tests/e2e/helpers.ts` nekter å kjøre mot noe annet, så de kan aldri skrive til produksjon.

## Slik bruker eieren systemet

### Markedsdager

Gå til **Admin → Marked**. Her legger du til, redigerer og avlyser markedsdager. Avlyste dager vises som avlyst på det offentlige nettstedet, og de teller ikke med i sesongstatusen.

### Sesongstatus på forsiden

Statusen regnes ut fra markedskalenderen:

- **I sesong**: det er en markedsdag (ikke avlyst) innen 14 dager.
- **Snart**: det finnes en kommende markedsdag, men den er mer enn 14 dager unna.
- **Utenfor sesong**: ingen kommende markedsdager er lagt inn.

### Påmeldinger

Folk melder seg på sesongvarsel på det offentlige nettstedet. Listen finner du under **Admin → Påmeldinger**, med eksport til CSV.

**Avmelding:** hver e-post har en avmeldingslenke. Den åpner en side med knappen «Meld meg av»; avmeldingen skjer først når knappen trykkes (så e-postskannere ikke melder noen av ved et uhell).

### Mørk modus

Under **Mer / Innstillinger** velger du System, Lys eller Mørk.

## Tekster og oppskrifter

Alt innhold på det offentlige nettstedet ligger i `src/content`:

- `no.ts` og `en.ts`: tekstene på norsk og engelsk
- `recipes.ts`: oppskriftene
- `site.ts`: sidenavn og `CONTACT_EMAIL`. Adressen er foreløpig en plassholder (`post@ramsløk.no`) som eieren må bekrefte før lansering.

Endring i disse filene krever en ny deploy.

## Personvern

- Lagret om påmeldte: e-postadresse, språk, samtykketeksten som ble vist, tidspunkt for samtykke og eventuell avmelding, samt en tilfeldig avmeldingsnøkkel. Ingenting annet.
- Etter avmelding slettes raden etter 30 dager. Slettingen kjører når siden **Admin → Påmeldinger** åpnes.
- Nettstedet bruker ingen sporingsinformasjonskapsler og ingen analyseverktøy. Den eneste informasjonskapselen er innloggingen i `/admin`.

## Produksjon (slik det er satt opp)

### 1. Supabase-prosjekt

Opprett et hostet Supabase-prosjekt i EU (Frankfurt).

**Databaseskjema.** Normalt:

```bash
npx supabase link --project-ref <ref>
npx supabase db push --remote
```

Hvis `supabase db push` ikke får kontakt (pooler-tilkoblingen feilet på nettverket vårt), lim inn SQL-en fra hver fil i `supabase/migrations/` (i filrekkefølge) i **SQL Editor** i Supabase-dashboardet og kjør dem.

Kjør aldri `seed.sql` mot produksjon.

**Nye migrasjoner.** Databaseendringer rulles ikke ut av deployen. Lim inn den nye filen fra `supabase/migrations/` (hele filen, én gang) i **SQL Editor** i Supabase-dashboardet og kjør den. Registrer deretter versjonen, slik at `supabase db push` ikke prøver å kjøre den på nytt:

```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('<versjon>', '<navn>')
on conflict do nothing;
```

Ferdig anvendt og registrert: migrasjon 1–5, sist `20261106000005_public_site` (offentlig nettsted: markedsdager og påmeldinger).

**Auth-innstillinger** (Authentication i dashboardet):

- Site URL: `https://ramsløk.no` (punycode: `https://xn--ramslk-fya.no`)
- Redirect URL: `https://ramsløk.no/auth/callback` (legg også til punycode-varianten)
- «Allow new users to sign up»: **av**. Nye brukere legges kun til av en eier.

### 2. Railway

Deploy: push til `main` bygger og deployer automatisk i Railway (tjenesten `ramsloek`, EU West, domene ramsløk.no).

Sett disse miljøvariablene på tjenesten:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (hemmelig, må aldri eksponeres i nettleseren)

`NEXT_PUBLIC_*`-variabler bygges inn ved build – endring krever ny deploy i Railway, ikke bare restart.

Node 22 er festet via `engines` i `package.json` og `.node-version`.

### 3. Første eier

Med URL-en til det hostede prosjektet og service-nøkkelen i miljøet:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service_role key> \
npm run create-owner -- <epost> "<navn>"
```

Skriptet oppretter brukeren direkte (ingen invitasjons-e-post). Eieren går deretter til innloggingssiden og logger inn med e-postadressen sin (magisk lenke).

### 4. Nye brukere

Eier legger til brukere under **Brukere → Legg til bruker** (e-post, navn, rolle). De får ingen e-post automatisk; be dem logge inn på innloggingssiden med e-postadressen sin. Status vises som «Ikke logget inn ennå» til første innlogging.

**Deaktiver brukere i appen – slett dem aldri i Supabase (navnet forsvinner fra signerte partier).**

### 5. E-post (viktig før ansatte skal logge inn)

Supabase sin innebygde e-postsender leverer bare til medlemmer av Supabase-organisasjonen og er sterkt rate-begrenset. Sett opp egen SMTP (f.eks. Resend, med verifisert domene `ramsløk.no`) under Authentication → SMTP Settings før andre enn deg skal logge inn.

## Portabilitet

Alt kjører på standard Postgres og Supabase Auth/Storage, så løsningen kan senere flyttes til selvhostet Supabase på Railway uten kodeendringer, bare nye miljøvariabler og import av databasen.
