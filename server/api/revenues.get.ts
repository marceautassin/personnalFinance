import { defineEventHandler } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { revenueModels } from '~~/server/db/schema'

/**
 * Retourne le singleton `revenue_models` (id=1). Toujours présent grâce au seed
 * bootstrap (story 5.3) — pas de 404 possible.
 */
export default defineEventHandler(async () => {
  const [model] = await db
    .select()
    .from(revenueModels)
    .where(eq(revenueModels.id, 1))
    .limit(1)
  return model
})
