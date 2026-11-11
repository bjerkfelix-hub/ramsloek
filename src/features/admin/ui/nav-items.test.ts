import { describe, expect, it } from 'vitest'
import { navFor } from './nav-items'

const hrefs = (role: Parameters<typeof navFor>[0]) => navFor(role).map((i) => i.href)

describe('navFor', () => {
  it('gives owners and sellers the Regnskap tab', () => {
    for (const role of ['owner', 'seller'] as const) {
      const item = navFor(role).find((i) => i.href === '/admin/regnskap')
      expect(item).toMatchObject({ label: 'Regnskap', icon: 'coins', tab: true })
    }
  })

  it('hides Regnskap from pickers', () => {
    expect(hrefs('picker')).not.toContain('/admin/regnskap')
  })
})

it('gives every role Vaktplan under Mer without adding a tab', () => {
  for (const role of ['owner', 'picker', 'seller'] as const) {
    expect(navFor(role).find(i => i.href === '/admin/vaktplan')).toMatchObject({ label: 'Vaktplan', icon: 'calendar', tab: false })
  }
})
it('gives all roles Stemple under Mer and Timer under Mer', () => {
  for (const role of ['owner','picker','seller'] as const) {
    expect(navFor(role).find(i => i.href === '/admin/stemple')).toMatchObject({ label: 'Stemple', icon: 'clock', tab: false })
    expect(navFor(role).find(i => i.href === '/admin/timer')).toMatchObject({ label: 'Timer', icon: 'clock', tab: false })
  }
})
it('gives all roles Oppgaver and preserves tab counts', () => {
  for (const [role, tabs] of [['owner',4],['picker',2],['seller',3]] as const) {
    expect(navFor(role).find(i => i.href === '/admin/oppgaver')).toMatchObject({label:'Oppgaver',icon:'checklist',tab:false})
    expect(navFor(role).filter(i => i.tab)).toHaveLength(tabs)
    expect(navFor(role).filter(i => i.tab === false).map(i => i.label)).toEqual(['Vaktplan','Stemple','Timer','Oppgaver'])
  }
})
