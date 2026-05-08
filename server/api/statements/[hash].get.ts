/**
 * GET /api/statements/[hash] — détail d'un relevé ingéré (Story 3.1).
 *
 * Retourne les métadonnées du statement, ses transactions (extraites + manuelles)
 * triées par date asc, et la réconciliation recalculée à la volée (pas de cache,
 * pas de colonne dérivée — cf. CLAUDE.md §Invariants critiques).
 */
import { defineEventHandler, getRouterParam } from 'h3'
import { eq, asc } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { bankStatements, transactions } from '~~/server/db/schema'
import { reconcile } from '~~/server/services/reconciler'
import { domainError, notFound } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { cents } from '~~/shared/types/money'

const HASH_RE = /^[a-f0-9]{64}$/

export default defineEventHandler(async (event) => {
  const hash = getRouterParam(event, 'hash')
  if (!hash || !HASH_RE.test(hash)) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'invalid hash', value: hash ?? null }, 422)
  }

  const [statement] = await db
    .select()
    .from(bankStatements)
    .where(eq(bankStatements.hashSha256, hash))
    .limit(1)
  if (!statement) {
    throw notFound(ApiErrorCode.NotFound, { resource: 'bank_statement', hash })
  }

  const txRows = await db
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
    .where(eq(transactions.statementHash, hash))
    .orderBy(asc(transactions.transactionDate), asc(transactions.id))

  const reconciliation = reconcile({
    openingCents: cents(statement.openingBalanceCents),
    closingCents: cents(statement.closingBalanceCents),
    transactions: txRows.map(t => ({ amountCents: cents(t.amountCents) })),
  })

  return {
    hash: statement.hashSha256,
    periodStart: statement.periodStart,
    periodEnd: statement.periodEnd,
    openingBalanceCents: statement.openingBalanceCents,
    closingBalanceCents: statement.closingBalanceCents,
    reliability: statement.reliability,
    transactions: txRows,
    reconciliation,
  }
})
