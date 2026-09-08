import { describe, it, expect } from 'vitest'
import { settlementEffectByTransaction } from './settlement-status'

/** Une ligne de test — seul ce que la dérivation lit est renseigné. */
function line(
  id: number,
  amountCents: number,
  settlementGroupId: number | null,
  transactionDate = '2026-04-10',
) {
  return { id, transactionDate, amountCents, categoryItemCode: 'alimentation-courses', settlementGroupId }
}

describe('settlementEffectByTransaction', () => {
  it('ignore les lignes hors groupe — elles ne sont pas dans la Map', () => {
    const out = settlementEffectByTransaction([line(1, -4210, null), line(2, 250000, null)])
    expect(out.size).toBe(0)
  })

  it('couverture exacte : les deux côtés sont neutralisés et ne pèsent plus rien', () => {
    const out = settlementEffectByTransaction([
      line(1, -31850, 7, '2026-04-12'),
      line(2, 31850, 7, '2026-04-20'),
    ])
    expect(out.get(1)).toEqual({ status: 'neutralized', effectiveAmountCents: 0 })
    expect(out.get(2)).toEqual({ status: 'neutralized', effectiveAmountCents: 0 })
  })

  it('couverture partielle : le reste à charge demeure sur l\'avance', () => {
    const out = settlementEffectByTransaction([
      line(1, -20000, 7, '2026-04-12'),
      line(2, 15000, 7, '2026-04-20'),
    ])
    expect(out.get(1)).toEqual({ status: 'partial', effectiveAmountCents: -5000 })
    expect(out.get(2)).toEqual({ status: 'neutralized', effectiveAmountCents: 0 })
  })

  it('groupe ouvert : sans remboursement, l\'avance compte pour son montant entier', () => {
    const out = settlementEffectByTransaction([line(1, -20000, 7)])
    expect(out.get(1)).toEqual({ status: 'outstanding', effectiveAmountCents: -20000 })
  })

  it('excédent : le surplus reste une recette, porté par le remboursement', () => {
    const out = settlementEffectByTransaction([
      line(1, -10000, 7, '2026-04-12'),
      line(2, 15000, 7, '2026-04-20'),
    ])
    expect(out.get(1)).toEqual({ status: 'neutralized', effectiveAmountCents: 0 })
    expect(out.get(2)).toEqual({ status: 'partial', effectiveAmountCents: 5000 })
  })

  it('imputation sur les avances les plus ANCIENNES d\'abord', () => {
    const out = settlementEffectByTransaction([
      line(1, -10000, 7, '2026-04-02'),
      line(2, -10000, 7, '2026-04-25'),
      line(3, 10000, 7, '2026-04-28'),
    ])
    expect(out.get(1)).toEqual({ status: 'neutralized', effectiveAmountCents: 0 })
    expect(out.get(2)).toEqual({ status: 'outstanding', effectiveAmountCents: -10000 })
  })

  /*
   * La portée fait le résultat. Ces deux cas sont ceux qui cassaient l'écran : donner au calcul
   * autre chose que les lignes de la période agrégée lui fait dire autre chose que le moteur.
   */
  it('remboursement hors période : l\'avance reste à charge dans SON mois', () => {
    // Seules les lignes de janvier sont passées — le virement de mars n'en est pas.
    const out = settlementEffectByTransaction([line(1, -20000, 7, '2026-01-12')])
    expect(out.get(1)).toEqual({ status: 'outstanding', effectiveAmountCents: -20000 })
  })

  it('un groupe amputé de son remboursement dirait le contraire du moteur', () => {
    const complet = settlementEffectByTransaction([
      line(1, -31850, 7, '2026-04-12'),
      line(2, 31850, 7, '2026-04-20'),
    ])
    const ampute = settlementEffectByTransaction([line(1, -31850, 7, '2026-04-12')])
    expect(complet.get(1)?.status).toBe('neutralized')
    expect(ampute.get(1)?.status).toBe('outstanding')
  })

  it('la somme des montants effectifs d\'un poste égale ce que le moteur agrège', () => {
    const out = settlementEffectByTransaction([
      line(1, -31850, 7, '2026-04-12'),
      line(2, 31850, 7, '2026-04-20'),
      line(3, -20000, 8, '2026-04-15'),
      line(4, 15000, 8, '2026-04-22'),
    ])
    const total = [...out.values()].reduce((sum, e) => sum + e.effectiveAmountCents, 0)
    expect(total).toBe(-5000)
  })
})
