import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { cents } from '~~/shared/types/money'

const fetchMock = vi.fn()
vi.stubGlobal('$fetch', fetchMock)
// `ref` et `computed` sont auto-importés par Nuxt à l'exécution, pas sous Vitest.
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)

const { useTargetTransactions } = await import('./useTargetTransactions')

const RANGE = { from: '2026-04-01', to: '2026-04-30' }
const WINDOW = { from: '2026-01-01', to: '2026-12-31' }

/** Une ligne telle que l'endpoint la rend : montant du relevé ET montant effectif. */
const tx = (id: number, amountCents: number, effectiveAmountCents: number, itemCode = 'alimentation-courses') => ({
  id,
  statementHash: 'h',
  transactionDate: '2026-04-05',
  label: `op-${id}`,
  amountCents: cents(amountCents),
  effectiveAmountCents: cents(effectiveAmountCents),
  categoryItemCode: itemCode,
  isManual: false,
})

beforeEach(() => fetchMock.mockReset())

describe('useTargetTransactions', () => {
  /**
   * Le total d'une tranche doit valoir le POINT qu'on vient d'ouvrir. Le moteur écarte les
   * lignes couvertes : sommer les montants du relevé affichait sous le graphique un total qui
   * ne valait pas son point (story 19.4).
   */
  it('somme les montants effectifs, pas ceux du relevé', async () => {
    fetchMock.mockResolvedValueOnce({
      transactions: [tx(1, -31850, 0), tx(2, -4210, -4210), tx(3, -20000, -5000)],
    })
    const s = useTargetTransactions()
    await s.toggle('2026-04', RANGE, 'item:alimentation-courses', WINDOW)

    expect(s.groups.value).toHaveLength(1)
    expect(s.groups.value[0]!.totalCents).toBe(-9210)
  })

  it('déclare la fenêtre à l\'endpoint — la portée du moteur, pas celle de la tranche', async () => {
    fetchMock.mockResolvedValueOnce({ transactions: [] })
    const s = useTargetTransactions()
    await s.toggle('2026-04', RANGE, 'item:alimentation-courses', WINDOW)

    expect(fetchMock).toHaveBeenCalledWith('/api/transactions', {
      query: {
        from: RANGE.from,
        to: RANGE.to,
        settlementFrom: WINDOW.from,
        settlementTo: WINDOW.to,
        item: 'alimentation-courses',
      },
    })
  })

  it('regroupe par poste et ordonne par poids décroissant', async () => {
    fetchMock.mockResolvedValueOnce({
      transactions: [
        tx(1, -1000, -1000, 'alimentation-courses'),
        tx(2, -5000, -5000, 'alimentation-restaurant'),
        tx(3, -2000, -2000, 'alimentation-courses'),
      ],
    })
    const s = useTargetTransactions()
    await s.toggle('2026-04', RANGE, 'group:alimentation', WINDOW)

    expect(s.groups.value.map(g => [g.itemCode, g.totalCents]))
      .toEqual([['alimentation-restaurant', -5000], ['alimentation-courses', -3000]])
  })

  /** Une tranche entièrement neutralisée totalise zéro — et le dit, plutôt que d'être vide. */
  it('rend un total nul quand toutes les lignes sont neutralisées', async () => {
    fetchMock.mockResolvedValueOnce({ transactions: [tx(1, -31850, 0), tx(2, -6600, 0)] })
    const s = useTargetTransactions()
    await s.toggle('2026-04', RANGE, 'item:alimentation-courses', WINDOW)

    expect(s.groups.value[0]!.totalCents).toBe(0)
    expect(s.groups.value[0]!.transactions).toHaveLength(2)
  })
})
