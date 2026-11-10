const krNumber = new Intl.NumberFormat('nb-NO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Parses positive kroner into integer øre, up to NOK 1 000 000. */
export function parseKr(input: string): number | null {
  const normalized = input.trim()
    .replace(/^kr\s*/i, '')
    .replace(/[ \u00a0\u202f]/g, '')
    .replace(/,-$/, '')
  if (!/^\d+([.,]\d{1,2})?$/.test(normalized)) return null
  const [whole, fraction = ''] = normalized.split(/[.,]/)
  const ore = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return ore > 0 && ore <= 100_000_000 ? ore : null
}

export function formatKr(ore: number): string {
  return `kr ${krNumber.format(oreToKrNumber(ore))}`
}

export function oreToKrNumber(ore: number): number {
  return ore / 100
}
