import { z } from 'zod'
import { DateIsoSchema } from './transaction.schema'

/** Nature d'un événement de dette — descriptive ; le signe du montant porte l'arithmétique. */
export const DEBT_EVENT_KINDS = ['advance', 'settlement', 'adjustment'] as const
export type DebtEventKind = (typeof DEBT_EVENT_KINDS)[number]

/**
 * Montant d'un événement en cents, **signé** et non nul (story 6.5, D16) :
 *  - `> 0` augmente le solde dû (avance reçue)
 *  - `< 0` le diminue (règlement, correction)
 *
 * `debt_advances` imposait `positive()`, ce qui rendait un solde négatif — une créance —
 * inexprimable, et donc FR68 impossible (revue du 2026-09-04).
 */
const SignedEventCentsSchema = z
  .number()
  .int('Montant en cents entier attendu')
  .refine(n => n !== 0, 'Un événement à 0 n\'a pas de sens')
  .refine(n => Math.abs(n) <= 1e11, 'Montant hors bornes')

const NoteSchema = z.string().trim().max(200, 'Note trop longue (max 200)').nullable().optional()

/** Body de création (`POST /api/debts/[id]/events`) — `debtId` vient de l'URL. */
export const NewDebtEventSchema = z
  .object({
    amountCents: SignedEventCentsSchema,
    eventDate: DateIsoSchema,
    kind: z.enum(DEBT_EVENT_KINDS).optional(),
    note: NoteSchema,
  })
  .strict()

/** Événement en lecture (sortie d'API). */
export const DebtEventSchema = z.object({
  id: z.number().int().positive(),
  debtId: z.number().int().positive(),
  amountCents: SignedEventCentsSchema,
  eventDate: DateIsoSchema,
  kind: z.enum(DEBT_EVENT_KINDS),
  sourceTransactionId: z.number().int().positive().nullable(),
  note: z.string().nullable(),
  createdAt: z.number().int(),
})

export type NewDebtEvent = z.infer<typeof NewDebtEventSchema>
export type DebtEvent = z.infer<typeof DebtEventSchema>
