import { apiMutate } from '~/utils/api-mutate'
import { useApiError } from '~/composables/useApiError'
import { useInvalidate } from '~/composables/useInvalidate'
import { usePeriodBounds } from '~/composables/usePeriodBounds'
import type { RangeTransaction } from '~/composables/useItemTransactions'
import { FALLBACK_ITEM_CODE } from '~~/shared/constants/default-referential'
import { cents, type Cents } from '~~/shared/types/money'
import { merchantKey } from '~~/shared/utils/bank-label'

/** Un paquet de lignes partageant le même libellé normalisé. */
export interface UncategorizedGroup {
  /** Clé de regroupement : le libellé débarrassé de sa date et de son numéro de carte. */
  key: string
  /**
   * Motif de règle exploitable, ou `null` quand le libellé n'identifie aucun commerçant.
   *
   * Distinct de `key` : le regroupement doit TOUJOURS rendre une clé, quitte à retomber sur le
   * libellé entier pour qu'un chèque reste seul dans son coin. Mais ce repli — date et numéro
   * de carte compris — ferait une règle qui ne se déclencherait jamais deux fois. Proposer une
   * règle exige donc un motif, pas une clé (revue du 2026-09-06).
   */
  rulePattern: string | null
  /** Libellé brut le plus récent du groupe, montré tel quel — c'est ce que la banque a écrit. */
  sampleLabel: string
  transactions: RangeTransaction[]
  totalCents: Cents
}

/**
 * Les lignes tombées au poste de repli, sur TOUT l'historique (story 18.10).
 *
 * **Pourquoi un écran plutôt qu'un filtre.** L'arbitrage initial avait retenu des filtres sur
 * la vue mensuelle ; à l'usage, « c'est assez pénible de refaire le filtre quand on repasse
 * sur la page ». Surtout, le repli se vide sur toute la plage, pas mois par mois : 307 lignes
 * réparties sur vingt relevés, c'est vingt allers-retours contre un seul écran.
 *
 * **Le regroupement fait le travail.** Les libellés bancaires sont très répétitifs, aux date et
 * numéro de carte près. Ranger un groupe de sept lignes d'un geste, c'est sept corrections en
 * une — et le motif du groupe est précisément celui d'une bonne règle.
 */
export function useUncategorized() {
  const { mapError, mapMutationError } = useApiError()
  const invalidate = useInvalidate()

  const bounds = usePeriodBounds()

  const range = computed(() => ({
    from: bounds.data.value.firstDate ?? '1970-01-01',
    to: bounds.data.value.lastDate ?? '2999-12-31',
  }))

  const fetchState = useFetch<{ transactions: RangeTransaction[] }>('/api/transactions', {
    key: 'uncategorized',
    query: computed(() => ({ from: range.value.from, to: range.value.to, item: FALLBACK_ITEM_CODE })),
    default: () => ({ transactions: [] }),
    server: false,
    immediate: false,
    // `watch: false` : sans lui, le changement de `range` déclenche un refetch interne EN PLUS
    // du `watch` ci-dessous, soit deux requêtes pour un seul chargement (revue du 2026-09-06).
    watch: false,
  })

  // La plage n'est connue qu'après `/api/periods` : sans cette attente, le premier appel
  // partirait sur des bornes inventées.
  watch(() => bounds.data.value.firstDate, (first) => {
    if (first !== null) void fetchState.refresh()
  }, { immediate: true })

  const pending = computed(() => bounds.pending.value || fetchState.pending.value)
  const error = computed(() => bounds.error.value ?? fetchState.error.value)
  const errorMessage = computed(() => (error.value ? mapError(error.value) : null))

  const total = computed(() => fetchState.data.value.transactions.length)

  /**
   * Groupes triés par POIDS, du plus lourd au plus léger.
   *
   * L'ordre n'est pas cosmétique : ranger d'abord le groupe de sept lignes fait tomber le repli
   * plus vite que d'attaquer par les lignes uniques.
   */
  const groups = computed<UncategorizedGroup[]>(() => {
    const byKey = new Map<string, RangeTransaction[]>()
    for (const tx of fetchState.data.value.transactions) {
      const key = groupKey(tx.label)
      const bucket = byKey.get(key)
      if (bucket) bucket.push(tx)
      else byKey.set(key, [tx])
    }

    return [...byKey.entries()]
      .map(([key, txs]) => ({
        key,
        rulePattern: merchantKey(txs[0]!.label),
        sampleLabel: [...txs].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))[0]!.label,
        transactions: [...txs].sort((a, b) => a.transactionDate.localeCompare(b.transactionDate)),
        totalCents: cents(txs.reduce((sum, t) => sum + t.amountCents, 0)),
      }))
      // `Math.abs` départage à nombre de lignes égal : on compare des POIDS, pas de l'argent.
      // L'anti-pattern de CLAUDE.md vise les fonctions de calcul, pas un ordre d'affichage.
      .sort((a, b) => b.transactions.length - a.transactions.length
        || Math.abs(b.totalCents) - Math.abs(a.totalCents))
  })

  /**
   * Range toutes les lignes d'un groupe d'un seul geste.
   *
   * Les `PATCH` partent en série et non en parallèle : chacun relit la ligne avant de l'écrire,
   * et les lancer ensemble sur une base SQLite synchrone n'accélérerait rien tout en rendant
   * l'ordre des erreurs illisible. Un seul rafraîchissement à la fin.
   */
  async function assignGroup(group: UncategorizedGroup, categoryItemCode: string) {
    let done = 0
    for (const tx of group.transactions) {
      try {
        await apiMutate(`/api/transactions/${tx.id}`, {
          method: 'PATCH',
          body: { categoryItemCode },
        })
      }
      catch (err) {
        // On s'arrête à la première ligne refusée. Le compte de ce qui est DÉJÀ passé remonte
        // avec l'erreur : sans lui, l'utilisateur voit un échec et un compteur qui a bougé,
        // sans savoir où le groupe en est.
        await fetchState.refresh()
        await invalidate.invalidateAnalysis()
        return { ...mapMutationError(err), doneCount: done }
      }
      done++
    }
    await fetchState.refresh()
    await invalidate.invalidateAnalysis()
    return { ok: true as const }
  }

  /** Recharge la liste ET les vues d'analyse — après un effet de bord venu d'ailleurs. */
  async function reload() {
    await fetchState.refresh()
    await invalidate.invalidateAnalysis()
  }

  return { groups, total, pending, error, errorMessage, assignGroup, reload }
}

/**
 * Clé de regroupement d'un libellé.
 *
 * S'appuie sur `merchantKey`, LA MÊME fonction qui propose un motif de règle après une
 * correction. C'est un invariant, pas du confort : l'écran range un groupe puis propose sa clé
 * comme motif de règle. Deux nettoyages différents produiraient une règle qui ne couvre pas le
 * groupe dont elle est née.
 *
 * Quand rien d'exploitable ne reste — un chèque, qui n'a qu'un numéro — la ligne reste SEULE
 * dans son groupe. Réunir les résidus mélangerait des dépenses sans rapport, un restaurant et
 * des frais scolaires sous la même clé.
 */
export function groupKey(label: string): string {
  return merchantKey(label) ?? label.toLowerCase()
}
