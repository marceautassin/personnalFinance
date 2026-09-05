import { defineEventHandler } from 'h3'
import { asc, and, eq, gte, lte } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { transactions } from '~~/server/db/schema'
import { type StatementReliability, worstReliability } from '~~/shared/types/statement-reliability'
import { reliabilityOverlapping } from '~~/server/utils/statement-reliability'
import { validateQuery } from '~~/server/utils/validation'
import { TransactionListQuerySchema } from '~~/shared/schemas/transaction.schema'

export default defineEventHandler(async (event) => {
  const query = validateQuery(event, TransactionListQuerySchema)

  // Deux formes de requête, une seule lecture : la vue mensuelle et la descente depuis un
  // agrégat lisent la même table, avec le même tri.
  const [from, to] = 'month' in query
    // LIKE 'YYYY-MM-%' utilise l'index transactions_period_idx (text comparable en préfixe) ;
    // les bornes ci-dessous sont équivalentes et couvrent tous les jours du mois.
    ? [`${query.month}-01`, `${query.month}-31`]
    : [query.from, query.to]
  const itemFilter = 'month' in query ? undefined : query.item

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
    .where(and(
      gte(transactions.transactionDate, from),
      lte(transactions.transactionDate, to),
      itemFilter ? eq(transactions.categoryItemCode, itemFilter) : undefined,
    ))
    .orderBy(asc(transactions.transactionDate), asc(transactions.id))

  // Fiabilité agrégée des relevés *qui couvrent la période demandée*, le pire état
  // l'emportant (D23) : un seul relevé bancal contamine tout le mois.
  const statements = await reliabilityOverlapping(from, to)

  const reliability: StatementReliability | null = statements.length > 0
    ? worstReliability(statements.map(s => s.reliability))
    : null

  return { transactions: rows, reliability }
})
