/**
 * useInvalidate — invalidation transversale du cache `useFetch`.
 *
 * Les vues d'analyse sont des fonctions pures des transactions persistées (D19) : toute
 * mutation — ingestion, reclassement, correction du référentiel — invalide leurs `useFetch`
 * pour déclencher un refetch, plutôt que d'entretenir un cache dérivé.
 *
 * ⚠️ `refreshNuxtData` perd le contexte Nuxt lorsqu'il est appelé après un `await` depuis un
 * gestionnaire d'événement : le refetch ne part alors jamais, silencieusement. Pour rafraîchir
 * une ressource précise depuis un composable de mutation, préférer la méthode `refresh()` de
 * l'instance `useFetch` capturée (D8, amendée le 2026-09-04).
 */
export function useInvalidate() {
  /**
   * Refetch les vues d'analyse. Leurs clés sont dynamiques (bornes de période et granularité) :
   * on rafraîchit l'ensemble des données actives, borné à ce qui est monté.
   */
  async function invalidateAnalysis() {
    await refreshNuxtData()
  }

  async function invalidateStatementsList() {
    await refreshNuxtData('statements-list')
  }

  return { invalidateAnalysis, invalidateStatementsList }
}
