'use client'

import { useState } from 'react'
import { Sheet } from './Sheet'
import { useIsPhone } from './use-phone'

/**
 * A create form that opens in a bottom sheet on phones (≤ 640px) and sits inline on wider screens.
 * The form is rendered in exactly one place at a time. Before hydration the phone trigger shows
 * and the inline copy is hidden by CSS, so phones never flash the inline form.
 */
export function ResponsiveSheet({
  title,
  triggerLabel = title,
  triggerClassName = 'a-btn a-btn-tinted w-full',
  card = true,
  inline = false,
  wide,
  children,
}: {
  title: string
  triggerLabel?: string
  triggerClassName?: string
  /** Inline: wrap in a card with the title as heading. */
  card?: boolean
  /** Always inline (e.g. while editing an existing record). */
  inline?: boolean
  /** Shown instead of the inline form on wide screens. */
  wide?: React.ReactNode
  children: React.ReactNode
}) {
  const isPhone = useIsPhone()
  const [open, setOpen] = useState(false)

  const inlineContent = card ? (
    <section className="a-card a-section">
      <h2 className="a-h2">{title}</h2>
      {children}
    </section>
  ) : (
    children
  )

  if (inline) return inlineContent

  return (
    <>
      <button type="button" className={`only-phone ${triggerClassName}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>
      {!isPhone && <div className="only-wide contents">{wide ?? inlineContent}</div>}
      {isPhone && (
        <Sheet open={open} onClose={() => setOpen(false)} title={title}>
          {children}
        </Sheet>
      )}
    </>
  )
}
