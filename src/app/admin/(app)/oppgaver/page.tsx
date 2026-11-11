import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { LargeTitle, Page } from '@/features/admin/ui/Page'
import { getMyTasks, getTaskBoard, type SchedulePerson } from '@/features/planlegging/queries'
import { TaskBoard } from '@/features/planlegging/TaskBoard'
import { MyTasks } from '@/features/planlegging/MyTasks'
import { todayOslo } from '@/lib/domain/time'
import { fetchAll } from '@/features/regnskap/fetch-all'
export default async function TasksPage({ searchParams }: { searchParams: Promise<{ archived?: string | string[] }> }) {
  const me = await requireRole('owner','picker','seller')
  const today = todayOslo()
  if (me.role !== 'owner') return <Page><LargeTitle>Oppgaver</LargeTitle><MyTasks tasks={await getMyTasks()} today={today} /></Page>
  const includeArchived = (await searchParams).archived === '1'
  const client = await createClient()
  const [tasks, people] = await Promise.all([
    getTaskBoard(includeArchived),
    fetchAll<SchedulePerson>((from,to) => client.from('profiles').select('id, full_name, active').order('full_name').order('id').range(from,to)),
  ])
  return <Page><LargeTitle>Oppgaver</LargeTitle><TaskBoard tasks={tasks} people={people} today={today} includeArchived={includeArchived} me={me.id} /></Page>
}
