/**
 * useInvalidate — composable d'invalidation transversale.
 *
 * `invalidateStatementsList` est implémenté (Story 3.3) pour propager la fiabilité
 * sur `/import` après une réconciliation. Les autres restent des stubs jusqu'à
 * Story 7.8 (Forecast) qui pluggera les vraies invalidations forecast/dashboard.
 */
export function useInvalidate() {
  function invalidateForecast() {
    if (import.meta.dev) {
      console.warn('[useInvalidate] forecast invalidation requested (no-op until Story 7.8)')
    }
  }
  function invalidateDashboard() {
    if (import.meta.dev) {
      console.warn('[useInvalidate] dashboard invalidation requested (no-op until Story 7.8)')
    }
  }
  async function invalidateStatementsList() {
    await refreshNuxtData('statements-list')
  }
  return { invalidateForecast, invalidateDashboard, invalidateStatementsList }
}
