import type { Cents } from '~~/shared/types/money'
import { apiMutate } from '~/utils/api-mutate'
import { useApiError } from '~/composables/useApiError'
import { useInvalidate } from '~/composables/useInvalidate'

/** Une ligne de relevé, telle que la renvoie `GET /api/transactions`. */
export interface RangeTransaction {
  id: number
  statementHash: string
  transactionDate: string
  label: string
  amountCents: Cents
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
 *
 * **Correctif du 2026-09-06 (story 17.6).** Vider ne suffisait pas : un poste resté OUVERT
 * gardait son état d'ouverture et affichait « 0 ligne(s), total 0,00 € » sous un montant non
 * nul, faute d'être rechargé. C'est exactement le mensonge que NFR2 interdit. `setRange()`
 * remplace donc `reset()` : il vide ET recharge ce qui est ouvert. Un jeton de génération
 * neutralise au passage les réponses tardives d'une période qu'on a déjà quittée.
 */
export function useItemTransactions() {
  const byItem = ref<Record<string, RangeTransaction[]>>({})
  const loading = ref<string[]>([])
  const failed = ref<string[]>([])

  /**
   * Période courante et jeton de génération.
   *
   * Sans jeton, la réponse d'un chargement lancé sur mars pouvait arriver APRÈS le passage à
   * avril et s'afficher sous les totaux d'avril. Ce ne sont pas des variables réactives : rien
   * ne les affiche, elles arbitrent.
   */
  let currentRange: { from: string, to: string } | null = null
  let generation = 0

  /**
   * Postes OUVERTS, tenus à part du cache.
   *
   * Les déduire de `byItem` était faux (revue du 2026-09-06) : `setRange` vide le cache avant
   * que les réponses n'arrivent, si bien qu'un second changement de période lisait un cache
   * vide et ne rechargeait plus rien. Deux clics sur le stepper plus rapides qu'un aller-retour
   * réseau suffisaient à figer un poste déplié sur « 0 ligne(s) », définitivement.
   */
  const openCodes = new Set<string>()

  // Capturé en setup, avant tout `await` : voir `useInvalidate`.
  const invalidate = useInvalidate()
  const { mapError } = useApiError()

  async function load(itemCode: string, range: { from: string, to: string }) {
    openCodes.add(itemCode)
    if (byItem.value[itemCode] || loading.value.includes(itemCode)) return
    currentRange = range
    await fetchItem(itemCode, range, generation)
  }

  /** Chargement effectif, rattaché à une génération : une réponse périmée est jetée. */
  async function fetchItem(itemCode: string, range: { from: string, to: string }, token: number) {
    loading.value = [...loading.value, itemCode]
    failed.value = failed.value.filter(c => c !== itemCode)
    try {
      const res = await $fetch<{ transactions: RangeTransaction[] }>('/api/transactions', {
        query: { from: range.from, to: range.to, item: itemCode },
      })
      // La période a changé pendant l'appel : ces lignes ne décrivent plus ce qui est affiché.
      if (token !== generation) return
      byItem.value = { ...byItem.value, [itemCode]: res.transactions }
    }
    catch {
      // Un échec de chargement se dit : sans ça, un poste déplié resterait vide et laisserait
      // croire qu'il ne contient rien — un mensonge sur des chiffres, précisément ce que NFR2
      // cherche à empêcher.
      if (token !== generation) return
      failed.value = [...failed.value, itemCode]
    }
    finally {
      if (token === generation) loading.value = loading.value.filter(c => c !== itemCode)
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
    const destinationWasOpen = openCodes.has(categoryItemCode)
    byItem.value = Object.fromEntries(
      Object.entries(byItem.value)
        .filter(([code]) => code !== categoryItemCode)
        .map(([code, lines]) => [
          code,
          code === transaction.categoryItemCode ? lines.filter(t => t.id !== transaction.id) : lines,
        ]),
    )
    // Le poste d'ARRIVÉE, s'il était ouvert, est RECHARGÉ — pas seulement oublié (story 17.6).
    // L'oublier laissait l'utilisateur devant « 0 ligne(s) » sous un total qui venait justement
    // d'augmenter de la ligne déplacée.
    if (destinationWasOpen && currentRange) {
      await fetchItem(categoryItemCode, currentRange, generation)
    }
    await invalidate.invalidateAnalysis()
    return { ok: true }
  }

  /**
   * Change de période : vide le cache et RECHARGE les postes qui étaient ouverts.
   *
   * L'incrément de génération invalide au passage tout chargement encore en vol.
   */
  async function setRange(range: { from: string, to: string }) {
    generation += 1
    currentRange = range
    byItem.value = {}
    loading.value = []
    failed.value = []
    await Promise.all([...openCodes].map(code => fetchItem(code, range, generation)))
  }

  /** Un poste replié quitte le cache : le rouvrir doit redemander des lignes fraîches. */
  function forget(itemCode: string) {
    openCodes.delete(itemCode)
    const { [itemCode]: _dropped, ...rest } = byItem.value
    byItem.value = rest
    failed.value = failed.value.filter(c => c !== itemCode)
  }

  return { byItem, loading, failed, load, setRange, forget, recategorize }
}
