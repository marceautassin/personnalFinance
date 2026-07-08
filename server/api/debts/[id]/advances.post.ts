import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { debts, debtAdvances } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { domainError, notFound } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { NewDebtAdvanceSchema, type DebtAdvance } from '~~/shared/schemas/debt-advance.schema'

/**
 * Enregistre une avance reçue sur une dette (FR31, story 6.1). Incrémente le solde courant
 * de façon implicite (calcul à la lecture, pas de mutation de colonne solde).
 * `id` non entier positif → 422 ; dette inexistante → 404 ; succès → 201.
 */
export default defineEventHandler(async (event): Promise<DebtAdvance> => {
  const idParam = getRouterParam(event, 'id')
  const debtId = Number(idParam)
  if (!Number.isInteger(debtId) || debtId <= 0) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'invalid id', value: idParam }, 422)
  }

  const body = await validateBody(event, NewDebtAdvanceSchema)

  const debt = db.select({ id: debts.id }).from(debts).where(eq(debts.id, debtId)).limit(1).get()
  if (!debt) throw notFound(ApiErrorCode.NotFound, { resource: 'debt', id: debtId })

  const created = db
    .insert(debtAdvances)
    .values({
      debtId,
      amountCents: body.amountCents,
      advanceDate: body.advanceDate,
      note: body.note ?? null,
    })
    .returning()
    .get()

  setResponseStatus(event, 201)
  return created
})
