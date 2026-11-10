'use client'

import { useState, useTransition } from 'react'
import { ActionForm, Field, inputClass } from '@/components/action-form'
import { callAction } from '@/lib/action-result'
import { PAYMENT_LABEL, type LedgerKind, type PaymentMethod } from '@/lib/domain/ledger'
import { oreToKrNumber } from '@/lib/domain/money'
import { settleEntry, updateEntry, voidEntry, voidTakings } from '@/app/admin/(app)/regnskap/poster/actions'
import { uploadReceipt } from '@/app/admin/(app)/regnskap/receipt-actions'
import { METHODS } from './entry-input'
import { ReceiptInput } from './ReceiptInput'
import type { CategoryOption } from './EntryForm'

export type EditableEntry = {
  id: string
  kind: LedgerKind
  entryDate: string
  amountOre: number
  categoryId: string
  counterparty: string | null
  description: string
  paymentMethod: PaymentMethod
  dueDate: string | null
}

const krInput = (ore: number) => oreToKrNumber(ore).toFixed(2).replace('.', ',')

export function EditEntryForm({ entry, categories, maxDate }: { entry: EditableEntry; categories: CategoryOption[]; maxDate: string }) {
  const [method, setMethod] = useState<PaymentMethod>(entry.paymentMethod)
  return (
    <ActionForm action={updateEntry} testId="edit-entry-form" successMessage="Endringen er lagret.">
      <input type="hidden" name="id" value={entry.id} />
      <Field label="Dato">
        <input type="date" name="entry_date" required defaultValue={entry.entryDate} max={maxDate} className={inputClass} />
      </Field>
      <Field label="Beløp (kr)">
        <input name="amount" inputMode="decimal" required defaultValue={krInput(entry.amountOre)} className={inputClass} />
      </Field>
      <Field label="Kategori">
        <select name="category_id" required defaultValue={entry.categoryId} className={inputClass}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={entry.kind === 'expense' ? 'Leverandør' : 'Kunde'}>
        <input name="counterparty" maxLength={120} defaultValue={entry.counterparty ?? ''} className={inputClass} />
      </Field>
      <Field label="Hva gjelder det?">
        <input name="description" required maxLength={200} defaultValue={entry.description} className={inputClass} />
      </Field>
      <Field label="Betaling">
        <select name="payment_method" value={method} onChange={(e) => setMethod(e.currentTarget.value as PaymentMethod)} className={inputClass}>
          {METHODS[entry.kind].map((m) => (
            <option key={m} value={m}>
              {PAYMENT_LABEL[m]}
            </option>
          ))}
        </select>
      </Field>
      {method === 'unpaid' && (
        <Field label="Forfallsdato">
          <input type="date" name="due_date" required defaultValue={entry.dueDate ?? ''} className={inputClass} />
        </Field>
      )}
    </ActionForm>
  )
}

/** Void an entry, or the whole daily takings it came from. A reason is required. */
export function VoidForm({ id, takings }: { id: string; takings: boolean }) {
  return (
    <ActionForm
      action={takings ? voidTakings : voidEntry}
      submitLabel={takings ? 'Annuller dagsoppgjør' : 'Annuller'}
      testId="void-form"
      successMessage="Annullert."
    >
      <input type="hidden" name="id" value={id} />
      <Field label="Grunn">
        <input name="reason" required minLength={3} maxLength={300} className={inputClass} />
      </Field>
      {takings && <p className="a-small a-muted">Alle postene fra dette dagsoppgjøret annulleres. Registrer et nytt dagsoppgjør etterpå hvis tallene var feil.</p>}
    </ActionForm>
  )
}

export function SettleButton({ id, label }: { id: string; label: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className="a-btn a-btn-tinted a-btn-sm"
        onClick={() =>
          startTransition(async () => {
            const res = await callAction(() => settleEntry(id))
            setError(res.ok ? null : res.error)
          })
        }
      >
        {label}
      </button>
      {error && (
        <span role="alert" className="a-msg-error">
          {error}
        </span>
      )}
    </div>
  )
}

export function AddReceiptForm({ parent, parentId }: { parent: 'entry' | 'takings'; parentId: string }) {
  return (
    <ActionForm action={uploadReceipt} submitLabel="Last opp kvittering" resetOnSuccess testId="add-receipt-form" successMessage="Kvitteringen er lagret.">
      <input type="hidden" name="parent" value={parent} />
      <input type="hidden" name="parent_id" value={parentId} />
      <ReceiptInput />
    </ActionForm>
  )
}
