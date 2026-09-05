/**
 * useInvalidate — invalidation transversale du cache `useFetch`.
 *
 * Les vues d'analyse sont des fonctions pures des transactions persistées (D19) : toute
 * mutation — ingestion, reclassement, correction du référentiel — invalide leurs `useFetch`
 * pour déclencher un refetch, plutôt que d'entretenir un cache dérivé.
 *
 * ⚠️ **`refreshNuxtData` perd le contexte Nuxt lorsqu'il est appelé après un `await`**, et
 * échoue alors SILENCIEUSEMENT : le refetch ne part jamais, l'écran garde ses anciens chiffres
 * pendant que la base porte les nouveaux. C'est le pire mode de défaillance de ce produit —
 * une divergence entre l'écran et la donnée, sans le moindre signal.
 *
 * Or toutes les mutations appellent l'invalidation APRÈS un `await` : c'est la nature même
 * d'un « je viens d'écrire, rafraîchis ». D'où `runWithContext`, qui restitue le contexte
 * capturé au montage. L'instance est saisie ici, de façon synchrone, là où le contexte existe
 * encore (revue du 2026-09-05 ; la note d'origine, datée du 2026-09-04, décrivait le défaut
 * sans le corriger).
 */
export function useInvalidate() {
  // Capture SYNCHRONE : `useNuxtApp()` ne peut être appelé qu'ici, pas dans les fonctions
  // ci-dessous qui, elles, s'exécutent après un `await`.
  const nuxtApp = useNuxtApp()

  /**
   * Refetch les vues d'analyse. Leurs clés sont dynamiques (bornes de période et granularité) :
   * on rafraîchit l'ensemble des données actives, borné à ce qui est monté.
   */
  async function invalidateAnalysis() {
    await nuxtApp.runWithContext(() => refreshNuxtData())
  }

  async function invalidateStatementsList() {
    await nuxtApp.runWithContext(() => refreshNuxtData('statements-list'))
  }

  return { invalidateAnalysis, invalidateStatementsList }
}
