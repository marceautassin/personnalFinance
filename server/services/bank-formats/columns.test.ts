import { describe, it, expect } from 'vitest'
import {
  findDebitCreditSeparator,
  findDebitCreditHeader,
  operationRows,
  renderRows,
  DEBIT_MARKER,
  CREDIT_MARKER,
} from './columns'
import type { PositionedItem } from './types'

/**
 * Reconstruction en colonnes (2026-09-05).
 *
 * L'extraction à plat perdait la distinction Débit / Crédit et le modèle devinait le signe —
 * jusqu'à donner deux signes opposés au même libellé récurrent. Sur les deux relevés réels,
 * la réconciliation accusait 2 187 € et 1 764 € d'écart ; avec les marqueurs, elle tombe à
 * zéro. Ces tests portent sur les fonctions PURES, sans PDF : la géométrie se simule.
 */
describe('reconstruction en colonnes', () => {
  const item = (text: string, x: number, y: number, width = 20): PositionedItem =>
    ({ text, x, right: x + width, y })

  // Géométrie relevée sur un extrait Boursobank réel : en-têtes Débit x≈442, Crédit x≈506 ;
  // montants alignés à droite, bord droit ≈480 au débit et ≈546 au crédit.
  const headers = [item('Débit', 442, 427, 23), item('Crédit', 506, 427, 27)]

  it('déduit le séparateur des en-têtes', () => {
    expect(findDebitCreditSeparator(headers)).toBeCloseTo(486.5, 1)
  })

  it('rend null sans en-tête reconnaissable', () => {
    expect(findDebitCreditSeparator([item('Montant', 442, 427)])).toBeNull()
  })

  it('rend null si les en-têtes ne sont pas sur la même ligne', () => {
    expect(findDebitCreditSeparator([headers[0]!, item('Crédit', 506, 300, 27)])).toBeNull()
  })

  it('rend null si Crédit précède Débit — ce n\'est pas le tableau attendu', () => {
    expect(findDebitCreditSeparator([item('Débit', 506, 427, 23), item('Crédit', 442, 427, 27)])).toBeNull()
  })

  it('marque un montant de la colonne gauche en DÉBIT, celui de droite en CRÉDIT', () => {
    const rows = renderRows([
      item('VIR Epargne programmee', 95, 371, 120),
      item('10,00', 455, 371, 25),
      item('VIR INST SOCIETEX', 95, 314, 90),
      item('500,00', 516, 314, 30),
    ], 486.5)
    expect(rows).toContain(`10,00 ${DEBIT_MARKER}`)
    expect(rows).toContain(`500,00 ${CREDIT_MARKER}`)
  })

  it('n\'annote rien quand la structure de colonnes est inconnue', () => {
    const rows = renderRows([item('Libellé', 95, 371, 40), item('10,00', 455, 371, 25)], null)
    expect(rows).toBe('Libellé 10,00')
  })

  it('regroupe une ligne par ordonnée et ordonne par abscisse', () => {
    const rows = renderRows([
      item('C', 300, 100, 10),
      item('A', 100, 100, 10),
      item('B', 200, 100, 10),
      item('suivante', 100, 80, 10),
    ], null)
    expect(rows).toBe('A B C\nsuivante')
  })

  it('tolère un décalage vertical de moins de deux points sur une même ligne', () => {
    const rows = renderRows([item('A', 100, 100, 10), item('B', 200, 101.5, 10)], null)
    expect(rows).toBe('A B')
  })

  it('n\'annote que les montants, pas les dates ni les références', () => {
    const rows = renderRows([
      item('02/03/2026', 46, 371, 40),
      item('CB*0000', 300, 371, 40),
      item('12,34', 455, 371, 25),
    ], 486.5)
    expect(rows).toBe(`02/03/2026 CB*0000 12,34 ${DEBIT_MARKER}`)
  })

  it('reconnaît un montant à séparateur de milliers', () => {
    const rows = renderRows([item('1 234,56', 440, 371, 40)], 486.5)
    expect(rows).toBe(`1 234,56 ${DEBIT_MARKER}`)
  })
})

/**
 * Report du séparateur sur les pages de continuation.
 *
 * Une page qui ne réimprime pas l'en-tête « Débit / Crédit » sortait sans marqueur, et le
 * prompt renvoyait alors le modèle à la déduction du signe — la panne d'origine, sur une
 * partie du relevé (revue du 2026-09-05).
 */
describe('report du séparateur entre pages', () => {
  const item = (text: string, x: number, y: number, width = 20): PositionedItem =>
    ({ text, x, right: x + width, y })

  it('applique le séparateur d\'une page à celles qui n\'ont pas d\'en-tête', () => {
    const headers = [item('Débit', 442, 427, 23), item('Crédit', 506, 427, 27)]
    const separator = findDebitCreditSeparator(headers)!

    // Page de continuation : un montant au débit, aucun en-tête.
    const continuation = renderRows([item('CARTE CARREFOUR', 95, 300, 100), item('42,37', 455, 300, 25)], separator)
    expect(continuation).toContain(DEBIT_MARKER)
  })
})

/**
 * Coupe géométrique du bloc d'identité — NFR6, story 17.1. Générique : opère sur toute
 * structure de colonnes Débit/Crédit reconnue, quelle que soit la banque.
 */
describe('coupe géométrique (NFR6, story 17.1)', () => {
  const item = (text: string, x: number, y: number, width = 20): PositionedItem =>
    ({ text, x, right: x + width, y })

  const header = [item('Débit', 400, 700), item('Crédit', 480, 700)]
  const identity = [item('FR76 1234 5678 9012 3456 7890 123', 50, 760), item('12 rue des Lilas', 50, 780)]
  const operations = [item('02/03/2026', 50, 660), item('VIR Epargne', 120, 660), item('10,00', 400, 660)]

  it('retire tout ce qui se trouve au-dessus de la ligne d\'en-tête', () => {
    const kept = operationRows([...identity, ...header, ...operations], findDebitCreditHeader(header))
    expect(kept.map(i => i.text)).not.toContain('FR76 1234 5678 9012 3456 7890 123')
    expect(kept.map(i => i.text)).not.toContain('12 rue des Lilas')
  })

  it('garde la ligne d\'en-tête et les opérations en dessous', () => {
    const kept = operationRows([...identity, ...header, ...operations], findDebitCreditHeader(header))
    expect(kept.map(i => i.text)).toEqual(expect.arrayContaining(['Débit', 'Crédit', 'VIR Epargne', '10,00']))
  })

  it('ne coupe rien sur une page sans en-tête — l\'expurgation par motif prend le relais', () => {
    const all = [...identity, ...operations]
    expect(operationRows(all, null)).toHaveLength(all.length)
  })
})
