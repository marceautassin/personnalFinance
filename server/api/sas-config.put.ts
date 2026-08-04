import { defineEventHandler } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { sasConfig } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { domainError } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { SasConfigPatchSchema, type SasConfig } from '~~/shared/schemas/sas-config.schema'

/**
 * Met à jour le singleton `sas_config` (id=1). Body = patch partiel (au moins un champ,
 * cohérent revenue_models story 5.3) : seuls les champs fournis sont écrits. `updated_at`
 * régénéré. Échoue explicitement si la ligne seedée manque (cf. `sas-config.get.ts`) :
 * sans ça, `.returning()` vide produirait un 200 menteur et un `{ok: true}` côté client.
 */
export default defineEventHandler(async (event): Promise<SasConfig> => {
  const body = await validateBody(event, SasConfigPatchSchema)

  const [updated] = await db
    .update(sasConfig)
    .set({ ...body, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(sasConfig.id, 1))
    .returning()
  if (!updated) throw domainError(ApiErrorCode.SingletonMissing, { table: 'sas_config' }, 500)
  return updated as SasConfig
})
