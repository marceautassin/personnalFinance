import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { settlementGroups, transactions } from '~~/server/db/schema'
import { domainError, notFound } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

/**
 * DELETE /api/settlements/:id — défait une réconciliation (epic 19, story 19.1).
 *
 * Aucune transaction n'est perdue : les lignes sont LIBÉRÉES explicitement, puis le groupe est
 * supprimé, dans la même transaction. Une transaction est un fait bancaire ; un groupe n'est
 * qu'une lecture qu'on en fait, et défaire la lecture ne défait pas le fait.
 *
 * ⚠️ La libération est faite ICI et non par une action `ON DELETE` : `ALTER TABLE` de SQLite ne
 * sait pas en porter, et la migration qui ajoute la colonne produit donc une contrainte nue.
 * Compter dessus levait « FOREIGN KEY constraint failed » (constaté le 2026-09-07).
 */
export default defineEventHandler((event) => {
  const raw = getRouterParam(event, 'id') ?? ''
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'invalid id', value: raw }, 422)
  }

  const existing = db
    .select({ id: settlementGroups.id })
    .from(settlementGroups)
    .where(eq(settlementGroups.id, id))
    .get()
  if (!existing) throw notFound(ApiErrorCode.NotFound, { resource: 'settlement_group', id })

  db.transaction((tx) => {
    tx.update(transactions)
      .set({ settlementGroupId: null })
      .where(eq(transactions.settlementGroupId, id))
      .run()
    tx.delete(settlementGroups).where(eq(settlementGroups.id, id)).run()
  })
  setResponseStatus(event, 204)
  return null
})
