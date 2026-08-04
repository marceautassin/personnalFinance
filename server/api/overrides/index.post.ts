import { defineEventHandler, setResponseStatus } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { monthlyOverrides, categoryDefinitions } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { domainError } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { NewMonthlyOverrideSchema, type MonthlyOverride } from '~~/shared/schemas/monthly-override.schema'

/**
 * Crée ou remplace (upsert sur `month × category_code`) un override mensuel (FR44, story 7.2).
 * La catégorie doit exister ET être VARIABLE (un override remplace la projection, qui n'existe
 * que pour les catégories variables) → 422 sinon. Retour 201.
 */
export default defineEventHandler(async (event): Promise<MonthlyOverride> => {
  const body = await validateBody(event, NewMonthlyOverrideSchema)

  const cat = db
    .select({ isVariable: categoryDefinitions.isVariable })
    .from(categoryDefinitions)
    .where(eq(categoryDefinitions.code, body.categoryCode))
    .get()
  if (!cat) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'unknown categoryCode', value: body.categoryCode }, 422)
  }
  if (!cat.isVariable) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'override only applies to variable categories', value: body.categoryCode }, 422)
  }

  const saved = db
    .insert(monthlyOverrides)
    .values({ month: body.month, categoryCode: body.categoryCode, amountCents: body.amountCents })
    .onConflictDoUpdate({
      target: [monthlyOverrides.month, monthlyOverrides.categoryCode],
      set: { amountCents: body.amountCents },
    })
    .returning()
    .get()

  setResponseStatus(event, 201)
  return saved
})
