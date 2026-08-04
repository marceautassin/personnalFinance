import type { MonthlyOverride, NewMonthlyOverride } from '~~/shared/schemas/monthly-override.schema'
import type { MutationOutcome } from './useApiError'
import { useInvalidate } from './useInvalidate'

/**
 * Overrides mois × catégorie variable (FR44) — lecture + upsert + suppression + invalidation.
 * Pas de `$fetch` direct en composant. Chaque mutation refetch la liste puis invalide le forecast
 * (implémentation réelle de l'invalidation = story 7.8).
 */
export function useOverrides() {
  const fetchState = useFetch<MonthlyOverride[]>('/api/overrides', {
    key: 'overrides',
    default: () => [],
    server: false,
  })

  const invalidate = useInvalidate()
  const { mapMutationError } = useApiError()

  async function runMutation(fn: () => Promise<unknown>): Promise<MutationOutcome> {
    try {
      await fn()
    }
    catch (err) {
      return mapMutationError(err)
    }
    await fetchState.refresh()
    await invalidate.invalidateForecast()
    return { ok: true }
  }

  function addOverride(input: NewMonthlyOverride): Promise<MutationOutcome> {
    return runMutation(() => apiMutate('/api/overrides', { method: 'POST', body: input }))
  }

  function removeOverride(id: number): Promise<MutationOutcome> {
    return runMutation(() => apiMutate(`/api/overrides/${id}`, { method: 'DELETE' }))
  }

  return { data: fetchState.data, pending: fetchState.pending, error: fetchState.error, refresh: fetchState.refresh, addOverride, removeOverride }
}
