import { defineEventHandler, getRouterParam } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { transactions } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { assertCategoryItemExists } from '~~/server/utils/category-fk'
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

  if (patch.categoryItemCode !== undefined) await assertCategoryItemExists(patch.categoryItemCode)
  const update: Partial<typeof transactions.$inferInsert> = {}
  // `isManual` signifie « catégorie saisie ou CORRIGÉE à la main ». Rattacher une transaction à
  // une dette n'est pas une correction de catégorisation : le flag n'est plus posé que lorsque
  // le patch touche effectivement la catégorie (story 6.8, revue du 2026-09-04).
  if (patch.categoryItemCode !== undefined) {
    update.categoryItemCode = patch.categoryItemCode
    update.isManual = true
  }

  await db.update(transactions).set(update).where(eq(transactions.id, id))

  const [updated] = await db
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
    .where(eq(transactions.id, id))
  return updated
})
