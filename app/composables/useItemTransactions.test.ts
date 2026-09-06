import { describe, it, expect, vi, beforeEach } from 'vitest'

import { ref } from 'vue'
import { cents } from '~~/shared/types/money'

const fetchMock = vi.fn()
vi.stubGlobal('$fetch', fetchMock)
// `ref` est auto-importé par Nuxt à l'exécution, pas sous Vitest : on le fournit tel quel
// plutôt que d'ajouter un import au code de production que Nuxt rendrait redondant.
vi.stubGlobal('ref', ref)

// `useInvalidate` capture `useNuxtApp()` : hors runtime Nuxt, on rejoue juste `runWithContext`.
const refreshMock = vi.fn()
vi.stubGlobal('useNuxtApp', () => ({ runWithContext: (fn: () => unknown) => fn() }))
vi.stubGlobal('refreshNuxtData', refreshMock)

const { useItemTransactions } = await import('./useItemTransactions')

const RANGE = { from: '2026-03-01', to: '2026-03-31' }
const tx = (id: number) => ({
  id,
  statementHash: 'h',
  transactionDate: '2026-03-05',
  label: `op-${id}`,
  amountCents: cents(-100),
  categoryItemCode: 'alimentation-courses',
  isManual: false,
})

beforeEach(() => {
  fetchMock.mockReset()
  refreshMock.mockReset()
})

