import { defineEventHandler } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { taxSettings } from '~~/server/db/schema'

/**
 * Retourne le singleton `tax_settings` (id=1). Toujours présent grâce au seed bootstrap
 * (story 5.5) — pas de 404 possible.
 */
export default defineEventHandler(async () => {
  const [settings] = await db
    .select()
    .from(taxSettings)
    .where(eq(taxSettings.id, 1))
    .limit(1)
  return settings
})
