import type { MutationOutcome } from './useApiError'
import { useApiError } from './useApiError'
import { useInvalidate } from './useInvalidate'

/**
 * Fabrique un `runMutation` partagé : exécute la mutation, mappe l'erreur métier en
 * `MutationOutcome`, puis refetch la ressource + invalide forecast/dashboard (stubs
 * jusqu'à Story 7.8). Factorise le wrapper autrefois dupliqué dans les composables de
 * mutation (DRY, cf. CLAUDE.md).
 *
 * `afterRefresh` (optionnel) : invalidations ciblées supplémentaires (ex. clé `debt-impact-<id>`)
 * exécutées après le refetch principal et avant les invalidations transversales.
 */
export function useMutations(refresh: () => Promise<unknown>) {
  const invalidate = useInvalidate()
  const { mapMutationError } = useApiError()

  return async function runMutation(
    fn: () => Promise<unknown>,
    afterRefresh?: () => Promise<unknown> | unknown,
  ): Promise<MutationOutcome> {
    try {
      await fn()
    }
    catch (err) {
      return mapMutationError(err)
    }
    await refresh()
    if (afterRefresh) await afterRefresh()
    invalidate.invalidateAnalysis()
    return { ok: true }
  }
}
