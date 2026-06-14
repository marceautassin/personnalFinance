import { defineEventHandler } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { revenueModels } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { RevenueModelPatchSchema } from '~~/shared/schemas/revenue-model.schema'

/**
 * Met à jour le singleton `revenue_models` (id=1). Body = patch partiel (au moins un
 * champ, cf. Dev Notes story 5.3) : seuls les champs fournis sont écrits, les autres
 * restent inchangés. `updated_at` régénéré à chaque mutation. Pas de 404 (seed garanti).
 */
export default defineEventHandler(async (event) => {
  const body = await validateBody(event, RevenueModelPatchSchema)

  const [updated] = await db
    .update(revenueModels)
    .set({ ...body, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(revenueModels.id, 1))
    .returning()
  return updated
})
