import { z } from 'zod'
import { DateIsoSchema } from './transaction.schema'

/**
 * Montant de revenu mensuel en cents : NON signé (un revenu est toujours ≥ 0).
 * Borne haute ±1e11 cohérente avec fixed-charge.schema (story 5.1). Contrairement aux
 * charges, 0 est autorisé (un champ non renseigné vaut zéro — état initial du singleton).
 */
const RevenueAmountCentsSchema = z
  .number()
  .int('Montant en cents entier attendu')
  .min(0, 'Un revenu ne peut pas être négatif')
  .max(1e11, 'Montant hors bornes')

/** Modèle de revenus en lecture (sortie d'API) — singleton `id = 1`. */
export const RevenueModelSchema = z.object({
  id: z.literal(1),
  unemploymentBenefitMonthlyCents: RevenueAmountCentsSchema,
  unemploymentBenefitEndDate: DateIsoSchema.nullable(),
  sasMonthlyRentCents: RevenueAmountCentsSchema,
  expenseReimbursementsMonthlyCents: RevenueAmountCentsSchema,
  updatedAt: z.number().int(),
})

/**
 * Body du `PUT /api/revenues` — patch partiel (cf. Dev Notes story 5.3 : sémantique PATCH
 * sous un verbe PUT, pour aligner avec les autres singletons sas-config/tax-settings).
 * `.strict()` rejette `id`/`updatedAt` (immuables) ou tout champ inconnu ; au moins un
 * champ doit être fourni (un body vide n'a pas de sens).
 */
export const RevenueModelPatchSchema = z
  .object({
    unemploymentBenefitMonthlyCents: RevenueAmountCentsSchema.optional(),
    unemploymentBenefitEndDate: DateIsoSchema.nullable().optional(),
    sasMonthlyRentCents: RevenueAmountCentsSchema.optional(),
    expenseReimbursementsMonthlyCents: RevenueAmountCentsSchema.optional(),
  })
  .strict()
  .refine(
    data => Object.keys(data).length > 0,
    { message: 'Au moins un champ doit être fourni' },
  )

export type RevenueModel = z.infer<typeof RevenueModelSchema>
export type RevenueModelPatch = z.infer<typeof RevenueModelPatchSchema>
