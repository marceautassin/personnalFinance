import { defineEventHandler } from 'h3'
import { and, gte, lte, eq, asc } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { transactions, categoryItems, categoryGroups, bankStatements } from '~~/server/db/schema'
import { validateQuery } from '~~/server/utils/validation'
import { AnalysisQuerySchema } from '~~/shared/schemas/analysis.schema'
import { analyze, type AnalysisItemRef, type AnalysisResult } from '~~/server/services/analysis-engine'
import { bucketOf, shiftBucket, bucketBounds } from '~~/shared/types/granularity'
import { reliabilityOverlapping } from '~~/server/utils/statement-reliability'
import { worstReliability, type StatementReliability } from '~~/shared/types/statement-reliability'
import type { Cents } from '~~/shared/types/money'

/**
 * GET /api/analysis — l'arbre d'agrégats et les indicateurs d'une période (D19).
 *
 * Couche MINCE : elle va chercher les lignes et appelle le moteur. Tout le calcul vit dans
 * `analysis-engine.ts`, qui ne touche jamais la base — c'est ce qui rend les cas limites de
 * NFR3 testables sans SQLite.
 *
 * **La réponse ne transporte aucune transaction** (AR8). NFR2 exige que le chemin vers les
 * lignes sources EXISTE, pas qu'il soit précalculé : `itemCode` plus les bornes suffisent à
 * appeler `/api/transactions`. Renvoyer 2 400 lignes à chaque changement de période serait un
 * gaspillage sans bénéfice.
 */
export interface AnalysisResponse extends AnalysisResult {
  from: string
  to: string
  /** Fiabilité au niveau PÉRIODE, pas au niveau nœud (D23) : un relevé bancal contamine tout le mois. */
  reliability: StatementReliability
  unreliableStatements: Array<{ hash: string, periodStart: string, periodEnd: string, gapCents: number }>
  /**
   * Solde bancaire encadrant la période. `null` si les relevés ne la couvrent pas de façon
   * contiguë : un trou dans l'historique rend le solde indéterminé, et l'afficher serait faux.
   *
   * Il coexiste avec le résultat sans s'y substituer : le solde inclut les mouvements
   * internes, le résultat les exclut (NFR4). Deux chiffres, deux questions.
   */
  bankBalance: { openingCents: Cents, closingCents: Cents } | null
}

export default defineEventHandler(async (event): Promise<AnalysisResponse> => {
  const { from, to, granularity } = await validateQuery(event, AnalysisQuerySchema)

  const referential: AnalysisItemRef[] = await db
    .select({
      code: categoryItems.code,
      label: categoryItems.label,
      nature: categoryItems.nature,
      groupCode: categoryGroups.code,
      groupLabel: categoryGroups.label,
    })
    .from(categoryItems)
    .innerJoin(categoryGroups, eq(categoryItems.groupCode, categoryGroups.code))
    .orderBy(asc(categoryGroups.position), asc(categoryItems.position))

  const rowsIn = (start: string, end: string) => db
    .select({
      transactionDate: transactions.transactionDate,
      amountCents: transactions.amountCents,
      categoryItemCode: transactions.categoryItemCode,
    })
    .from(transactions)
    .where(and(gte(transactions.transactionDate, start), lte(transactions.transactionDate, end)))

  // Période précédente : la tranche calendaire d'avant, déduite de la borne de début. Un
  // décalage en jours donnerait une fenêtre à cheval que personne ne reconnaîtrait comme
  // « le mois d'avant » (D24).
  const previousBounds = bucketBounds(shiftBucket(bucketOf(from, granularity), granularity, -1), granularity)

  const [current, previous] = await Promise.all([
    rowsIn(from, to),
    rowsIn(previousBounds.from, previousBounds.to),
  ])

  const result = analyze({
    transactions: current,
    previousTransactions: previous,
    referential,
    granularity,
  })

  const statements = await reliabilityOverlapping(from, to)
  const unreliableStatements = statements
    .filter(s => s.reliability !== 'reliable')
    .map(s => ({ hash: s.hash, periodStart: s.periodStart, periodEnd: s.periodEnd, gapCents: s.gapCents }))

  return {
    ...result,
    from,
    to,
    reliability: worstReliability(statements.map(s => s.reliability)),
    unreliableStatements,
    bankBalance: await bankBalanceFor(from, to),
  }
})

/**
 * Solde d'ouverture et de clôture encadrant la période.
 *
 * Rend `null` dès que les relevés ne couvrent pas la période de bout en bout sans trou : le
 * solde de clôture d'un mois n'a de sens que si l'on connaît tout ce qui l'a précédé dans la
 * fenêtre. Mieux vaut ne rien afficher qu'un chiffre qu'on croirait exact (D25).
 */
async function bankBalanceFor(from: string, to: string) {
  const covering = await db
    .select({
      periodStart: bankStatements.periodStart,
      periodEnd: bankStatements.periodEnd,
      openingBalanceCents: bankStatements.openingBalanceCents,
      closingBalanceCents: bankStatements.closingBalanceCents,
    })
    .from(bankStatements)
    .where(and(lte(bankStatements.periodStart, to), gte(bankStatements.periodEnd, from)))
    .orderBy(asc(bankStatements.periodStart))

  if (covering.length === 0) return null

  const first = covering[0]!
  const last = covering.at(-1)!
  if (first.periodStart > from || last.periodEnd < to) return null

  // Contiguïté : chaque relevé doit reprendre là où le précédent s'est arrêté, au jour près.
  for (let i = 1; i < covering.length; i++) {
    if (nextDay(covering[i - 1]!.periodEnd) !== covering[i]!.periodStart) return null
  }

  return {
    openingCents: first.openingBalanceCents as Cents,
    closingCents: last.closingBalanceCents as Cents,
  }
}

/** Lendemain d'une date ISO, en UTC pour éviter tout décalage de fuseau. */
function nextDay(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
