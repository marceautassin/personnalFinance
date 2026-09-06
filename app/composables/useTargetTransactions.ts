import type { RangeTransaction } from '~/composables/useItemTransactions'
import { cents, type Cents } from '~~/shared/types/money'

/**
 * Lignes d'une tranche pour la cible suivie, sur `/evolution` (story 16.5).
 *
 * **Pourquoi ce composable existe.** Suivre une rubrique sur douze tranches sans pouvoir en
 * ouvrir une seule laissait un graphique invérifiable — l'inverse de NFR2, qui veut qu'un
 * montant affiché mène toujours à ses lignes. La cible est une rubrique OU un poste : c'est
 * l'endpoint qui sait filtrer les deux depuis le 2026-09-06, plutôt que le client qui agrège.
 *
 * Une seule tranche est ouverte à la fois : ici on inspecte un point de la courbe, on ne
 * compare pas plusieurs tranches entre elles — c'est le rôle du tableau au-dessus.
 */
/** Les lignes d'une tranche, rassemblées sous leur poste. */
export interface TargetTransactionGroup {
  itemCode: string
  transactions: RangeTransaction[]
  totalCents: Cents
}

export function useTargetTransactions() {
  const openBucket = ref<string | null>(null)
  const transactions = ref<RangeTransaction[]>([])
  const loading = ref(false)
  const failed = ref(false)

  /** Neutralise les réponses d'une tranche qu'on a déjà quittée. */
  let generation = 0

  async function toggle(bucket: string, range: { from: string, to: string }, target: string) {
    generation += 1
    const token = generation

    if (openBucket.value === bucket) {
      openBucket.value = null
      transactions.value = []
      failed.value = false
      return
    }

    openBucket.value = bucket
    transactions.value = []
    failed.value = false
    loading.value = true

    // `group:alimentation` ou `item:alimentation-courses` — la cible porte son propre type,
    // et l'endpoint refuse qu'on lui passe les deux.
    const [kind, code] = target.split(':')
    try {
      const res = await $fetch<{ transactions: RangeTransaction[] }>('/api/transactions', {
        query: {
          from: range.from,
          to: range.to,
          ...(kind === 'group' ? { group: code } : { item: code }),
        },
      })
      if (token !== generation) return
      transactions.value = res.transactions
    }
    catch {
      // Un échec se dit : une tranche ouverte et vide laisserait croire qu'elle ne contient
      // rien, alors que le graphique juste au-dessus affiche un montant (NFR2).
      if (token !== generation) return
      failed.value = true
    }
    finally {
      if (token === generation) loading.value = false
    }
  }

  /** Changer de cible ou de fenêtre referme la tranche : ses lignes ne la décrivent plus. */
  function reset() {
    generation += 1
    openBucket.value = null
    transactions.value = []
    loading.value = false
    failed.value = false
  }

  /**
   * Lignes regroupées par POSTE, du plus lourd au plus léger (demande du 2026-09-06).
   *
   * Sur une rubrique comme Alimentation, une tranche peut porter cinquante lignes : les lire à
   * plat oblige à trier des courses, des restaurants et du fast-food de tête, alors que c'est
   * justement leur répartition qu'on est venu chercher. Le tri suit la MAGNITUDE : sur des
   * dépenses, toutes négatives, un tri décroissant brut remonterait le poste le plus faible.
   */
  const groups = computed<TargetTransactionGroup[]>(() => {
    const byItem = new Map<string, RangeTransaction[]>()
    for (const tx of transactions.value) {
      const bucket = byItem.get(tx.categoryItemCode)
      if (bucket) bucket.push(tx)
      else byItem.set(tx.categoryItemCode, [tx])
    }
    return [...byItem.entries()]
      .map(([itemCode, txs]) => ({
        itemCode,
        transactions: txs,
        totalCents: cents(txs.reduce((sum, t) => sum + t.amountCents, 0)),
      }))
      .sort((a, b) => Math.abs(b.totalCents) - Math.abs(a.totalCents))
  })

  return { openBucket, transactions, groups, loading, failed, toggle, reset }
}
