'use client'
import { useState } from 'react'
import { ActionForm, Field, inputClass } from '@/components/action-form'
import { Sheet } from '@/features/admin/ui/Sheet'
import { setHourlyRate } from '@/app/admin/(app)/users/actions'
export function RateSheet({ profileId, rate }: { profileId: string; rate: number | null }) {
  const [open, setOpen] = useState(false)
  return <>
    <button className="a-btn a-btn-tinted" type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}>Endre timesats</button>
    <Sheet open={open} onClose={() => setOpen(false)} title="Endre timesats">
      <ActionForm action={setHourlyRate}>
        <input type="hidden" name="profile_id" value={profileId} />
        <Field label="Timesats (kr/time)"><input name="rate" inputMode="decimal" required defaultValue={rate === null ? '' : (rate / 100).toFixed(2).replace('.', ',')} className={inputClass} /></Field>
        <p className="a-muted">Endringen gjelder nye innstemplinger. Tidligere timer beholder satsen de ble registrert med.</p>
      </ActionForm>
    </Sheet>
  </>
}
