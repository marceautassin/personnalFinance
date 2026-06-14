import { z } from 'zod'

/**
 * Date de clôture d'exercice au format `MM-DD` (sans année — récurrente chaque année).
 * Validation sémantique : rejette `02-30`, `04-31`, etc. On résout les jours via une année
 * bissextile de référence (2000) pour autoriser `02-29` (clôture possible une année sur 4).
 */
export const FiscalYearEndDateSchema = z
  .string()
  .regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Format MM-DD attendu')
  .refine((s) => {
    const parts = s.split('-')
    const m = Number(parts[0])
    const d = Number(parts[1])
    const dt = new Date(Date.UTC(2000, m - 1, d))
    return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  }, 'Date de clôture inexistante (jour/mois invalide)')

/**
 * Montant SAS en cents : NON signé. Borne haute 1e12 (CA jusqu'à ~10 M€ = 1e9 cents,
 * large marge). 0 autorisé (état initial du singleton).
 */
const SasAmountCentsSchema = z
  .number()
  .int('Montant en cents entier attendu')
  .min(0, 'Un montant SAS ne peut pas être négatif')
  .max(1e12, 'Montant hors bornes')

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
