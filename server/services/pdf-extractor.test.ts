import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { extractStatement, parseFrAmount } from './pdf-extractor'
import { eurosToCents } from '~~/shared/types/money'

const FIXTURE_DIR = resolve('tests/fixtures/pdfs')
const firstFixturePdf = (): string | null => {
  if (!existsSync(FIXTURE_DIR)) return null
  const files = readdirSync(FIXTURE_DIR).filter(f => f.toLowerCase().endsWith('.pdf'))
  return files.length > 0 ? resolve(FIXTURE_DIR, files[0]!) : null
}
const fixturePath = firstFixturePdf()

describe('parseFrAmount', () => {
  it('parses a standard FR amount with thin space and comma', () => {
    expect(parseFrAmount('1 234,56')).toBe(eurosToCents(1234.56))
  })

  it('parses an amount with euro symbol', () => {
    expect(parseFrAmount('1 234,56 €')).toBe(eurosToCents(1234.56))
  })

  it('parses a negative amount (overdraft)', () => {
    expect(parseFrAmount('-12,34')).toBe(eurosToCents(-12.34))
  })

  it('parses an amount with non-breaking spaces (U+00A0)', () => {
    expect(parseFrAmount('1 234,56')).toBe(eurosToCents(1234.56))
  })

  it('parses an amount with narrow no-break space (U+202F)', () => {
    expect(parseFrAmount('1 234,56')).toBe(eurosToCents(1234.56))
  })

  it('parses dot decimal as fallback', () => {
    expect(parseFrAmount('1234.56')).toBe(eurosToCents(1234.56))
  })

  it('returns null on garbage input', () => {
    expect(parseFrAmount('hello')).toBeNull()
  })

  it('returns null on empty string', () => {
    expect(parseFrAmount('')).toBeNull()
  })
})

describe('extractStatement', () => {
  it('rejects a non-PDF buffer with an explicit error', async () => {
    const garbage = Buffer.from('this is definitely not a pdf')
    await expect(extractStatement(garbage)).rejects.toThrow()
  })

  it('rejects an empty buffer', async () => {
    await expect(extractStatement(Buffer.alloc(0))).rejects.toThrow()
  })

  it.skipIf(!fixturePath)(
    'extracts text and metadata from a real Boursorama statement (fixture present)',
    async () => {
      const buf = readFileSync(fixturePath!)
      const result = await extractStatement(buf)

      expect(result.rawText.length).toBeGreaterThan(100)

      // Period et soldes peuvent être null si les regex ne matchent pas le format observé.
      // On valide seulement la forme quand ils sont présents — les valeurs exactes seront
      // verrouillées par snapshot dans une story ultérieure (cf. PRD G5).
      if (result.periodStart !== null) {
        expect(result.periodStart).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      }
      if (result.periodEnd !== null) {
        expect(result.periodEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      }
      if (result.periodStart && result.periodEnd) {
        expect(result.periodStart <= result.periodEnd).toBe(true)
      }
      if (result.openingBalanceCents !== null) {
        expect(Number.isInteger(result.openingBalanceCents)).toBe(true)
      }
      if (result.closingBalanceCents !== null) {
        expect(Number.isInteger(result.closingBalanceCents)).toBe(true)
      }
    },
  )
})
