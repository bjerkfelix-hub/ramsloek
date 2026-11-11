import { expect, type Request } from '@playwright/test'
import { test, submitPlanning, planningUser, loginPlanning, checked } from './planning-helpers'
import { weekPeriod, nextWeekMonday, shiftInterval } from '../../src/lib/domain/planning'
import { todayOslo } from '../../src/lib/domain/time'
test.use({ viewport: { width: 390, height: 844 } })

test('owner rates, phone create/edit/history/cancel and private worker weeks', async ({ page }) => {
  test.setTimeout(60000)
  const owner = await planningUser('owner'), picker = await planningUser('picker'), seller = await planningUser('seller')
  const monday = weekPeriod(todayOslo()).from, next = nextWeekMonday(monday)
  await loginPlanning(page, owner.email)
  await page.goto('/admin/users')
  await expect(page.getByText('Endringen gjelder nye innstemplinger.', { exact: false }).first()).toBeVisible()
  let rateRequest: Request | undefined
  for (const [person, rate] of [[owner, '0'], [picker, '250'], [seller, '300']] as const) {
    const row = page.getByRole('row').filter({ hasText: person.label })
    await row.getByRole('button', { name: 'Endre timesats' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Timesats (kr/time)').fill(rate)
    const request = await submitPlanning(dialog.getByRole('button', { name: 'Lagre' }))
    if (person.id === picker.id) rateRequest = request
    await expect(dialog).not.toBeVisible()
  }
  await page.goto(`/admin/vaktplan?week=${monday}`)
  await page.getByRole('button', { name: 'Ny vakt', exact: true }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Person').selectOption(picker.id)
  await dialog.getByLabel('Dato', { exact: true }).fill(monday)
  await dialog.getByLabel('Start', { exact: true }).fill('08:00')
  await dialog.getByLabel('Slutt', { exact: true }).fill('12:00')
  const note = `E2E UI ${crypto.randomUUID()}`
  await dialog.getByLabel('Notat').fill(note)
  await submitPlanning(dialog.getByRole('button', { name: 'Lagre' }))
  await expect(dialog).not.toBeVisible()
  for (const [i, kind] of ['packing', 'market', 'other'].entries()) {
    const interval = shiftInterval(next, i === 2 ? '23:00' : `${14+i}:00`, i === 2 ? '01:00' : `${15+i}:00`, i === 2)!
    checked(await owner.client.from('work_shifts').insert({ id: crypto.randomUUID(), profile_id: seller.id, starts_at: interval.startsAt, ends_at: interval.endsAt, kind, note: `E2E ${kind}` }))
  }
  const grid = page.getByRole('table')
  await expect(grid.getByRole('row').filter({ hasText: picker.label })).toHaveCount(1)
  await expect(grid.getByRole('row').filter({ hasText: picker.label }).getByRole('cell', { name: '4,00', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('button', { name: new RegExp(note) }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Notat').fill(`${note} endret`)
  await submitPlanning(dialog.getByRole('button', { name: 'Lagre', exact: true }))
  await expect(dialog).not.toBeVisible()
  await page.getByRole('button', { name: new RegExp(note) }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Historikk', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('listitem').filter({ hasText: '→' })).toContainText(`${note} endret`)
  await dialog.getByRole('button', { name: 'Avlys vakt', exact: true }).click()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Grunn for avlysning')).toHaveValue('')
  await dialog.getByLabel('Grunn for avlysning').fill('Feil vakt')
  await submitPlanning(dialog.getByRole('button', { name: 'Avlys vakt', exact: true }))
  await expect(dialog).not.toBeVisible()
  await loginPlanning(page, picker.email)
  await page.goto('/admin/vaktplan')
  await expect(page.getByText('Avlyst').first()).toBeVisible()
  await expect(page.getByText('0,00 timer').first()).toBeVisible()
  await expect(page.getByText('E2E packing')).toHaveCount(0)
  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { name: 'Brukere', exact: true })).toHaveCount(0)
  const directAction = await page.request.post('/admin/users', {
    headers: { 'next-action': rateRequest!.headers()['next-action'], 'content-type': rateRequest!.headers()['content-type'] },
    data: rateRequest!.postDataBuffer()!,
  })
  expect(directAction.status()).toBe(404)
  expect(checked(await picker.client.from('work_rates').select('hourly_rate_ore').eq('profile_id', picker.id).single()).data?.hourly_rate_ore).toBe(25000)
  const denied = await picker.client.from('work_rates').upsert({ profile_id: picker.id, hourly_rate_ore: 1 }, { onConflict: 'profile_id' })
  expect(denied.error).not.toBeNull()
  await loginPlanning(page, seller.email)
  await page.goto('/admin/vaktplan')
  await expect(page.getByText('E2E packing').first()).toBeVisible()
  await expect(page.getByText('4,00 timer')).toBeVisible()
  await expect(page.getByText(note, { exact: false })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('copy previews weeks, navigates, retries and rolls back conflicts', async ({ page }) => {
  const owner = await planningUser('owner'), person = await planningUser('picker')
  const monday = '2032-06-07', next = nextWeekMonday(monday)
  for (const start of ['08:00', '13:00']) {
    const interval = shiftInterval(monday, start, start === '08:00' ? '10:00' : '15:00', false)!
    checked(await owner.client.from('work_shifts').insert({ id: crypto.randomUUID(), profile_id: person.id, starts_at: interval.startsAt, ends_at: interval.endsAt, kind: 'harvest', note: `E2E copy ${start}` }))
  }
  await loginPlanning(page, owner.email)
  await page.goto(`/admin/vaktplan?week=${monday}`)
  await expect(page.getByText(`${monday} → ${next}`, { exact: false }).first()).toBeVisible()
  await submitPlanning(page.getByRole('button', { name: 'Kopier til neste uke', exact: true }))
  await page.waitForURL(`**/admin/vaktplan?week=${next}`)
  expect(checked(await owner.client.rpc('copy_work_week', { p_monday: monday })).data).toBe(0)
  const interval = shiftInterval(nextWeekMonday(next), '08:00', '10:00', false)!
  checked(await owner.client.from('work_shifts').insert({ id: crypto.randomUUID(), profile_id: person.id, starts_at: interval.startsAt, ends_at: interval.endsAt, kind: 'other', note: 'E2E conflict' }))
  const before = checked(await owner.client.from('work_shifts').select('id').eq('copied_week', nextWeekMonday(next))).data
  await submitPlanning(page.getByRole('button', { name: 'Kopier til neste uke', exact: true }))
  await expect(page.getByRole('alert').filter({ hasText: 'Ingen vakter ble kopiert.' })).toContainText('Ingen vakter ble kopiert.')
  expect(checked(await owner.client.from('work_shifts').select('id').eq('copied_week', nextWeekMonday(next))).data).toEqual(before)
})

test('existing users invite and active controls remain usable', async ({ page }) => {
  const owner = await planningUser('owner'), person = await planningUser('picker')
  await loginPlanning(page, owner.email)
  await page.goto('/admin/users')
  const row = page.getByRole('row').filter({ hasText: person.label })
  await row.getByRole('button', { name: 'Deaktiver', exact: true }).click()
  await expect(row.getByText('Deaktivert', { exact: true })).toBeVisible()
  await row.getByRole('button', { name: 'Aktiver', exact: true }).click()
  await expect(row.getByRole('button', { name: 'Deaktiver', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Legg til bruker', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const name = `E2E invite ${crypto.randomUUID()}`
  await dialog.getByLabel('E-post').fill(`${crypto.randomUUID()}@planning.test.local`)
  await dialog.getByLabel('Navn', { exact: true }).fill(name)
  await submitPlanning(dialog.getByRole('button', { name: 'Legg til bruker', exact: true }))
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible()
  checked(await owner.client.from('profiles').update({ active: false }).eq('full_name', name))
})

test('overnight week boundary is clipped and inactive scheduled people remain in owner grid', async ({ page }) => {
  const owner = await planningUser('owner'), person = await planningUser('picker')
  const monday = weekPeriod(todayOslo()).from
  const sunday = new Date(Date.parse(`${monday}T12:00:00Z`) - 86400000).toISOString().slice(0, 10)
  const interval = shiftInterval(sunday, '23:00', '01:00', true)!
  checked(await owner.client.from('work_shifts').insert({ id: crypto.randomUUID(), profile_id: person.id, starts_at: interval.startsAt, ends_at: interval.endsAt, kind: 'packing', note: `E2E boundary ${crypto.randomUUID()}` }))
  await loginPlanning(page, person.email)
  await page.goto('/admin/vaktplan')
  await expect(page.getByText('1,00 timer')).toBeVisible()
  checked(await owner.client.from('profiles').update({ active: false }).eq('id', person.id))
  await loginPlanning(page, owner.email)
  await page.goto(`/admin/vaktplan?week=${monday}`)
  const row = page.getByRole('table').getByRole('row').filter({ hasText: person.label })
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('(deaktivert)')
  await expect(row.getByRole('cell', { name: '1,00', exact: true })).toBeVisible()
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 })
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await row.scrollIntoViewIfNeeded()
      await page.screenshot({ path: `shots/planning-shifts-${width}-${theme}.png` })
    }
  }
  // The inline desktop form must generate a fresh intent after each successful create.
  const form = page.locator('form').filter({ has: page.getByLabel('Notat') })
  for (const [start, end] of [['08:00', '10:00'], ['10:00', '12:00']]) {
    await form.getByLabel('Person').selectOption(owner.id)
    await form.getByLabel('Start', { exact: true }).fill(start)
    await form.getByLabel('Slutt', { exact: true }).fill(end)
    const note = `E2E desktop ${crypto.randomUUID()}`
    await form.getByLabel('Notat').fill(note)
    await submitPlanning(form.getByRole('button', { name: 'Lagre', exact: true }))
    await expect(page.getByRole('button', { name: new RegExp(note) })).toBeVisible()
    await expect(form.getByLabel('Notat')).toHaveValue('')
  }
})
