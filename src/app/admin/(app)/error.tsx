'use client'

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3">
      <h1 className="text-xl font-semibold">Noe gikk galt</h1>
      <p className="text-sm text-zinc-700">Siden kunne ikke vises. Sjekk nettforbindelsen og prøv igjen.</p>
      <button
        type="button"
        onClick={reset}
        className="rounded bg-green-800 px-4 py-3 text-base font-medium text-white"
      >
        Prøv igjen
      </button>
    </div>
  )
}
