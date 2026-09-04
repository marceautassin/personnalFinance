/**
 * GET /api/statements — liste des relevés ingérés, avec leur fiabilité et leur taux de
 * correction manuelle (FR8, FR24).
 *
 * Triés par `period_start` DESC. Liste vide si aucun relevé (jamais 404).
 *
 * **Le taux de correction est le chiffre du jalon de décision du MVP** : au-delà de 10 % de
 * lignes reprises à la main, la corvée que le produit devait supprimer est de retour. Il se
 * calcule sans ajout de schéma — `transactions.is_manual` signifie déjà « catégorie corrigée
 * à la main », et le correctif du 2026-09-04 (poser le drapeau uniquement quand le patch
 * touche la catégorie) l'a rendu fiable pour cet usage.
 */
import { defineEventHandler } from 'h3'
import { sql, desc } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { bankStatements, transactions } from '~~/server/db/schema'
import { ratio, type Ratio } from '~~/shared/types/ratio'

export interface StatementListItem {
  hash: string
  periodStart: string
  periodEnd: string
  reliability: string
  ingestedAt: number
  transactionCount: number
  manualCount: number
  /** `null` sur un relevé sans transaction : le taux n'est pas défini, il n'est pas nul. */
  correctionRate: Ratio | null
}

export default defineEventHandler(async (): Promise<{ statements: StatementListItem[] }> => {
  const countFor = (condition: ReturnType<typeof sql> | null) => sql<number>`(
    SELECT COUNT(*) FROM ${transactions}
    WHERE ${transactions.statementHash} = ${bankStatements.hashSha256}
    ${condition ?? sql``}
  )`

  const rows = await db
    .select({
      hash: bankStatements.hashSha256,
      periodStart: bankStatements.periodStart,
      periodEnd: bankStatements.periodEnd,
      reliability: bankStatements.reliability,
      ingestedAt: bankStatements.ingestedAt,
      transactionCount: countFor(null),
      manualCount: countFor(sql`AND ${transactions.isManual} = 1`),
    })
    .from(bankStatements)
    .orderBy(desc(bankStatements.periodStart))

  return {
    statements: rows.map(r => ({
      ...r,
      transactionCount: Number(r.transactionCount),
      manualCount: Number(r.manualCount),
      correctionRate: ratio(Number(r.manualCount), Number(r.transactionCount)),
    })),
  }
})
