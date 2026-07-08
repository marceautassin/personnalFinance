import { z } from 'zod'
import { DIVIDEND_TAX_MODES } from '~~/shared/constants/fiscal-defaults'

/** Taux d'imposition dividende en pct × 100 : 0 à 10000 (0 % à 100 %). */
const DividendTaxRatePctSchema = z
  .number()
  .int('Taux en pct×100 entier attendu')
  .min(0, 'Taux hors bornes')
  .max(10000, 'Taux hors bornes')

/** Mode d'imposition dividende (importe la source de vérité `fiscal-defaults`). */
const DividendTaxModeSchema = z.enum(DIVIDEND_TAX_MODES)

/** Réglages d'imposition en lecture (sortie d'API) — singleton `id = 1`. */
export const TaxSettingsSchema = z.object({
  id: z.literal(1),
  dividendTaxRatePct: DividendTaxRatePctSchema,
  dividendTaxMode: DividendTaxModeSchema,
  updatedAt: z.number().int(),
})

/**
 * Body du `PUT /api/tax-settings` — patch partiel (cohérent sas_config story 5.4).
 * `.strict()` rejette `id`/`updatedAt` ou tout champ inconnu ; au moins un champ requis.
 */
export const TaxSettingsPatchSchema = z
  .object({
    dividendTaxRatePct: DividendTaxRatePctSchema.optional(),
    dividendTaxMode: DividendTaxModeSchema.optional(),
  })
  .strict()
  .refine(
    data => Object.keys(data).length > 0,
    { message: 'Au moins un champ doit être fourni' },
  )

export type TaxSettings = z.infer<typeof TaxSettingsSchema>
export type TaxSettingsPatch = z.infer<typeof TaxSettingsPatchSchema>
