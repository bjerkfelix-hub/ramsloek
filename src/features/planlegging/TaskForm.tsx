'use client'
import { useState } from 'react'
import { ActionForm, Field, inputClass } from '@/components/action-form'
import { saveTask } from '@/app/admin/(app)/oppgaver/actions'
import type { SchedulePerson, WorkTask } from './queries'
export function TaskForm({ people, task }: { people: SchedulePerson[]; task?: WorkTask }) {
  const [id, setId] = useState(() => task?.id ?? crypto.randomUUID())
  return <ActionForm action={saveTask} resetOnSuccess={!task} onResult={result => { if (result.ok && !task) setId(crypto.randomUUID()) }}>
    <input type="hidden" name="id" value={id} /><input type="hidden" name="intent" value={task ? 'edit' : 'create'} />
    <Field label="Tittel"><input name="title" required maxLength={200} defaultValue={task?.title ?? ''} className={inputClass} /></Field>
    <Field label="Beskrivelse"><textarea name="description" maxLength={10000} defaultValue={task?.description ?? ''} className={inputClass} /></Field>
    <Field label="Person"><select name="assigned_to" defaultValue={task?.assigned_to ?? ''} className={inputClass}><option value="">Ikke tildelt</option>{people.filter(p => p.active || p.id === task?.assigned_to).map(p => <option key={p.id} value={p.id}>{p.full_name}{!p.active && ' (deaktivert)'}</option>)}</select></Field>
    <Field label="Frist"><input type="date" name="due_date" defaultValue={task?.due_date ?? ''} className={inputClass} /></Field>
    <label className="a-field"><span><input name="important" type="checkbox" defaultChecked={task?.important ?? false} /> Viktig</span></label>
  </ActionForm>
}
