'use client'
import { useState } from 'react'
import { formatDateTime } from '@/lib/domain/time'
import Link from 'next/link'
import { ActionForm, Field, inputClass } from '@/components/action-form'
import { archiveTask, restoreTask, setTaskStatus } from '@/app/admin/(app)/oppgaver/actions'
import { TASK_STATUS_LABEL, type TaskStatus } from '@/lib/domain/planning'
import { ResponsiveSheet } from '@/features/admin/ui/ResponsiveSheet'
import { Sheet } from '@/features/admin/ui/Sheet'
import { TaskDescription } from './MyTasks'
import { TaskForm } from './TaskForm'
import type { WorkTask, SchedulePerson } from './queries'
export function TaskBoard({ tasks, people, today, includeArchived, me }: { tasks: WorkTask[]; people: SchedulePerson[]; today: string; includeArchived: boolean; me: string }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [onlyMine, setOnlyMine] = useState(false)
  const [personId, setPersonId] = useState('')
  const task = tasks.find(t => t.id === selected)
  const visible = tasks.filter(t => (!onlyMine || t.assignees.some(a => a.id === me)) && (!personId || t.assignees.some(a => a.id === personId)))
  const active = visible.filter(t => !t.archived_at)
  const archived = visible.filter(t => !!t.archived_at)
  return <section className="space-y-4 min-w-0">
    <div className="flex flex-wrap gap-4 items-center"><Link className="a-btn a-btn-tinted" href={includeArchived ? '/admin/oppgaver' : '/admin/oppgaver?archived=1'}>{includeArchived ? 'Skjul arkiverte' : 'Vis arkiverte'}</Link>
      <label><input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} /> Bare mine oppgaver</label>
      <Field label="Filtrer etter person"><select value={personId} onChange={e => setPersonId(e.target.value)} className={inputClass}><option value="">Alle personer</option>{people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field>
    </div>
    <ResponsiveSheet title="Ny oppgave"><TaskForm people={people} /></ResponsiveSheet>
    {!active.length && <p>Du har ingen oppgaver.</p>}
    <div className="grid gap-4 min-w-0 lg:grid-cols-3">
      {(Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map(status => <section key={status} aria-label={TASK_STATUS_LABEL[status]} className="space-y-3 min-w-0"><h2 className="a-h2">{TASK_STATUS_LABEL[status]}</h2>
        {active.filter(t => t.status === status).map(t => <article key={t.id} className="a-card a-section space-y-3 min-w-0 [overflow-wrap:anywhere]">
          <TaskDescription task={t} today={today} />
          <button className="a-btn a-btn-tinted" onClick={() => setSelected(t.id)}>Rediger</button>
          <ActionForm action={form => setTaskStatus(t.id, String(form.get('status')) as TaskStatus)} submitLabel="Endre status">
            <Field label="Status"><select key={t.status} name="status" defaultValue={t.status} className={inputClass}>{(Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map(s => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}</select></Field>
          </ActionForm>
          <ActionForm action={() => archiveTask(t.id)} submitLabel="Arkiver">{null}</ActionForm>
        </article>)}
      </section>)}
    </div>
    {includeArchived && <section aria-label="Arkiverte oppgaver" className="space-y-3 min-w-0">
      <h2 className="a-h2">Arkiverte oppgaver</h2>
      {!archived.length && <p>Ingen arkiverte oppgaver.</p>}
      {archived.map(t => <article key={t.id} className="a-card a-section space-y-3 min-w-0 [overflow-wrap:anywhere]">
        <h3 className="a-h2 break-words">{t.title}</h3>
        <p>{t.assignees.map(a => a.name).join(', ') || 'Ikke tildelt'}</p>
        <p>{TASK_STATUS_LABEL[t.status]}</p>
        <p>Arkivert {formatDateTime(t.archived_at!)}</p>
        <ActionForm action={() => restoreTask(t.id)} submitLabel="Gjenopprett">{null}</ActionForm>
      </article>)}
    </section>}
    <Sheet open={!!task && !task.archived_at} onClose={() => setSelected(null)} title="Rediger oppgave">
      {task && !task.archived_at && <TaskForm key={task.id} people={people} task={task} />}
    </Sheet>
  </section>
}
