import { defineEventHandler, getRouterParam } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { transactions, categoryDefinitions } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { domainError, notFound } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { TransactionPatchSchema } from '~~/shared/schemas/transaction.schema'

export default defineEventHandler(async (event) => {
  const idParam = getRouterParam(event, 'id')
  const id = Number(idParam)
  if (!Number.isFinite(id) || id <= 0 || !Number.isInteger(id)) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'invalid id', value: idParam }, 422)
  }

  const patch = await validateBody(event, TransactionPatchSchema)

  const existing = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id))
    .limit(1)
  if (existing.length === 0) {
    throw notFound(ApiErrorCode.NotFound, { resource: 'transaction', id })
  }

  if (patch.categoryCode !== undefined) {
    const cat = await db
      .select({ code: categoryDefinitions.code })
      .from(categoryDefinitions)
      .where(eq(categoryDefinitions.code, patch.categoryCode))
      .limit(1)
    if (cat.length === 0) {
      throw domainError(
        ApiErrorCode.ValidationFailed,
        { reason: 'unknown categoryCode', value: patch.categoryCode },
        422,
      )
    }
  }

  const update: Partial<typeof transactions.$inferInsert> = {
    isManual: true,
  }
  if (patch.categoryCode !== undefined) update.categoryCode = patch.categoryCode
  if (patch.isDebtRepayment !== undefined) update.isDebtRepayment = patch.isDebtRepayment
  if (patch.debtId !== undefined) update.debtId = patch.debtId

  await db.update(transactions).set(update).where(eq(transactions.id, id))

  const [updated] = await db
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
    .where(eq(transactions.id, id))
  return updated
})
