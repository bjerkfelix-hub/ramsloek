import { getDictionary, type Locale } from '@/content'

export const SIGNUP_ANCHOR = 'pamelding'

// Placeholder for the season sign-up form; Task 7 replaces this component.
export function SignupSlot({ locale }: { locale: Locale }) {
  const { signup } = getDictionary(locale)
  return (
    <section
      id={SIGNUP_ANCHOR}
      aria-labelledby={`${SIGNUP_ANCHOR}-tittel`}
      className="scroll-mt-6 rounded-2xl border border-line bg-cream px-5 py-6 sm:px-7"
    >
      <h2 id={`${SIGNUP_ANCHOR}-tittel`} className="font-display text-2xl font-semibold text-forest">
        {signup.heading}
      </h2>
      <p className="mt-2 text-muted">{signup.comingSoon}</p>
    </section>
  )
}
