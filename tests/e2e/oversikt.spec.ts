import { expect, test, type Page } from '@playwright/test'
import { adminClient, authUserId, loginAs } from './helpers'
import { checked, planningConnection } from './planning-helpers'
import { chainPeriod, formatChainNumber } from '../../src/features/oversikt/chain'
import { todayOslo, osloLocalToIso } from '../../src/lib/domain/time'

const batches: string[] = [], days: string[] = [], takings: string[] = []
const today = todayOslo()
function dateBefore(days: number) {
  const date = new Date(`${today}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

test.beforeAll(async () => {
  const db = adminClient(), owner = await authUserId('owner')
  const ownerClient = await planningConnection('eier@test.local')
  const area = checked(await db.from('harvest_areas').select('id').eq('name', 'Bekken').single()).data!.id
  const product = checked(await db.from('products').select('id').eq('name', 'Ramsløk 100 g pose').single()).data!.id
  for (const [i, date] of [dateBefore(10), dateBefore(2), today].entries()) {
    const at = osloLocalToIso(`${date}T12:00`)!
    const id = crypto.randomUUID(); batches.push(id)
    checked(await db.from('batches').insert({ id, harvested_at: at, area_id: area, pickers: 'E2E verdikjede', gross_weight_g: 2500 + i * 1000, created_by: owner }))
    checked(await db.from('sorting_checks').insert({ batch_id: id, checked_by: owner }))
    checked(await db.from('packings').insert({ id: crypto.randomUUID(), batch_id: id, product_id: product, units: 10 + i, packed_by: owner, packed_at: at }))
    // Trusted local fixture maintenance dates server-stamped rows after their guards ran.
    checked(await db.from('packings').update({ packed_at: at }).eq('batch_id', id))
    checked(await db.from('stock_movements').update({ created_at: at }).eq('batch_id', id))
    checked(await db.from('stock_movements').insert([
      { batch_id: id, product_id: product, kind: 'sell', units: -2, created_at: at, created_by: owner },
      { batch_id: id, product_id: product, kind: 'deliver', units: -1, created_at: at, created_by: owner },
    ]))
    checked(await db.from('waste_records').insert({ id: crypto.randomUUID(), batch_id: id, product_id: product, units: 1, reason: 'skadet', created_at: at, created_by: owner }))
    checked(await db.from('stock_movements').update({ created_at: at }).eq('batch_id', id).eq('kind', 'waste'))
    checked(await db.from('waste_records').insert({ id: crypto.randomUUID(), batch_id: id, weight_g: 250, reason: 'skadet', created_at: at, created_by: owner }))
    checked(await db.from('waste_records').update({ created_at: at }).eq('batch_id', id))
    const day = checked(await db.from('market_days').insert({ market_date: date, starts_at: '10:00', ends_at: '15:00', place_name: `E2E Verdikjede ${id}`, address: 'Testgata', published: false, created_by: owner }).select('id').single()).data!.id
    days.push(day)
    takings.push(checked(await db.from('market_takings').insert({ market_day_id: day, vipps_ore: (i + 1) * 100000, card_ore: 50000, created_by: owner }).select('id').single()).data!.id)
  }
  // A pending batch and a reversed taking exercise both sides of the filters.
  const pending = crypto.randomUUID(); batches.push(pending)
  checked(await db.from('batches').insert({ id: pending, harvested_at: osloLocalToIso(`${today}T12:00`)!, area_id: area, pickers: 'E2E venter', gross_weight_g: 1250, created_by: owner }))
  checked(await ownerClient.from('market_takings').update({ voided_at: new Date().toISOString(), void_reason: 'E2E reversed taking' }).eq('id', takings[2]))
  takings.push(checked(await db.from('market_takings').insert({ market_day_id: days[2], vipps_ore: 300000, card_ore: 50000, created_by: owner }).select('id').single()).data!.id)
})

test.afterAll(async () => {
  const db = adminClient()
  const ownerClient = await planningConnection('eier@test.local')
  if (takings.length) checked(await ownerClient.from('market_takings').update({ voided_at: new Date().toISOString(), void_reason: 'E2E fixture retired' }).in('id', takings).is('voided_at', null))
  if (days.length) checked(await db.from('market_days').update({ cancelled: true }).in('id', days))
  if (batches.length) {
    checked(await db.from('stock_movements').delete().in('batch_id', batches))
    checked(await db.from('waste_records').delete().in('batch_id', batches))
    checked(await db.from('packings').delete().in('batch_id', batches))
    checked(await db.from('sorting_checks').delete().in('batch_id', batches))
    checked(await db.from('batches').delete().in('id', batches))
  }
})

async function assertPeriod(page: Page, key: string) {
  const p = chainPeriod(key, new Date()), db = adminClient()
  const picked = checked(await db.from('batches').select('gross_weight_g, sorting_checks(batch_id)').gte('harvest_date', p.from).lte('harvest_date', p.to)).data!
  const packed = checked(await db.from('packings').select('units, weight_g').gte('packed_at', p.start).lt('packed_at', p.end)).data!
  const moved = checked(await db.from('stock_movements').select('units, kind').gte('created_at', p.start).lt('created_at', p.end)).data!
  const stock = checked(await db.from('stock_movements').select('units')).data!
  const waste = checked(await db.from('waste_records').select('units, weight_g').gte('created_at', p.start).lt('created_at', p.end)).data!
  const ownerClient = await planningConnection('eier@test.local')
  const totals = checked(await ownerClient.rpc('ledger_totals', { p_from: p.from, p_to: p.to })).data![0]
  const market = checked(await db.from('market_takings').select('market_day_id, market_days!inner(market_date)').is('voided_at', null).gte('market_days.market_date', p.from).lte('market_days.market_date', p.to)).data!
  const countDays = new Set(market.map(t => t.market_day_id)).size
  const expected: Record<string, number[]> = {
    picking: [picked.reduce((s, b) => s + b.gross_weight_g, 0) / 1000, picked.length],
    sorting: [picked.filter(b => Array.isArray(b.sorting_checks) ? b.sorting_checks.length > 0 : !!b.sorting_checks).length, picked.filter(b => Array.isArray(b.sorting_checks) ? b.sorting_checks.length === 0 : !b.sorting_checks).length],
    packing: [packed.reduce((s, r) => s + r.units, 0), packed.reduce((s, r) => s + r.weight_g, 0) / 1000],
    delivery: [-moved.filter(r => ['sell', 'deliver'].includes(r.kind)).reduce((s, r) => s + r.units, 0), stock.reduce((s, r) => s + r.units, 0), waste.reduce((s, r) => s + (r.units ?? 0), 0), waste.reduce((s, r) => s + (r.weight_g ?? 0), 0) / 1000],
    value: [Number(totals.income_ore) / 100, countDays ? Number(totals.income_ore) / 100 / countDays : 0],
  }
  for (const [id, values] of Object.entries(expected)) {
    for (const [i, value] of values.entries()) {
      const number = page.getByTestId(`chain-${id}`).locator('[data-chain-number]').nth(i)
      const digits = Number(await number.getAttribute('data-digits'))
      await expect(number).toHaveText(formatChainNumber(value, digits))
    }
  }
}

test('owner sees five steps and seeded numbers when switching every period', async ({ page }) => {
  await loginAs(page, 'owner')
  const section = page.getByRole('region', { name: 'Verdikjeden' })
  await expect(section.locator('[data-chain-card]')).toHaveCount(5)
  await expect(section.getByRole('heading', { name: 'Verdi', exact: true })).toBeVisible()
  await assertPeriod(page, 'sesong')
  for (const [key, label] of [['uke', '7 dager'], ['dag', 'I dag'], ['sesong', 'Sesong']]) {
    const responsePromise = page.waitForResponse(response => {
      const url = new URL(response.url())
      return url.pathname === '/admin' && url.searchParams.get('periode') === key && response.request().headers()['rsc'] === '1'
    })
    const [response] = await Promise.all([responsePromise, section.getByRole('link', { name: label, exact: true }).click()])
    expect(await response.finished()).toBeNull()
    await page.waitForURL(`**/admin?periode=${key}`)
    await expect(section.getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page')
    await assertPeriod(page, key)
  }
  expect(await section.locator('[data-chain-card]').evaluateAll(cards => new Set(cards.map(c => Math.round(c.getBoundingClientRect().top))).size)).toBe(1)
})

for (const role of ['picker', 'seller'] as const) test(`${role} receives four steps without value or currency`, async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await loginAs(page, role)
  await expect(page.locator('[data-chain-card]')).toHaveCount(4)
  await expect(page.getByRole('heading', { name: 'Verdi', exact: true })).toHaveCount(0)
  await expect(page.getByRole('main')).not.toContainText(/\bkr\b/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  for (const card of await page.locator('.a-chain-card').all()) expect((await card.boundingBox())!.height).toBeGreaterThanOrEqual(44)
})

test('reduced motion presents final numbers immediately without animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await loginAs(page, 'owner')
  await page.goto('/admin?periode=dag')
  const numbers = await page.locator('[data-chain-number]').evaluateAll(elements => elements.map(el => ({ text: el.textContent, value: (el as HTMLElement).dataset.value, digits: (el as HTMLElement).dataset.digits })))
  for (const n of numbers) expect(n.text).toBe(formatChainNumber(Number(n.value), Number(n.digits)))
  expect(await page.locator('.a-chain').evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0)
  await assertPeriod(page, 'dag')
})

test('server HTML contains final values with JavaScript disabled', async ({ page }) => {
  await loginAs(page, 'owner')
  const context = await page.context().browser()!.newContext({ javaScriptEnabled: false, storageState: await page.context().storageState() })
  try {
    const plain = await context.newPage()
    await plain.goto('http://localhost:3000/admin?periode=dag')
    await expect(plain.locator('[data-chain-card]')).toHaveCount(5)
    await assertPeriod(plain, 'dag')
  } finally { await context.close() }
})
