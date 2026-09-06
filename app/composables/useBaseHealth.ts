import { useStatementsList } from '~/composables/useStatements'
import { ratio, type Ratio } from '~~/shared/types/ratio'
import type { Cents } from '~~/shared/types/money'

/**
 * Santé de la base, dérivée de la liste des relevés — aucun endpoint ni agrégat de plus.
 *
 * Les trois chiffres portés par la barre d'application répondent à une question qu'on se pose
 * en permanence et qui obligeait jusqu'ici à ouvrir `/import` : est-ce que ce que je regarde
 * repose sur des données complètes et réconciliées ?
 *
 * La dérivation vit ici et non dans un endpoint parce que `GET /api/statements` porte déjà
 * tout le nécessaire, et qu'un agrégat de plus côté serveur serait un état dérivé persisté —
 * exactement ce que D19 interdit.
 */
export function useBaseHealth() {
  const { data, pending, error } = useStatementsList()

  const statements = computed(() => data.value?.statements ?? [])

  const statementCount = computed(() => statements.value.length)

  const transactionCount = computed(() =>
    statements.value.reduce((sum, s) => sum + s.transactionCount, 0),
  )

  /**
   * Écart cumulé en VALEUR ABSOLUE.
   *
   * Deux relevés qui divergent de +47 € et −47 € ne se compensent pas : ce sont deux relevés
   * faux. Sommer algébriquement afficherait « 0,00 € » sur une base cassée — le seul endroit
   * du produit où l'absolu est le bon calcul, parce qu'on compte des anomalies et non de
   * l'argent (D28 régit le moteur, pas ce compteur).
   */
  const gapCents = computed(() =>
    statements.value.reduce((sum, s) => sum + Math.abs(s.gapCents), 0) as Cents,
  )

  const manualCount = computed(() =>
    statements.value.reduce((sum, s) => sum + s.manualCount, 0),
  )

  /** `null` sur une base vide : le taux n'est pas défini, il n'est pas nul. */
  const correctionRate = computed<Ratio | null>(() =>
    ratio(manualCount.value, transactionCount.value),
  )

  /**
   * Mois du relevé le plus récent, au format `AAAA-MM` — `null` sur une base vide.
   *
   * Sert à ouvrir la liste des transactions là où il y a quelque chose à voir. Viser le mois du
   * calendrier ouvrait l'écran le plus dense du produit sur son état vide chaque début de mois.
   * La liste vient déjà triée par période décroissante : le premier élément suffit.
   */
  const latestPeriod = computed<string | null>(() => {
    const start = statements.value[0]?.periodStart
    return start ? start.slice(0, 7) : null
  })

  return {
    pending,
    /**
     * Le chargement a échoué (story 17.7). Sans ce drapeau, les trois compteurs tombaient à
     * zéro sur une panne : « 0 lignes · 0 relevés » se lit comme une base vide, pas comme un
     * serveur muet.
     */
    failed: computed(() => error.value !== null && error.value !== undefined),
    statementCount,
    transactionCount,
    gapCents,
    manualCount,
    correctionRate,
    latestPeriod,
  }
}
