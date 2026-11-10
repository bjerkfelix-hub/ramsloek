'use client'

import { useState } from 'react'
import { Field, inputClass } from '@/components/action-form'
import { formatKr, parseKrOrZero } from '@/lib/domain/money'
import { saveTakings } from '@/app/admin/(app)/regnskap/actions'
import { LedgerForm } from './LedgerForm'
import { ReceiptInput } from './ReceiptInput'

export type TakingsDay = { id: string; label: string }

const FIELDS = [
  { name: 'vipps', label: 'Vipps (kr)' },
  { name: 'card', label: 'Kort (kr)' },
  { name: 'cash', label: 'Kontant (kr)' },
] as const

function sum(values: Record<string, string>): number | null {
  let total = 0
  for (const v of Object.values(values)) {
    const ore = parseKrOrZero(v)
    if (ore === null) return null
    total += ore
  }
  return total
}

export function TakingsForm({ days }: { days: TakingsDay[] }) {
  const [values, setValues] = useState<Record<string, string>>({ vipps: '', card: '', cash: '' })
  // After saving the last open day the list empties; keep the form (and its confirmation) on screen.
  const [savedOnce, setSavedOnce] = useState(false)
  const total = sum(values)

  if (days.length === 0 && !savedOnce) {
    return (
      <p className="a-sub">
        Ingen markedsdager å registrere. Dagsoppgjør kan registreres fra markedsdagen og 60 dager bakover, én gang per dag.
      </p>
    )
  }

  return (
    <LedgerForm
      save={saveTakings}
      parent="takings"
      testId="takings-form"
      onSaved={() => {
        setValues({ vipps: '', card: '', cash: '' })
        setSavedOnce(true)
      }}
    >
      <Field label="Markedsdag">
        <select name="market_day_id" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            {days.length === 0 ? 'Ingen flere markedsdager å registrere' : 'Velg markedsdag'}
          </option>
          {days.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </Field>
      {FIELDS.map((f) => (
        <Field key={f.name} label={f.label}>
          <input
            name={f.name}
            inputMode="decimal"
            autoComplete="off"
            className={inputClass}
            onChange={(e) => {
              const v = e.currentTarget.value
              setValues((s) => ({ ...s, [f.name]: v }))
            }}
          />
        </Field>
      ))}
      <p className="a-sub" aria-live="polite" data-testid="takings-total">
        {total === null ? 'Sjekk beløpene.' : `Totalt ${formatKr(total)}`}
      </p>
      <Field label="Notat">
        <textarea name="note" rows={2} maxLength={500} className={inputClass} />
      </Field>
      <ReceiptInput />
      <p className="a-small a-muted">Ta bilde av dagsrapporten fra Vipps eller kortterminalen.</p>
    </LedgerForm>
  )
}
