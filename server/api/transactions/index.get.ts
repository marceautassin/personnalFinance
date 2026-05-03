import { defineEventHandler } from 'h3'
import { sql, asc, and, lte, gte } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { transactions, bankStatements, type ReliabilityValue } from '~~/server/db/schema'
import { validateQuery } from '~~/server/utils/validation'
import { TransactionListQuerySchema } from '~~/shared/schemas/transaction.schema'

export default defineEventHandler(async (event) => {
  const { month } = validateQuery(event, TransactionListQuerySchema)

  // LIKE 'YYYY-MM-%' utilise l'index transactions_period_idx (text comparable préfixe).
  const rows = await db
    .select({
      id: transactions.id,
      statementHash: transactions.statementHash,
      transactionDate: transactions.transactionDate,
      label: transactions.label,
      amountCents: transactions.amountCents,
      categoryCode: transactions.categoryCode,
      isManual: transactions.isManual,
      isDebtRepayment: transactions.isDebtRepayment,
      debtId: transactions.debtId,
    })
    .from(transactions)
    .where(sql`${transactions.transactionDate} LIKE ${`${month}-%`}`)
    .orderBy(asc(transactions.transactionDate), asc(transactions.id))

  // Reliability agrégée des statements *qui couvrent la période demandée* (recouvrement
  // d'intervalles de dates ISO), indépendamment du nombre de transactions extraites.
  // Couvre le cas du statement unreliable avec 0 transaction parsée.
  const monthStart = `${month}-01`
  const monthEnd = `${month}-31`
  const statements = await db
    .select({ reliability: bankStatements.reliability })
    .from(bankStatements)
    .where(and(lte(bankStatements.periodStart, monthEnd), gte(bankStatements.periodEnd, monthStart)))

  let reliability: ReliabilityValue | null = null
  if (statements.length > 0) {
    reliability = statements.some(s => s.reliability === 'unreliable') ? 'unreliable' : 'reliable'
  }

  return { transactions: rows, reliability }
})
