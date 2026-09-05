import { describe, it, expect, vi, beforeEach } from 'vitest'

import { ref } from 'vue'

const fetchMock = vi.fn()
vi.stubGlobal('$fetch', fetchMock)
// `ref` est auto-importé par Nuxt à l'exécution, pas sous Vitest : on le fournit tel quel
// plutôt que d'ajouter un import au code de production que Nuxt rendrait redondant.
vi.stubGlobal('ref', ref)

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

beforeEach(() => fetchMock.mockReset())

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
