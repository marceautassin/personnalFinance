import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { debts, transactions } from '~~/server/db/schema'
import { domainError, notFound } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

/**
 * Supprime une dette (story 6.1). Les `debt_advances` liées partent en cascade (FK).
 * `id` non entier positif → 422 ; `id` inexistant → 404 ; succès → 204.
 *
 * NOTE : `transactions.debt_id` est sans FK (choix V1). Une transaction PEUT déjà être
 * rattachée à une dette (marquage remboursement via PATCH /api/transactions/[id]), donc on
 * DÉLIE explicitement les transactions concernées (debt_id → null, is_debt_repayment → false)
 * pour ne pas laisser de référence pendante ni de remboursement fantôme dans les calculs.
 */
export default defineEventHandler(async (event): Promise<null> => {
  const idParam = getRouterParam(event, 'id')
  const id = Number(idParam)
  if (!Number.isInteger(id) || id <= 0) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'invalid id', value: idParam }, 422)
  }

  const existing = db.select({ id: debts.id }).from(debts).where(eq(debts.id, id)).limit(1).get()
  if (!existing) throw notFound(ApiErrorCode.NotFound, { resource: 'debt', id })

  db.update(transactions)
    .set({ debtId: null, isDebtRepayment: false })
    .where(eq(transactions.debtId, id))
    .run()
  db.delete(debts).where(eq(debts.id, id)).run()
  setResponseStatus(event, 204)
  return null
})
