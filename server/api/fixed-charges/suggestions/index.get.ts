import { defineEventHandler } from 'h3'
import { db } from '~~/server/db/client'
import { suggestRecurringCharges } from '~~/server/services/charge-suggester'

/**
 * Suggestions de charges récurrentes (recompute à chaque appel — pas de cache, cf. Dev Notes).
 * Trié par le service (occurrences desc, |montant| desc).
 */
export default defineEventHandler(async () => {
  const suggestions = await suggestRecurringCharges(db)
  return { suggestions }
})
