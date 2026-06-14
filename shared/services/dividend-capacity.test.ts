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
})
