export type ReceiptMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'application/pdf'

export const MIME_EXT: Record<ReceiptMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
}

function hasSignature(bytes: Uint8Array, signature: string, offset = 0): boolean {
  return bytes.length >= offset + signature.length &&
    Array.from(signature).every((character, index) => bytes[offset + index] === character.charCodeAt(0))
}

/** Identifies supported receipt formats from their leading bytes. */
export function sniffMime(bytes: Uint8Array): ReceiptMime | null {
  if (hasSignature(bytes, '\xff\xd8\xff')) return 'image/jpeg'
  if (hasSignature(bytes, '\x89PNG\r\n\x1a\n')) return 'image/png'
  if (hasSignature(bytes, 'RIFF') && hasSignature(bytes, 'WEBP', 8)) return 'image/webp'
  if (hasSignature(bytes, '%PDF-')) return 'application/pdf'
  if (hasSignature(bytes, 'ftyp', 4) &&
    ['heic', 'heix', 'mif1'].some((brand) => hasSignature(bytes, brand, 8))) return 'image/heic'
  return null
}
