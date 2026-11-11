'use client'
import { useState } from 'react'
import { ActionForm, Field, inputClass } from '@/components/action-form'
import { saveShift, cancelShift } from '@/app/admin/(app)/vaktplan/actions'
import { SHIFT_LABEL, type ShiftKind } from '@/lib/domain/planning'
import { todayOslo } from '@/lib/domain/time'
import type { SchedulePerson, WorkShift } from './queries'
const time = (value: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value))
export function ShiftForm({ people, monday, shift }: { people: SchedulePerson[]; monday: string; shift?: WorkShift }) {
  const [id, setId] = useState(() => shift?.id ?? crypto.randomUUID())
  if (shift?.cancelled_at) return <p>Avlyst: {shift.cancel_reason}</p>
  return <>
    <ActionForm action={saveShift} resetOnSuccess={!shift} onResult={result => { if (result.ok && !shift) setId(crypto.randomUUID()) }}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="intent" value={shift ? 'edit' : 'create'} />
      <Field label="Person"><select name="profile_id" defaultValue={shift?.profile_id} required className={inputClass}>{people.filter(p => p.active || p.id === shift?.profile_id).map(p => <option key={p.id} value={p.id}>{p.full_name}{!p.active && ' (deaktivert)'}</option>)}</select></Field>
      <Field label="Dato"><input type="date" name="date" required defaultValue={shift ? todayOslo(new Date(shift.starts_at)) : monday} className={inputClass} /></Field>
      <Field label="Start"><input type="time" name="start" required defaultValue={shift ? time(shift.starts_at) : '08:00'} className={inputClass} /></Field>
      <Field label="Slutt"><input type="time" name="end" required defaultValue={shift ? time(shift.ends_at) : '12:00'} className={inputClass} /></Field>
      <label className="a-field"><span><input type="checkbox" name="next_day" defaultChecked={!!shift && todayOslo(new Date(shift.starts_at)) !== todayOslo(new Date(shift.ends_at))} /> Slutter neste dag</span></label>
      <Field label="Type"><select name="kind" defaultValue={shift?.kind ?? 'harvest'} className={inputClass}>{(Object.keys(SHIFT_LABEL) as ShiftKind[]).map(kind => <option key={kind} value={kind}>{SHIFT_LABEL[kind]}</option>)}</select></Field>
      <Field label="Notat"><textarea name="note" maxLength={2000} defaultValue={shift?.note ?? ''} className={inputClass} /></Field>
    </ActionForm>
    {shift && <ActionForm action={form => cancelShift(id, String(form.get('reason') ?? ''))} submitLabel="Avlys vakt">
      <Field label="Grunn for avlysning"><textarea name="reason" required minLength={3} maxLength={500} className={inputClass} /></Field>
    </ActionForm>}
  </>
}
