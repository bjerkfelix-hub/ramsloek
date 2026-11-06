import { getDictionary, type Locale } from '@/content'
import type { SeasonStatus } from '@/lib/domain/season'
import { SIGNUP_ANCHOR } from './signup-slot'
import { seasonBannerText } from './view'

export function SeasonBanner({ status, locale }: { status: SeasonStatus; locale: Locale }) {
  const { text, signUp } = seasonBannerText(status, locale)
  const { season } = getDictionary(locale)
  return (
    <div data-testid="season-banner" className="on-forest rounded-2xl bg-forest px-5 py-5 text-cream sm:px-7 sm:py-6">
      <p className="flex items-start gap-3 font-display text-xl leading-snug sm:text-2xl">
        <span
          aria-hidden="true"
          className={`mt-2 inline-block size-2.5 shrink-0 rounded-full ${status.kind === 'in_season' ? 'bg-cream' : 'border-2 border-cream'}`}
        />
        <span>{text}</span>
      </p>
      {signUp && (
        <p className="mt-2 pl-[1.375rem]">
          <a href={`#${SIGNUP_ANCHOR}`} className="text-cream underline">
            {season.signUpPrompt}
          </a>
        </p>
      )}
    </div>
  )
}
