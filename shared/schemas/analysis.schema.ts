import { z } from 'zod'
import { GRANULARITIES } from '../types/granularity'

/** Date ISO `YYYY-MM-DD`. Validée aussi sur le calendrier, pas seulement sur la forme. */
const DateIsoSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'format attendu YYYY-MM-DD')
  .refine((d) => {
    const [y, m, day] = d.split('-').map(Number)
    if (m! < 1 || m! > 12 || day! < 1) return false
    const isLeap = (y! % 4 === 0 && y! % 100 !== 0) || y! % 400 === 0
    const days = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return day! <= days[m! - 1]!
  }, 'date inexistante au calendrier')

/**
 * Requête d'analyse : des BORNES explicites plus une granularité (AR9).
 *
 * Jamais un identifiant de période composite (`?period=2026-Q1`) : les bornes disent quoi
 * agréger, la granularité comment le découper. Les confondre interdirait de demander un
 * semestre découpé en mois, et divergerait dès la première plage libre.
 */
export const AnalysisQuerySchema = z
  .object({
    from: DateIsoSchema,
    to: DateIsoSchema,
    granularity: z.enum(GRANULARITIES),
  })
  .refine(q => q.from <= q.to, {
    message: 'from doit précéder to',
    path: ['from'],
  })

export type AnalysisQuery = z.infer<typeof AnalysisQuerySchema>
