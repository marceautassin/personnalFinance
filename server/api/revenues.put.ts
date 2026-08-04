import { defineEventHandler } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { revenueModels } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { domainError } from '~~/server/utils/errors'
import { monthOf } from '~~/server/utils/period'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { RevenueModelPatchSchema } from '~~/shared/schemas/revenue-model.schema'

/**
 * Met à jour le singleton `revenue_models` (id=1). Body = patch partiel (au moins un
 * champ, cf. Dev Notes story 5.3) : seuls les champs fournis sont écrits, les autres
 * restent inchangés. `updated_at` régénéré à chaque mutation.
 *
 * Invariant ARE (amendement story 5.3, revue 2026-08-04) : un montant d'ARE > 0 exige une
 * date de fin de droits, et cette date doit tomber sur le mois courant ou plus tard. Le
 * forecast ne compte l'ARE que si `monthOf(endDate) >= month` (`forecast-engine.incomeForMonth`) :
 * sans date — ou avec une date échue — le montant serait saisi puis silencieusement ignoré
 * sur tout l'horizon. Contrôle croisé sur l'état APRÈS patch (le body étant partiel, le
 * schéma Zod seul ne suffit pas). Erreurs métier → 400 + code dédié (CLAUDE.md §Règle d'or).
 */
export default defineEventHandler(async (event) => {
  const body = await validateBody(event, RevenueModelPatchSchema)

  const current = db.select().from(revenueModels).where(eq(revenueModels.id, 1)).limit(1).get()
  if (!current) throw domainError(ApiErrorCode.SingletonMissing, { table: 'revenue_models' }, 500)

  const merged = {
    unemploymentBenefitMonthlyCents: body.unemploymentBenefitMonthlyCents ?? current.unemploymentBenefitMonthlyCents,
    unemploymentBenefitEndDate: body.unemploymentBenefitEndDate !== undefined
      ? body.unemploymentBenefitEndDate
      : current.unemploymentBenefitEndDate,
  }
  if (merged.unemploymentBenefitMonthlyCents > 0) {
    if (merged.unemploymentBenefitEndDate === null) {
      throw domainError(ApiErrorCode.UnemploymentEndDateRequired, { field: 'unemploymentBenefitEndDate' })
    }
    const currentMonth = monthOf(new Date().toISOString().slice(0, 10))
    if (monthOf(merged.unemploymentBenefitEndDate) < currentMonth) {
      throw domainError(ApiErrorCode.UnemploymentEndDatePast, {
        field: 'unemploymentBenefitEndDate',
        endDate: merged.unemploymentBenefitEndDate,
        currentMonth,
      })
    }
  }

  const [updated] = await db
    .update(revenueModels)
    .set({ ...body, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(revenueModels.id, 1))
    .returning()
  if (!updated) throw domainError(ApiErrorCode.SingletonMissing, { table: 'revenue_models' }, 500)
  return updated
})
