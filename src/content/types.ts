export type Page = { title: string; description: string }
export type Section = { heading: string; paragraphs: string[] }

export type Dictionary = {
  site: { name: string; tagline: string; skipToContent: string }
  nav: {
    story: string
    recipes: string
    markets: string
    privacy: string
    mainNavigation: string
    switchToOther: string
  }
  pages: {
    home: Page
    story: Page
    recipes: Page
    markets: Page
    privacy: Page
    unsubscribe: Page
    notFound: Page
  }
  season: {
    inSeason: string // {date} {place}
    soon: string // {month}
    offSeason: string
    signUpPrompt: string
  }
  home: {
    heading: string
    intro: string[]
    nextMarketsHeading: string
    allMarkets: string
    storyLink: string
    recipesLink: string
  }
  markets: {
    heading: string
    lead: string
    cancelled: string
    showOnMap: string
    time: string // {start} {end}
    empty: string
    emptyPointer: string
    loadFailed: string
  }
  signup: {
    heading: string
    lead: string
    emailLabel: string
    emailPlaceholder: string
    consentText: string
    privacyLink: string // link text to the privacy page, shown after the consent text
    button: string
    honeypotLabel: string // label of the hidden spam-trap field
    sending: string
    success: string
    errorInvalidEmail: string
    errorNoConsent: string
    errorTryLater: string
    errorGeneric: string
  }
  unsubscribe: {
    heading: string
    done: string
    invalid: string
    backHome: string
    button: string
    error: string
  }
  story: {
    heading: string
    lead: string
    sections: Section[]
    safetyHeading: string
    safetyIntro: string
    safetyTips: string[]
    safetyAdvice: string
    imagePlaceholder: string
  }
  recipes: {
    heading: string
    lead: string
    ingredients: string
    steps: string
    time: string
    servings: string // {count}
    readRecipe: string
    allRecipes: string
    safetyNote: string
  }
  privacy: {
    heading: string
    updated: string
    intro: string
    sections: Section[]
    controllerHeading: string
    contactHeading: string
    contact: string // {email}
  }
  notFound: { heading: string; text: string; backHome: string }
  footer: {
    orgNumber: string // {orgNumber}
    contact: string
    rights: string // {year} {name}
    languageLabel: string
  }
}

export type Recipe = {
  slug: string
  image: null
  time: { no: string; en: string }
  /** ISO-8601 duration for structured data; only set when the time is a single exact duration. */
  durationIso?: string
  servings: number
  title: { no: string; en: string }
  intro: { no: string; en: string }
  ingredients: { no: string[]; en: string[] }
  steps: { no: string[]; en: string[] }
}
