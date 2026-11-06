export type Page = { title: string; description: string }
export type Section = { heading: string; paragraphs: string[] }

export type Dictionary = {
  site: { name: string; tagline: string; skipToContent: string }
  nav: {
    home: string
    story: string
    recipes: string
    markets: string
    privacy: string
    menu: string
    mainNavigation: string
    languageSwitchLabel: string
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
    nextLabel: string
  }
  signup: {
    heading: string
    lead: string
    emailLabel: string
    emailPlaceholder: string
    consentText: string
    button: string
    comingSoon: string // shown until the sign-up form exists
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
  servings: number
  title: { no: string; en: string }
  intro: { no: string; en: string }
  ingredients: { no: string[]; en: string[] }
  steps: { no: string[]; en: string[] }
}
