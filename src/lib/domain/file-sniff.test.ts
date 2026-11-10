import { describe, expect, it } from 'vitest'
import { MIME_EXT, sniffMime } from './file-sniff'

const ascii = (value: string) => new TextEncoder().encode(value)

describe('sniffMime', () => {
  it('recognizes JPEG and PNG signatures', () => {
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff]))).toBe('image/jpeg')
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png')
  })

  it('requires both RIFF and WEBP markers', () => {
    expect(sniffMime(ascii('RIFF....WEBP'))).toBe('image/webp')
    expect(sniffMime(ascii('RIFF....WAVE'))).toBeNull()
    expect(sniffMime(ascii('xxxx....WEBP'))).toBeNull()
  })

  it('recognizes PDF', () => {
    expect(sniffMime(ascii('%PDF-'))).toBe('application/pdf')
  })

  it.each(['heic', 'heix', 'mif1'])('recognizes the %s HEIC brand at offset 8', (brand) => {
    expect(sniffMime(ascii(`....ftyp${brand}`))).toBe('image/heic')
  })

  it.each([
    ascii('<svg'), ascii('<!DOCTYPE html'), new Uint8Array(), new Uint8Array([1, 2, 3]),
    new Uint8Array([0xff, 0xd8]), new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    ascii('%PDF'), ascii('RIFF....WEB'), ascii('....ftyphei'), ascii('....ftypavif'),
    ascii('ftypheic'), ascii('....xxxxheic'),
  ])('rejects unsupported or truncated bytes %j', (bytes) => {
    expect(sniffMime(bytes)).toBeNull()
  })
})

describe('MIME_EXT', () => {
  it('maps supported MIME types to canonical extensions', () => {
    expect(MIME_EXT).toEqual({
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
      'image/heic': 'heic', 'application/pdf': 'pdf',
    })
  })
})
