'use client'
import { ActionForm } from '@/components/action-form'
import { completeTask } from '@/app/admin/(app)/oppgaver/actions'
import { isTaskOverdue, TASK_STATUS_LABEL } from '@/lib/domain/planning'
import { formatDateTime } from '@/lib/domain/time'
import type { WorkTask } from './queries'
export function TaskDescription({ task, today }: { task: WorkTask; today: string }) {
  const overdue = isTaskOverdue(task.due_date, task.status, !!task.archived_at, today)
  return <>
    <h3 className="a-h2 break-words">{task.title}</h3>
    {task.important && <strong>Viktig</strong>}
    {task.description && <p className="whitespace-pre-wrap break-words">{task.description}</p>}
    <p>{task.assigneeName ?? 'Ikke tildelt'}</p>
    {task.due_date && <p className={overdue ? 'a-msg-error' : ''}>{overdue ? 'Forfalt' : 'Frist'}: {task.due_date}</p>}
    <p>{TASK_STATUS_LABEL[task.status]}</p>
    {task.completed_at && <p>Fullført {formatDateTime(task.completed_at)} · {task.completedByName}</p>}
    {task.archived_at && <p>Arkivert {formatDateTime(task.archived_at)}</p>}
  </>
}
export function MyTasks({ tasks, today }: { tasks: WorkTask[]; today: string }) {
  return <section className="space-y-4"><h2 className="a-h2">Mine oppgaver</h2>
    {!tasks.length && <p>Du har ingen oppgaver.</p>}
    {tasks.map(task => <article key={task.id} className="a-card a-section space-y-3 min-w-0 [overflow-wrap:anywhere]">
      <TaskDescription task={task} today={today} />
      {task.status !== 'done' && <ActionForm action={() => completeTask(task.id)} submitLabel="Marker som ferdig">{null}</ActionForm>}
    </article>)}
  </section>
}
