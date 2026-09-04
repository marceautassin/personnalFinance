import { eq, sql } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { debtEvents, transactions } from '~~/server/db/schema'
import { cents, type Cents } from '~~/shared/types/money'

/**
 * Source UNIQUE du solde courant d'une dette (FR31-FR32, FR68) :
 *   currentBalanceCents = initial + Σ(événements signés) − Σ|remboursements marqués|
 *
 * Le solde n'est jamais stocké (invariant CLAUDE.md « aucun état dérivé en base »).
 *
 * **Le résultat peut être négatif** — c'est une créance (on me doit de l'argent), pas une
 * anomalie. Les événements du ledger sont signés depuis la story 6.5 (D16) : un règlement
 * reçu est un événement négatif, et le solde bascule naturellement de dette en créance.
 *
 * Les transactions rattachées sont sommées en montant **SIGNÉ**, pas en valeur absolue.
 *
 * ⚠️ Ne pas revenir à `abs()`. Le calcul soustrayait `Σ|montant|`, en s'appuyant sur une règle
 * — « seule une transaction SORTANTE peut être rattachée » — que la story 6.5 a supprimée. Un
 * encaissement de 200 € rattaché à une créance la CREUSAIT de 200 € au lieu de la résorber :
 *
 *     créance -50 000, encaissement rattaché +20 000  →  -70 000  au lieu de  -30 000
 *
 * En signé, une sortie (montant négatif) diminue le dû exactement comme avant — aucun
 * changement pour l'existant — et une entrée le rapproche de zéro, ce qui est le cas d'usage
 * même de FR66-FR68 (revue du 2026-09-04).
 *
 * Typage `Cents` sur toutes les signatures : elles étaient en `number` nu, exactement au point
 * le plus sensible du modèle monétaire (écart CLAUDE.md relevé à la revue du 2026-09-04).
 */
export function toCurrentBalance(
  initialBalanceCents: Cents,
  eventsCents: Cents,
  attachedTransactionsCents: Cents,
): Cents {
  return cents(initialBalanceCents + eventsCents + attachedTransactionsCents)
}

/** Solde courant d'UNE dette (2 requêtes agrégées). */
export function currentBalanceForDebt(debtId: number, initialBalanceCents: Cents): Cents {
  const ev = db
    .select({ total: sql<number>`coalesce(sum(${debtEvents.amountCents}), 0)` })
    .from(debtEvents)
    .where(eq(debtEvents.debtId, debtId))
    .get()
  const attached = db
    .select({ total: sql<number>`coalesce(sum(${transactions.amountCents}), 0)` })
    .from(transactions)
    .where(sql`${transactions.debtId} = ${debtId} AND ${transactions.isDebtRepayment} = 1`)
    .get()
  return toCurrentBalance(
    initialBalanceCents,
    cents(Number(ev?.total ?? 0)),
    cents(Number(attached?.total ?? 0)),
  )
}

/**
 * Maps `debtId → Σévénements signés` et `debtId → Σmontants signés des transactions rattachées`
 * pour un calcul en lot
 * (liste) : 2 scans agrégés au lieu de 2 requêtes par dette.
 */
export function balanceSumsByDebt(): { events: Map<number, Cents>, attached: Map<number, Cents> } {
  const evRows = db
    .select({ debtId: debtEvents.debtId, total: sql<number>`sum(${debtEvents.amountCents})` })
    .from(debtEvents)
    .groupBy(debtEvents.debtId)
    .all()
  const attachedRows = db
    .select({ debtId: transactions.debtId, total: sql<number>`sum(${transactions.amountCents})` })
    .from(transactions)
    .where(sql`${transactions.isDebtRepayment} = 1 AND ${transactions.debtId} IS NOT NULL`)
    .groupBy(transactions.debtId)
    .all()
  return {
    events: new Map(evRows.map(r => [r.debtId, cents(Number(r.total))])),
    attached: new Map(
      attachedRows.filter(r => r.debtId != null).map(r => [Number(r.debtId), cents(Number(r.total))]),
    ),
  }
}

/**
 * Nombre de transactions rattachées à une dette (story 6.7). Sert à AVERTIR avant suppression :
 * supprimer une dette délie ses transactions (SET NULL, arbitrage du 2026-09-04), et le
 * dialogue disait seulement « Cette action est définitive » — 18 remboursements marqués sur
 * 12 mois pouvaient disparaître sans undo ni annonce (revue du 2026-09-04).
 */
export function linkedTransactionCountsByDebt(): Map<number, number> {
  const rows = db
    .select({ debtId: transactions.debtId, n: sql<number>`count(*)` })
    .from(transactions)
    .where(sql`${transactions.debtId} IS NOT NULL`)
    .groupBy(transactions.debtId)
    .all()
  return new Map(rows.filter(r => r.debtId != null).map(r => [Number(r.debtId), Number(r.n)]))
}

/** Compteur ciblé pour UNE dette — évite un `GROUP BY` sur toute la table pour une valeur. */
export function linkedTransactionCountForDebt(debtId: number): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(transactions)
    .where(eq(transactions.debtId, debtId))
    .get()
  return Number(row?.n ?? 0)
}
