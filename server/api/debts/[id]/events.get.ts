import { defineEventHandler, getRouterParam } from 'h3'
import { asc, eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { debts, debtEvents } from '~~/server/db/schema'
import { domainError, notFound } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import type { DebtEvent } from '~~/shared/schemas/debt-event.schema'

/**
 * Historique des événements d'une dette (story 6.5). Il n'existait aucune surface de lecture :
 * une avance était insérable mais invisible, donc une saisie erronée était indétectable et
 * irréparable autrement qu'en tordant `initialBalanceCents` (revue du 2026-09-04, trou de FR31).
 *
 * Tri `event_date` ASC puis `id` ASC (ordre stable à date égale).
 */
export default defineEventHandler(async (event): Promise<DebtEvent[]> => {
  const idParam = getRouterParam(event, 'id')
  const debtId = Number(idParam)
  if (!Number.isInteger(debtId) || debtId <= 0) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'invalid id', value: idParam }, 422)
  }

  const debt = db.select({ id: debts.id }).from(debts).where(eq(debts.id, debtId)).limit(1).get()
  if (!debt) throw notFound(ApiErrorCode.NotFound, { resource: 'debt', id: debtId })

  return db
    .select()
    .from(debtEvents)
    .where(eq(debtEvents.debtId, debtId))
    .orderBy(asc(debtEvents.eventDate), asc(debtEvents.id))
    .all()
})
