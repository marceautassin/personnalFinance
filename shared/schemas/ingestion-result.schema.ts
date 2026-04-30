import { z } from 'zod'

/**
 * Réponse de POST /api/statements (Story 2.6).
 * Contrat minimal : metadata du relevé et état de réconciliation.
 * Le client refetch les transactions via GET /api/transactions?month=... (Story 2.7).
 */
export const IngestionResultSchema = z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  transactionCount: z.number().int().nonnegative(),
  isBalanced: z.boolean(),
  gapCents: z.number().int(),
})

export type IngestionResult = z.infer<typeof IngestionResultSchema>
