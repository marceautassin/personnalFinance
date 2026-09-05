import { z } from 'zod'
import { GRANULARITIES } from '../types/granularity'

/**
 * Requête d'évolution : la DERNIÈRE tranche affichée, et le pas de découpage.
 *
 * Contrairement à `/api/analysis`, on ne passe pas de bornes : la fenêtre est fixe (douze
 * tranches) et se déduit de la tranche d'arrivée. C'est ce qui rend les deux pages
 * distinctes — l'analyse décrit UNE période, l'évolution en traverse douze — et ce qui évite
 * le sélecteur ambigu qui gouvernait deux portées à la fois.
 */
export const EvolutionQuerySchema = z.object({
  to: z.string().regex(/^\d{4}(-(0[1-9]|1[0-2])|-T[1-4])?$/, 'tranche attendue : YYYY, YYYY-MM ou YYYY-T1'),
  granularity: z.enum(GRANULARITIES),
  /** Cible du suivi : `item:<code>` ou `group:<code>`. Absente → vue d'ensemble seule. */
  target: z.string().regex(/^(item|group):[a-z0-9-]+$/, 'format attendu : item:<code> ou group:<code>').optional(),
})

export type EvolutionQuery = z.infer<typeof EvolutionQuerySchema>
