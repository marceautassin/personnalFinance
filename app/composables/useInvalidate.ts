/**
 * useInvalidate — composable d'invalidation transversale (V1 stub).
 *
 * En V1 (Stories 2-6), c'est un no-op + console.warn en dev. Story 7.8 (Forecast)
 * finalisera en plugant les vraies invalidations sur useFetch (forecast-*, dashboard-*).
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
  return { invalidateForecast, invalidateDashboard }
}
