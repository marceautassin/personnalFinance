import { defineEventHandler } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { sasConfig } from '~~/server/db/schema'
import { domainError } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import type { SasConfig } from '~~/shared/schemas/sas-config.schema'

/**
 * Retourne le singleton `sas_config` (id=1), normalement toujours présent grâce au seed
 * bootstrap (story 5.4). Si la ligne manque, on échoue explicitement plutôt que de renvoyer
 * un 200 à corps vide (cf. `revenues.get.ts`).
 */
export default defineEventHandler(async (): Promise<SasConfig> => {
  const [config] = await db
    .select()
    .from(sasConfig)
    .where(eq(sasConfig.id, 1))
    .limit(1)
  if (!config) throw domainError(ApiErrorCode.SingletonMissing, { table: 'sas_config' }, 500)
  return config as SasConfig
})
