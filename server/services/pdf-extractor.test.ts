import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { extractStatement, parseFrAmount } from './pdf-extractor'
import { eurosToCents } from '~~/shared/types/money'

const FIXTURE_DIR = resolve('tests/fixtures/pdfs')
const fixtureByName = (name: string): string | null => {
  const p = resolve(FIXTURE_DIR, name)
  return existsSync(p) ? p : null
}
const firstFixturePdf = (): string | null => {
  if (!existsSync(FIXTURE_DIR)) return null
  const files = readdirSync(FIXTURE_DIR).filter(f => f.toLowerCase().endsWith('.pdf'))
  return files.length > 0 ? resolve(FIXTURE_DIR, files[0]!) : null
}
const fixturePath = firstFixturePdf()

/**
 * Cas Boursobank verrouillés. Chaque entrée = un relevé réel ; les valeurs ont été
 * extraites manuellement et confirmées sur le PDF (cf. Completion Notes Story 2.2).
 *
 * Cohérence inter-relevés : closing(t) === opening(t+1). Boursobank rapporte au centime.
 */
const BOURSOBANK_FIXTURES: Array<{
  file: string
  periodStart: string
  periodEnd: string
  openingEuros: number
  closingEuros: number
}> = [
  {
    file: 'Releve-compte-27-02-2026.pdf',
    periodStart: '2026-01-31',
    periodEnd: '2026-02-27',
    openingEuros: 577.07,
    closingEuros: 478.41,
  },
  {
    file: 'Releve-compte-31-03-2026.pdf',
    periodStart: '2026-02-28',
    periodEnd: '2026-03-31',
    openingEuros: 478.41,
    closingEuros: 1023.98,
  },
]

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

  it('parses Boursobank thousands-dot + comma-decimal ("1.023,98")', () => {
    expect(parseFrAmount('1.023,98')).toBe(eurosToCents(1023.98))
  })

  it('parses millions with thousands-dot ("1.234.567,89")', () => {
    expect(parseFrAmount('1.234.567,89')).toBe(eurosToCents(1234567.89))
  })

  it('returns null on garbage input', () => {
    expect(parseFrAmount('hello')).toBeNull()
  })

  it('returns null on empty string', () => {
    expect(parseFrAmount('')).toBeNull()
  })

  it('returns null on ambiguous "1.234" (no comma, dot+3 digits)', () => {
    // Pourrait être 1.234 € ASCII OU 1 234 € milliers-point — on refuse de deviner.
    expect(parseFrAmount('1.234')).toBeNull()
  })

  it('returns null on ambiguous "12.345" (no comma, dot+3 digits)', () => {
    expect(parseFrAmount('12.345')).toBeNull()
  })

  it('parses non-ambiguous "1234.56" (2 decimals, ASCII fallback)', () => {
    expect(parseFrAmount('1234.56')).toBe(eurosToCents(1234.56))
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

  describe.each(BOURSOBANK_FIXTURES)('Boursobank fixture: $file', (fx) => {
    const path = fixtureByName(fx.file)

    it.skipIf(!path)('extracts period and balances exactly', async () => {
      const result = await extractStatement(readFileSync(path!))

      expect(result.rawText.length).toBeGreaterThan(1000)
      expect(result.rawText).toContain('BOURSOBANK')
      expect(result.periodStart).toBe(fx.periodStart)
      expect(result.periodEnd).toBe(fx.periodEnd)
      expect(result.openingBalanceCents).toBe(eurosToCents(fx.openingEuros))
      expect(result.closingBalanceCents).toBe(eurosToCents(fx.closingEuros))
    })
  })

  /**
   * Cohérence inter-relevés : un relevé qui clôt à X € doit ouvrir le suivant à X €.
   * Garde-fou contre une régression silencieuse des regex de soldes.
   * Skipped si une seule des fixtures consécutives manque (sinon le test passerait
   * vert sans assertion — faux positif).
   */
  const allFixturesPresent = BOURSOBANK_FIXTURES.every(fx => fixtureByName(fx.file))
  it.skipIf(!allFixturesPresent)(
    'closing(month n) equals opening(month n+1) across Boursobank fixtures',
    async () => {
      const sorted = [...BOURSOBANK_FIXTURES].sort((a, b) => a.periodStart.localeCompare(b.periodStart))
      expect.assertions(sorted.length - 1)
      for (let i = 0; i < sorted.length - 1; i++) {
        const cur = sorted[i]!
        const next = sorted[i + 1]!
        const curRes = await extractStatement(readFileSync(fixtureByName(cur.file)!))
        const nextRes = await extractStatement(readFileSync(fixtureByName(next.file)!))
        expect(curRes.closingBalanceCents).toBe(nextRes.openingBalanceCents)
      }
    },
  )

  it.skipIf(!fixturePath)('extracts a non-empty rawText from any PDF fixture', async () => {
    const result = await extractStatement(readFileSync(fixturePath!))
    expect(result.rawText.length).toBeGreaterThan(100)
    if (result.periodStart !== null) {
      expect(result.periodStart).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
    if (result.openingBalanceCents !== null) {
      expect(Number.isInteger(result.openingBalanceCents)).toBe(true)
    }
  })
})
