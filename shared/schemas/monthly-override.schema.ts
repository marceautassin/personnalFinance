import { z } from 'zod'

/** Mois d'un override au format `YYYY-MM`. */
export const MonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Format YYYY-MM attendu')

/** Montant d'override en cents NON signé : dépense forcée du mois (0 autorisé). */
const OverrideAmountCentsSchema = z
  .number()
  .int('Montant en cents entier attendu')
  .min(0, 'Un montant ne peut pas être négatif')
  .max(1e11, 'Montant hors bornes')

/** Body de création (`POST /api/overrides`) — upsert sur (month, categoryCode). */
export const NewMonthlyOverrideSchema = z
  .object({
    month: MonthSchema,
    categoryCode: z.string().trim().min(1, 'Catégorie requise'),
    amountCents: OverrideAmountCentsSchema,
  })
  .strict()

/** Override en lecture (sortie d'API). */
export const MonthlyOverrideSchema = z.object({
  id: z.number().int().positive(),
  month: MonthSchema,
  categoryCode: z.string().min(1),
  amountCents: OverrideAmountCentsSchema,
  createdAt: z.number().int(),
})

/** Query optionnelle du GET : filtre par mois. */
export const OverrideListQuerySchema = z.object({
  month: MonthSchema.optional(),
})

export type NewMonthlyOverride = z.infer<typeof NewMonthlyOverrideSchema>
export type MonthlyOverride = z.infer<typeof MonthlyOverrideSchema>
