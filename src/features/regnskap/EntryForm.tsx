'use client'

import { useState } from 'react'
import { Field, inputClass } from '@/components/action-form'
import { PAYMENT_LABEL, type LedgerKind, type PaymentMethod } from '@/lib/domain/ledger'
import { saveExpense, saveIncome } from '@/app/admin/(app)/regnskap/actions'
import { LedgerForm } from './LedgerForm'
import { ReceiptInput } from './ReceiptInput'

export type CategoryOption = { id: string; name: string; accountNo: string }

const METHODS: Record<LedgerKind, PaymentMethod[]> = {
  expense: ['card', 'vipps', 'cash', 'bank', 'private', 'unpaid'],
  income: ['vipps', 'card', 'cash', 'bank'],
}

/** New expense (owner and sellers) or other income (owner). `today` and `maxDate` are Oslo dates. */
export function EntryForm({
  kind,
  categories,
  today,
  maxDate,
}: {
  kind: LedgerKind
  categories: CategoryOption[]
  today: string
  maxDate: string
}) {
  const [method, setMethod] = useState<PaymentMethod>(METHODS[kind][0])
  const isExpense = kind === 'expense'
  return (
    <LedgerForm save={isExpense ? saveExpense : saveIncome} parent="entry" testId={`${kind}-form`}>
      <Field label="Dato">
        <input type="date" name="entry_date" required defaultValue={today} max={maxDate} className={inputClass} />
      </Field>
      <Field label="Beløp (kr)">
        <input name="amount" inputMode="decimal" autoComplete="off" required className={inputClass} />
      </Field>
      <Field label="Kategori">
        <select name="category_id" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            Velg kategori
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={isExpense ? 'Leverandør' : 'Kunde'}>
        <input name="counterparty" maxLength={120} autoComplete="off" className={inputClass} />
      </Field>
      <Field label="Hva gjelder det?">
        <input name="description" required maxLength={200} className={inputClass} />
      </Field>
      <Field label="Betaling">
        <select
          name="payment_method"
          value={method}
          onChange={(e) => setMethod(e.currentTarget.value as PaymentMethod)}
          className={inputClass}
        >
          {METHODS[kind].map((m) => (
            <option key={m} value={m}>
              {PAYMENT_LABEL[m]}
            </option>
          ))}
        </select>
      </Field>
      {method === 'unpaid' && (
        <Field label="Forfallsdato">
          <input type="date" name="due_date" required className={inputClass} />
        </Field>
      )}
      {method === 'private' && (
        <p className="a-small a-muted">Du har betalt med egne penger. Beløpet vises under «Skyldes tilbake» til det er tilbakebetalt.</p>
      )}
      <ReceiptInput />
    </LedgerForm>
  )
}
