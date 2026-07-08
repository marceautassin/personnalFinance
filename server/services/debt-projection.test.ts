import { describe, it, expect } from 'vitest'
import { projectDebt, projectedTotalCents, type DebtProjectionInput } from './debt-projection'
import type { Cents } from '~~/shared/types/money'

const c = (n: number) => n as Cents

function input(partial: Partial<DebtProjectionInput>): DebtProjectionInput {
  return {
    currentBalanceCents: c(0),
    repaymentMode: 'free',
    monthlyAmountCents: null,
    lumpSumDate: null,
    ...partial,
  }
}

describe('projectDebt — mode monthly', () => {
  it('nominal : sorties = mensualité, somme = solde, dernier mois partiel', () => {
    const series = projectDebt(
      input({ currentBalanceCents: c(250_000), repaymentMode: 'monthly', monthlyAmountCents: c(100_000) }),
      '2026-01',
      6,
    )
    expect(series).toHaveLength(6)
    expect(series.map(s => s.amountCents)).toEqual([100_000, 100_000, 50_000, 0, 0, 0])
    expect(series.reduce((s, o) => s + o.amountCents, 0)).toBe(250_000)
    expect(series[0]!.month).toBe('2026-01')
  })

  it('cas limite : solde < mensualité → un seul mois partiel', () => {
    const series = projectDebt(
      input({ currentBalanceCents: c(30_000), repaymentMode: 'monthly', monthlyAmountCents: c(100_000) }),
      '2026-01',
      3,
    )
    expect(series.map(s => s.amountCents)).toEqual([30_000, 0, 0])
  })

  it('solde 0 → tout à 0', () => {
    const series = projectDebt(
      input({ currentBalanceCents: c(0), repaymentMode: 'monthly', monthlyAmountCents: c(100_000) }),
      '2026-01',
      3,
    )
    expect(series.every(s => s.amountCents === 0)).toBe(true)
  })
})

describe('projectDebt — mode lump_sum', () => {
  it('échéance dans l\'horizon → solde au bon mois', () => {
    const series = projectDebt(
      input({ currentBalanceCents: c(500_000), repaymentMode: 'lump_sum', lumpSumDate: '2026-03-15' }),
      '2026-01',
      6,
    )
    expect(series.map(s => s.amountCents)).toEqual([0, 0, 500_000, 0, 0, 0])
    expect(series[2]!.month).toBe('2026-03')
  })

  it('échéance hors horizon → tout à 0', () => {
    const series = projectDebt(
      input({ currentBalanceCents: c(500_000), repaymentMode: 'lump_sum', lumpSumDate: '2027-01-15' }),
      '2026-01',
      6,
    )
    expect(series.every(s => s.amountCents === 0)).toBe(true)
  })

  it('cas limite : échéance PASSÉE mais solde encore dû → imputée au mois 0', () => {
    const series = projectDebt(
      input({ currentBalanceCents: c(500_000), repaymentMode: 'lump_sum', lumpSumDate: '2026-06-15' }),
      '2026-07',
      6,
    )
    expect(series.map(s => s.amountCents)).toEqual([500_000, 0, 0, 0, 0, 0])
    expect(series[0]!.month).toBe('2026-07')
  })
})

describe('projectDebt — mode free', () => {
  it('tout à 0 (hors forecast)', () => {
    const series = projectDebt(
      input({ currentBalanceCents: c(500_000), repaymentMode: 'free' }),
      '2026-01',
      12,
    )
    expect(series).toHaveLength(12)
    expect(series.every(s => s.amountCents === 0)).toBe(true)
  })
})

describe('projectDebt — arithmétique de mois', () => {
  it('passage d\'année : décembre → janvier', () => {
    const series = projectDebt(
      input({ currentBalanceCents: c(200_000), repaymentMode: 'monthly', monthlyAmountCents: c(100_000) }),
      '2026-11',
      4,
    )
    expect(series.map(s => s.month)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
    expect(series.map(s => s.amountCents)).toEqual([100_000, 100_000, 0, 0])
  })
})

describe('projectedTotalCents', () => {
  it('somme sur horizons : mensualité plafonnée au solde', () => {
    const i = input({ currentBalanceCents: c(250_000), repaymentMode: 'monthly', monthlyAmountCents: c(100_000) })
    expect(projectedTotalCents(i, '2026-01', 6)).toBe(250_000)
    expect(projectedTotalCents(i, '2026-01', 2)).toBe(200_000) // horizon court → tronqué
  })

  it('lump_sum hors horizon court → 0', () => {
    const i = input({ currentBalanceCents: c(500_000), repaymentMode: 'lump_sum', lumpSumDate: '2026-10-01' })
    expect(projectedTotalCents(i, '2026-01', 6)).toBe(0)
    expect(projectedTotalCents(i, '2026-01', 12)).toBe(500_000)
  })
})
