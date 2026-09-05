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

  function reset() {
    byItem.value = {}
    loading.value = []
    failed.value = []
  }

  return { byItem, loading, failed, load, reset }
}
