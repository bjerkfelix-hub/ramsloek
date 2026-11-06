import type { Dictionary } from './types'

export const en: Dictionary = {
  site: {
    name: 'Nesodden Ramsløk',
    tagline: 'Hand-picked wild garlic from Nesodden',
    skipToContent: 'Skip to content',
  },
  nav: {
    home: 'Home',
    story: 'Our story',
    recipes: 'Recipes',
    markets: 'Markets',
    privacy: 'Privacy',
    menu: 'Menu',
    mainNavigation: 'Main navigation',
    languageSwitchLabel: 'Language',
    switchToOther: 'Norsk',
  },
  pages: {
    home: {
      title: 'Nesodden Ramsløk – hand-picked wild garlic from Nesodden',
      description:
        'Wild garlic (ramsløk) picked by hand on a private estate on Nesodden, sorted and checked for lily of the valley, and sold fresh at Bondens marked in Oslo.',
    },
    story: {
      title: 'Our story – Nesodden Ramsløk',
      description:
        'From a private estate on Nesodden to the market stall in Oslo. How we pick and check our wild garlic, and how to tell it from lily of the valley.',
    },
    recipes: {
      title: 'Wild garlic recipes – Nesodden Ramsløk',
      description:
        'Six simple wild garlic recipes: pesto, butter, oil, soup, scrambled eggs and lacto-fermented wild garlic.',
    },
    markets: {
      title: 'Markets – where and when to find us | Nesodden Ramsløk',
      description:
        'Upcoming market days in Oslo with date, time and place. Meet us at Bondens marked and buy fresh wild garlic.',
    },
    privacy: {
      title: 'Privacy – Nesodden Ramsløk',
      description:
        'What we store when you sign up for the season notice, why, for how long, and what rights you have.',
    },
    unsubscribe: {
      title: 'Unsubscribe – Nesodden Ramsløk',
      description: 'Unsubscribe from the season notice from Nesodden Ramsløk.',
    },
    notFound: {
      title: 'Page not found – Nesodden Ramsløk',
      description: 'We could not find the page you are looking for.',
    },
  },
  season: {
    inSeason: 'In season – next market: {date}, {place}',
    soon: 'The season starts {month}',
    offSeason: 'The season starts in spring',
    signUpPrompt: "Sign up and we'll let you know when the season starts.",
  },
  home: {
    heading: 'Wild garlic from Nesodden',
    intro: [
      'Nesodden Ramsløk sells wild garlic (ramsløk) from a private estate on Nesodden. Every leaf is picked by hand.',
      'Every single batch is sorted and checked for lily of the valley, the poisonous look-alike, before it is packed. You can buy it fresh at Bondens marked in Oslo.',
    ],
    nextMarketsHeading: 'Next market days',
    allMarkets: 'See all market days',
    storyLink: 'Read our story',
    recipesLink: 'See recipes',
  },
  markets: {
    heading: 'Markets',
    lead: 'This is where to find us with fresh wild garlic. Come early for the freshest.',
    cancelled: 'Cancelled',
    showOnMap: 'Show on map',
    time: '{start}–{end}',
    empty: 'There are no market days on the calendar right now.',
    emptyPointer: "Wild garlic is a spring crop. Sign up below and we'll let you know when the season starts.",
    loadFailed: 'Market days could not be loaded right now',
    nextLabel: 'Next market',
  },
  signup: {
    heading: 'Get notified when the season starts',
    lead: "Leave your email address and we'll tell you when we have fresh wild garlic.",
    emailLabel: 'Email address',
    emailPlaceholder: 'you@example.com',
    consentText:
      'I consent to Nesodden Ramsløk storing my email address and sending me a notice when the season starts. I can unsubscribe at any time.',
    button: 'Sign me up',
    comingSoon: 'Sign-up opens soon.',
    sending: 'Sending …',
    success: "Thanks! We'll let you know when the season starts.",
    errorInvalidEmail: 'Please enter a valid email address.',
    errorNoConsent: 'Please tick the consent box.',
    errorTryLater: 'Please try again a little later.',
    errorGeneric: 'Something went wrong. Please try again shortly.',
  },
  unsubscribe: {
    heading: 'Unsubscribe',
    done: 'You have been unsubscribed.',
    invalid: 'The link is invalid or has already been used.',
    backHome: 'Back to the front page',
  },
  story: {
    heading: 'Our story',
    lead: 'From a private estate on Nesodden to the market stall in Oslo.',
    sections: [
      {
        heading: 'Wild garlic from a private estate',
        paragraphs: [
          'Our wild garlic comes from a private estate on Nesodden.',
        ],
      },
      {
        heading: 'Picked by hand',
        paragraphs: [
          'The wild garlic is picked by hand.',
        ],
      },
      {
        heading: 'Sorted and checked',
        paragraphs: [
          'Every batch is sorted and checked for lily of the valley. Lily of the valley is poisonous and can resemble wild garlic, so this check is the most important step before the wild garlic is sold.',
        ],
      },
      {
        heading: 'Fresh to Oslo',
        paragraphs: [
          'Wild garlic is best fresh. We sell it fresh at Bondens marked in Oslo. See Markets for where and when to find us.',
        ],
      },
    ],
    safetyHeading: 'How to tell wild garlic from lily of the valley',
    safetyIntro:
      'Do you pick your own, or just want to know what you are buying? These signs help, but use them together. If in doubt, do not eat it.',
    safetyTips: [
      'Smell: Crush a leaf between your fingers. Wild garlic clearly smells of garlic. Lily of the valley does not.',
      'Leaf stalk: Wild garlic leaves grow singly, each on its own stalk up from the ground.',
      'Leaf pair: Lily of the valley usually has two leaves close together, wrapped around the same stem.',
      'Flowers: Wild garlic has white, star-shaped flowers in an umbel. Lily of the valley has small white, bell-shaped flowers hanging along one stalk.',
    ],
    safetyAdvice:
      'Buy wild garlic from sellers who check and sort their batches, and who can tell you how. The smell test alone is not enough: if you have handled garlic or wild garlic, the smell can linger on your fingers and fool you.',
    imagePlaceholder: 'Photo coming soon',
  },
  recipes: {
    heading: 'Recipes',
    lead: 'Six simple ways to use fresh wild garlic.',
    ingredients: 'Ingredients',
    steps: 'Method',
    time: 'Time',
    servings: '{count} servings',
    readRecipe: 'View recipe',
    allRecipes: 'All recipes',
    safetyNote:
      'Only use wild garlic you are sure about, and buy from sellers who sort and check for lily of the valley.',
  },
  privacy: {
    heading: 'Privacy',
    updated: 'Last updated: November 2026',
    intro:
      'This page explains what we do with your information if you sign up for the season notice. We use no tracking cookies or analytics tools on this website.',
    sections: [
      {
        heading: 'What we store',
        paragraphs: [
          'When you sign up, we store your email address, the language you used (Norwegian or English), and the time and wording of your consent.',
        ],
      },
      {
        heading: 'Why',
        paragraphs: ['We use the information to tell you when the wild garlic season starts. We do not use it for anything else.'],
      },
      {
        heading: 'Legal basis',
        paragraphs: ['The processing is based on your consent (GDPR Article 6(1)(a)). You can withdraw your consent at any time.'],
      },
      {
        heading: 'How long we keep it',
        paragraphs: [
          'We keep the information until you unsubscribe. After you unsubscribe, it is deleted within 30 days.',
          'The emails we send will contain an unsubscribe link. You can also always unsubscribe using the link on the confirmation page, or by contacting us. It is free and needs no login.',
        ],
      },
      {
        heading: 'Who processes the information',
        paragraphs: [
          'We use the database service Supabase (data centre in the EU) and the hosting platform Railway (data centre in the EU). Once we start using a service to send email, it will also process your email address on our behalf. We do not share the information with anyone else and we never sell it.',
        ],
      },
      {
        heading: 'Your rights',
        paragraphs: [
          'You have the right to access, correct and delete your information, and to restrict or object to the processing. You can also complain to the Norwegian Data Protection Authority, Datatilsynet (datatilsynet.no), if you believe we are processing your information unlawfully.',
        ],
      },
    ],
    contactHeading: 'Contact us',
    contact: 'To see, correct or delete your information, send an email to {email}.',
  },
  notFound: {
    heading: 'Page not found',
    text: 'We could not find the page you are looking for. The link may be old, or the address mistyped.',
    backHome: 'Back to the front page',
  },
  footer: {
    orgNumber: 'Org. no. {orgNumber}',
    contact: 'Contact',
    rights: '© {year} {name}',
    languageLabel: 'Language',
  },
}
