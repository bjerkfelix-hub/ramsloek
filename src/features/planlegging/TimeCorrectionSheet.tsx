'use client'

import { useState } from 'react'
import { ActionForm, Field, inputClass } from '@/components/action-form'
import { ResponsiveSheet } from '@/features/admin/ui/ResponsiveSheet'
import { correctTime } from '@/app/admin/(app)/timer/[id]/actions'
import type { TimeEntryDetail } from './queries'
const local = (value: string | null) => value ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)).replace(' ', 'T') : ''
export function TimeCorrectionSheet({ entry }: { entry: TimeEntryDetail }) {
  const [start, setStart] = useState(local(entry.started_at)), [end, setEnd] = useState(local(entry.ended_at))
  return <ResponsiveSheet title="Korriger" triggerLabel="Korriger">
    <ActionForm action={correctTime}>
      <input type="hidden" name="id" value={entry.id} />
      <input type="hidden" name="expected_version" value={entry.version} />
      <input type="hidden" name="original_start" value={entry.started_at} />
      <input type="hidden" name="original_end" value={entry.ended_at ?? ''} />
      <p className="break-words">Nå: {entry.started_at} → {entry.ended_at ?? 'Åpen'}. Tidspunktene over inkluderer UTC-offset.</p>
      <Field label="Start (Oslo)"><input className={inputClass} type="datetime-local" name="start" required value={start} onChange={e => setStart(e.target.value)} /></Field>
      <Field label="Slutt (Oslo)"><input className={inputClass} type="datetime-local" name="end" value={end} onChange={e => setEnd(e.target.value)} /></Field>
      <p>Forslag (Oslo): {start} → {end || 'Åpen'}</p>
      <p className="a-muted">Tom slutt gjenåpner registreringen. Uendrede tidspunkter beholder sekunder, millisekunder og offset.</p>
      <Field label="Grunn for korrigering"><textarea name="reason" required minLength={3} maxLength={500} className={inputClass} /></Field>
      {entry.hourly_rate_ore === null && <label className="a-field"><span><input type="checkbox" name="fill_missing_rate" /> Bruk gjeldende timesats</span></label>}
    </ActionForm>
  </ResponsiveSheet>
}
