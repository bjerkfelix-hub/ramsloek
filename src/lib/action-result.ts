export type ActionResult = { ok: true } | { ok: false; error: string }

export function text(form: FormData, key: string): string {
  const v = form.get(key)
  return typeof v === 'string' ? v.trim() : ''
}

export function textOrNull(form: FormData, key: string): string | null {
  return text(form, key) || null
}
