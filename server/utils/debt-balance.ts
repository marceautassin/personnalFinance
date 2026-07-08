import { eq, sql } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { debtAdvances, transactions } from '~~/server/db/schema'

/**
 * Source UNIQUE du solde courant d'une dette (FR31-FR32) :
 *   currentBalanceCents = initial + Σavances − Σ|remboursements|
 * Le solde n'est jamais stocké (invariant CLAUDE.md « aucun état dérivé en base »).
 * Le filtre « transaction = remboursement » vit ici et nulle part ailleurs : quand la
 * story 6.3 l'affinera, un seul endroit change (évite la divergence liste ↔ détail).
 */
export function toCurrentBalance(
  initialBalanceCents: number,
  advancesCents: number,
  repaymentsCents: number,
): number {
  return initialBalanceCents + advancesCents - repaymentsCents
}

/** Solde courant d'UNE dette (2 requêtes agrégées). */
export function currentBalanceForDebt(debtId: number, initialBalanceCents: number): number {
  const adv = db
    .select({ total: sql<number>`coalesce(sum(${debtAdvances.amountCents}), 0)` })
    .from(debtAdvances)
    .where(eq(debtAdvances.debtId, debtId))
    .get()
  const rep = db
    .select({ total: sql<number>`coalesce(sum(abs(${transactions.amountCents})), 0)` })
    .from(transactions)
    .where(sql`${transactions.debtId} = ${debtId} AND ${transactions.isDebtRepayment} = 1`)
    .get()
  return toCurrentBalance(initialBalanceCents, Number(adv?.total ?? 0), Number(rep?.total ?? 0))
}

/**
 * Maps `debtId → Σavances` et `debtId → Σ|remboursements|` pour un calcul en lot (liste) :
 * 2 scans agrégés au lieu de 2 requêtes par dette.
 */
export function balanceSumsByDebt(): { advances: Map<number, number>, repayments: Map<number, number> } {
  const advRows = db
    .select({ debtId: debtAdvances.debtId, total: sql<number>`sum(${debtAdvances.amountCents})` })
    .from(debtAdvances)
    .groupBy(debtAdvances.debtId)
    .all()
  const repRows = db
    .select({ debtId: transactions.debtId, total: sql<number>`sum(abs(${transactions.amountCents}))` })
    .from(transactions)
    .where(sql`${transactions.isDebtRepayment} = 1 AND ${transactions.debtId} IS NOT NULL`)
    .groupBy(transactions.debtId)
    .all()
  return {
    advances: new Map(advRows.map(r => [r.debtId, Number(r.total)])),
    repayments: new Map(repRows.filter(r => r.debtId != null).map(r => [Number(r.debtId), Number(r.total)])),
  }
}
