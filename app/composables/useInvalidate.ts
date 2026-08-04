/**
 * useInvalidate — invalidation transversale du cache `useFetch` (FR53, story 7.8).
 *
 * Le forecast et le dashboard sont des fonctions pures des modèles persistés (D9) : toute
 * mutation de modèle (charges, revenus, SAS, fiscalité, dettes, catégories, overrides,
 * transactions) ou ingestion invalide leurs `useFetch` → refetch, pas de cache dérivé.
 */

/** Clés forecast : ensemble borné {6, 12, 24} (cf. `useForecast`). */
const FORECAST_KEYS = ['forecast-6', 'forecast-12', 'forecast-24']

export function useInvalidate() {
  /** Refetch les projections forecast (recalcul réactif, FR53). */
  async function invalidateForecast() {
    await refreshNuxtData(FORECAST_KEYS)
  }

  /**
   * Refetch le dashboard. Ses clés sont dynamiques (`dashboard-${month}`) : on rafraîchit
   * l'ensemble des données actives (borné à ce qui est monté). Le dashboard étant read-only,
   * ce refresh ne concerne en pratique que la vue courante après une mutation ailleurs.
   */
  async function invalidateDashboard() {
    await refreshNuxtData()
  }

  async function invalidateStatementsList() {
    await refreshNuxtData('statements-list')
  }

  return { invalidateForecast, invalidateDashboard, invalidateStatementsList }
}
