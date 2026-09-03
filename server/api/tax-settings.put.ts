import { defineEventHandler } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { taxSettings } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { domainError } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { TaxSettingsPatchSchema, type TaxSettings } from '~~/shared/schemas/tax-settings.schema'

/**
 * Met à jour le singleton `tax_settings` (id=1). Body = patch partiel (au moins un champ,
 * cohérent sas_config story 5.4) : seuls les champs fournis sont écrits. `updated_at`
 * régénéré. Échoue explicitement si la ligne seedée manque : un `.returning()` vide
 * produisait un 200 menteur et un `{ok: true}` côté client (revue 2026-08-04).
 */
export default defineEventHandler(async (event): Promise<TaxSettings> => {
  const body = await validateBody(event, TaxSettingsPatchSchema)

  const [updated] = await db
    .update(taxSettings)
    .set({ ...body, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(taxSettings.id, 1))
    .returning()
  if (!updated) throw domainError(ApiErrorCode.SingletonMissing, { table: 'tax_settings' }, 500)
  return updated as TaxSettings
})
