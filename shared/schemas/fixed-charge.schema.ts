import { z } from 'zod'
import { DateIsoSchema, LabelSchema } from './transaction.schema'

/**
 * Fréquences d'une charge fixe. Doit rester aligné avec `FREQUENCY_VALUES`
 * (server/db/schema.ts) — la projection associée vit dans forecast-engine.ts (Story 7.3).
 */
export const FrequencyEnum = z.enum(['monthly', 'quarterly', 'annual', 'punctual'])

/**
 * Montant signé en cents : négatif = dépense, positif = revenu récurrent.
 * Bornes ±1e11 (≈ 1 milliard d'euros) cohérentes avec reconciliation.schema (Story 3.1) ;
 * refine ≠ 0 : une charge à 0 n'a pas de sens métier.
 */
const AmountCentsSchema = z
  .number()
  .int('Montant en cents entier attendu')
  .min(-1e11, 'Montant hors bornes')
  .max(1e11, 'Montant hors bornes')
  .refine(n => n !== 0, 'Le montant ne peut pas être nul')

/** Une charge avec `endDate` doit avoir `endDate >= startDate`. */
const endDateAfterStart = (c: { startDate: string, endDate?: string | null }) =>
  c.endDate == null || c.endDate >= c.startDate
const endDateRefineMessage = {
  message: 'La date de fin doit être postérieure ou égale à la date de début',
  path: ['endDate'],
}

/** Charge fixe en lecture (sortie d'API) — inclut `id` et `createdAt`. */
export const FixedChargeSchema = z.object({
  id: z.number().int().positive(),
  label: LabelSchema,
  amountCents: AmountCentsSchema,
  categoryCode: z.string().min(1),
  frequency: FrequencyEnum,
  startDate: DateIsoSchema,
  endDate: DateIsoSchema.nullable(),
  createdAt: z.number().int(),
})

/** Body de création (`POST`) — sans `id`/`createdAt`. */
export const NewFixedChargeSchema = z
  .object({
    label: LabelSchema,
    amountCents: AmountCentsSchema,
    categoryCode: z.string().trim().min(1, 'Catégorie requise'),
    frequency: FrequencyEnum,
    startDate: DateIsoSchema,
    endDate: DateIsoSchema.nullable().optional(),
  })
  .refine(endDateAfterStart, endDateRefineMessage)

/**
 * Body de remplacement (`PUT`) — sémantique replace complet : tous les champs requis
 * sauf `endDate`. `.strict()` rejette `id`/`createdAt` (immuables) ou tout champ inconnu.
 */
export const FixedChargePutSchema = z
  .object({
    label: LabelSchema,
    amountCents: AmountCentsSchema,
    categoryCode: z.string().trim().min(1, 'Catégorie requise'),
    frequency: FrequencyEnum,
    startDate: DateIsoSchema,
    endDate: DateIsoSchema.nullable().optional(),
  })
  .strict()
  .refine(endDateAfterStart, endDateRefineMessage)

export type Frequency = z.infer<typeof FrequencyEnum>
export type FixedCharge = z.infer<typeof FixedChargeSchema>
export type NewFixedCharge = z.infer<typeof NewFixedChargeSchema>
export type FixedChargePut = z.infer<typeof FixedChargePutSchema>
