const TZ = 'Europe/Oslo'

const dateTimeFmt = new Intl.DateTimeFormat('nb-NO', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' })
const dateFmt = new Intl.DateTimeFormat('nb-NO', { timeZone: TZ, dateStyle: 'medium' })

export function formatDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso))
}

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso))
}

// Offset (ms) of Europe/Oslo from UTC at the given instant.
function osloOffsetMs(at: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(at))
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(at / 1000) * 1000
}

/** Interprets "YYYY-MM-DDTHH:mm" (a datetime-local value) as Oslo wall-clock time; returns an ISO instant or null. */
export function osloLocalToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local)
  if (!m) return null
  const [y, mo, d, h, mi] = m.slice(1).map(Number)
  const wall = Date.UTC(y, mo - 1, d, h, mi)
  let t = wall - osloOffsetMs(wall)
  t = wall - osloOffsetMs(t)
  const date = new Date(t)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** Current Oslo wall-clock time as a datetime-local value. */
export function nowOsloLocal(): string {
  const p = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())
  return p.replace(' ', 'T')
}
