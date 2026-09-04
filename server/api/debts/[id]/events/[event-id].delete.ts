import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { and, eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { debtEvents } from '~~/server/db/schema'
import { domainError, notFound } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

/**
 * Supprime un événement de dette (story 6.5). Une saisie erronée — 250 000 au lieu de 25 000 —
 * faussait le solde définitivement : le seul contournement était de tordre `initialBalanceCents`
 * via le PUT, ce qui détruisait la traçabilité (revue du 2026-09-04).
 *
 * L'événement doit appartenir à la dette de l'URL, sinon 404 : on ne supprime pas l'événement
 * d'une autre dette par un identifiant deviné.
 */
export default defineEventHandler(async (event): Promise<null> => {
  const debtId = Number(getRouterParam(event, 'id'))
  // Paramètre en kebab-case : le nom du fichier de route porte le nom du paramètre, et le
  // lint du projet impose des noms de fichiers en kebab-case (`unicorn/filename-case`).
  const eventId = Number(getRouterParam(event, 'event-id'))
  if (!Number.isInteger(debtId) || debtId <= 0 || !Number.isInteger(eventId) || eventId <= 0) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'invalid id', debtId, eventId }, 422)
  }

  const deleted = db
    .delete(debtEvents)
    .where(and(eq(debtEvents.id, eventId), eq(debtEvents.debtId, debtId)))
    .returning({ id: debtEvents.id })
    .get()
  if (!deleted) throw notFound(ApiErrorCode.NotFound, { resource: 'debt_event', id: eventId })

  setResponseStatus(event, 204)
  return null
})
