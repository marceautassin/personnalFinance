import { defineEventHandler, getRouterParam } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { transactions } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { assertCategoryExists } from '~~/server/utils/category-fk'
import { assertDebtExists } from '~~/server/utils/debt-fk'
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

  if (patch.categoryCode !== undefined) await assertCategoryExists(patch.categoryCode)

  const existingTx = existing[0]!
  const update: Partial<typeof transactions.$inferInsert> = {
    isManual: true,
  }
  if (patch.categoryCode !== undefined) update.categoryCode = patch.categoryCode

  // Marquage remboursement de dette (Story 6.3) : ne touche les colonnes dette QUE si le
  // patch les vise (`isDebtRepayment` et/ou `debtId`), pour ne pas parasiter un simple
  // changement de catégorie.
  const touchesDebt = patch.isDebtRepayment !== undefined || patch.debtId !== undefined
  if (touchesDebt) {
    const willRepay = patch.isDebtRepayment ?? existingTx.isDebtRepayment
    if (willRepay) {
      const debtId = patch.debtId !== undefined ? patch.debtId : existingTx.debtId
      if (debtId == null) {
        throw domainError(ApiErrorCode.ValidationFailed, { reason: 'debtId required to mark repayment' }, 422)
      }
      await assertDebtExists(debtId)
      // FR9 : seule une transaction SORTANTE (montant négatif) peut être un remboursement.
      if (existingTx.amountCents >= 0) {
        throw domainError(ApiErrorCode.ValidationFailed, { reason: 'only outgoing transactions can be a repayment' }, 422)
      }
      update.isDebtRepayment = true
      update.debtId = debtId
    }
    else {
      // Démarquage : délie la dette pour ne pas laisser de lien pendant.
      update.isDebtRepayment = false
      update.debtId = null
    }
  }

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
