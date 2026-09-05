import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { classificationRules } from '~~/server/db/schema'
import { domainError, notFound } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

/**
 * Supprime une règle.
 *
 * Aucune transaction n'est reclassée en retour : les lignes déjà ingérées gardent leur poste.
 * C'est volontaire — une suppression de règle ne doit pas réécrire silencieusement des mois
 * déjà analysés. Pour revenir en arrière, on ré-ingère.
 */
export default defineEventHandler(async (event) => {
  const raw = getRouterParam(event, 'id') ?? ''
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'invalid id', value: raw }, 422)
  }

  const existing = db
    .select({ id: classificationRules.id })
    .from(classificationRules)
    .where(eq(classificationRules.id, id))
    .get()
  if (!existing) throw notFound(ApiErrorCode.NotFound, { resource: 'classification_rule', id })

  db.delete(classificationRules).where(eq(classificationRules.id, id)).run()
  setResponseStatus(event, 204)
  return null
})
