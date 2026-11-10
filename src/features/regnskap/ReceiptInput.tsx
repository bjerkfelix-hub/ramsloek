'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Image from 'next/image'
import { prepareReceiptFile } from './downscale'

export function ReceiptInput({ name = 'file', onChange }: { name?: string; onChange?: (f: File | null) => void }) {
  const id = useId()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const previewRef = useRef<string | null>(null)
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
  }, [])

  return (
    <div className="a-field" aria-busy={busy}>
      <label htmlFor={id}>Ta bilde</label>
      <input id={id} name={name} className="a-input" type="file" accept="image/*,application/pdf" capture="environment"
        aria-describedby={`${id}-status`}
        onChange={async (event) => {
          const input = event.currentTarget
          const selected = input.files?.[0]
          setBusy(true)
          setError('')
          // While the photo is being prepared the form must not submit (it would save without the
          // receipt). A custom validity message makes native validation block every form using this.
          input.setCustomValidity('Vent til bildet er klart.')
          try {
            const prepared = selected ? await prepareReceiptFile(selected) : null
            // Native FormData and the callback must receive the same prepared bytes.
            const transfer = new DataTransfer()
            if (prepared) transfer.items.add(prepared)
            input.files = transfer.files
            if (previewRef.current) URL.revokeObjectURL(previewRef.current)
            previewRef.current = prepared?.type.startsWith('image/') ? URL.createObjectURL(prepared) : null
            setPreview(previewRef.current)
            setFile(prepared)
            onChange?.(prepared)
          } catch {
            input.value = ''
            setFile(null)
            setPreview(null)
            onChange?.(null)
            setError('Kunne ikke klargjøre bildet. Prøv igjen.')
          } finally {
            input.setCustomValidity('')
            setBusy(false)
          }
        }} />
      <p id={`${id}-status`} role="status">{error || (busy ? 'Klargjør bilde …' : file?.name)}</p>
      {preview && <Image src={preview} alt="Valgt kvittering" width={160} height={160} unoptimized style={{ objectFit: 'contain', maxWidth: '100%' }} />}
    </div>
  )
}
