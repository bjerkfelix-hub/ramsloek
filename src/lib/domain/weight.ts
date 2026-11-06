const nbNumber = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 3 })

/** Parses a kilogram value typed with a decimal comma or point (e.g. "2,5", "2.5 kg") into grams. */
export function parseKgToGrams(input: string): number | null {
  const normalized = input.trim().replace(/\s*kg$/i, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const grams = Math.round(Number(normalized) * 1000)
  return grams > 0 ? grams : null
}

/** Formats grams as grams under 1 kg, otherwise kilograms with a Norwegian decimal comma. */
export function formatGrams(grams: number): string {
  return grams < 1000 ? `${grams} g` : `${nbNumber.format(grams / 1000)} kg`
}
