# Ramsløk.no – offentlig nettsted og internt system

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
- **e2e** (Playwright): hele flyten i nettleseren. Testene bruker service-role-klienten `adminClient()` fra `tests/e2e/helpers.ts`, og den nekter å kjøre med mindre `NEXT_PUBLIC_SUPABASE_URL` peker på en lokal Supabase (127.0.0.1, localhost eller [::1]). Dermed kan oppsett og opprydding i testene aldri skrive til produksjon.

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

Velg System, Lys eller Mørk under **Mer / Innstillinger** (mobil) eller med bryteren i sidemenyen (skrivebord).

### Regnskap

Et underregnskap for ramsløk (en avdeling i DONTPANIC AS). Hovedboken til AS-et føres et annet sted; herfra eksporteres tall og kvitteringer.

- **Dagsoppgjør** (eier og selgere): velg markedsdag, skriv totalene for Vipps, kort og kontant, ta bilde av dagsrapporten. Ett dagsoppgjør per markedsdag; det lager inntektsposter automatisk.
- **Ny utgift** (eier og selgere): beløp, kategori, leverandør, betaling og bilde av kvitteringen. «Lagt ut privat» vises under «Skyldes tilbake» til eieren markerer det som tilbakebetalt; «Ubetalt regning» vises til den er markert betalt.
- **Annen inntekt** (eier): for eksempel en restaurant som betaler med bankoverføring.
- **Oversikt** (eier): inntekt, kostnader og resultat for måneden og året, poster som mangler kvittering, ubetalte regninger, utlegg som skal tilbakebetales, og en måler mot MVA-grensen (kr 50 000 siste 12 måneder; grensen gjelder hele AS-et).
- **Poster** (eier): filtrer, åpne en post, rett den, legg til kvittering eller annuller. Alle endringer vises i historikken med gammel og ny verdi.
- **Kategorier** (eier): hver kategori har et kontonummer (NS 4102) som følger med i eksporten. «Salg marked» brukes av dagsoppgjør og kan ikke skrus av.
- **Eksport** (eier): Excel med alle poster, summer per kategori og per måned, og en zip med kvitteringene navngitt etter postnummer (f.eks. `R-2027-014 Emballasje Bunnpris.jpg`).

**Ingenting slettes.** Poster og kvitteringer kan ikke slettes, heller ikke av eieren; feil rettes eller annulleres med en grunn. Selgere ser bare sine egne registreringer de siste 30 dagene. Plukkere har ikke tilgang til regnskapet. Reglene håndheves i databasen.

### Planlegging: Vaktplan, Stemple, Timer og Oppgaver

Alle aktive roller finner sidene under **Mer** på mobil og i sidemenyen på datamaskin.
**Start/Stopp** finnes også øverst på Oversikt, slik at egen tid kan stemples med ett trykk.
Plukkere og selgere har samme planleggingsrettigheter: egne vakter, timer og timesats,
og tildelte oppgaver. De kan bare markere egne oppgaver som ferdige. Ferdige oppgaver
blir stående til eieren arkiverer dem. Eieren planlegger for alle aktive roller, kopierer
uker, setter timesatser på Brukere og administrerer oppgavebrettet Å gjøre / Pågår / Ferdig.
Viktige oppgaver sorteres først, deretter frist (uten frist sist). Forfalte oppgaver merkes.
Arkiverte oppgaver er skrivebeskyttet og bare synlige for eier.

- **Private satser:** satsene ligger adskilt fra delte profiler. En sats på 0 er tillatt;
  manglende sats er ukjent. Ved Start lagres et øyeblikksbilde av gjeldende sats.
  Senere satsendringer gjelder nye innstemplinger og endrer aldri tidligere beløp.
- **Tid og beløp:** uker går mandag–søndag i Europe/Oslo. Faktisk medgåtte millisekunder
  brukes, også ved sommertid/vintertid, uten automatiske pauser eller overtidsregler.
  Intervaller deles ved Oslo-midnatt; beløpet avrundes til nærmeste øre per registrering
  per dag (halve øre opp), før summering. Visning av timer med to desimaler brukes ikke
  til å beregne beløpet. Planlagt beløp er et anslag med dagens sats.
- **Korrigering:** bare eier kan rette start/slutt, med obligatorisk grunn. Historikken
  viser gammel og ny verdi, aktør og tidspunkt. Endrede registreringer må leses og
  kontrolleres på nytt før en utdatert rettelse kan lagres. En manglende historisk sats
  kan fylles én gang fra gjeldende sats med grunn; en eksisterende sats kan ikke prises om.
- **Ufullstendige tall:** åpne registreringer vises separat og inngår ikke i arbeidede
  timer eller beløp. Etter mer enn 14 timer vises en advarsel; ingenting stoppes automatisk.
  Manglende sats gir «Foreløpig beløp» for kjent delsum, aldri en skjult nullsats.
- **Excel:** eier velger måned og kontrollerer åpne timer/manglende satser før nedlasting.
  Timer-arket har én lukket registrering per dag i valgt Oslo-måned, også for deaktiverte
  personer. Kontroll-arket viser kjente beløp og mangler. Et ufullstendig eller tomt
  grunnlag kan lastes ned. Dette er lønnsgrunnlag, uten skattetrekk, feriepenger eller
  andre lønnstillegg; det kjører ikke lønn og bokfører ingenting i Regnskap.
