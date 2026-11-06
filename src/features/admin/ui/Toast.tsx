'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { animate } from 'motion/react'
import { prefersReducedMotion } from './use-phone'

type ToastApi = { show: (text: string) => void }

const ToastContext = createContext<ToastApi>({ show: () => {} })

export function useToast(): ToastApi {
  return useContext(ToastContext)
}

const VISIBLE_MS = 2200
// Critically damped (no overshoot): the toast is status, not a gesture with momentum.
const SPRING = { type: 'spring', bounce: 0, visualDuration: 0.35 } as const

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const nextId = useRef(0)
  const show = useCallback((text: string) => setToast({ id: ++nextId.current, text }), [])
  const api = useMemo(() => ({ show }), [show])
  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Persistent live region, so inserted text is announced. */}
      <div className="a-toast-region" aria-live="polite">
        {toast && <Toast key={toast.id} text={toast.text} onDone={() => setToast(null)} />}
      </div>
    </ToastContext.Provider>
  )
}

function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduced = prefersReducedMotion()
    // Enters from the top edge it hangs from; exits the same way (symmetric path).
    const enter = reduced
      ? animate(el, { opacity: [0, 1] }, { duration: 0.2 })
      : animate(el, { opacity: [0, 1], y: [-16, 0], scale: [0.96, 1] }, SPRING)
    let exit: ReturnType<typeof animate> | undefined
    const timer = setTimeout(() => {
      exit = reduced
        ? animate(el, { opacity: 0 }, { duration: 0.2 })
        : animate(el, { opacity: 0, y: -12, scale: 0.98 }, SPRING)
      exit.then(() => done.current())
    }, VISIBLE_MS)
    return () => {
      clearTimeout(timer)
      enter.stop()
      exit?.stop()
    }
  }, [])
  return (
    <div ref={ref} role="status" className="a-toast" style={{ opacity: 0 }}>
      {text}
    </div>
  )
}
