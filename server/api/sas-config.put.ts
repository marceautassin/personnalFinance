import { defineEventHandler } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { sasConfig } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { SasConfigPatchSchema } from '~~/shared/schemas/sas-config.schema'

/**
 * Met à jour le singleton `sas_config` (id=1). Body = patch partiel (au moins un champ,
 * cohérent revenue_models story 5.3) : seuls les champs fournis sont écrits. `updated_at`
 * régénéré. Pas de 404 (seed garanti).
 */
export default defineEventHandler(async (event) => {
  const body = await validateBody(event, SasConfigPatchSchema)

  const [updated] = await db
    .update(sasConfig)
    .set({ ...body, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(sasConfig.id, 1))
    .returning()
  return updated
})
