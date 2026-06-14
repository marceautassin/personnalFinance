import { defineEventHandler } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { sasConfig } from '~~/server/db/schema'

/**
 * Retourne le singleton `sas_config` (id=1). Toujours présent grâce au seed bootstrap
 * (story 5.4) — pas de 404 possible.
 */
export default defineEventHandler(async () => {
  const [config] = await db
    .select()
    .from(sasConfig)
    .where(eq(sasConfig.id, 1))
    .limit(1)
  return config
})
