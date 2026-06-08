import { defineEventHandler } from 'h3'
import { db } from '~~/server/db/client'
import { fixedCharges } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { assertCategoryExists } from '~~/server/utils/category-fk'
import { NewFixedChargeSchema } from '~~/shared/schemas/fixed-charge.schema'

/**
 * Crée une charge fixe. FK pre-check sur `categoryCode` (422 si inconnue),
 * refine `endDate >= startDate` géré par le schéma (422 validation_failed).
 * Retourne la ligne complète insérée (`id` + `createdAt`).
 */
export default defineEventHandler(async (event) => {
  const body = await validateBody(event, NewFixedChargeSchema)

  await assertCategoryExists(body.categoryCode)

  const [created] = await db
    .insert(fixedCharges)
    .values({
      label: body.label,
      amountCents: body.amountCents,
      categoryCode: body.categoryCode,
      frequency: body.frequency,
      startDate: body.startDate,
      endDate: body.endDate ?? null,
    })
    .returning()
  return created
})
