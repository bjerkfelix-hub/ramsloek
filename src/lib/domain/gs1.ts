/** GS1 mod-10 check digit for a string of digits that excludes the check digit. */
export function gs1CheckDigit(digitsWithoutCheck: string): number {
  let sum = 0
  for (let i = 0; i < digitsWithoutCheck.length; i++) {
    const digit = Number(digitsWithoutCheck[digitsWithoutCheck.length - 1 - i])
    sum += digit * (i % 2 === 0 ? 3 : 1)
  }
  return (10 - (sum % 10)) % 10
}

/** Accepts GTIN-8/12/13/14 (spaces ignored) and returns the 14-digit GTIN, or null if invalid. */
export function normalizeGtin(input: string): string | null {
  const digits = input.replace(/\s/g, '')
  if (!/^\d+$/.test(digits) || ![8, 12, 13, 14].includes(digits.length)) return null
  const gtin14 = digits.padStart(14, '0')
  return gs1CheckDigit(gtin14.slice(0, 13)) === Number(gtin14[13]) ? gtin14 : null
}

/** Returns the 13-digit EAN for a GTIN-14 that starts with 0, otherwise null. */
export function ean13FromGtin(gtin14: string): string | null {
  return /^0\d{13}$/.test(gtin14) ? gtin14.slice(1) : null
}

/** GS1-128 element string for bwip-js: GTIN (01), best-before date (15) as YYMMDD, lot (10). */
export function gs1_128Text(args: { gtin14: string; bestBefore: string; lot: string }): string {
  const [year, month, day] = args.bestBefore.split('-')
  return `(01)${args.gtin14}(15)${year.slice(2)}${month}${day}(10)${args.lot}`
}
