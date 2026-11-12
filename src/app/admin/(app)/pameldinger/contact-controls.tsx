'use client'
import { useActionState } from 'react'
import { changeContact } from './contact-actions'
export function ContactControls({
  id,
  kind,
  answered,
}: {
  id: string
  kind: 'interest' | 'wholesale'
  answered: boolean
}) {
  const [error, action, pending] = useActionState(async (_prev: string | null, form: FormData) => {
    try {
      await changeContact(form)
      return null
    } catch {
      return 'Kunne ikke lagre. Prøv igjen.'
    }
  }, null)
  return (
    <form
      action={action}
      className="flex flex-wrap gap-2"
      onSubmit={(event) => {
        const button = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
        if (button?.value === 'delete' && !window.confirm('Slette opplysningene permanent?'))
          event.preventDefault()
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="kind" value={kind} />
      {kind === 'wholesale' && (
        <button
          className="a-btn a-btn-tinted"
          name="operation"
          value={answered ? 'undo' : 'answer'}
          disabled={pending}
        >
          {answered ? 'Angre besvart' : 'Marker som besvart'}
        </button>
      )}
      <button className="a-btn a-btn-tinted" name="operation" value="delete" disabled={pending}>
        Slett
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
