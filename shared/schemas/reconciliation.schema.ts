import { z } from 'zod'
import { DateIsoSchema, LabelSchema } from './transaction.schema'

/**
 * Body de POST /api/reconciliation/[hash] (Story 3.1).
 *
 * Discriminated union sur `action` :
 *  - add_transaction : insère une transaction manuelle (is_manual=true) puis recompute le gap.
 *  - accept_gap : insère une transaction "divers" du montant exact du gap résiduel,
 *                 marque le statement comme `unreliable` (FR14).
 *
 * Convention de signe (cf. server/services/reconciler.ts) :
 *   gap = (closing - opening) - sum(transactions.amountCents)
 *   amountCents NÉGATIF = sortie, POSITIF = entrée.
 */
/**
 * `amountCents` rejette `0` (no-op qui pollue la liste sans fermer de gap)
 * et plafonne à ±10^11 cents (~€1Md, large au-dessus de tout cas réel,
 * sous Number.MAX_SAFE_INTEGER pour éviter les drift FP côté sumCents).
 */
export const AddManualTransactionInputSchema = z.object({
  transactionDate: DateIsoSchema,
  label: LabelSchema,
  amountCents: z
    .number()
    .int()
    .min(-1e11, 'Montant trop grand')
    .max(1e11, 'Montant trop grand')
    .refine(n => n !== 0, 'Le montant ne peut pas être 0'),
  categoryCode: z.string().trim().min(1),
})

export const ReconciliationActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('add_transaction'),
    transaction: AddManualTransactionInputSchema,
  }),
  z.object({
    action: z.literal('accept_gap'),
  }),
])

export type AddManualTransactionInput = z.infer<typeof AddManualTransactionInputSchema>
export type ReconciliationAction = z.infer<typeof ReconciliationActionSchema>
