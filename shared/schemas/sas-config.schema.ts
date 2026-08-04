import { z } from 'zod'
import type { Cents } from '../types/money'

/**
 * Date de clôture d'exercice au format `MM-DD` (sans année — récurrente chaque année).
 * Validation sémantique : rejette `02-30`, `04-31`, etc.
 *
 * `02-29` est rejeté (revue 2026-08-04) : une clôture récurrente doit exister **chaque**
 * année, or 3 années sur 4 le 29 février n'est pas une date. On résout donc les jours via
 * une année NON bissextile de référence (2001), ce qui exclut `02-29` par construction.
 */
export const FiscalYearEndDateSchema = z
  .string()
  .regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Format MM-DD attendu')
  .refine((s) => {
    const parts = s.split('-')
    const m = Number(parts[0])
    const d = Number(parts[1])
    const dt = new Date(Date.UTC(2001, m - 1, d))
    return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  }, 'Date de clôture inexistante — elle doit exister chaque année (29 février exclu)')

/**
 * Montant SAS en cents : NON signé. Borne haute 1e12 (CA jusqu'à ~10 M€ = 1e9 cents,
 * large marge). 0 autorisé (état initial du singleton). Sortie brandée `Cents` — cf.
 * `revenue-model.schema.ts`.
 */
const SasAmountCentsSchema = z
  .number()
  .int('Montant en cents entier attendu')
  .min(0, 'Un montant SAS ne peut pas être négatif')
  .max(1e12, 'Montant hors bornes')
  .transform(v => v as Cents)

/** Taux IS en pct × 100 : 0 à 10000 (0 % à 100 %). */
const IsRatePctSchema = z
  .number()
  .int('Taux en pct×100 entier attendu')
  .min(0, 'Taux hors bornes')
  .max(10000, 'Taux hors bornes')

/** Config SAS en lecture (sortie d'API) — singleton `id = 1`. */
export const SasConfigSchema = z.object({
  id: z.literal(1),
  fiscalYearEndDate: FiscalYearEndDateSchema,
  revenueForecastCents: SasAmountCentsSchema,
  expensesForecastCents: SasAmountCentsSchema,
  currentTreasuryCents: SasAmountCentsSchema,
  isRatePct: IsRatePctSchema,
  updatedAt: z.number().int(),
})

/**
 * Body du `PUT /api/sas-config` — patch partiel (cohérent revenue_models story 5.3).
 * `.strict()` rejette `id`/`updatedAt` ou tout champ inconnu ; au moins un champ requis.
 */
export const SasConfigPatchSchema = z
  .object({
    fiscalYearEndDate: FiscalYearEndDateSchema.optional(),
    revenueForecastCents: SasAmountCentsSchema.optional(),
    expensesForecastCents: SasAmountCentsSchema.optional(),
    currentTreasuryCents: SasAmountCentsSchema.optional(),
    isRatePct: IsRatePctSchema.optional(),
  })
  .strict()
  .refine(
    data => Object.keys(data).length > 0,
    { message: 'Au moins un champ doit être fourni' },
  )

export type SasConfig = z.infer<typeof SasConfigSchema>
export type SasConfigPatch = z.infer<typeof SasConfigPatchSchema>
