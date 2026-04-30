import { z } from 'zod'

/**
 * Date ISO YYYY-MM-DD avec validation sémantique (rejette 2026-02-30, 2026-13-01, etc.).
 */
const DateIsoSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (YYYY-MM-DD attendu)')
  .refine((s) => {
    const parts = s.split('-')
    const y = Number(parts[0])
    const m = Number(parts[1])
    const d = Number(parts[2])
    const dt = new Date(Date.UTC(y, m - 1, d))
    return (
      dt.getUTCFullYear() === y
      && dt.getUTCMonth() === m - 1
      && dt.getUTCDate() === d
    )
  }, 'Date inexistante (jour/mois invalide)')

/** Libellé non-vide après trim (rejette `"   "`). */
const LabelSchema = z.string().trim().min(1, 'Libellé requis')

/** Hash SHA-256 hex lowercase (canonique : `crypto.digest('hex')` produit du lowercase). */
const HashSha256Schema = z.string().regex(/^[a-f0-9]{64}$/, 'Hash SHA-256 attendu (lowercase hex)')

/** Une transaction marquée `isDebtRepayment` doit référencer une dette (`debtId !== null`). */
const debtRepaymentRefine = (
  t: { isDebtRepayment: boolean, debtId: number | null },
) => !t.isDebtRepayment || t.debtId !== null

export const TransactionSchema = z
  .object({
    id: z.number().int().positive(),
    statementHash: HashSha256Schema,
    transactionDate: DateIsoSchema,
    label: LabelSchema,
    amountCents: z.number().int(),
    categoryCode: z.string().min(1),
    isManual: z.boolean(),
    isDebtRepayment: z.boolean(),
    debtId: z.number().int().positive().nullable(),
    createdAt: z.number().int(),
  })
  .refine(debtRepaymentRefine, {
    message: 'isDebtRepayment=true exige un debtId non-null',
    path: ['debtId'],
  })

export const NewTransactionSchema = z
  .object({
    statementHash: HashSha256Schema,
    transactionDate: DateIsoSchema,
    label: LabelSchema,
    amountCents: z.number().int(),
    categoryCode: z.string().min(1),
    isManual: z.boolean().default(false),
    isDebtRepayment: z.boolean().default(false),
    debtId: z.number().int().positive().nullable().default(null),
  })
  .refine(debtRepaymentRefine, {
    message: 'isDebtRepayment=true exige un debtId non-null',
    path: ['debtId'],
  })

/**
 * Transaction en sortie de catégorisation LLM, avant association au statement (Story 2.6).
 */
export const ExtractedTransactionSchema = z.object({
  transactionDate: DateIsoSchema,
  label: LabelSchema,
  amountCents: z.number().int(),
  categoryCode: z.string().min(1),
})

export type Transaction = z.infer<typeof TransactionSchema>
export type NewTransaction = z.infer<typeof NewTransactionSchema>
export type ExtractedTransaction = z.infer<typeof ExtractedTransactionSchema>
