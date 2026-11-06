import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ActionForm, Field, inputClass } from '@/components/action-form'
import { saveSettings } from './actions'

export default async function SettingsPage() {
  await requireRole('owner')
  const supabase = await createClient()
  const { data: s } = await supabase.from('settings').select('*').eq('id', true).single()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Innstillinger</h1>
      <ActionForm action={saveSettings}>
        <Field label="Firmanavn">
          <input name="company_name" defaultValue={s?.company_name ?? ''} className={inputClass} />
        </Field>
        <Field label="Org.nr">
          <input name="org_nr" inputMode="numeric" defaultValue={s?.org_nr ?? ''} className={inputClass} />
        </Field>
        <Field label="Adresse">
          <input name="address" defaultValue={s?.address ?? ''} className={inputClass} />
        </Field>
        <Field label="GS1 selskapsprefiks">
          <input name="gs1_company_prefix" inputMode="numeric" defaultValue={s?.gs1_company_prefix ?? ''} className={inputClass} />
        </Field>
        <Field label="Partiprefiks">
          <input name="lot_prefix" required defaultValue={s?.lot_prefix ?? 'RL'} className={inputClass} />
        </Field>
        <Field label="Dager før best før-dato for advarsel">
          <input
            name="best_before_warning_days"
            type="number"
            min={0}
            required
            defaultValue={s?.best_before_warning_days ?? 1}
            className={inputClass}
          />
        </Field>
      </ActionForm>
    </div>
  )
}
