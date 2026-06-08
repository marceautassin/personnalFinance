import { defineEventHandler, getRouterParam } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { fixedCharges } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { assertCategoryExists } from '~~/server/utils/category-fk'
import { domainError, notFound } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { FixedChargePutSchema } from '~~/shared/schemas/fixed-charge.schema'

/**
 * Remplace une charge fixe (sémantique PUT : replace complet, `id`/`createdAt` immuables).
 * 404 si `id` inexistant, FK pre-check + refine endDate identiques à POST.
 */
export default defineEventHandler(async (event) => {
  const idParam = getRouterParam(event, 'id')
  const id = Number(idParam)
  if (!Number.isFinite(id) || id <= 0 || !Number.isInteger(id)) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'invalid id', value: idParam }, 422)
  }

  const body = await validateBody(event, FixedChargePutSchema)

  const existing = await db
    .select({ id: fixedCharges.id })
    .from(fixedCharges)
    .where(eq(fixedCharges.id, id))
    .limit(1)
  if (existing.length === 0) {
    throw notFound(ApiErrorCode.NotFound, { resource: 'fixed_charge', id })
  }

  await assertCategoryExists(body.categoryCode)

  const [updated] = await db
    .update(fixedCharges)
    .set({
      label: body.label,
      amountCents: body.amountCents,
      categoryCode: body.categoryCode,
      frequency: body.frequency,
      startDate: body.startDate,
      endDate: body.endDate ?? null,
    })
    .where(eq(fixedCharges.id, id))
    .returning()
  return updated
})
