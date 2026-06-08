import { defineEventHandler } from 'h3'
import { asc } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { fixedCharges } from '~~/server/db/schema'

/**
 * Liste des charges fixes, triées par `frequency` puis `label`, `id` ASC.
 * Le tri sur `id` départage les charges de même fréquence + libellé (ordre stable
 * entre refetch). Pas de pagination V1 (mono-utilisateur, < 50 charges typiques).
 */
export default defineEventHandler(async () => {
  const charges = await db
    .select()
    .from(fixedCharges)
    .orderBy(asc(fixedCharges.frequency), asc(fixedCharges.label), asc(fixedCharges.id))
  return { charges }
})
