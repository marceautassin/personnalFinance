/**
 * GET /api/statements — liste de tous les relevés ingérés (Story 3.3).
 *
 * Triés par period_start DESC. Pour chaque statement, count agrégé des transactions.
 * Liste vide si aucun statement (jamais 404).
 */
import { defineEventHandler } from 'h3'
import { sql, desc } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { bankStatements, transactions } from '~~/server/db/schema'

export default defineEventHandler(async () => {
  const rows = await db
    .select({
      hash: bankStatements.hashSha256,
      periodStart: bankStatements.periodStart,
      periodEnd: bankStatements.periodEnd,
      reliability: bankStatements.reliability,
      ingestedAt: bankStatements.ingestedAt,
      transactionCount: sql<number>`(SELECT COUNT(*) FROM ${transactions} WHERE ${transactions.statementHash} = ${bankStatements.hashSha256})`,
    })
    .from(bankStatements)
    .orderBy(desc(bankStatements.periodStart))

  return { statements: rows }
})
