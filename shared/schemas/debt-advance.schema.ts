import { z } from 'zod'
import { DateIsoSchema } from './transaction.schema'

/** Montant d'une avance en cents : strictement positif (une avance à 0 n'a pas de sens). */
const AdvanceAmountCentsSchema = z
  .number()
  .int('Montant en cents entier attendu')
  .positive('Une avance doit être strictement positive')
  .max(1e11, 'Montant hors bornes')

/** Body de création (`POST /api/debts/[id]/advances`) — `debtId` vient de l'URL. */
export const NewDebtAdvanceSchema = z
  .object({
    amountCents: AdvanceAmountCentsSchema,
    advanceDate: DateIsoSchema,
    note: z.string().trim().max(200, 'Note trop longue (max 200)').nullable().optional(),
  })
  .strict()

/** Avance en lecture (sortie d'API). */
export const DebtAdvanceSchema = z.object({
  id: z.number().int().positive(),
  debtId: z.number().int().positive(),
  amountCents: AdvanceAmountCentsSchema,
  advanceDate: DateIsoSchema,
  note: z.string().nullable(),
  createdAt: z.number().int(),
})

export type NewDebtAdvance = z.infer<typeof NewDebtAdvanceSchema>
export type DebtAdvance = z.infer<typeof DebtAdvanceSchema>
