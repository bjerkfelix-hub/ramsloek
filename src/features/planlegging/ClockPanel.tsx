'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { startClock, stopClock } from '@/app/admin/(app)/stemple/actions'
import { callAction } from '@/lib/action-result'
import { isForgotten } from '@/lib/domain/planning'
import { formatDateTime } from '@/lib/domain/time'
import { useToast } from '@/features/admin/ui/Toast'
import type { ClockEntry } from './queries'

export function ClockPanel({ entry, profileId }: { entry: ClockEntry | null; profileId: string }) {
  const router = useRouter(), toast = useToast()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [now, setNow] = useState<number | null>(null)
  const startKey = useRef<string | null>(null)
  const storageKey = `planning-start:${profileId}`
  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const timer = setInterval(tick, 1000)
    const refresh = () => { if (document.visibilityState === 'visible') startTransition(() => router.refresh()) }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [router])
  useEffect(() => {
    // An open row reconciles even a successful Start whose HTTP response was lost.
    if (entry && entry.start_key === sessionStorage.getItem(storageKey)) {
      sessionStorage.removeItem(storageKey)
      startKey.current = null
    }
  }, [entry, storageKey])
  function clock() {
    // Capture the displayed id before dispatch. Never resolve "current open" on Stop.
    const displayedId = entry?.id
    if (!displayedId) {
      startKey.current ??= sessionStorage.getItem(storageKey) ?? crypto.randomUUID()
      sessionStorage.setItem(storageKey, startKey.current)
    }
    const key = startKey.current!
    startTransition(async () => {
      const result = await callAction(() => displayedId ? stopClock(displayedId) : startClock(key))
      if (result.ok) {
        if (!displayedId) { sessionStorage.removeItem(storageKey); startKey.current = null }
        setError('')
        toast.show(displayedId ? 'Stemplet ut' : 'Stempling registrert')
      } else setError(result.error)
      // Both success and uncertain network/conflict outcomes require DB reconciliation.
      router.refresh()
    })
  }
  const elapsed = entry && now ? Math.max(0, Math.floor((now - Date.parse(entry.started_at)) / 1000)) : 0
  return <section className="a-card a-section space-y-3" aria-label="Stemple">
    <h2 className="a-h2">Stemple</h2>
    <p>{entry ? 'Stemplet inn' : 'Du er stemplet ut.'}</p>
    {entry && <>
      <p>Startet {formatDateTime(entry.started_at)}</p>
      <p>Medgått tid: {Math.floor(elapsed / 3600)} t {Math.floor(elapsed / 60) % 60} min {elapsed % 60} sek</p>
      <p>{entry.shift_id ? 'Knyttet til planlagt vakt' : 'Uplanlagt'}</p>
      {now && isForgotten(entry.started_at, entry.ended_at, now) && <p className="a-msg-error">Glemt å stemple ut?</p>}
      <Link className="a-btn a-btn-tinted" href={`/admin/timer/${entry.id}`}>Se timeregistrering</Link>
    </>}
    {error && <p role="alert" className="a-msg-error">{error}</p>}
    <button className="a-btn a-btn-primary w-full" style={{ minHeight: 56 }} disabled={pending} onClick={clock}>{entry ? 'Stopp' : 'Start'}</button>
  </section>
}
