import { defineEventHandler } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { taxSettings } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { TaxSettingsPatchSchema } from '~~/shared/schemas/tax-settings.schema'

/**
 * Met à jour le singleton `tax_settings` (id=1). Body = patch partiel (au moins un champ,
 * cohérent sas_config story 5.4) : seuls les champs fournis sont écrits. `updated_at`
 * régénéré. Pas de 404 (seed garanti).
 */
export default defineEventHandler(async (event) => {
  const body = await validateBody(event, TaxSettingsPatchSchema)

  const [updated] = await db
    .update(taxSettings)
    .set({ ...body, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(taxSettings.id, 1))
    .returning()
  return updated
})
