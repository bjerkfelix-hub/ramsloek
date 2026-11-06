'use client'

import { useActionState } from 'react'
import { signUpAction } from '@/app/(public)/signup-actions'
import type { Dictionary, Locale } from '@/content'

import { SIGNUP_ANCHOR } from './signup-anchor'

export function SignupForm({ locale, signup }: { locale: Locale; signup: Dictionary['signup'] }) {
  const [state, formAction, pending] = useActionState(signUpAction, null)

  return (
    <section
      id={SIGNUP_ANCHOR}
      aria-labelledby={`${SIGNUP_ANCHOR}-tittel`}
      className="scroll-mt-6 rounded-2xl border border-line bg-cream px-5 py-6 sm:px-7"
    >
      <h2 id={`${SIGNUP_ANCHOR}-tittel`} className="font-display text-2xl font-semibold text-forest">
        {signup.heading}
      </h2>
      <p className="mt-2 text-muted">{signup.lead}</p>
      {state?.ok ? (
        <p role="status" data-testid="signup-success" className="mt-4 rounded-lg bg-sage px-4 py-3 font-medium text-forest-dark">
          {signup.success}
        </p>
      ) : (
        <form action={formAction} className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="language" value={locale} />
          <div className="hp-field" aria-hidden="true">
            <label>
              {signup.honeypotLabel}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
            </label>
          </div>
          <label className="flex flex-col gap-1 font-medium">
            {signup.emailLabel}
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder={signup.emailPlaceholder}
              className="rounded-lg border border-line bg-white px-3 py-3 text-base font-normal"
            />
          </label>
          <label className="flex items-start gap-3 text-base">
            <input type="checkbox" name="consent" className="mt-1 h-5 w-5 shrink-0 accent-[var(--rl-forest)]" />
            <span>{signup.consentText}</span>
          </label>
          {state && !state.ok && (
            <p role="alert" data-testid="signup-error" className="font-medium text-alert">
              {state.error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="self-start rounded-lg bg-forest px-5 py-3 font-medium text-cream hover:bg-forest-dark disabled:opacity-60"
          >
            {pending ? signup.sending : signup.button}
          </button>
        </form>
      )}
    </section>
  )
}
