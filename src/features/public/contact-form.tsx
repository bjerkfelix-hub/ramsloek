'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { interestAction, inquiryAction } from '@/app/(public)/contact-actions'
import { getDictionary, type Locale } from '@/content'
import type { ContactKind } from '@/lib/domain/public-contacts'
import { ROUTES } from '@/lib/public/routes'

const inputClass =
  'min-h-11 w-full min-w-0 rounded-lg border border-line bg-white px-3 py-3 text-base font-normal'
export function ContactForm({ locale, kind }: { locale: Locale; kind: ContactKind }) {
  const dict = getDictionary(locale)
  const t = dict.contactForm
  const [values, setValues] = useState<Record<string, string>>({ type: 'restaurant' })
  const [consent, setConsent] = useState(false)
  const updateValue = (name: string, value: string) =>
    setValues((previous) => ({ ...previous, [name]: value }))
  const [state, action, pending] = useActionState(kind === 'interest' ? interestAction : inquiryAction, null)
  const textField = (
    name: string,
    label: string,
    maxLength: number,
    required = false,
    type = 'text',
    autoComplete?: string,
  ) => (
    <label className="flex min-w-0 flex-col gap-1 font-medium" key={name}>
      {label}
      <input
        className={inputClass}
        name={name}
        value={values[name] ?? ''}
        onChange={(event) => updateValue(name, event.target.value)}
        type={type}
        maxLength={maxLength}
        required={required}
        autoComplete={autoComplete}
      />
    </label>
  )
  const textarea = (name: string, label: string, maxLength: number, required = false) => (
    <label className="flex min-w-0 flex-col gap-1 font-medium">
      {label}
      <textarea
        className={inputClass}
        name={name}
        value={values[name] ?? ''}
        onChange={(event) => updateValue(name, event.target.value)}
        maxLength={maxLength}
        rows={5}
        required={required}
      />
    </label>
  )
  return (
    <section className="rounded-2xl border border-line bg-cream px-5 py-6 sm:px-7">
      <div role="status" aria-live="polite">
        {state?.ok && (
          <p
            data-testid="contact-success"
            className="rounded-lg bg-sage px-4 py-3 font-medium text-forest-dark"
          >
            {dict[kind].success}
          </p>
        )}
      </div>
      {!state?.ok && (
        <form
          action={action}
          className="flex min-w-0 flex-col gap-4"
          aria-describedby={state && !state.ok ? 'contact-error' : undefined}
        >
          <input type="hidden" name="language" value={locale} />
          <div className="hp-field" aria-hidden="true">
            <label>
              {dict.signup.honeypotLabel}
              <input name="hp_extra_field" tabIndex={-1} autoComplete="off" defaultValue="" />
            </label>
          </div>
          {kind === 'interest' ? (
            textField('name', t.name, 100, true, 'text', 'name')
          ) : (
            <>
              {textField('company', t.company, 100, true, 'text', 'organization')}
              {textField('contact_name', t.contactName, 100, true, 'text', 'name')}
            </>
          )}
          {textField('email', t.email, 254, true, 'email', 'email')}
          {textField('phone', t.phone, 50, false, 'tel', 'tel')}
          {kind === 'interest' ? (
            <>
              <label className="flex flex-col gap-1 font-medium">
                {t.bags}
                <input
                  className={inputClass}
                  name="bags"
                  value={values.bags ?? ''}
                  onChange={(event) => updateValue('bags', event.target.value)}
                  type="number"
                  min={1}
                  max={50}
                  step={1}
                  required
                />
              </label>
              {textarea('comment', t.comment, 1000)}
            </>
          ) : (
            <>
              <label className="flex flex-col gap-1 font-medium">
                {t.type}
                <select
                  className={inputClass}
                  name="type"
                  value={values.type}
                  onChange={(event) => updateValue('type', event.target.value)}
                  required
                >
                  {(['restaurant', 'grossist', 'butikk', 'annet'] as const).map((value) => (
                    <option key={value} value={value}>
                      {t[value]}
                    </option>
                  ))}
                </select>
              </label>
              {textField('weekly_quantity', t.weeklyQuantity, 100)}
              {textarea('message', t.message, 2000, true)}
            </>
          )}
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input
              name="consent"
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              required
              className="mt-1 h-5 w-5 shrink-0 accent-[var(--rl-forest)]"
            />
            <span>{dict[kind].consentText}</span>
          </label>
          <Link
            href={ROUTES[locale].privacy}
            className="inline-flex min-h-11 items-center font-medium text-forest underline"
          >
            {dict.signup.privacyLink}
          </Link>
          {state && !state.ok && (
            <p id="contact-error" role="alert" data-testid="contact-error" className="font-medium text-alert">
              {state.error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="min-h-11 self-start rounded-lg bg-forest px-5 py-3 font-medium text-cream hover:bg-forest-dark disabled:opacity-60"
          >
            {pending ? dict.signup.sending : t.button}
          </button>
        </form>
      )}
    </section>
  )
}
