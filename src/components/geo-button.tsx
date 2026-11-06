'use client'

import { useState } from 'react'

// Fills the lat/lng inputs of the surrounding form from the device position.
export function GeoButton() {
  const [message, setMessage] = useState<string | null>(null)

  function fill(e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.form
    if (!form || !navigator.geolocation) return setMessage('Posisjon er ikke tilgjengelig.')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        ;(form.elements.namedItem('lat') as HTMLInputElement).value = pos.coords.latitude.toFixed(6)
        ;(form.elements.namedItem('lng') as HTMLInputElement).value = pos.coords.longitude.toFixed(6)
        setMessage(null)
      },
      () => setMessage('Kunne ikke hente posisjonen.'),
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={fill} className="a-btn a-btn-tinted">
        Bruk min posisjon
      </button>
      {message && <p className="a-msg-error">{message}</p>}
    </div>
  )
}
