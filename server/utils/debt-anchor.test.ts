import { describe, it, expect } from 'vitest'
import { projectDebtFromCurrentMonth } from './debt-anchor'
import type { Cents } from '~~/shared/types/money'
import type { DebtProjectionInput } from '~~/server/services/debt-projection'

/**
 * Ancrage des projections de dette (story 6.6). Fonction de calcul financier → NFR18.
 *
 * `projectDebtFromCurrentMonth` est pure : solde, mois de départ et déjà-réglé sont injectés.
 * Ces cas ne touchent pas la DB — l'agrégation SQL (`repaidInMonthCents`) est couverte au
 * niveau endpoint dans `server/api/debts/crud.test.ts`.
 */

const c = (n: number) => n as Cents

function monthly(balance: number, monthlyAmount: number): DebtProjectionInput {
  return {
    currentBalanceCents: c(balance),
    repaymentMode: 'monthly',
    monthlyAmountCents: c(monthlyAmount),
    lumpSumDate: null,
  }
}

const total = (series: { amountCents: number }[]) => series.reduce((s, o) => s + o.amountCents, 0)

describe('projectDebtFromCurrentMonth', () => {
  /**
   * LE cas de la revue du 2026-09-04, avec ses chiffres exacts :
   * « dette 1 000 €, mensualité 100 €, payée le 5 et marquée → currentBalance = 900, mais
   *   series[0] = 100 → l'horizon 6 mois annonce 600 € alors que 500 € restent à sortir. »
   */
  it('mensualité du mois déjà réglée : horizon 6 = 500 et non 600', () => {
    const series = projectDebtFromCurrentMonth(monthly(90_000, 10_000), '2026-04', 6, c(10_000))
    expect(series[0]!.amountCents).toBe(0)
    expect(total(series)).toBe(50_000)
  })

  it('mensualité non réglée : comportement inchangé (non-régression)', () => {
    const series = projectDebtFromCurrentMonth(monthly(90_000, 10_000), '2026-04', 6, c(0))
    expect(series[0]!.amountCents).toBe(10_000)
    expect(total(series)).toBe(60_000)
  })

  /**
   * Paiement PARTIEL : le mois courant porte le reliquat. C'est ce cas qui interdit la
   * correction naïve « démarrer au mois suivant », qui écraserait les 60 restants.
   */
  it('paiement partiel : le mois courant porte le reliquat', () => {
    const series = projectDebtFromCurrentMonth(monthly(26_000, 10_000), '2026-04', 6, c(4_000))
    expect(series[0]!.amountCents).toBe(6_000)
    expect(total(series)).toBe(26_000)
  })

  /**
   * Invariant central : plafonner le mois courant ne doit JAMAIS faire disparaître du solde.
   * Une déduction naïve du mois 0 perdait une mensualité — le premier correctif écrit pour
   * cette story avait ce défaut, attrapé par un test d'endpoint.
   */
  it('ne perd jamais de solde : le total projeté reste le solde dû (horizon suffisant)', () => {
    for (const repaid of [0, 1_000, 5_000, 10_000, 30_000]) {
      const series = projectDebtFromCurrentMonth(monthly(50_000, 10_000), '2026-04', 12, c(repaid))
      expect(total(series)).toBe(50_000)
    }
  })

  it('déjà réglé supérieur à la mensualité : mois courant à 0, solde intact', () => {
    const series = projectDebtFromCurrentMonth(monthly(50_000, 10_000), '2026-04', 12, c(25_000))
    expect(series[0]!.amountCents).toBe(0)
    expect(total(series)).toBe(50_000)
  })

  it('dette à zéro : série nulle (NFR18 cas limite)', () => {
    const series = projectDebtFromCurrentMonth(monthly(0, 10_000), '2026-04', 6, c(10_000))
    expect(total(series)).toBe(0)
    expect(series).toHaveLength(6)
  })

  it('longueur de série = horizon, y compris avec plafonnement', () => {
    expect(projectDebtFromCurrentMonth(monthly(90_000, 10_000), '2026-04', 6, c(10_000))).toHaveLength(6)
  })

  it('passage d\'année conservé malgré le décalage du mois courant', () => {
    const series = projectDebtFromCurrentMonth(monthly(30_000, 10_000), '2026-11', 4, c(10_000))
    expect(series.map(o => o.month)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
  })

  // Le plafonnement ne s'applique qu'au mode `monthly` : un lump sum est un versement unique,
  // pas une capacité mensuelle, et `free` ne projette rien.
  it('mode lump_sum : le déjà-réglé ne plafonne pas l\'échéance', () => {
    const series = projectDebtFromCurrentMonth(
      { currentBalanceCents: c(80_000), repaymentMode: 'lump_sum', monthlyAmountCents: null, lumpSumDate: '2026-06-15' },
      '2026-04', 6, c(20_000),
    )
    expect(series.find(o => o.month === '2026-06')!.amountCents).toBe(80_000)
    expect(total(series)).toBe(80_000)
  })

  it('mode free : rien n\'est projeté', () => {
    const series = projectDebtFromCurrentMonth(
      { currentBalanceCents: c(80_000), repaymentMode: 'free', monthlyAmountCents: null, lumpSumDate: null },
      '2026-04', 6, c(20_000),
    )
    expect(total(series)).toBe(0)
  })
})
