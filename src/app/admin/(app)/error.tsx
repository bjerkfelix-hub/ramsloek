'use client'

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="a-page items-start">
      <h1 className="a-title">Noe gikk galt</h1>
      <p className="a-sub">Siden kunne ikke vises. Sjekk nettforbindelsen og prøv igjen.</p>
      <button type="button" onClick={reset} className="a-btn a-btn-primary">
        Prøv igjen
      </button>
    </div>
  )
}
