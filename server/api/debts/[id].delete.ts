import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { debts, transactions } from '~~/server/db/schema'
import { domainError, notFound } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

/**
 * Supprime une dette (story 6.1). Les `debt_events` liés partent en cascade (FK).
 * `id` non entier positif → 422 ; `id` inexistant → 404 ; succès → 204.
 *
 * Le déliage des transactions rattachées (debt_id → null, is_debt_repayment → false) et la
 * suppression sont dans UNE MÊME TRANSACTION SQL (story 6.7) : c'étaient deux ordres séparés,
 * et une interruption entre les deux laissait des transactions déliées avec la dette vivante.
 *
 * Le déliage reste explicite malgré la FK `ON DELETE SET NULL` ajoutée en 6.7 : la FK remet
 * `debt_id` à NULL mais ne touche pas `is_debt_repayment`, ce que la contrainte
 * `transactions_debt_coherence_check` refuserait. Les deux colonnes doivent bouger ensemble.
 *
 * L'utilisateur est averti du nombre exact de transactions concernées AVANT d'arriver ici :
 * `GET /api/debts` expose `linkedTransactionCount` (arbitrage du 2026-09-04 — SET NULL avec
 * avertissement chiffré, plutôt qu'un refus en 409 qui bloquerait une suppression légitime
 * après solde).
 */
export default defineEventHandler(async (event): Promise<null> => {
  const idParam = getRouterParam(event, 'id')
  const id = Number(idParam)
  if (!Number.isInteger(id) || id <= 0) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'invalid id', value: idParam }, 422)
  }

  const existing = db.select({ id: debts.id }).from(debts).where(eq(debts.id, id)).limit(1).get()
  if (!existing) throw notFound(ApiErrorCode.NotFound, { resource: 'debt', id })

  db.transaction((tx) => {
    tx.update(transactions)
      .set({ debtId: null, isDebtRepayment: false })
      .where(eq(transactions.debtId, id))
      .run()
    tx.delete(debts).where(eq(debts.id, id)).run()
  })
  setResponseStatus(event, 204)
  return null
})
