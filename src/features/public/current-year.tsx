'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/** The current year, taken in the visitor's browser so statically rendered pages never show a stale year. */
export function CurrentYear() {
  // The server snapshot is empty-safe: it renders the build-time year, the client then corrects it.
  const year = useSyncExternalStore(
    subscribe,
    () => String(new Date().getFullYear()),
    () => String(new Date().getFullYear()),
  )
  return <span suppressHydrationWarning>{year}</span>
}
