import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { monthlyOverrides } from '~~/server/db/schema'
import { domainError, notFound } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

/**
 * Supprime un override mensuel (story 7.2) — la catégorie revient à sa projection.
 * `id` non entier positif → 422 ; `id` inexistant → 404 ; succès → 204.
 */
export default defineEventHandler(async (event): Promise<null> => {
  const idParam = getRouterParam(event, 'id')
  const id = Number(idParam)
  if (!Number.isInteger(id) || id <= 0) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'invalid id', value: idParam }, 422)
  }

  const existing = db.select({ id: monthlyOverrides.id }).from(monthlyOverrides).where(eq(monthlyOverrides.id, id)).limit(1).get()
  if (!existing) throw notFound(ApiErrorCode.NotFound, { resource: 'monthly_override', id })

  db.delete(monthlyOverrides).where(eq(monthlyOverrides.id, id)).run()
  setResponseStatus(event, 204)
  return null
})
