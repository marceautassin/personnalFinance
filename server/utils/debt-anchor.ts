import { sql } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { transactions } from '~~/server/db/schema'
import { cents, type Cents } from '~~/shared/types/money'
import { projectDebt, type MonthlyOutflow, type DebtProjectionInput } from '~~/server/services/debt-projection'
import { nextMonths } from '~~/server/utils/period'

/**
 * Ancrage temporel des projections de dette — SOURCE UNIQUE (story 6.6).
 *
 * Le problème (revue du 2026-09-04) : `impact.get.ts` et `forecast-engine.ts` ancraient tous
 * deux la projection au **mois courant** en partant du **solde courant**, ce qui recomptait la
 * mensualité déjà réglée ce mois-ci.
 *
 *   dette 1 000 €, mensualité 100 €, réglée le 5 et marquée
 *   → currentBalance = 900, mais series[0] = 100
 *   → l'horizon 6 mois annonçait 600 € quand 500 € restaient à sortir.
 *
 * Le biais ne restait pas dans la carte d'impact : `forecast-engine` reprenait le même ancrage,
 * donc il remontait jusqu'au dividende à voter.
 *
 * La règle vit ICI et nulle part ailleurs. La dupliquer ferait diverger la carte d'impact et le
 * dividende — même motif que `category-references.ts` (story 5.6).
 */

/** Mois courant serveur au format `YYYY-MM`. */
export function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Montant DÉJÀ SORTI vers cette dette sur ce mois (valeur absolue des sorties).
 *
 * Filtre explicitement `amount_cents < 0` : depuis la story 6.5, une transaction **entrante**
 * peut être rattachée à une dette, et ce n'est pas un remboursement. La compter ici
 * neutraliserait à tort la mensualité projetée du mois — sur la carte d'impact comme sur le
 * dividende (revue du 2026-09-04).
 */
export function repaidInMonthCents(debtId: number, month: string): Cents {
  const row = db
    .select({ total: sql<number>`coalesce(sum(abs(${transactions.amountCents})), 0)` })
    .from(transactions)
    .where(sql`
      ${transactions.debtId} = ${debtId}
      AND ${transactions.isDebtRepayment} = 1
      AND ${transactions.amountCents} < 0
      AND strftime('%Y-%m', ${transactions.transactionDate}) = ${month}
    `)
    .get()
  return cents(Number(row?.total ?? 0))
}

/**
 * Projette une dette en tenant compte de ce qui a DÉJÀ été réglé sur le mois de départ.
 *
 * Le mois courant est **plafonné au reliquat** de sa mensualité, pas amputé : le solde restant
 * ne disparaît pas, il sort les mois suivants. C'est la différence entre corriger le biais et
 * en créer un autre — déduire bêtement du mois 0 faisait perdre une mensualité au total projeté.
 *
 *   solde 900, mensualité 100, mensualité du mois déjà réglée
 *   → mois 0 plafonné à 0, puis 100/mois → horizon 6 = 500 (et non 600)
 *
 *   solde 260, mensualité 100, 40 déjà réglés (paiement PARTIEL)
 *   → mois 0 = 60 (le reliquat), puis 100/mois → le solde entier reste projeté
 *
 * Ne s'applique qu'au mode `monthly` : une échéance `lump_sum` est un versement unique, pas une
 * capacité mensuelle, et `free` ne projette rien.
 *
 * Fonction PURE (solde et déjà-réglé injectés), conformément à D9.
 */
export function projectDebtFromCurrentMonth(
  input: DebtProjectionInput,
  startMonth: string,
  horizonMonths: number,
  alreadyRepaidCents: Cents,
): MonthlyOutflow[] {
  const monthly = input.monthlyAmountCents ?? 0
  if (input.repaymentMode !== 'monthly' || alreadyRepaidCents <= 0 || monthly <= 0) {
    return projectDebt(input, startMonth, horizonMonths)
  }
  if (horizonMonths <= 0) return []

  const balance = Math.max(0, input.currentBalanceCents)
  const firstMonthCap = Math.max(0, monthly - alreadyRepaidCents)
  const firstOutflow = Math.min(balance, firstMonthCap)

  const rest = projectDebt(
    { ...input, currentBalanceCents: cents(balance - firstOutflow) },
    nextMonths(startMonth, 2)[1]!,
    horizonMonths - 1,
  )
  return [{ month: startMonth, amountCents: cents(firstOutflow) }, ...rest]
}
