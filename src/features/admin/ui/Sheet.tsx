'use client'

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { animate, useMotionValue, type AnimationPlaybackControlsWithThen } from 'motion/react'
import { rubberband, sheetReleaseTarget, velocityFrom, type Sample } from './gesture'
import { prefersReducedMotion } from './use-phone'

// Critically damped spring (Apple: damping 1.0, response ≈ 0.35 s). No overshoot on open/close.
const SPRING = { type: 'spring', bounce: 0, visualDuration: 0.35 } as const
const FADE = { duration: 0.2, ease: 'easeOut' } as const

const APP_ROOT_ID = 'admin-app'

// Lets content inside a sheet (ActionForm) close it after a successful save.
const SheetCloseContext = createContext<(() => void) | null>(null)
export function useSheetClose(): (() => void) | null {
  return useContext(SheetCloseContext)
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Bottom sheet: modal dialog (focus trap, Escape, focus returns to the trigger), dimming scrim,
 * drag-to-dismiss on the header with 1:1 tracking, rubber-banding above the top, velocity handoff
 * and momentum projection. Every animation starts from the live value, so it can be grabbed and
 * reversed mid-flight.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  // Stays mounted while the close animation runs.
  const [present, setPresent] = useState(open)
  if (open && !present) setPresent(true)
  if (!present || typeof document === 'undefined') return null
  return (
    <SheetPanel open={open} onClose={onClose} onExited={() => setPresent(false)} title={title}>
      {children}
    </SheetPanel>
  )
}

function SheetPanel({
  open,
  onClose,
  onExited,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  onExited: () => void
  title: string
  children: React.ReactNode
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const y = useMotionValue(0)
  const opacity = useMotionValue(1)
  const height = useRef(0)
  const anim = useRef<AnimationPlaybackControlsWithThen | null>(null)
  const releaseVelocity = useRef(0)
  const returnFocus = useRef<HTMLElement | null>(null)
  const drag = useRef<{ id: number; startPointer: number; startY: number; samples: Sample[] } | null>(null)
  const callbacks = useRef({ onClose, onExited })
  const isOpen = useRef(open)
  useEffect(() => {
    callbacks.current = { onClose, onExited }
  })

  // Motion values drive the DOM directly: no React render per frame.
  useLayoutEffect(() => {
    const panel = panelRef.current!
    const scrim = scrimRef.current!
    const paint = () => {
      const h = height.current || 1
      const v = y.get()
      panel.style.transform = `translate3d(0, ${v}px, 0)`
      panel.style.opacity = String(opacity.get())
      scrim.style.opacity = String(Math.max(0, Math.min(1, 1 - v / h)) * opacity.get())
    }
    const offY = y.on('change', paint)
    const offO = opacity.on('change', paint)
    return () => {
      offY()
      offO()
    }
  }, [y, opacity])

  useLayoutEffect(() => {
    const panel = panelRef.current!
    const reduced = prefersReducedMotion()
    height.current = panel.offsetHeight
    isOpen.current = open
    anim.current?.stop()
    if (open) {
      if (!returnFocus.current) returnFocus.current = document.activeElement as HTMLElement | null
      document.getElementById(APP_ROOT_ID)?.setAttribute('inert', '')
      document.documentElement.style.overflow = 'hidden'
      if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true })
      if (reduced) {
        // Reduced motion: no slide, a short cross-fade only.
        y.set(0)
        if (panel.dataset.shown !== '1') opacity.set(0)
        anim.current = animate(opacity, 1, FADE)
      } else {
        // First open starts below the screen; a re-open mid-close continues from where it is.
        if (y.get() === 0 && panel.dataset.shown !== '1') y.set(height.current)
        anim.current = animate(y, 0, { ...SPRING, velocity: y.getVelocity() })
      }
      panel.dataset.shown = '1'
    } else {
      releaseInert()
      const target = returnFocus.current
      returnFocus.current = null
      if (target && document.contains(target)) target.focus({ preventScroll: true })
      // A re-open while closing stops this animation; only a finished close unmounts.
      const done = () => {
        if (!isOpen.current) callbacks.current.onExited()
      }
      if (reduced) {
        anim.current = animate(opacity, 0, FADE)
      } else {
        const velocity = releaseVelocity.current || y.getVelocity()
        anim.current = animate(y, height.current, { ...SPRING, velocity })
      }
      releaseVelocity.current = 0
      anim.current.then(done)
    }
  }, [open, y, opacity])

  // Unmount (e.g. navigation after a save) must never leave the app inert.
  useEffect(() => () => releaseInert(), [])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        callbacks.current.onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  function trapTab(e: React.KeyboardEvent) {
    if (e.key !== 'Tab') return
    const panel = panelRef.current!
    const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
    if (items.length === 0) return e.preventDefault()
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!open || e.button !== 0 || (e.target as HTMLElement).closest('button')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    anim.current?.stop() // grab it mid-flight: continue from the on-screen value
    height.current = panelRef.current!.offsetHeight
    drag.current = { id: e.pointerId, startPointer: e.clientY, startY: y.get(), samples: [{ y: e.clientY, t: e.timeStamp }] }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    // 1:1 with the finger, keeping the offset from where it was grabbed.
    const raw = d.startY + (e.clientY - d.startPointer)
    y.set(raw < 0 ? rubberband(raw, height.current) : raw)
    d.samples.push({ y: e.clientY, t: e.timeStamp })
    if (d.samples.length > 8) d.samples.shift()
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    const velocity = velocityFrom(d.samples)
    if (sheetReleaseTarget(y.get(), velocity, height.current) === 'closed') {
      releaseVelocity.current = velocity
      callbacks.current.onClose()
    } else {
      anim.current = prefersReducedMotion()
        ? animate(y, 0, FADE)
        : animate(y, 0, { ...SPRING, velocity }) // hand the finger's velocity to the spring
    }
  }

  const close = useCallback(() => callbacks.current.onClose(), [])

  return createPortal(
    <>
      <div ref={scrimRef} className="a-scrim" aria-hidden="true" onClick={close} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="a-sheet"
        style={{ transform: 'translate3d(0, 100%, 0)' }}
        onKeyDown={trapTab}
      >
        <div
          className="a-sheet-head"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="a-grabber" data-testid="sheet-grabber" />
          <div className="a-sheet-titlebar">
            <h2 id={titleId} className="a-sheet-title">
              {title}
            </h2>
            <button type="button" className="a-btn a-btn-plain a-sheet-close" onClick={close}>
              Lukk
            </button>
          </div>
        </div>
        <div className="a-sheet-body">
          <SheetCloseContext.Provider value={close}>{children}</SheetCloseContext.Provider>
        </div>
      </div>
    </>,
    document.body,
  )
}

function releaseInert() {
  document.getElementById(APP_ROOT_ID)?.removeAttribute('inert')
  document.documentElement.style.overflow = ''
}