- **Ingen sletting:** vakter avlyses med grunn, oppgaver arkiveres og tidsregistreringer
  beholdes (også rettelser til null varighet). Avlysning og arkivering er endelige.
  Databasen håndhever tilgang, historikk og sletteforbud. Deaktiver personer fremfor å slette dem.

Testoppsettet for planlegging i e2e oppretter Auth-identiteter med lokal adminklient, men skriver
planleggingsdata gjennom innloggede eier-/personøkter. Historikken beholdes; testvakter
avlyses, åpne testtimer lukkes og testoppgaver arkiveres.

## Tekster og oppskrifter

Alt innhold på det offentlige nettstedet ligger i `src/content`:

- `no.ts` og `en.ts`: tekstene på norsk og engelsk
- `recipes.ts`: oppskriftene
- `site.ts`: sidenavn, `CONTACT_EMAIL` og `COMPANY` (firmanavn, org.nr., adresse). Kontaktadressen er `felix@dontpanic.no`. Firmaopplysningene er foreløpig plassholdere som eieren må bekrefte før lansering. De vises i bunnteksten og på personvernsiden.

Endring i disse filene krever en ny deploy.

## Personvern

- Lagret om påmeldte: e-postadresse, språk, samtykketeksten som ble vist, tidspunkt for samtykke og eventuell avmelding, samt en tilfeldig avmeldingsnøkkel. Ingenting annet.
- Etter avmelding slettes raden senest 31 dager senere. Slettingen kjører daglig kl. 03:17 (pg_cron, `purge_unsubscribed_signups_system()`, migrasjon 6), og i tillegg når siden **Admin → Påmeldinger** åpnes.
- Nettstedet bruker ingen sporingsinformasjonskapsler og ingen analyseverktøy. Det settes to informasjonskapsler: innloggingsøkta (kun for innloggede brukere i `/admin`) og temavalget (lys/mørk/system), som ikke sporer deg.
- Etter hver deploy: eier/utvikler bør verifisere at påmeldings-rate-limiten fungerer bak Railway-proxyen, ved å sende gjentatte påmeldinger med forfalskede `X-Forwarded-For`-/`X-Real-IP`-headere og sjekke at grensen (5 per 10 min per IP) fortsatt slår inn.

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

Skal anvendes: `20261106000006_privacy_hardening` (daglig sletting av avmeldte via pg_cron, og kolonnebegrenset lesetilgang for `anon` på `market_days`). Kjør hele filen i SQL Editor og registrer versjonen som beskrevet over.

Skal anvendes: `20261110000007_security_hardening` (eieren leser `season_signups` via RLS; nye brukeres rolle hentes fra `app_metadata` i stedet for `user_metadata`). **Kjør den før koden deployes:** ellers får påmeldingssiden/CSV-eksporten tilgangsfeil, og nye brukere lagt til fra Brukere-siden blir plukkere uansett valgt rolle.

**Planlegging – migrasjoner 13–15 før appen.** Den kombinerte SQL Editor-filen
`deploy-sql/2026-11-11-planlegging-hosted.sql` er en lokal, git-ignorert overlevering.
Den inneholder i rekkefølge `20261111000013_planning_shifts_rates`,
`20261111000014_planning_time` og `20261111000015_planning_tasks`. Hver DDL-del og
innsettingen av tilsvarende `(version, name)` i `supabase_migrations.schema_migrations`
ligger i samme transaksjon, fulgt av en sluttkontroll. SQL-en er ren tekst og skal ikke
HTML-enkodes før innliming.

Påkrevd eierkontroll før kjøring: ta vanlig sikkerhetskopi, kontroller faktisk hostet
historikktabell (kolonnene `version` og `name` må kunne brukes), bekreft at forutgående
migrasjoner til og med 12 er anvendt, og at 13–15 ikke allerede er registrert eller delvis
anvendt. Hostet historikk er ikke lest eller verifisert i denne implementeringen.
Ikke kjør anvendt DDL på nytt. Filens kommenterte forhåndsspørringer hjelper med kontrollen.
Eieren kjører SQL-en manuelt; det er ikke gjort noen hostet mutasjon, Railway-endring
eller push i denne overleveringen. Appen deployes først etter vellykket skjemakontroll.
Ingen nye miljøvariabler trengs. Ved appfeil rulles appversjonen tilbake mens skjema og
registrerte data beholdes; skjema rettes eventuelt med en ny fremovermigrasjon.

Røyktest etter utrulling: eier setter sats, oppretter/kopierer/avlyser vakt, korrigerer tid
med grunn og laster ned valgt måned til Excel. Kontroller at UI og fil har samme øresum
og synlige mangler. Både plukker og selger skal kunne Start/Stopp fra Oversikt, se bare
egne vakter/timer/sats og tildelte oppgaver, og fullføre en oppgave med aktør og tidspunkt fra databasen synlig for eier. Sjekk også direkte tilgang til en annens data og eksport
(avvist), samt eksisterende brukere, høsting, lager, marked og regnskap.

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
