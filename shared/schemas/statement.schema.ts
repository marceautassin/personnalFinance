import { z } from 'zod'

const DateIsoSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (YYYY-MM-DD attendu)')

const ReliabilityEnum = z.enum(['reliable', 'unreliable'])

export const StatementSchema = z.object({
  hashSha256: z.string().regex(/^[a-f0-9]{64}$/i, 'Hash SHA-256 attendu'),
  periodStart: DateIsoSchema,
  periodEnd: DateIsoSchema,
  openingBalanceCents: z.number().int(),
  closingBalanceCents: z.number().int(),
  reliability: ReliabilityEnum,
  ingestedAt: z.number().int(),
})

export const NewStatementSchema = StatementSchema.omit({ ingestedAt: true }).extend({
  reliability: ReliabilityEnum.default('reliable'),
})

export type Statement = z.infer<typeof StatementSchema>
export type NewStatement = z.infer<typeof NewStatementSchema>
