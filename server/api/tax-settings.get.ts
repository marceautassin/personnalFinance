import { defineEventHandler } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { taxSettings } from '~~/server/db/schema'
import { domainError } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import type { TaxSettings } from '~~/shared/schemas/tax-settings.schema'

/**
 * Retourne le singleton `tax_settings` (id=1), normalement toujours présent grâce au seed
 * bootstrap (story 5.5). Si la ligne manque, on échoue explicitement plutôt que de renvoyer
 * un 200 à corps vide, qui laissait `/parametres` bloquée sur « Chargement… » sans le moindre
 * diagnostic. Même traitement que `sas-config.get.ts` (revue 2026-08-04).
 */
export default defineEventHandler(async (): Promise<TaxSettings> => {
  const [settings] = await db
    .select()
    .from(taxSettings)
    .where(eq(taxSettings.id, 1))
    .limit(1)
  if (!settings) throw domainError(ApiErrorCode.SingletonMissing, { table: 'tax_settings' }, 500)
  return settings as TaxSettings
})
