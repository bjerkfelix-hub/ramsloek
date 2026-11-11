import { test, expect, type Request } from '@playwright/test'
import { planningUser, planningConnection, loginPlanning, closePlanningClock, checked } from './planning-helpers'
import { shiftInterval } from '../../src/lib/domain/planning'
test.use({ viewport: { width: 390, height: 844 } })

for (const role of ['owner', 'picker', 'seller'] as const) for (const planned of [false, true]) test(`${role} ${planned ? 'planned' : 'unplanned'} one-tap home Start, refresh, detail and Stopp`, async ({ page }) => {
  const person = await planningUser(role), owner = await planningUser('owner')
  try {
    // Every role exercises planned and unplanned work with DB-selected linkage.
    let shiftId: string | null = null
    if (planned) {
      shiftId = crypto.randomUUID()
      checked(await owner.client.from('work_shifts').insert({ id: shiftId, profile_id: person.id, starts_at: new Date(Date.now() - 3600000).toISOString(), ends_at: new Date(Date.now() + 3600000).toISOString(), kind: 'harvest', note: 'E2E clock matching' }))
    }
    await loginPlanning(page, person.email)
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Stopp', exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Stopp', exact: true })).toBeVisible()
    await expect(page.getByText(planned ? 'Knyttet til planlagt vakt' : 'Uplanlagt', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const entry = checked(await person.client.from('time_entries').select('*').eq('profile_id', person.id).is('ended_at', null).single()).data!
    expect(entry.shift_id).toBe(shiftId)
    await page.goto(`/admin/timer/${entry.id}`)
    await expect(page.getByRole('heading', { name: 'Timeregistrering', exact: true })).toBeVisible()
    expect(await page.getByRole('button', { name: 'Korriger', exact: true }).count()).toBe(role === 'owner' ? 1 : 0)
    await page.goto('/admin')
    await page.getByRole('button', { name: 'Stopp', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
    expect(checked(await person.client.from('time_entries').select('ended_at').eq('id', entry.id).single()).data!.ended_at).not.toBeNull()
    await page.goto('/admin/stemple')
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  } finally { await closePlanningClock(person) }
})

test('forgotten warning, reasoned correction, zero duration, missing snapshot fill and owner history', async ({ page }) => {
  test.setTimeout(60000)
  const owner = await planningUser('owner'), person = await planningUser('picker'), other = await planningUser('seller')
  const entry = checked(await person.client.rpc('clock_in', { p_start_key: crypto.randomUUID() })).data!
  const oldStart = new Date(Date.now() - 15 * 3600000).toISOString()
  let request: Request | undefined
  try {
    checked(await owner.client.rpc('correct_time_entry', { p_id: entry.id, p_started_at: oldStart, p_ended_at: null, p_reason: 'E2E forgotten fixture', p_expected_version: entry.version }))
    await loginPlanning(page, person.email)
    await expect(page.getByText('Glemt å stemple ut?', { exact: true })).toBeVisible()
    await page.goto(`/admin/timer/${entry.id}`)
    await expect(page.getByRole('button', { name: 'Korriger', exact: true })).toHaveCount(0)
    await loginPlanning(page, other.email)
    const hidden = await page.goto(`/admin/timer/${entry.id}`)
    expect(hidden?.status()).toBe(404)
    await loginPlanning(page, owner.email)
    await page.goto('/admin/stemple')
    await expect(page.getByRole('link', { name: new RegExp(person.label) })).toBeVisible()
    await page.goto(`/admin/timer/${entry.id}`)
    await page.getByRole('button', { name: 'Korriger', exact: true }).click()
    let dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Lagre', exact: true }).click()
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Slutt (Oslo)').fill('2026-01-02T11:00')
    await dialog.getByLabel('Start (Oslo)').fill('2026-01-02T10:00')
    await dialog.getByLabel('Grunn for korrigering').fill('Glemte å stoppe')
    const posted = page.waitForRequest(r => r.method() === 'POST' && !!r.headers()['next-action'])
    await dialog.getByRole('button', { name: 'Lagre', exact: true }).click()
    request = await posted
    await expect(dialog).not.toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: 'Glemte å stoppe' })).toContainText(owner.label)
    await expect(page.getByRole('listitem').filter({ hasText: 'Glemte å stoppe' })).toContainText('→')
    checked(await owner.client.from('work_rates').upsert({ profile_id: person.id, hourly_rate_ore: 25000 }, { onConflict: 'profile_id' }))
    await page.reload()
    await page.getByRole('button', { name: 'Korriger', exact: true }).click()
    dialog = page.getByRole('dialog')
    await dialog.getByLabel('Slutt (Oslo)').fill('2026-01-02T10:00')
    await dialog.getByLabel('Grunn for korrigering').fill('Utilsiktet innstempling')
    await dialog.getByLabel('Bruk gjeldende timesats').check()
    await dialog.getByRole('button', { name: 'Lagre', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.getByText('Null varighet', { exact: true })).toBeVisible()
    const filled = checked(await person.client.from('time_entries').select('*').eq('id', entry.id).single()).data!
    expect(filled.hourly_rate_ore).toBe(25000)
    const audit = checked(await owner.client.from('audit_log').select('data').eq('table_name','time_entries').eq('row_id', entry.id)).data!
    expect(audit.filter(a => a.data.old?.hourly_rate_ore === null && a.data.new?.hourly_rate_ore === 25000)).toHaveLength(1)
    await page.getByRole('button', { name: 'Korriger', exact: true }).click()
    await expect(page.getByLabel('Bruk gjeldende timesats')).toHaveCount(0)
    const reprice = await owner.client.rpc('correct_time_entry', { p_id: entry.id, p_started_at: filled.started_at, p_ended_at: filled.ended_at, p_reason: 'E2E reprice rejected', p_expected_version: filled.version, p_fill_missing_rate: true })
    expect(reprice.error?.message).toContain('TIME_RATE')
    await loginPlanning(page, person.email)
    const denied = await page.request.post(`/admin/timer/${entry.id}`, { headers: { 'next-action': request.headers()['next-action'], 'content-type': request.headers()['content-type'] }, data: request.postDataBuffer()! })
    expect(denied.status()).toBe(404)
    await page.goto(`/admin/timer/${entry.id}`)
    await expect(page.getByRole('heading', { name: 'Historikk', exact: true })).toHaveCount(0)
  } finally { await closePlanningClock(person) }
})

