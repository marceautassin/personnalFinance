import { describe, it, expect } from 'vitest'
import { computeRequiredDividend } from './dividend-calculator'
import type { ForecastResult, ForecastMonth } from './forecast-engine'
import type { Cents } from '~~/shared/types/money'

const c = (n: number) => n as Cents

/** Construit un ForecastResult minimal : seuls `endingBalanceCents` et `startingTreasuryCents` comptent. */
function mkForecast(balances: number[], startingTreasuryCents = 0): ForecastResult {
  const months: ForecastMonth[] = balances.map((b, i) => ({
    month: `2026-${String(i + 1).padStart(2, '0')}`,
    incomeCents: c(0), fixedChargesCents: c(0), variableCents: c(0), punctualCents: c(0),
    netCents: c(0), endingBalanceCents: c(b),
  }))
  return {
    startMonth: '2026-01', horizonMonths: balances.length,
    startingTreasuryCents: c(startingTreasuryCents), months, firstNegativeMonth: null,
  }
}

describe('computeRequiredDividend', () => {
  it('forecast tout positif → net 0, gross 0, fits, marge = capacité', () => {
    const r = computeRequiredDividend(mkForecast([100_000, 120_000, 90_000]), { dividendTaxRatePct: 3000, capacityGrossCents: c(500_000) })
    expect(r.requiredNetCents).toBe(0)
    expect(r.requiredGrossCents).toBe(0)
    expect(r.fitsCapacity).toBe(true)
    expect(r.marginCents).toBe(500_000)
  })

  it('creux négatif → net = |creux|', () => {
    const r = computeRequiredDividend(mkForecast([50_000, -70_000, -30_000]), { dividendTaxRatePct: 0, capacityGrossCents: c(1_000_000) })
    expect(r.requiredNetCents).toBe(70_000)
    expect(r.requiredGrossCents).toBe(70_000) // taux 0 → brut = net
  })

  it('taux 30 % → brut = ceil(net / 0.7)', () => {
    const r = computeRequiredDividend(mkForecast([-100_000]), { dividendTaxRatePct: 3000, capacityGrossCents: c(1_000_000) })
    expect(r.requiredNetCents).toBe(100_000)
    expect(r.requiredGrossCents).toBe(142_858) // ceil(100000/0.7) = ceil(142857.14)
  })

  it('brut divisible : net 70k @30 % → 100k', () => {
    const r = computeRequiredDividend(mkForecast([-70_000]), { dividendTaxRatePct: 3000, capacityGrossCents: c(1_000_000) })
    expect(r.requiredGrossCents).toBe(100_000)
  })

  it('taux 100 % + net > 0 → brut null, marge null, ne tient pas', () => {
    const r = computeRequiredDividend(mkForecast([-50_000]), { dividendTaxRatePct: 10000, capacityGrossCents: c(1_000_000) })
    expect(r.requiredGrossCents).toBeNull()
    expect(r.marginCents).toBeNull()
    expect(r.fitsCapacity).toBe(false)
  })

  it('capacité < brut requis → ne tient pas, marge négative', () => {
    const r = computeRequiredDividend(mkForecast([-700_000]), { dividendTaxRatePct: 3000, capacityGrossCents: c(500_000) })
    expect(r.requiredGrossCents).toBe(1_000_000) // ceil(700000/0.7)
    expect(r.fitsCapacity).toBe(false)
    expect(r.marginCents).toBe(-500_000)
  })

  it('capacité ≥ brut requis → tient', () => {
    const r = computeRequiredDividend(mkForecast([-700_000]), { dividendTaxRatePct: 3000, capacityGrossCents: c(1_200_000) })
    expect(r.fitsCapacity).toBe(true)
    expect(r.marginCents).toBe(200_000)
  })

  it('le solde de départ compte dans le min (aucun mois plus bas)', () => {
    // startingTreasury -10k, tous les mois remontent → min = -10k.
    const r = computeRequiredDividend(mkForecast([5_000, 20_000], -10_000), { dividendTaxRatePct: 0, capacityGrossCents: c(0) })
    expect(r.requiredNetCents).toBe(10_000)
  })

  it('exactitude au plafond : net 1e12 @30 % sans perte de centime', () => {
    const r = computeRequiredDividend(mkForecast([-1_000_000_000_000]), { dividendTaxRatePct: 3000, capacityGrossCents: c(0) })
    // Décomposition entière : ceil(1e12 * 10000 / 7000) = 1 428 571 428 572 (le calcul naïf 1e16 perdrait des centimes).
    expect(r.requiredGrossCents).toBe(1_428_571_428_572)
  })
})
