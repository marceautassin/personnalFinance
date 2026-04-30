import { z } from 'zod'

const DateIsoSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (YYYY-MM-DD attendu)')

export const TransactionSchema = z.object({
  id: z.number().int().positive(),
  statementHash: z.string().regex(/^[a-f0-9]{64}$/i),
  transactionDate: DateIsoSchema,
  label: z.string().min(1),
  amountCents: z.number().int(),
  categoryCode: z.string().min(1),
  isManual: z.boolean(),
  isDebtRepayment: z.boolean(),
  debtId: z.number().int().positive().nullable(),
  createdAt: z.number().int(),
})

export const NewTransactionSchema = TransactionSchema.omit({
  id: true,
  createdAt: true,
}).extend({
  isManual: z.boolean().default(false),
  isDebtRepayment: z.boolean().default(false),
  debtId: z.number().int().positive().nullable().default(null),
})

/**
 * Transaction en sortie de catégorisation LLM, avant association au statement (Story 2.6).
 */
export const ExtractedTransactionSchema = z.object({
  transactionDate: DateIsoSchema,
  label: z.string().min(1),
  amountCents: z.number().int(),
  categoryCode: z.string().min(1),
})

export type Transaction = z.infer<typeof TransactionSchema>
export type NewTransaction = z.infer<typeof NewTransactionSchema>
export type ExtractedTransaction = z.infer<typeof ExtractedTransactionSchema>
