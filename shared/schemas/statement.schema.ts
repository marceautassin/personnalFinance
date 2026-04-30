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

const ReliabilityEnum = z.enum(['reliable', 'unreliable'])

/** Hash SHA-256 hex lowercase (canonique : `crypto.digest('hex')` produit du lowercase). */
const HashSha256Schema = z.string().regex(/^[a-f0-9]{64}$/, 'Hash SHA-256 attendu (lowercase hex)')

export const StatementSchema = z
  .object({
    hashSha256: HashSha256Schema,
    periodStart: DateIsoSchema,
    periodEnd: DateIsoSchema,
    openingBalanceCents: z.number().int(),
    closingBalanceCents: z.number().int(),
    reliability: ReliabilityEnum,
    ingestedAt: z.number().int(),
  })
  .refine(s => s.periodStart <= s.periodEnd, {
    message: 'periodStart doit être ≤ periodEnd',
    path: ['periodEnd'],
  })

export const NewStatementSchema = z
  .object({
    hashSha256: HashSha256Schema,
    periodStart: DateIsoSchema,
    periodEnd: DateIsoSchema,
    openingBalanceCents: z.number().int(),
    closingBalanceCents: z.number().int(),
    reliability: ReliabilityEnum.default('reliable'),
  })
  .refine(s => s.periodStart <= s.periodEnd, {
    message: 'periodStart doit être ≤ periodEnd',
    path: ['periodEnd'],
  })

export type Statement = z.infer<typeof StatementSchema>
export type NewStatement = z.infer<typeof NewStatementSchema>
