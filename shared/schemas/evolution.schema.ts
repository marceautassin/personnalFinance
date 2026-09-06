import { z } from 'zod'

/**
 * Requête d'évolution : LA PÉRIODE REGARDÉE.
 *
 * **Refonte du 2026-09-07.** Le paramètre était auparavant la dernière tranche affichée plus
 * un PAS, et la fenêtre valait douze tranches de ce pas. Choisir « Année » donnait donc douze
 * ANNÉES, quand l'utilisateur attendait les douze mois de l'année regardée — le même mot ne
 * voulait pas dire la même chose que sur l'écran d'analyse.
 *
 * Désormais le paramètre désigne ce qu'on regarde, et le découpage en découle : une année se
 * lit en mois, un trimestre en mois, tout l'historique en mois. Un mot, un sens, sur les deux
 * écrans.
 */
export const EVOLUTION_ALL = 'all'

export const EvolutionQuerySchema = z.object({
  /** `YYYY`, `YYYY-Tn`, ou `all` pour tout l'historique. */
  period: z.union([
    z.literal(EVOLUTION_ALL),
    z.string().regex(/^\d{4}(-T[1-4])?$/, 'période attendue : YYYY, YYYY-T1 ou all'),
  ]),
  /** Cible du suivi : `item:<code>` ou `group:<code>`. Absente → vue d'ensemble seule. */
  target: z.string().regex(/^(item|group):[a-z0-9-]+$/, 'format attendu : item:<code> ou group:<code>').optional(),
})

export type EvolutionQuery = z.infer<typeof EvolutionQuerySchema>
