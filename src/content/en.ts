import type { Dictionary } from './types'

export const en: Dictionary = {
  site: {
    name: 'Ramsløk.no',
    tagline: 'Hand-picked wild garlic from Nesodden',
    skipToContent: 'Skip to content',
  },
  nav: {
    shop: "Shop",
    interest: "Register interest",
    wholesale: "For restaurants and wholesalers",
    business: "For businesses",

    story: 'Our story',
    recipes: 'Recipes',
    markets: 'Markets',
    privacy: 'Privacy',
    mainNavigation: 'Main navigation',
    switchToOther: 'Norsk',
  },
  pages: {
    shop: {
      title: 'Shop – Ramsløk.no',
      description: 'Fresh wild garlic from Nesodden at spring markets in Oslo.',
    },
    interest: {
      title: 'Register interest – Ramsløk.no',
      description: 'Tell us how many bags you are interested in. We will contact you closer to the season. This is not an order.',
    },
    wholesale: {
      title: 'For restaurants and wholesalers – Ramsløk.no',
      description: 'Would you like fresh wild garlic for your kitchen or to sell on? Tell us what you need and we will get in touch.',
    },

    home: {
      title: 'Ramsløk.no – hand-picked wild garlic from Nesodden',
      description:
        'Wild garlic (ramsløk) picked by hand on a private estate on Nesodden, sorted and checked for lily of the valley, and sold fresh at Bondens marked in Oslo.',
    },
    story: {
      title: 'Our story – Ramsløk.no',
      description:
        'From a private estate on Nesodden to the market stall in Oslo. How we pick and check our wild garlic, and how to tell it from lily of the valley.',
    },
    recipes: {
      title: 'Wild garlic recipes – Ramsløk.no',
      description:
        'Six simple wild garlic recipes: pesto, butter, oil, soup, scrambled eggs and lacto-fermented wild garlic.',
    },
    markets: {
      title: 'Markets – where and when to find us | Ramsløk.no',
      description:
        'Upcoming market days in Oslo with date, time and place. Meet us at Bondens marked and buy fresh wild garlic.',
    },
    privacy: {
      title: 'Privacy – Ramsløk.no',
      description:
        'What we store when you sign up for the season notice, why, for how long, and what rights you have.',
    },
    unsubscribe: {
      title: 'Unsubscribe – Ramsløk.no',
      description: 'Unsubscribe from the season notice from Ramsløk.no.',
    },
    notFound: {
      title: 'Page not found – Ramsløk.no',
      description: 'We could not find the page you are looking for.',
    },
  },
  shop: {
    heading: 'Shop',
    lead: 'Fresh wild garlic from Nesodden at spring markets in Oslo.',
    paragraphs: [
      'We pick our wild garlic by hand on a private property on Nesodden. Every batch is sorted and checked for lily of the valley before it is packed fresh.',
      'You can find us at markets in Oslo in spring. See the market calendar for times and places.',
    ],
    productsHeading: 'Our products',
    prices: 'Prices will be available when the season starts.',
    empty: 'The range for next season will be available soon.',
    loadFailed: 'The product range could not be loaded. Please try again shortly.',
  },
  interest: {
    heading: 'Register interest',
    lead: 'Tell us how many bags you are interested in. We will contact you closer to the season. This is not an order.',
    consentText: 'I consent to Ramsløk.no storing my details and contacting me about my interest this season. My details will be deleted when the season ends. I can withdraw consent at any time.',
    success: 'Thank you! Your interest has been registered.',
  },
  wholesale: {
    heading: 'For restaurants and wholesalers',
    lead: 'Would you like fresh wild garlic for your kitchen or to sell on? Tell us what you need and we will get in touch.',
    consentText: 'I consent to Ramsløk.no storing my inquiry and contacting me to follow it up. My details will be deleted after 12 months. I can withdraw consent at any time.',
    success: 'Thank you for your inquiry! We will be in touch.',
  },
  contactForm: {
    name: 'Name',
    email: 'Email address',
    phone: 'Phone (optional)',
    bags: 'Number of bags',
    comment: 'Comment (optional)',
    company: 'Company',
    contactName: 'Contact name',
    type: 'Business type',
    weeklyQuantity: 'Approximate weekly quantity (optional)',
    message: 'Message',
    restaurant: 'Restaurant',
    grossist: 'Wholesaler',
    butikk: 'Shop',
    annet: 'Other',
    button: 'Submit',
    errorRequired: 'Please complete all required fields.',
    errorPhone: 'Please enter a valid phone number.',
    errorBags: 'Enter a whole number of bags from 1 to 50.',
    errorLength: 'A field is too long. Please shorten the text.',
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
      'Ramsløk.no sells wild garlic (ramsløk) from a private estate on Nesodden. Every leaf is picked by hand.',
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
  },
  signup: {
    heading: 'Get notified when the season starts',
    lead: "Leave your email address and we'll tell you when we have fresh wild garlic.",
    emailLabel: 'Email address',
    emailPlaceholder: 'you@example.com',
    consentText:
      'I consent to Ramsløk.no storing my email address and sending me a notice when the season starts. I can unsubscribe at any time.',
    privacyLink: 'Read the privacy policy.',
    button: 'Sign me up',
    honeypotLabel: 'Do not fill in this field',
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
    button: 'Unsubscribe',
    error: 'Something went wrong – please try again later.',
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
      'This page explains what we do with your information when you sign up for the season notice, register interest or send an inquiry. We use no tracking cookies or analytics tools on this website.',
    sections: [
      {
        heading: 'Registering interest',
        paragraphs: [
          'We store your name, email, optional phone, number of bags and optional comment, along with language, consent wording and time. Only the owners have access. With your consent, we use these details to follow up your interest. They are deleted when the season ends. Use the contact email below to withdraw consent or ask for deletion.',
        ],
      },
      {
        heading: 'Business inquiries',
        paragraphs: [
          'We store the company, contact name, email, optional phone, business type, optional weekly quantity and message, along with language, consent wording and time. The owners see the inquiry and record when and by whom it was answered. With your consent, we use the details to reply. The inquiry is also emailed to the owners through Resend, which processes the details for us. The details are deleted after 12 months, including from email. You can ask for deletion at the contact email below.',
        ],
      },
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
          'We keep the information until you unsubscribe. It is deleted no later than 31 days after you unsubscribe.',
          'You can unsubscribe at any time by contacting us at the contact address below. Every email we send will contain a link that unsubscribes you with one click. It is free and needs no login.',
        ],
      },
      {
        heading: 'Who processes the information',
        paragraphs: [
          'We use the database service Supabase (data centre in the EU) and the hosting platform Railway (data centre in the EU). Once we start using a service to send email, it will also process your email address on our behalf. We do not share the information with anyone else and we never sell it.',
          'The providers of the database and the hosting platform keep short-lived technical request logs (including IP address) for security and operation. We do not use these logs to follow you.',
        ],
      },
      {
        heading: 'Your rights',
        paragraphs: [
          'You have the right to access, correct and delete your information, to restrict or object to the processing, and to data portability (to receive your information in a machine-readable format). You can also complain to the Norwegian Data Protection Authority, Datatilsynet (datatilsynet.no), if you believe we are processing your information unlawfully.',
        ],
      },
    ],
    controllerHeading: 'Data controller',
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
