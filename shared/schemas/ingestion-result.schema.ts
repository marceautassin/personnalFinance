import { z } from 'zod'
import { STATEMENT_SOURCES } from '../types/statement-source'

/**
 * Réponse de POST /api/statements (Story 2.6 ; `source`/`ignoredSheets`/`cardAggregateMonths`
 * story 28.4).
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
  source: z.enum(STATEMENT_SOURCES),
  /** Feuilles ignorées d'un export (story 28.4) — absent sur un relevé PDF. */
  ignoredSheets: z.array(z.string()).optional(),
  /** Mois `YYYY-MM` dont les achats carte ne sont pas détaillés (FR84) — absent sur un PDF. */
  cardAggregateMonths: z.array(z.string()).optional(),
})

export type IngestionResult = z.infer<typeof IngestionResultSchema>
