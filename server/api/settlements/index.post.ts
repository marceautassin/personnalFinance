import { defineEventHandler, setResponseStatus } from 'h3'
import { inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '~~/server/db/client'
import { settlementGroups, transactions } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { requireProfile } from '~~/server/utils/current-profile'
import { domainError } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

const NewSettlementSchema = z.object({
  label: z.string().trim().min(1).max(120),
  /** Lignes à réunir. Au moins deux : un groupe d'une seule ligne ne réconcilie rien. */
  transactionIds: z.array(z.number().int().positive()).min(2),
}).strict()

/**
 * POST /api/settlements — réunit des transactions qui se compensent (epic 19, story 19.1).
 *
 * Une ligne déjà membre d'un autre groupe est REFUSÉE plutôt que déplacée : une transaction
 * n'appartient qu'à une réconciliation, sans quoi la même avance pourrait être remboursée deux
 * fois et sortirait deux fois des agrégats.
 */
export default defineEventHandler(async (event) => {
  const body = await validateBody(event, NewSettlementSchema)
  const profileId = requireProfile(event)
  const ids = [...new Set(body.transactionIds)]

  const rows = db
    .select({ id: transactions.id, settlementGroupId: transactions.settlementGroupId })
    .from(transactions)
    .where(inArray(transactions.id, ids))
    .all()

  if (rows.length !== ids.length) {
    const found = new Set(rows.map(r => r.id))
    throw domainError(ApiErrorCode.NotFound, {
      resource: 'transaction',
      missing: ids.filter(id => !found.has(id)),
    }, 404)
  }

  const taken = rows.filter(r => r.settlementGroupId !== null).map(r => r.id)
  if (taken.length > 0) {
    throw domainError(ApiErrorCode.ValidationFailed, {
      reason: 'transactions_already_grouped',
      transactionIds: taken,
    }, 422)
  }

  const group = db.transaction((tx) => {
    const created = tx.insert(settlementGroups).values({ profileId, label: body.label }).returning().get()
    tx.update(transactions)
      .set({ settlementGroupId: created.id })
      .where(inArray(transactions.id, ids))
      .run()
    return created
  })

  setResponseStatus(event, 201)
  return group
})
