import { describe, it, expect, vi, beforeEach } from 'vitest'

import { ref } from 'vue'

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
  amountCents: -100,
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

  /** Changer de période vide le cache : des lignes d'un autre mois sous un total qui a changé. */
  it('oublie tout au changement de période', async () => {
    fetchMock.mockResolvedValueOnce({ transactions: [tx(1)] })
    const s = useItemTransactions()
    await s.load('alimentation-courses', RANGE)
    s.reset()

    expect(s.byItem.value).toEqual({})
    expect(s.failed.value).toEqual([])
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
  it('retire la ligne de son ancien poste et oublie le nouveau', async () => {
    fetchMock.mockResolvedValueOnce({ transactions: [tx(1), tx(2)] })
    fetchMock.mockResolvedValueOnce({ transactions: [tx(9)] })
    const s = useItemTransactions()
    await s.load('alimentation-courses', RANGE)
    await s.load('transport-carburant', RANGE)

    fetchMock.mockResolvedValueOnce({})
    const outcome = await s.recategorize(tx(1), 'transport-carburant')

    expect(outcome).toEqual({ ok: true })
    expect(s.byItem.value['alimentation-courses']!.map(t => t.id)).toEqual([2])
    expect(s.byItem.value).not.toHaveProperty('transport-carburant')
    expect(refreshMock).toHaveBeenCalled()
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
