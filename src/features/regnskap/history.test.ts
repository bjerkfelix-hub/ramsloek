import { describe, expect, it } from 'vitest'
import { describeHistory, type AuditRow } from './history'

const cats = new Map([
  ['c1', 'Emballasje'],
  ['c2', 'Standleie'],
])

describe('describeHistory', () => {
  it('shows creation and readable field changes', () => {
    const rows: AuditRow[] = [
      { id: 1, at: '2027-04-20T10:00:00Z', actor: 'u', action: 'INSERT', data: { new: { amount_ore: 10000 } } },
      {
        id: 2,
        at: '2027-04-21T10:00:00Z',
        actor: 'u',
        action: 'UPDATE',
        data: {
          old: { amount_ore: 10000, category_id: 'c1', payment_method: 'card', description: 'Poser' },
          new: { amount_ore: 12000, category_id: 'c2', payment_method: 'private', description: 'Poser' },
        },
      },
    ]
    const [created, changed] = describeHistory(rows, cats)
    expect(created).toMatchObject({ action: 'created', changes: [] })
    expect(changed.changes.map((c) => `${c.field}: ${c.from} → ${c.to}`)).toEqual([
      expect.stringMatching(/^Beløp: kr 100,00 → kr 120,00$/),
      'Kategori: Emballasje → Standleie',
      'Betaling: Kort → Lagt ut privat',
    ])
  })

  it('ignores updates to fields that are not shown (e.g. voided_by alone)', () => {
    const rows: AuditRow[] = [
      { id: 3, at: '2027-04-22T10:00:00Z', actor: 'u', action: 'UPDATE', data: { old: { voided_by: null }, new: { voided_by: 'u' } } },
    ]
    expect(describeHistory(rows, cats)[0].changes).toEqual([])
  })
})
