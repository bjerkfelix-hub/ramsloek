export type ActionResult = { ok: true } | { ok: false; error: string }

/**
 * Runs a client-side server-action call. A dropped network connection rejects the call; instead of
 * letting it reach the error boundary, turn it into an error result so the user can simply retry
 * (forms keep their record id, so a retry is idempotent). Next's redirect signal is re-thrown.
 */
export async function callAction<T extends ActionResult>(
  run: () => Promise<T>,
  message = 'Ingen forbindelse. Prøv igjen.',
): Promise<T | { ok: false; error: string }> {
  try {
    return await run()
  } catch (e) {
    const digest = (e as { digest?: unknown } | null)?.digest
    if (typeof digest === 'string' && digest.startsWith('NEXT_')) throw e
    return { ok: false, error: message }
  }
}

export function text(form: FormData, key: string): string {
  const v = form.get(key)
  return typeof v === 'string' ? v.trim() : ''
}

export function textOrNull(form: FormData, key: string): string | null {
  return text(form, key) || null
}
