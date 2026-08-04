import type { SasConfig, SasConfigPatch } from '~~/shared/schemas/sas-config.schema'
import type { MutationOutcome } from './useApiError'
import { useInvalidate } from './useInvalidate'
import { apiMutate } from '~/utils/api-mutate'

/**
 * Config SAS (singleton) — lecture + mutation partielle + invalidations.
 * Le type de lecture vient du schéma partagé (`SasConfigSchema`, AC#3) : le redéclarer ici
 * dupliquerait le contrat et laisserait les deux diverger.
 *
 * Mêmes conventions que `useRevenueModel` (story 5.3) : pas de `$fetch` dans les composants,
 * mutation réussie → refetch puis invalidation forecast + dashboard.
 */
export function useSasConfig() {
  const fetchState = useFetch<SasConfig>('/api/sas-config', {
    key: 'sas-config',
    server: false,
  })

  const invalidate = useInvalidate()
  const { mapMutationError } = useApiError()

  async function update(patch: SasConfigPatch): Promise<MutationOutcome> {
    try {
      await apiMutate('/api/sas-config', { method: 'PUT', body: patch })
    }
    catch (err) {
      return mapMutationError(err)
    }
    await fetchState.refresh()
    invalidate.invalidateForecast()
    invalidate.invalidateDashboard()
    return { ok: true }
  }

  return {
    data: fetchState.data,
    pending: fetchState.pending,
    error: fetchState.error,
    refresh: fetchState.refresh,
    update,
  }
}
