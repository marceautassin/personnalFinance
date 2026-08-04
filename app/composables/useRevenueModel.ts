import type { RevenueModel, RevenueModelPatch } from '~~/shared/schemas/revenue-model.schema'
import type { MutationOutcome } from './useApiError'
import { useInvalidate } from './useInvalidate'
import { apiMutate } from '~/utils/api-mutate'

/**
 * Modèle de revenus (singleton) — lecture + mutation partielle + invalidations.
 * Le type de lecture vient du schéma partagé (`RevenueModelSchema`, AC#3) plutôt que d'une
 * interface redéclarée ici, qui dupliquerait le contrat.
 *
 * Chaque panneau UI soumet uniquement ses champs via `update(patch)` ; le serveur applique
 * le patch. Toute la logique de mutation vit ici (CLAUDE.md : pas de `$fetch` dans les
 * composants). Une mutation réussie refetch puis invalide forecast + dashboard.
 */
export function useRevenueModel() {
  const fetchState = useFetch<RevenueModel>('/api/revenues', {
    key: 'revenue-model',
    server: false,
  })

  // Capturés en setup (avant tout `await`) pour préserver le contexte Nuxt.
  const invalidate = useInvalidate()
  const { mapMutationError } = useApiError()

  async function update(patch: RevenueModelPatch): Promise<MutationOutcome> {
    try {
      await apiMutate('/api/revenues', { method: 'PUT', body: patch })
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
