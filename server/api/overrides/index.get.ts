import { defineEventHandler } from 'h3'
import { asc, eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { monthlyOverrides } from '~~/server/db/schema'
import { validateQuery } from '~~/server/utils/validation'
import { OverrideListQuerySchema, type MonthlyOverride } from '~~/shared/schemas/monthly-override.schema'

/**
 * Liste les overrides mensuels (story 7.2), triés `month` puis `category_code`.
 * Query optionnelle `?month=YYYY-MM` filtre sur un mois.
 */
export default defineEventHandler(async (event): Promise<MonthlyOverride[]> => {
  const { month } = validateQuery(event, OverrideListQuerySchema)

  const base = db.select().from(monthlyOverrides)
  const rows = month
    ? await base.where(eq(monthlyOverrides.month, month)).orderBy(asc(monthlyOverrides.categoryCode))
    : await base.orderBy(asc(monthlyOverrides.month), asc(monthlyOverrides.categoryCode))
  return rows
})
