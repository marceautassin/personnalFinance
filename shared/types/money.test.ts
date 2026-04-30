import { describe, expect, it } from 'vitest'
import {
  type Cents,
  addCents,
  cents,
  eurosToCents,
  formatEuros,
  mulCentsByRatio,
  negateCents,
  subCents,
  sumCents,
} from './money'

// Codepoints utilisés par Intl.NumberFormat fr-FR pour les espaces insécables.
const NBSP = '[  ]'

describe('Cents type and helpers', () => {
  describe('eurosToCents', () => {
    it('converts whole euros without drift', () => {
      expect(eurosToCents(12.34)).toBe(1234)
    })
    it('handles zero', () => {
      expect(eurosToCents(0)).toBe(0)
    })
    it('handles negative', () => {
      expect(eurosToCents(-12.34)).toBe(-1234)
    })
    it('rounds inputs with 4+ decimals to nearest cent', () => {
      expect(eurosToCents(1.2349)).toBe(123)
      expect(eurosToCents(1.2350)).toBe(124)
    })
    it('compensates IEEE-754 drift on x.x05 inputs (canonical money pitfall)', () => {
      // 1.005 * 100 = 100.49999... en IEEE-754 → sans normalisation, Math.round renvoie 100.
      // Avec la normalisation toFixed(8), on obtient bien 101.
      expect(eurosToCents(1.005)).toBe(101)
      expect(eurosToCents(2.005)).toBe(201)
    })
    it('rejects NaN', () => {
      expect(() => eurosToCents(Number.NaN)).toThrow(/eurosToCents/)
    })
    it('rejects Infinity', () => {
      expect(() => eurosToCents(Number.POSITIVE_INFINITY)).toThrow(/eurosToCents/)
      expect(() => eurosToCents(Number.NEGATIVE_INFINITY)).toThrow(/eurosToCents/)
    })
  })

  describe('arithmetic safety (no float drift)', () => {
    it('eurosToCents(0.1 + 0.2) = 30 exactement (test du float drift réel)', () => {
      // 0.1 + 0.2 = 0.30000000000000004 en IEEE-754. La conversion en cents doit gommer la drift.
      expect(eurosToCents(0.1 + 0.2)).toBe(30)
    })
    it('addCents : 10 + 20 cents = 30 cents', () => {
      expect(addCents(eurosToCents(0.10), eurosToCents(0.20))).toBe(30)
    })
    it('subCents handles negative results', () => {
      expect(subCents(cents(100), cents(150))).toBe(-50)
    })
    it('negateCents inverts sign', () => {
      expect(negateCents(cents(100))).toBe(-100)
      expect(negateCents(cents(-100))).toBe(100)
    })
    it('sumCents on empty array returns 0', () => {
      expect(sumCents([])).toBe(0)
    })
    it('sumCents on multiple values', () => {
      const arr: Cents[] = [cents(100), cents(200), cents(300)]
      expect(sumCents(arr)).toBe(600)
    })
  })

  describe('cents() constructor', () => {
    it('rejects NaN', () => {
      expect(() => cents(Number.NaN)).toThrow(/cents/)
    })
    it('rejects Infinity', () => {
      expect(() => cents(Number.POSITIVE_INFINITY)).toThrow(/cents/)
      expect(() => cents(Number.NEGATIVE_INFINITY)).toThrow(/cents/)
    })
    it('rounds non-integer inputs (Math.round)', () => {
      expect(cents(1.7)).toBe(2)
      expect(cents(1.4)).toBe(1)
    })
  })

  describe('rounding mode (Math.round = round-half-toward-+∞)', () => {
    // Verrouille la sémantique réelle de JS Math.round, qui n'est PAS half-away-from-zero :
    //   round(0.5) = 1, round(-0.5) = 0
    //   round(2.5) = 3, round(-2.5) = -2
    it('eurosToCents rounds positive .5 up', () => {
      expect(eurosToCents(12.345)).toBe(1235)
    })
    it('eurosToCents rounds negative .5 toward +∞ (not away from zero)', () => {
      // -12.345 * 100 = -1234.5 → round → -1234 (et non -1235)
      expect(eurosToCents(-12.345)).toBe(-1234)
    })
    it('mulCentsByRatio rounds positive .5 up', () => {
      // 333 * 0.5 = 166.5 → round → 167
      expect(mulCentsByRatio(cents(333), 0.5)).toBe(167)
    })
    it('mulCentsByRatio rounds negative .5 toward +∞', () => {
      // -333 * 0.5 = -166.5 → round → -166 (et non -167)
      expect(mulCentsByRatio(cents(-333), 0.5)).toBe(-166)
    })
  })

  describe('mulCentsByRatio', () => {
    it('applies IS 15% rate exactly', () => {
      expect(mulCentsByRatio(cents(1000), 0.15)).toBe(150)
    })
    it('applies flat tax 30% on a salary-equivalent figure', () => {
      expect(mulCentsByRatio(eurosToCents(5000), 0.30)).toBe(eurosToCents(1500))
    })
    it('handles zero ratio', () => {
      expect(mulCentsByRatio(cents(1234), 0)).toBe(0)
    })
    it('throws on NaN ratio', () => {
      expect(() => mulCentsByRatio(cents(100), Number.NaN)).toThrow(/mulCentsByRatio/)
    })
    it('throws on Infinity ratio', () => {
      expect(() => mulCentsByRatio(cents(100), Number.POSITIVE_INFINITY)).toThrow(/mulCentsByRatio/)
    })
  })

  describe('formatEuros', () => {
    it('formats 1234 cents as "12,34<NBSP>€" (fr-FR)', () => {
      expect(formatEuros(cents(1234))).toMatch(new RegExp(`^12,34${NBSP}€$`))
    })
    it('formats large amount with thousands separator', () => {
      expect(formatEuros(cents(123456))).toMatch(new RegExp(`^1${NBSP}234,56${NBSP}€$`))
    })
    it('formats negative amount', () => {
      expect(formatEuros(cents(-1234))).toMatch(new RegExp(`^-12,34${NBSP}€$`))
    })
    it('formats zero', () => {
      expect(formatEuros(cents(0))).toMatch(new RegExp(`^0,00${NBSP}€$`))
    })
  })

  describe('compile-time safety (brand)', () => {
    it('rejects raw number assignment to Cents', () => {
      // Vérifie le contrat compile-time : assigner un number brut à Cents doit échouer tsc.
      // @ts-expect-error — un `number` brut ne doit pas satisfaire `Cents`.
      const bad: Cents = 100
      expect(bad).toBe(100) // runtime OK, c'est le compilo qui doit refuser ci-dessus
    })
    it('accepts a Cents produced by a helper', () => {
      const ok: Cents = cents(100)
      expect(ok).toBe(100)
    })
  })
})
