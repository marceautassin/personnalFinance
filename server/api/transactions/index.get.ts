import { defineEventHandler } from 'h3'
import { sql, asc } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { transactions } from '~~/server/db/schema'
import { type StatementReliability, worstReliability } from '~~/shared/types/statement-reliability'
import { reliabilityOverlapping } from '~~/server/utils/statement-reliability'
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
      categoryItemCode: transactions.categoryItemCode,
      isManual: transactions.isManual,
    })
    .from(transactions)
    .where(sql`${transactions.transactionDate} LIKE ${`${month}-%`}`)
    .orderBy(asc(transactions.transactionDate), asc(transactions.id))

  // Fiabilité agrégée des relevés *qui couvrent la période demandée*, le pire état
  // l'emportant (D23) : un seul relevé bancal contamine tout le mois.
  const statements = await reliabilityOverlapping(`${month}-01`, `${month}-31`)

  const reliability: StatementReliability | null = statements.length > 0
    ? worstReliability(statements.map(s => s.reliability))
    : null

  return { transactions: rows, reliability }
})
