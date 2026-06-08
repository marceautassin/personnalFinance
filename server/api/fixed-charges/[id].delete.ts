import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { fixedCharges } from '~~/server/db/schema'
import { domainError, notFound } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

/**
 * Supprime une charge fixe → 204. 404 si `id` inexistant. Pas de soft-delete en V1.
 */
export default defineEventHandler(async (event) => {
  const idParam = getRouterParam(event, 'id')
  const id = Number(idParam)
  if (!Number.isFinite(id) || id <= 0 || !Number.isInteger(id)) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'invalid id', value: idParam }, 422)
  }

  const deleted = await db
    .delete(fixedCharges)
    .where(eq(fixedCharges.id, id))
    .returning({ id: fixedCharges.id })
  if (deleted.length === 0) {
    throw notFound(ApiErrorCode.NotFound, { resource: 'fixed_charge', id })
  }

  setResponseStatus(event, 204)
  return null
})
