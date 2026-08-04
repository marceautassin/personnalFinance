import { describe, it, expect } from 'vitest'
import { computeDividendCapacity } from './dividend-capacity'
import type { Cents } from '~~/shared/types/money'

const c = (n: number) => n as Cents

describe('computeDividendCapacity (story 5.4)', () => {
  it('IS 15 % : profit 40k€, tax 6k€, capacity 54k€', () => {
    const r = computeDividendCapacity({
      revenueForecastCents: c(10_000_000),
      expensesForecastCents: c(6_000_000),
      currentTreasuryCents: c(2_000_000),
      isRatePct: 1500,
    })
    expect(r.profitBeforeTaxCents).toBe(4_000_000)
    expect(r.taxCents).toBe(600_000)
    expect(r.profitAfterTaxCents).toBe(3_400_000)
    expect(r.dividendableCapacityCents).toBe(5_400_000)
  })

  it('IS 25 % : mêmes valeurs → tax 10k€, capacity 50k€', () => {
    const r = computeDividendCapacity({
      revenueForecastCents: c(10_000_000),
      expensesForecastCents: c(6_000_000),
      currentTreasuryCents: c(2_000_000),
      isRatePct: 2500,
    })
    expect(r.taxCents).toBe(1_000_000)
    expect(r.dividendableCapacityCents).toBe(5_000_000)
  })

  it('charges > CA : profit négatif, tax 0, capacity floor à 0', () => {
    const r = computeDividendCapacity({
      revenueForecastCents: c(5_000_000),
      expensesForecastCents: c(8_000_000),
      currentTreasuryCents: c(1_000_000),
      isRatePct: 1500,
    })
    expect(r.profitBeforeTaxCents).toBe(-3_000_000)
    expect(r.taxCents).toBe(0)
    expect(r.profitAfterTaxCents).toBe(-3_000_000)
    // max(0, -3_000_000 + 1_000_000) = max(0, -2_000_000) = 0
    expect(r.dividendableCapacityCents).toBe(0)
  })

  it('IS 0 % : tax 0, capacity = profit + treasury', () => {
    const r = computeDividendCapacity({
      revenueForecastCents: c(3_000_000),
      expensesForecastCents: c(1_000_000),
      currentTreasuryCents: c(500_000),
      isRatePct: 0,
    })
    expect(r.taxCents).toBe(0)
    expect(r.profitAfterTaxCents).toBe(2_000_000)
    expect(r.dividendableCapacityCents).toBe(2_500_000)
  })

  it('rounding floor sur petit montant : tax = 0', () => {
    const r = computeDividendCapacity({
      revenueForecastCents: c(33),
      expensesForecastCents: c(0),
      currentTreasuryCents: c(0),
      isRatePct: 33,
    })
    // floor(33 * 33 / 10000) = floor(0.1089) = 0
    expect(r.taxCents).toBe(0)
    expect(r.dividendableCapacityCents).toBe(33)
  })

  it('rounding floor sur gros montant : tax = 3300', () => {
    const r = computeDividendCapacity({
      revenueForecastCents: c(1_000_000),
      expensesForecastCents: c(0),
      currentTreasuryCents: c(0),
      isRatePct: 33,
    })
    // floor(1_000_000 * 33 / 10000) = 3300
    expect(r.taxCents).toBe(3300)
  })

  it('plafond du schéma : IS exact sans dépasser Number.MAX_SAFE_INTEGER', () => {
    // profit × isRatePct = ~1e16 > 2^53 : la multiplication naïve perdrait des centimes.
    const revenue = 999_999_999_999 // proche de la borne 1e12 du schéma
    const isRatePct = 9999
    const r = computeDividendCapacity({
      revenueForecastCents: c(revenue),
      expensesForecastCents: c(0),
      currentTreasuryCents: c(0),
      isRatePct,
    })
    // Référence exacte via BigInt : floor(revenue × isRatePct / 10000).
    const expected = Number((BigInt(revenue) * BigInt(isRatePct)) / 10000n)
    expect(r.taxCents).toBe(expected)
  })

  // Bords de la condition `profitBeforeTaxCents > 0` et du `Math.max(0, …)` : la frontière
  // stricte n'était assertée nulle part (revue 2026-08-04, NFR18).
  it('profit exactement nul : tax 0, capacity = trésorerie seule', () => {
    const r = computeDividendCapacity({
      revenueForecastCents: c(4_000_000),
      expensesForecastCents: c(4_000_000),
      currentTreasuryCents: c(750_000),
      isRatePct: 2500,
    })
    expect(r.profitBeforeTaxCents).toBe(0)
    expect(r.taxCents).toBe(0)
    expect(r.profitAfterTaxCents).toBe(0)
    expect(r.dividendableCapacityCents).toBe(750_000)
  })

  it('profit après IS + trésorerie exactement nul : capacity 0 (bord du floor)', () => {
    const r = computeDividendCapacity({
      revenueForecastCents: c(1_000_000),
      expensesForecastCents: c(3_000_000),
      currentTreasuryCents: c(2_000_000),
      isRatePct: 1500,
    })
    expect(r.profitAfterTaxCents).toBe(-2_000_000)
    expect(r.dividendableCapacityCents).toBe(0)
  })

  // `isRatePct` doit être un entier de 0 à 10000 : la décomposition arithmétique le suppose.
  it.each([
    ['fractionnaire', 1550.5],
    ['négatif', -500],
    ['au-delà de 100 %', 10001],
    ['NaN', Number.NaN],
  ])('rejette un isRatePct %s', (_label, isRatePct) => {
    expect(() => computeDividendCapacity({
      revenueForecastCents: c(10_000_000),
      expensesForecastCents: c(6_000_000),
      currentTreasuryCents: c(0),
      isRatePct,
    })).toThrow(RangeError)
  })
})