test('independent connections serialize different and same keys, stale Stop and start retry', async () => {
  const owner = await planningUser('owner'), person = await planningUser('picker')
  const second = await planningConnection(person.email)
  try {
    const different = await Promise.all([person.client, second].map(c => c.rpc('clock_in', { p_start_key: crypto.randomUUID() })))
    expect(different.filter(r => !r.error)).toHaveLength(1)
    expect(different.find(r => r.error)?.error?.message).toContain('TIME_ALREADY_OPEN')
    expect(checked(await person.client.from('time_entries').select('id').is('ended_at',null)).data).toHaveLength(1)
    await closePlanningClock(person)
    const key = crypto.randomUUID()
    const same = await Promise.all([person.client, second].map(c => c.rpc('clock_in', { p_start_key: key })))
    same.forEach(checked)
    const a = same[0].data!
    expect(same[1].data!.id).toBe(a.id)
    expect(checked(await owner.client.from('audit_log').select('id').eq('table_name','time_entries').eq('row_id',a.id).eq('action','INSERT')).data).toHaveLength(1)
    checked(await person.client.rpc('clock_out', { p_entry_id: a.id }))
    const b = checked(await second.rpc('clock_in', { p_start_key: crypto.randomUUID() })).data!
    expect(checked(await person.client.rpc('clock_out', { p_entry_id: a.id })).data!.ended_at).not.toBeNull()
    expect(checked(await second.rpc('clock_in', { p_start_key: key })).data!.id).toBe(a.id)
    expect(checked(await person.client.from('time_entries').select('id').is('ended_at',null)).data).toEqual([{ id: b.id }])
  } finally { await closePlanningClock(person) }
})

