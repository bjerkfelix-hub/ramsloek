/** One CSV cell: neutralises spreadsheet formulas (leading = + - @, tab, CR) and applies RFC 4180 quoting. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** CSV text with CRLF line endings and a UTF-8 BOM so Excel reads æøå correctly. */
export function toCsv(header: string[], rows: string[][]): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(','))
  return '﻿' + lines.join('\r\n') + '\r\n'
}
