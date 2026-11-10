'use client'

import { useState, useTransition } from 'react'
import { ActionForm, Field, inputClass } from '@/components/action-form'
import { callAction } from '@/lib/action-result'
import { saveCategory, setCategoryActive } from '@/app/admin/(app)/regnskap/kategorier/actions'

export type CategoryRow = { id: string; kind: 'income' | 'expense'; name: string; accountNo: string; sort: number; active: boolean; system: boolean }

export function CategoryEditForm({ category }: { category: CategoryRow }) {
  return (
    <ActionForm action={saveCategory} testId={`category-form-${category.name}`} successMessage="Lagret.">
      <input type="hidden" name="id" value={category.id} />
      <div className="grid grid-cols-[1fr_6.5rem] gap-3">
        <Field label="Navn">
          <input name="name" required maxLength={60} defaultValue={category.name} className={inputClass} />
        </Field>
        <Field label="Konto">
          <input name="account_no" required inputMode="numeric" pattern="\d{4}" defaultValue={category.accountNo} className={inputClass} />
        </Field>
      </div>
      <Field label="Rekkefølge">
        <input name="sort" inputMode="numeric" defaultValue={String(category.sort)} className={inputClass} />
      </Field>
    </ActionForm>
  )
}

export function NewCategoryForm() {
  return (
    <ActionForm action={saveCategory} resetOnSuccess testId="new-category-form" submitLabel="Legg til" successMessage="Kategorien er lagt til.">
      <Field label="Type">
        <select name="kind" required defaultValue="expense" className={inputClass}>
          <option value="expense">Utgift</option>
          <option value="income">Inntekt</option>
        </select>
      </Field>
      <div className="grid grid-cols-[1fr_6.5rem] gap-3">
        <Field label="Navn">
          <input name="name" required maxLength={60} className={inputClass} />
        </Field>
        <Field label="Konto">
          <input name="account_no" required inputMode="numeric" pattern="\d{4}" className={inputClass} />
        </Field>
      </div>
      <Field label="Rekkefølge">
        <input name="sort" inputMode="numeric" defaultValue="100" className={inputClass} />
      </Field>
    </ActionForm>
  )
}

export function CategoryActiveButton({ id, active, name }: { id: string; active: boolean; name: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        aria-label={`${active ? 'Skru av' : 'Skru på'} ${name}`}
        className="a-btn a-btn-gray a-btn-sm"
        onClick={() =>
          startTransition(async () => {
            const res = await callAction(() => setCategoryActive(id, !active))
            setError(res.ok ? null : res.error)
          })
        }
      >
        {active ? 'Skru av' : 'Skru på'}
      </button>
      {error && (
        <span role="alert" className="a-msg-error">
          {error}
        </span>
      )}
    </span>
  )
}
