import { computed, type Ref } from 'vue'
import type { ForecastResponse } from '~~/server/api/forecast.get'

/**
 * Forecast inverse (FR46-53) pour un horizon donné (`Ref` réactif : changer l'horizon refetch).
 * Clé par horizon → cache Nuxt dédié. Pas de `$fetch` direct en composant (CLAUDE.md).
 * Recalcul réactif sur mutation de modèle : story 7.8 (invalidation de la clé).
 */
export function useForecast(horizon: Ref<number>) {
  const key = computed(() => `forecast-${horizon.value}`)
  return useFetch<ForecastResponse>('/api/forecast', {
    query: { horizon },
    key,
    server: false,
  })
}
