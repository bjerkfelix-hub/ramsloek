const MAX_LENGTH = 254
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase()
}

export function isValidEmail(input: string): boolean {
  const e = normalizeEmail(input)
  return e.length > 0 && e.length <= MAX_LENGTH && EMAIL_RE.test(e)
}
