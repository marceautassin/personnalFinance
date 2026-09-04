import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { debts, debtEvents } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { domainError, notFound } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { NewDebtEventSchema, type DebtEvent } from '~~/shared/schemas/debt-event.schema'

/**
 * Enregistre un événement SIGNÉ sur une dette (FR31, story 6.5). Remplace l'ancien
 * `advances.post.ts`, qui n'acceptait que des montants positifs.
 *
 * Le solde reste calculé à la lecture — aucune colonne de solde n'est mutée.
 * `id` non entier positif → 422 ; dette inexistante → 404 ; succès → 201.
 */
export default defineEventHandler(async (event): Promise<DebtEvent> => {
  const idParam = getRouterParam(event, 'id')
  const debtId = Number(idParam)
  if (!Number.isInteger(debtId) || debtId <= 0) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'invalid id', value: idParam }, 422)
  }

  const body = await validateBody(event, NewDebtEventSchema)

  const debt = db.select({ id: debts.id }).from(debts).where(eq(debts.id, debtId)).limit(1).get()
  if (!debt) throw notFound(ApiErrorCode.NotFound, { resource: 'debt', id: debtId })

  const created = db
    .insert(debtEvents)
    .values({
      debtId,
      amountCents: body.amountCents,
      eventDate: body.eventDate,
      kind: body.kind ?? (body.amountCents > 0 ? 'advance' : 'settlement'),
      note: body.note ?? null,
    })
    .returning()
    .get()

  setResponseStatus(event, 201)
  return created
})
