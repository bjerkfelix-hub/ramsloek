import type { Dictionary } from './types'

export const no: Dictionary = {
  site: {
    name: 'Ramsløk.no',
    tagline: 'Håndplukket ramsløk fra Nesodden',
    skipToContent: 'Hopp til innhold',
  },
  nav: {
    shop: "Butikken",
    interest: "Meld interesse",
    wholesale: "For restauranter og grossister",
    business: "For bedrifter",

    story: 'Historien',
    recipes: 'Oppskrifter',
    markets: 'Marked',
    privacy: 'Personvern',
    mainNavigation: 'Hovednavigasjon',
    switchToOther: 'English',
  },
  pages: {
    shop: {
      title: 'Butikken – Ramsløk.no',
      description: 'Fersk ramsløk fra Nesodden til vårens markeder i Oslo.',
    },
    interest: {
      title: 'Meld interesse – Ramsløk.no',
      description: 'Fortell oss hvor mange poser du er interessert i. Vi tar kontakt når sesongen nærmer seg. Dette er ikke en bestilling.',
    },
    wholesale: {
      title: 'For restauranter og grossister – Ramsløk.no',
      description: 'Vil dere kjøpe fersk ramsløk til kjøkkenet eller for videresalg? Fortell oss hva dere trenger, så tar vi kontakt.',
    },

    home: {
      title: 'Ramsløk.no – håndplukket ramsløk fra Nesodden',
      description:
        'Ramsløk plukket for hånd på en privat eiendom på Nesodden, sortert og kontrollert for liljekonvall, og solgt ferskt på Bondens marked i Oslo.',
    },
    story: {
      title: 'Historien – Ramsløk.no',
      description:
        'Fra en privat eiendom på Nesodden til markedsbordet i Oslo. Slik plukker og kontrollerer vi ramsløken, og slik skiller du den fra liljekonvall.',
    },
    recipes: {
      title: 'Oppskrifter med ramsløk – Ramsløk.no',
      description:
        'Seks enkle oppskrifter med ramsløk: pesto, smør, olje, suppe, eggerøre og lakefermentert ramsløk.',
    },
    markets: {
      title: 'Marked – hvor og når du finner oss | Ramsløk.no',
      description:
        'Kommende markedsdager i Oslo med dato, tid og sted. Møt oss på Bondens marked og kjøp fersk ramsløk.',
    },
    privacy: {
      title: 'Personvern – Ramsløk.no',
      description:
        'Hva vi lagrer når du melder deg på sesongvarsel, hvorfor, hvor lenge, og hvilke rettigheter du har.',
    },
    unsubscribe: {
      title: 'Avmelding – Ramsløk.no',
      description: 'Avmelding fra sesongvarsel fra Ramsløk.no.',
    },
    notFound: {
      title: 'Siden finnes ikke – Ramsløk.no',
      description: 'Vi finner ikke siden du leter etter.',
    },
  },
  shop: {
    heading: 'Butikken',
    lead: 'Fersk ramsløk fra Nesodden til vårens markeder i Oslo.',
    paragraphs: [
      'Vi plukker ramsløken for hånd på en privat eiendom på Nesodden. Hver sending sorteres og kontrolleres for liljekonvall før den pakkes fersk.',
      'Du finner oss på markeder i Oslo om våren. Se markedskalenderen for tid og sted.',
    ],
    productsHeading: 'Dette selger vi',
    prices: 'Prisene kommer når sesongen starter.',
    empty: 'Utvalget for neste sesong kommer snart.',
    loadFailed: 'Utvalget kunne ikke lastes. Prøv igjen om litt.',
  },
  interest: {
    heading: 'Meld interesse',
    lead: 'Fortell oss hvor mange poser du er interessert i. Vi tar kontakt når sesongen nærmer seg. Dette er ikke en bestilling.',
    consentText: 'Jeg samtykker til at Ramsløk.no lagrer opplysningene mine og kontakter meg om interessen min denne sesongen. Opplysningene slettes når sesongen er over. Jeg kan trekke samtykket tilbake når som helst.',
    success: 'Takk! Vi har registrert interessen din.',
  },
  wholesale: {
    heading: 'For restauranter og grossister',
    lead: 'Vil dere kjøpe fersk ramsløk til kjøkkenet eller for videresalg? Fortell oss hva dere trenger, så tar vi kontakt.',
    consentText: 'Jeg samtykker til at Ramsløk.no lagrer opplysningene i henvendelsen og kontakter meg for å følge den opp. Opplysningene slettes etter 12 måneder. Jeg kan trekke samtykket tilbake når som helst.',
    success: 'Takk for henvendelsen! Vi tar kontakt.',
  },
  contactForm: {
    name: 'Navn',
    email: 'E-postadresse',
    phone: 'Telefon (valgfritt)',
    bags: 'Antall poser',
    comment: 'Kommentar (valgfritt)',
    company: 'Bedrift',
    contactName: 'Kontaktperson',
    type: 'Type virksomhet',
    weeklyQuantity: 'Omtrent ukentlig mengde (valgfritt)',
    message: 'Melding',
    restaurant: 'Restaurant',
    grossist: 'Grossist',
    butikk: 'Butikk',
    annet: 'Annet',
    button: 'Send inn',
    errorRequired: 'Fyll ut alle obligatoriske felt.',
    errorPhone: 'Skriv et gyldig telefonnummer.',
    errorBags: 'Velg et helt antall poser fra 1 til 50.',
    errorLength: 'Et felt er for langt. Kort ned teksten.',
  },
  season: {
    inSeason: 'I sesong – neste marked: {date}, {place}',
    soon: 'Sesongen starter {month}',
    offSeason: 'Sesongen starter til våren',
    signUpPrompt: 'Meld deg på, så sier vi fra når sesongen starter.',
  },
  home: {
    heading: 'Ramsløk fra Nesodden',
    intro: [
      'Ramsløk.no selger ramsløk fra en privat eiendom på Nesodden. Hvert blad plukkes for hånd.',
      'Hver eneste sending sorteres og kontrolleres for liljekonvall, den giftige dobbeltgjengeren, før den pakkes. Du får den fersk på Bondens marked i Oslo.',
    ],
    nextMarketsHeading: 'Neste markedsdager',
    allMarkets: 'Se alle markedsdager',
    storyLink: 'Les historien vår',
    recipesLink: 'Se oppskrifter',
  },
  markets: {
    heading: 'Marked',
    lead: 'Her finner du oss med fersk ramsløk. Kom tidlig, så får du den ferskeste.',
    cancelled: 'Avlyst',
    showOnMap: 'Vis i kart',
    time: 'kl. {start}–{end}',
    empty: 'Det er ingen markedsdager på kalenderen akkurat nå.',
    emptyPointer: 'Ramsløk er en vårvare. Meld deg på nedenfor, så sier vi fra når sesongen starter.',
    loadFailed: 'Markedsdagene kunne ikke lastes akkurat nå',
  },
  signup: {
    heading: 'Si fra når sesongen starter',
    lead: 'Legg igjen e-postadressen din, så får du beskjed når vi har fersk ramsløk.',
    emailLabel: 'E-postadresse',
    emailPlaceholder: 'din@epost.no',
    consentText:
      'Jeg samtykker til at Ramsløk.no lagrer e-postadressen min og sender meg beskjed når sesongen starter. Jeg kan melde meg av når som helst.',
    privacyLink: 'Les personvernerklæringen.',
    button: 'Meld meg på',
    honeypotLabel: 'Ikke fyll ut dette feltet',
    sending: 'Sender …',
    success: 'Takk! Vi sier fra når sesongen starter.',
    errorInvalidEmail: 'Skriv en gyldig e-postadresse.',
    errorNoConsent: 'Du må samtykke for å melde deg på.',
    errorTryLater: 'Prøv igjen litt senere.',
    errorGeneric: 'Noe gikk galt. Prøv igjen om litt.',
  },
  unsubscribe: {
    heading: 'Avmelding',
    done: 'Du er meldt av.',
    invalid: 'Lenken er ugyldig eller allerede brukt.',
    backHome: 'Til forsiden',
    button: 'Meld meg av',
    error: 'Noe gikk galt – prøv igjen senere.',
  },
  story: {
    heading: 'Historien vår',
    lead: 'Fra en privat eiendom på Nesodden til markedsbordet i Oslo.',
    sections: [
      {
        heading: 'Ramsløk fra en privat eiendom',
        paragraphs: [
          'Ramsløken vår kommer fra en privat eiendom på Nesodden.',
        ],
      },
      {
        heading: 'Plukket for hånd',
        paragraphs: [
          'Ramsløken plukkes for hånd.',
        ],
      },
      {
        heading: 'Sortert og kontrollert',
        paragraphs: [
          'Hver sending sorteres og kontrolleres for liljekonvall. Liljekonvall er giftig og kan ligne på ramsløk, så denne kontrollen er det viktigste steget før ramsløken selges.',
        ],
      },
      {
        heading: 'Fersk til Oslo',
        paragraphs: [
          'Ramsløk er best når den er fersk. Vi selger den fersk på Bondens marked i Oslo. Se under Marked hvor og når du finner oss.',
        ],
      },
    ],
    safetyHeading: 'Slik skiller du ramsløk fra liljekonvall',
    safetyIntro:
      'Plukker du selv, eller vil du bare vite hva du kjøper? Disse tegnene hjelper, men bruk dem sammen. Er du i tvil, skal du ikke spise den.',
    safetyTips: [
      'Lukt: Knus et blad mellom fingrene. Ramsløk lukter tydelig av hvitløk. Liljekonvall lukter ikke av hvitløk.',
      'Bladstilk: Ramsløkbladene vokser enkeltvis, hvert på sin egen stilk opp fra bakken.',
      'Bladpar: Liljekonvall har vanligvis to blad som sitter tett sammen og er viklet rundt samme stengel.',
      'Blomster: Ramsløk har hvite, stjerneformede blomster samlet i en skjerm. Liljekonvall har små hvite, klokkeformede blomster som henger langs én stilk.',
    ],
    safetyAdvice:
      'Kjøp ramsløk fra selgere som kontrollerer og sorterer partiene sine, og som kan fortelle deg hvordan. Luktetesten alene er ikke nok: hvis du har håndtert hvitløk eller ramsløk, kan lukten sitte på fingrene og lure deg.',
    imagePlaceholder: 'Bilde kommer',
  },
  recipes: {
    heading: 'Oppskrifter',
    lead: 'Seks enkle måter å bruke fersk ramsløk på.',
    ingredients: 'Ingredienser',
    steps: 'Slik gjør du',
    time: 'Tid',
    servings: '{count} porsjoner',
    readRecipe: 'Se oppskrift',
    allRecipes: 'Alle oppskrifter',
    safetyNote:
      'Bruk bare ramsløk du er sikker på, og kjøp fra selgere som sorterer og kontrollerer for liljekonvall.',
  },
  privacy: {
    heading: 'Personvern',
    updated: 'Sist oppdatert: november 2026',
    intro:
      'Denne siden forklarer hva vi gjør med opplysningene dine når du melder deg på sesongvarsel, melder interesse eller sender en henvendelse. Vi bruker ikke informasjonskapsler for sporing eller analyseverktøy på nettsiden.',
    sections: [
      {
        heading: 'Meld interesse',
        paragraphs: [
          'Vi lagrer navn, e-post, eventuell telefon, antall poser og eventuell kommentar, samt språk, samtykketekst og tidspunkt. Bare eierne har tilgang. Vi bruker opplysningene til å følge opp interessen din, med samtykket ditt som grunnlag. De slettes når sesongen slutter. Kontakt oss på kontaktadressen under for å trekke samtykket tilbake eller be om sletting.',
        ],
      },
      {
        heading: 'Henvendelser fra bedrifter',
        paragraphs: [
          'Vi lagrer bedrift, kontaktperson, e-post, eventuell telefon, type virksomhet, eventuell ukentlig mengde og melding, samt språk, samtykketekst og tidspunkt. Eierne ser henvendelsen og registrerer når og av hvem den er besvart. Vi bruker opplysningene til å svare deg, med samtykket ditt som grunnlag. Henvendelsen sendes også til eiernes e-post via Resend, som behandler opplysningene for oss. Opplysningene slettes etter 12 måneder, også fra e-post. Du kan be om sletting på kontaktadressen under.',
        ],
      },
      {
        heading: 'Hva vi lagrer',
        paragraphs: [
          'Når du melder deg på, lagrer vi e-postadressen din, hvilket språk du brukte (norsk eller engelsk), og tidspunktet og teksten for samtykket ditt.',
        ],
      },
      {
        heading: 'Hvorfor',
        paragraphs: ['Vi bruker opplysningene til å si fra når ramsløksesongen starter. Vi bruker dem ikke til noe annet.'],
      },
      {
        heading: 'Rettslig grunnlag',
        paragraphs: ['Behandlingen bygger på samtykket ditt (personvernforordningen artikkel 6 nr. 1 bokstav a). Du kan trekke samtykket tilbake når som helst.'],
      },
      {
        heading: 'Hvor lenge vi lagrer det',
        paragraphs: [
          'Vi lagrer opplysningene til du melder deg av. Opplysningene slettes senest 31 dager etter at du meldte deg av.',
          'Du kan melde deg av når som helst ved å kontakte oss på kontaktadressen under. Hver e-post vi sender vil inneholde en lenke som melder deg av med ett klikk. Det koster ingenting og krever ingen innlogging.',
        ],
      },
      {
        heading: 'Hvem som behandler opplysningene',
        paragraphs: [
          'Vi bruker databasetjenesten Supabase (datasenter i EU) og driftsplattformen Railway (datasenter i EU). Når vi tar i bruk en tjeneste for å sende e-post, behandler den også e-postadressen din for oss. Vi deler ikke opplysningene med andre og selger dem ikke.',
          'Leverandørene av databasen og driftsplattformen lagrer kortvarige tekniske forespørselslogger (blant annet IP-adresse) av hensyn til sikkerhet og drift. Vi bruker ikke disse loggene til å følge deg.',
        ],
      },
      {
        heading: 'Dine rettigheter',
        paragraphs: [
          'Du har rett til innsyn, retting og sletting, til å begrense eller protestere mot behandlingen, og til dataportabilitet (å få opplysningene dine utlevert i et maskinlesbart format). Du kan også klage til Datatilsynet (datatilsynet.no) hvis du mener vi behandler opplysningene dine i strid med regelverket.',
        ],
      },
    ],
    controllerHeading: 'Behandlingsansvarlig',
    contactHeading: 'Kontakt oss',
    contact: 'Vil du ha innsyn, rette eller slette opplysninger? Send en e-post til {email}.',
  },
  notFound: {
    heading: 'Siden finnes ikke',
    text: 'Vi finner ikke siden du leter etter. Kanskje lenken er gammel, eller adressen er skrevet feil.',
    backHome: 'Til forsiden',
  },
  footer: {
    orgNumber: 'Org.nr. {orgNumber}',
    contact: 'Kontakt',
    rights: '© {year} {name}',
    languageLabel: 'Språk',
  },
}
