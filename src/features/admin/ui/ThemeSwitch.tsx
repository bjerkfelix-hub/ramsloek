'use client'

import { createContext, useContext, useId, useState, useTransition } from 'react'
import { THEME_LABELS, THEME_PREFS, type ThemePref } from '../theme'
import { setTheme } from '../theme-actions'

type ThemeApi = { pref: ThemePref; choose: (pref: ThemePref) => void }

const ThemeContext = createContext<ThemeApi | null>(null)

export function ThemeProvider({ initial, children }: { initial: ThemePref; children: React.ReactNode }) {
  const [pref, setPref] = useState(initial)
  const [, startTransition] = useTransition()

  function choose(next: ThemePref) {
    setPref(next)
    const root = document.documentElement
    // Ease the brightness change (colours only, so it is fine under reduced motion too).
    root.classList.add('a-theme-anim')
    root.dataset.theme = next
    window.setTimeout(() => root.classList.remove('a-theme-anim'), 300)
    startTransition(async () => {
      await setTheme(next)
    })
  }

  return <ThemeContext.Provider value={{ pref, choose }}>{children}</ThemeContext.Provider>
}

// Segmented control: System / Lys / Mørk. Native radios, so arrow keys and screen readers just work.
export function ThemeSwitch() {
  const ctx = useContext(ThemeContext)
  const name = useId()
  if (!ctx) return null
  const index = THEME_PREFS.indexOf(ctx.pref)
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="a-small a-muted mb-2 font-semibold">Utseende</legend>
      <div className="a-seg" style={{ '--i': index } as React.CSSProperties}>
        <span className="a-seg-thumb" aria-hidden="true" />
        {THEME_PREFS.map((p) => (
          <label key={p}>
            <input type="radio" name={name} value={p} checked={ctx.pref === p} onChange={() => ctx.choose(p)} />
            {THEME_LABELS[p]}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