test('correction races Stop without reopening, stale review and constraint rollback', async () => {
  const owner = await planningUser('owner'), person = await planningUser('seller')
  try {
    const entry = checked(await person.client.rpc('clock_in', { p_start_key: crypto.randomUUID() })).data!
    const start = new Date(Date.parse(entry.started_at) - 3600000).toISOString()
    const args = { p_id: entry.id, p_started_at: start, p_ended_at: null, p_reason: 'E2E race correction', p_expected_version: entry.version }
    const [correction, stop] = await Promise.all([owner.client.rpc('correct_time_entry', args), person.client.rpc('clock_out', { p_entry_id: entry.id })])
    checked(stop)
    let final = checked(await person.client.from('time_entries').select('*').eq('id',entry.id).single()).data!
    expect(final.ended_at).not.toBeNull()
    if (correction.error) {
      expect(correction.error.message).toContain('PLANNING_STALE')
      checked(await owner.client.rpc('correct_time_entry', { ...args, p_ended_at: final.ended_at, p_expected_version: final.version }))
      final = checked(await person.client.from('time_entries').select('*').eq('id',entry.id).single()).data!
    }
    expect(Date.parse(final.started_at)).toBe(Date.parse(start))
    expect(final.ended_at).not.toBeNull()
    const next = checked(await person.client.rpc('clock_in', { p_start_key: crypto.randomUUID() })).data!
    const conflict = await owner.client.rpc('correct_time_entry', { ...args, p_expected_version: final.version })
    expect(conflict.error).not.toBeNull()
    const unchanged = checked(await person.client.from('time_entries').select('*').eq('id',entry.id).single()).data!
    expect(unchanged.version).toBe(final.version)
    expect(unchanged.ended_at).toBe(final.ended_at)
    expect(checked(await person.client.from('time_entries').select('id').is('ended_at',null)).data).toEqual([{ id: next.id }])
  } finally { await closePlanningClock(person) }
})

test('concurrent copy creates exactly one copy per source and week', async () => {
  const owner = await planningUser('owner'), person = await planningUser('picker'), second = await planningConnection(owner.email)
  const id = crypto.randomUUID(), interval = shiftInterval('2034-06-05','08:00','10:00',false)!
  checked(await owner.client.from('work_shifts').insert({ id, profile_id: person.id, starts_at: interval.startsAt, ends_at: interval.endsAt, kind: 'other', note: 'E2E concurrent copy' }))
  const results = await Promise.all([owner.client,second].map(c => c.rpc('copy_work_week', { p_monday: '2034-06-05' })))
  results.forEach(checked)
  expect(checked(await owner.client.from('work_shifts').select('id').eq('copied_from_shift_id',id)).data).toHaveLength(1)
})

test('lost Start and Stop responses reconcile the same key and displayed id', async ({ page }) => {
  const person = await planningUser('picker')
  try {
    await loginPlanning(page, person.email)
    let dropped = false
    await page.route('**/admin', async route => {
      if (!dropped && route.request().method() === 'POST') { dropped = true; await route.fetch(); await route.abort('failed'); return }
      await route.continue()
    })
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Stopp', exact: true })).toBeVisible()
    expect(checked(await person.client.from('time_entries').select('id')).data).toHaveLength(1)
    dropped = false
    await page.getByRole('button', { name: 'Stopp', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
    expect(checked(await person.client.from('time_entries').select('id').is('ended_at',null)).data).toHaveLength(0)
    await page.unroute('**/admin')
    // A completed explicit next Start is a new intent.
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Stopp', exact: true })).toBeVisible()
    expect(checked(await person.client.from('time_entries').select('id')).data).toHaveLength(2)
  } finally { await closePlanningClock(person) }
})


test('Start retry after failed delivery and reload retains its intent key', async ({ page }) => {
  const person = await planningUser('picker')
  try {
    await loginPlanning(page, person.email)
    await page.route('**/admin', async route => {
      if (route.request().method() === 'POST') await route.abort('failed')
      else await route.continue()
    })
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Ingen forbindelse' })).toContainText('Ingen forbindelse')
    const key = await page.evaluate(id => sessionStorage.getItem(`planning-start:${id}`), person.id)
    expect(key).toMatch(/^[0-9a-f-]{36}$/)
    expect(checked(await person.client.from('time_entries').select('id')).data).toHaveLength(0)
    await page.unroute('**/admin')
    await page.reload()
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Stopp', exact: true })).toBeVisible()
    const rows = checked(await person.client.from('time_entries').select('start_key')).data!
    expect(rows).toEqual([{ start_key: key }])
    expect(await page.evaluate(id => sessionStorage.getItem(`planning-start:${id}`), person.id)).toBeNull()
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 })
      for (const theme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        await page.screenshot({ path: `shots/planning-clock-${width}-${theme}.png` })
      }
    }
  } finally { await closePlanningClock(person) }
})
