import { describe, expect, it } from 'vitest'
import { csvCell, toCsv } from './csv'

describe('csvCell', () => {
  it('leaves plain text alone and quotes commas, quotes and newlines', () => {
    expect(csvCell('a@b.no')).toBe('a@b.no')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('a\nb')).toBe('"a\nb"')
  })
  it('neutralises formula injection', () => {
    for (const c of ['=1+1', '+1', '-1', '@x']) expect(csvCell(c)).toBe(`'${c}`)
    expect(csvCell('=a,b')).toBe(`"'=a,b"`)
  })
})

describe('toCsv', () => {
  it('starts with a BOM and the header, CRLF separated', () => {
    expect(toCsv(['email', 'language'], [['a@b.no', 'no']])).toBe('﻿email,language\r\na@b.no,no\r\n')
  })
})
