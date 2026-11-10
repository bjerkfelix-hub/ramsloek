'use client'

import { useEffect, useState } from 'react'

/**
 * The current year, set in the visitor's browser after mount. Nothing year-specific is rendered
 * on the server, so a prerendered (static) page can never keep the build year.
 */
export function CurrentYear() {
  const [year, setYear] = useState<number | null>(null)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentionally client-only after mount
    setYear(new Date().getFullYear())
  }, [])
  return <span>{year ?? ''}</span>
}