describe('useItemTransactions', () => {
  it('charge les lignes d\'un poste et les mémorise par code', async () => {
    fetchMock.mockResolvedValueOnce({ transactions: [tx(1), tx(2)] })
    const s = useItemTransactions()
    await s.load('alimentation-courses', RANGE)

    expect(s.byItem.value['alimentation-courses']).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledWith('/api/transactions', {
      query: { from: RANGE.from, to: RANGE.to, item: 'alimentation-courses' },
    })
  })

  /** Replier puis redéplier un poste ne doit pas rappeler le serveur. */
  it('ne recharge pas un poste déjà chargé', async () => {
    fetchMock.mockResolvedValueOnce({ transactions: [tx(1)] })
    const s = useItemTransactions()
    await s.load('alimentation-courses', RANGE)
    await s.load('alimentation-courses', RANGE)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('garde plusieurs postes ouverts en même temps', async () => {
    fetchMock
      .mockResolvedValueOnce({ transactions: [tx(1)] })
      .mockResolvedValueOnce({ transactions: [tx(2), tx(3)] })
    const s = useItemTransactions()
    await s.load('alimentation-courses', RANGE)
    await s.load('alimentation-restaurant', RANGE)

    expect(Object.keys(s.byItem.value).sort())
      .toEqual(['alimentation-courses', 'alimentation-restaurant'])
  })

  /**
   * Un échec doit se DIRE : un poste déplié et vide laisserait croire qu'il ne contient rien,
   * alors que son total annonce le contraire — un mensonge sur des chiffres, ce que NFR2
   * cherche justement à empêcher.
   */
  it('signale un échec de chargement au lieu de rester vide', async () => {
    fetchMock.mockRejectedValueOnce(new Error('réseau'))
    const s = useItemTransactions()
    await s.load('alimentation-courses', RANGE)

    expect(s.failed.value).toEqual(['alimentation-courses'])
    expect(s.byItem.value['alimentation-courses']).toBeUndefined()
    expect(s.loading.value).toEqual([])
  })

  it('permet de réessayer après un échec', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('réseau'))
      .mockResolvedValueOnce({ transactions: [tx(1)] })
    const s = useItemTransactions()
    await s.load('alimentation-courses', RANGE)
    await s.load('alimentation-courses', RANGE)

    expect(s.failed.value).toEqual([])
    expect(s.byItem.value['alimentation-courses']).toHaveLength(1)
  })

  /**
   * Story 17.6 — changer de période RECHARGE les postes ouverts.
   *
   * Les vider sans les recharger laissait un poste déplié afficher « 0 ligne(s), total
   * 0,00 € » sous un montant non nul : le mensonge exact que NFR2 interdit.
   */
  describe('changement de période (story 17.6)', () => {
    const NEXT = { from: '2026-04-01', to: '2026-04-30' }

    it('recharge les postes ouverts sur la nouvelle période', async () => {
      fetchMock.mockResolvedValueOnce({ transactions: [tx(1)] })
      const s = useItemTransactions()
      await s.load('alimentation-courses', RANGE)

      fetchMock.mockResolvedValueOnce({ transactions: [tx(42)] })
      await s.setRange(NEXT)

      expect(s.byItem.value['alimentation-courses']!.map(t => t.id)).toEqual([42])
      expect(fetchMock).toHaveBeenLastCalledWith('/api/transactions', {
        query: { from: NEXT.from, to: NEXT.to, item: 'alimentation-courses' },
      })
    })

    it('ne recharge rien quand aucun poste n\'est ouvert', async () => {
      const s = useItemTransactions()
      await s.setRange(NEXT)

      expect(s.byItem.value).toEqual({})
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('ignore la réponse d\'un chargement lancé sur la période précédente', async () => {
      const s = useItemTransactions()
      let releaseStale: (v: unknown) => void = () => {}
      fetchMock.mockReturnValueOnce(new Promise((resolve) => {
        releaseStale = resolve
      }))
      const stale = s.load('alimentation-courses', RANGE)

      // La période change AVANT que la réponse de mars n'arrive.
      await s.setRange(NEXT)
      releaseStale({ transactions: [tx(1)] })
      await stale

      expect(s.byItem.value).toEqual({})
      expect(s.loading.value).toEqual([])
    })

    /**
     * Défaut trouvé en revue le 2026-09-06 : les postes à recharger étaient déduits de
     * `byItem`, que `setRange` vide AVANT l'arrivée des réponses. Un second changement de
     * période lisait donc un cache vide et ne rechargeait plus rien — le poste restait déplié
     * sur « 0 ligne(s) », définitivement. Deux clics rapides sur le stepper suffisaient.
     */
    it('recharge encore après DEUX changements de période rapprochés', async () => {
      fetchMock.mockResolvedValueOnce({ transactions: [tx(1)] })
      const s = useItemTransactions()
      await s.load('alimentation-courses', RANGE)

      // La réponse d'avril reste en vol quand mai arrive.
      fetchMock.mockReturnValueOnce(new Promise(() => {}))
      const toApril = s.setRange(NEXT)

      fetchMock.mockResolvedValueOnce({ transactions: [tx(77)] })
      await s.setRange({ from: '2026-05-01', to: '2026-05-31' })

      expect(s.byItem.value['alimentation-courses']!.map(t => t.id)).toEqual([77])
      void toApril
    })

    it('oublie un poste replié, pour que sa réouverture redemande des lignes', async () => {
      fetchMock.mockResolvedValueOnce({ transactions: [tx(1)] })
      const s = useItemTransactions()
      await s.load('alimentation-courses', RANGE)
      s.forget('alimentation-courses')

      expect(s.byItem.value).toEqual({})

      fetchMock.mockResolvedValueOnce({ transactions: [tx(2)] })
      await s.load('alimentation-courses', RANGE)
      expect(s.byItem.value['alimentation-courses']!.map(t => t.id)).toEqual([2])
    })
  })
})

/**
 * Reclassement depuis la descente d'analyse.
 *
 * Le point sensible n'est pas l'appel : c'est l'état du cache après coup. Une ligne qui resterait
 * affichée sous son ancien poste, ou un poste d'arrivée complété à la main, ferait diverger
 * l'écran des totaux recalculés par le serveur — exactement ce que NFR2 interdit.
 */
describe('useItemTransactions — reclassement', () => {
  /**
   * Story 17.6 — le poste d'ARRIVÉE est rechargé, pas seulement oublié.
   *
   * L'oublier laissait l'utilisateur devant « 0 ligne(s) » sous un total qui venait justement
   * d'augmenter de la ligne déplacée.
   */
  it('retire la ligne de son ancien poste et recharge le nouveau', async () => {
    fetchMock.mockResolvedValueOnce({ transactions: [tx(1), tx(2)] })
    fetchMock.mockResolvedValueOnce({ transactions: [tx(9)] })
    const s = useItemTransactions()
    await s.load('alimentation-courses', RANGE)
    await s.load('transport-carburant', RANGE)

    fetchMock.mockResolvedValueOnce({})
    fetchMock.mockResolvedValueOnce({ transactions: [tx(9), tx(1)] })
    const outcome = await s.recategorize(tx(1), 'transport-carburant')

    expect(outcome).toEqual({ ok: true })
    expect(s.byItem.value['alimentation-courses']!.map(t => t.id)).toEqual([2])
    expect(s.byItem.value['transport-carburant']!.map(t => t.id)).toEqual([9, 1])
    expect(refreshMock).toHaveBeenCalled()
  })

  /** Un poste d'arrivée FERMÉ n'est pas chargé pour rien : il le sera à son ouverture. */
  it('ne charge pas un poste d\'arrivée qui n\'était pas ouvert', async () => {
    fetchMock.mockResolvedValueOnce({ transactions: [tx(1)] })
    const s = useItemTransactions()
    await s.load('alimentation-courses', RANGE)

    fetchMock.mockResolvedValueOnce({})
    await s.recategorize(tx(1), 'transport-carburant')

    expect(s.byItem.value).not.toHaveProperty('transport-carburant')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  /** Les postes non concernés ne bougent pas : un reclassement n'invalide pas tout le cache. */
  it('laisse intacts les autres postes chargés', async () => {
    fetchMock.mockResolvedValueOnce({ transactions: [tx(1)] })
    fetchMock.mockResolvedValueOnce({ transactions: [tx(7)] })
    const s = useItemTransactions()
    await s.load('alimentation-courses', RANGE)
    await s.load('loisirs-sorties', RANGE)

    fetchMock.mockResolvedValueOnce({})
    await s.recategorize(tx(1), 'transport-carburant')

    expect(s.byItem.value['loisirs-sorties']!.map(t => t.id)).toEqual([7])
  })

  /** Reclasser vers le poste courant n'appelle rien : ce n'est pas un changement. */
  it('ne fait rien quand le poste est déjà le bon', async () => {
    const s = useItemTransactions()
    const outcome = await s.recategorize(tx(1), 'alimentation-courses')

    expect(outcome).toEqual({ ok: true })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  /** Un échec ne doit RIEN retirer de l'écran : la ligne est toujours là où elle était. */
  it('rend une erreur et ne touche pas au cache quand le serveur refuse', async () => {
    fetchMock.mockResolvedValueOnce({ transactions: [tx(1)] })
    const s = useItemTransactions()
    await s.load('alimentation-courses', RANGE)

    fetchMock.mockRejectedValueOnce(new Error('boom'))
    const outcome = await s.recategorize(tx(1), 'transport-carburant')

    expect(outcome).toHaveProperty('error')
    expect(s.byItem.value['alimentation-courses']).toHaveLength(1)
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
