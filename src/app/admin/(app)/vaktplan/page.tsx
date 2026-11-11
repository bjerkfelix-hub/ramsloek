import { requireRole } from '@/lib/auth'
import { LargeTitle, Page } from '@/features/admin/ui/Page'
import { MyShifts } from '@/features/planlegging/MyShifts'
import { WeekSchedule } from '@/features/planlegging/WeekSchedule'
import { getMyShifts, getWeekSchedule } from '@/features/planlegging/queries'
import { nextWeekMonday, weekPeriod } from '@/lib/domain/planning'
import { todayOslo } from '@/lib/domain/time'
export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
  const me = await requireRole('owner', 'picker', 'seller')
  const current = weekPeriod(todayOslo()).from
  const { week } = await searchParams
  let monday = current, invalid = false
  if (me.role === 'owner' && week !== undefined) {
    try { if (typeof week !== 'string') throw Error(); nextWeekMonday(week); monday = week } catch { invalid = true }
  }
  const mine = await getMyShifts(current)
  const schedule = me.role === 'owner' ? await getWeekSchedule(monday) : null
  return <Page><LargeTitle>Vaktplan</LargeTitle>{invalid && <p role="alert">Velg en mandag som ukestart.</p>}
    <MyShifts data={mine} />{schedule && <WeekSchedule data={schedule} />}
  </Page>
}
