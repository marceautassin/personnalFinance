import type { Cents } from '~~/shared/types/money'
import type { RepaymentMode } from '~~/shared/types/repayment-mode'
import { monthOf, nextMonths } from '~~/server/utils/period'

/**
 * debt-projection — projection PURE d'une dette en sorties de trésorerie mensuelles (FR33).
 *
 * Fonction pure : le mois de départ est INJECTÉ (`startMonth`), jamais `Date.now()` interne —
 * testable et reproductible (cf. CLAUDE.md « Forecast = fonction pure »). Aucun accès DB.
 * L'Epic 7 (`forecast-engine`) consommera cette projection pour intégrer les dettes au forecast.
 */

export interface DebtProjectionInput {
  /** Solde restant à rembourser (calcul story 6.1). */
  currentBalanceCents: Cents
  repaymentMode: RepaymentMode
  /** Requis en mode `monthly`. */
  monthlyAmountCents: Cents | null
  /** Requis en mode `lump_sum`, format `YYYY-MM-DD`. */
  lumpSumDate: string | null
}

export interface MonthlyOutflow {
  /** Mois `YYYY-MM`. */
  month: string
  /** Sortie de trésorerie ce mois (≥ 0). */
  amountCents: Cents
}

/**
 * Projette une dette sur `horizonMonths` mois à partir de `startMonth` (inclus).
 * Retourne une entrée par mois (longueur = `horizonMonths`), `amountCents` = sortie ce mois.
 * L'arithmétique de mois est déléguée à `period.ts` (source unique, testée rollover d'année).
 *
 *  - `free`     → toutes les sorties à 0 (hors forecast).
 *  - `monthly`  → `min(mensualité, solde restant)` chaque mois jusqu'à épuisement, puis 0.
 *                 La somme ne dépasse jamais le solde.
 *  - `lump_sum` → le solde au mois de l'échéance si elle tombe dans l'horizon ; une échéance
 *                 DÉJÀ PASSÉE mais encore due est imputée immédiatement (mois 0) — sinon la
 *                 dépense disparaîtrait du forecast alors qu'elle reste à payer.
 */
export function projectDebt(
  input: DebtProjectionInput,
  startMonth: string,
  horizonMonths: number,
): MonthlyOutflow[] {
  const months = nextMonths(startMonth, horizonMonths)
  const series: MonthlyOutflow[] = months.map(month => ({ month, amountCents: 0 as Cents }))

  const balance = Math.max(0, input.currentBalanceCents)
  if (balance === 0 || series.length === 0) return series

  if (input.repaymentMode === 'monthly') {
    const monthly = input.monthlyAmountCents ?? 0
    if (monthly <= 0) return series
    let remaining = balance
    for (const entry of series) {
      if (remaining <= 0) break
      const out = Math.min(monthly, remaining)
      entry.amountCents = out as Cents
      remaining -= out
    }
    return series
  }

  if (input.repaymentMode === 'lump_sum') {
    if (!input.lumpSumDate) return series
    const dueMonth = monthOf(input.lumpSumDate) // YYYY-MM (valide la date calendrier)
    if (dueMonth < startMonth) {
      // Échéance passée mais solde encore dû → imputée dès le premier mois de l'horizon.
      series[0]!.amountCents = balance as Cents
    }
    else {
      const pos = months.indexOf(dueMonth)
      if (pos >= 0) series[pos]!.amountCents = balance as Cents
    }
    return series
  }

  // free → toutes à 0.
  return series
}

/** Somme des sorties projetées sur l'horizon (dépense marginale de la dette). */
export function projectedTotalCents(
  input: DebtProjectionInput,
  startMonth: string,
  horizonMonths: number,
): Cents {
  return projectDebt(input, startMonth, horizonMonths)
    .reduce((sum, o) => sum + o.amountCents, 0) as Cents
}
