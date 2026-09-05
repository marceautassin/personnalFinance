import { apiMutate } from '~/utils/api-mutate'
import { useApiError } from '~/composables/useApiError'
import { useInvalidate } from '~/composables/useInvalidate'

/** Une ligne de relevé, telle que la renvoie `GET /api/transactions`. */
export interface RangeTransaction {
  id: number
  statementHash: string
  transactionDate: string
  label: string
  amountCents: number
  categoryItemCode: string
  isManual: boolean
}

/**
 * Transactions chargées poste par poste, pour la descente EN PLACE dans l'arbre d'analyse.
 *
 * Plusieurs postes peuvent être dépliés en même temps : les lignes sont donc mémorisées par
 * code de poste, et non dans un état unique comme le faisait le panneau de descente qu'elle
 * remplace.
 *
 * Le cache est vidé à chaque changement de période — des lignes d'un autre mois affichées sous
 * un total qui a changé seraient pire que pas de lignes du tout.
 */
export function useItemTransactions() {
  const byItem = ref<Record<string, RangeTransaction[]>>({})
  const loading = ref<string[]>([])
  const failed = ref<string[]>([])

  // Capturé en setup, avant tout `await` : voir `useInvalidate`.
  const invalidate = useInvalidate()
  const { mapError } = useApiError()

  async function load(itemCode: string, range: { from: string, to: string }) {
    if (byItem.value[itemCode] || loading.value.includes(itemCode)) return
    loading.value = [...loading.value, itemCode]
    failed.value = failed.value.filter(c => c !== itemCode)
    try {
      const res = await $fetch<{ transactions: RangeTransaction[] }>('/api/transactions', {
        query: { from: range.from, to: range.to, item: itemCode },
      })
      byItem.value = { ...byItem.value, [itemCode]: res.transactions }
    }
    catch {
      // Un échec de chargement se dit : sans ça, un poste déplié resterait vide et laisserait
      // croire qu'il ne contient rien — un mensonge sur des chiffres, précisément ce que NFR2
      // cherche à empêcher.
      failed.value = [...failed.value, itemCode]
    }
    finally {
      loading.value = loading.value.filter(c => c !== itemCode)
    }
  }

  /**
   * Reclasse une ligne depuis la descente d'analyse (FR34).
   *
   * La ligne quitte son poste et rejoint un autre : on la retire du cache de l'ancien et on
   * OUBLIE celui du nouveau, plutôt que d'y insérer la ligne à la main. Reconstruire l'état du
   * poste d'arrivée côté client, c'est se donner deux sources de vérité pour un même total —
   * un rechargement à l'ouverture coûte moins cher qu'un écran qui ment (NFR2).
   */
  async function recategorize(
    transaction: RangeTransaction,
    categoryItemCode: string,
  ): Promise<{ ok: true } | { error: string }> {
    if (categoryItemCode === transaction.categoryItemCode) return { ok: true }
    try {
      await apiMutate(`/api/transactions/${transaction.id}`, {
        method: 'PATCH',
        body: { categoryItemCode },
      })
    }
    catch (err) {
      return { error: mapError(err) }
    }
    byItem.value = Object.fromEntries(
      Object.entries(byItem.value)
        // Le poste d'ARRIVÉE est oublié, pas complété : il se rechargera à l'ouverture.
        .filter(([code]) => code !== categoryItemCode)
        .map(([code, lines]) => [
          code,
          code === transaction.categoryItemCode ? lines.filter(t => t.id !== transaction.id) : lines,
        ]),
    )
    await invalidate.invalidateAnalysis()
    return { ok: true }
  }

  function reset() {
    byItem.value = {}
    loading.value = []
    failed.value = []
  }

  return { byItem, loading, failed, load, reset, recategorize }
}
