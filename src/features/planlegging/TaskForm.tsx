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
    <fieldset className="space-y-1"><legend className="a-field">Personer</legend><p className="a-muted">Ingen valgt = ikke tildelt.</p>
      {people.filter(p => p.active || task?.assignees.some(a => a.id === p.id)).map(p => <label key={p.id} className="flex min-h-11 min-w-0 items-center gap-3 py-2 [overflow-wrap:anywhere]"><input type="checkbox" name="assignees" value={p.id} defaultChecked={task?.assignees.some(a => a.id === p.id) ?? false} className="size-5 shrink-0" /><span className="min-w-0">{p.full_name}{!p.active && ' (deaktivert)'}</span></label>)}
    </fieldset>
    <Field label="Frist"><input type="date" name="due_date" defaultValue={task?.due_date ?? ''} className={inputClass} /></Field>
    <label className="a-field"><span><input name="important" type="checkbox" defaultChecked={task?.important ?? false} /> Viktig</span></label>
  </ActionForm>
}
