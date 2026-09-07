import { apiMutate } from '~/utils/api-mutate'
import { useApiError, type MutationOutcome } from '~/composables/useApiError'
import { useInvalidate } from '~/composables/useInvalidate'

/**
 * Réconciliations d'avances remboursées (epic 19).
 *
 * Ce composable ne LIT rien : l'état de chaque ligne arrive déjà avec la liste des
 * transactions, calculé côté serveur en rejouant la neutralisation du moteur. Il ne porte que
 * les deux gestes qui écrivent.
 */
export function useSettlements() {
  const { mapMutationError } = useApiError()
  const invalidate = useInvalidate()

  async function link(label: string, transactionIds: number[]): Promise<MutationOutcome> {
    try {
      await apiMutate('/api/settlements', { method: 'POST', body: { label, transactionIds } })
    }
    catch (err) {
      return mapMutationError(err)
    }
    await invalidate.invalidateAnalysis()
    return { ok: true }
  }

  async function unlink(groupId: number): Promise<MutationOutcome> {
    try {
      await apiMutate(`/api/settlements/${groupId}`, { method: 'DELETE' })
    }
    catch (err) {
      return mapMutationError(err)
    }
    await invalidate.invalidateAnalysis()
    return { ok: true }
  }

  return { link, unlink }
}
