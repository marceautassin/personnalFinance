import { describe, it, expect } from 'vitest'
import { sortTransactions, type SortKey } from './transaction-sort'
import type { TransactionListItem } from '~/composables/useTransactions'
import { cents } from '~~/shared/types/money'

const tx = (
  id: number,
  transactionDate: string,
  label: string,
  amountCents: number,
  categoryItemCode = 'alimentation-courses',
): TransactionListItem => ({
  id,
  statementHash: 'h',
  transactionDate,
  label,
  amountCents: cents(amountCents),
  categoryItemCode,
  isManual: false,
})

const LABELS: Record<string, string> = {
  'alimentation-courses': 'Alimentation · Courses',
  'revenus-salaire': 'Revenus · Salaire',
  'zzz-inconnu': 'Zzz · Inconnu',
}
const labelOf = (code: string) => LABELS[code] ?? code

const ROWS = [
  tx(1, '2026-03-05', 'Carrefour', -4_000),
  tx(2, '2026-03-01', 'Épargne', -1_000, 'zzz-inconnu'),
  tx(3, '2026-03-05', 'amazon', 250_000, 'revenus-salaire'),
]

const ids = (key: SortKey, dir: 'asc' | 'desc' = 'asc') =>
  sortTransactions(ROWS, key, dir, labelOf).map(t => t.id)

describe('sortTransactions', () => {
  it('trie par date, du plus ancien au plus récent', () => {
    expect(ids('date')).toEqual([2, 1, 3])
  })

  it('inverse l\'ordre en descendant', () => {
    expect(ids('date', 'desc')).toEqual([1, 3, 2])
  })

  /** Le départage par `id` ne s'inverse pas : il rend l'ordre déterministe, il ne le porte pas. */
  it('départage deux lignes égales par leur id, dans les deux sens', () => {
    expect(ids('date')).toEqual([2, 1, 3])
    expect(ids('date', 'desc').slice(0, 2)).toEqual([1, 3])
  })

  it('trie les libellés sans se laisser piéger par la casse ni les accents', () => {
    // « amazon » avant « Carrefour » avant « Épargne » : une comparaison brute mettrait
    // « Épargne » après « amazon » et « Carrefour » en tête.
    expect(ids('label')).toEqual([3, 1, 2])
  })

  it('trie les montants SIGNÉS : la plus grosse dépense en tête', () => {
    expect(ids('amount')).toEqual([1, 2, 3])
  })

  /** Un remboursement de 500 € et une dépense de 500 € ne doivent pas se mélanger (D28). */
  it('ne trie pas par magnitude', () => {
    const rows = [tx(1, '2026-03-01', 'Dépense', -50_000), tx(2, '2026-03-02', 'Remboursement', 50_000)]
    expect(sortTransactions(rows, 'amount', 'asc', labelOf).map(t => t.id)).toEqual([1, 2])
  })

  it('trie par libellé de catégorie, pas par code', () => {
    expect(ids('category')).toEqual([1, 3, 2])
  })

  it('retombe sur le code quand le libellé est inconnu', () => {
    const rows = [tx(1, '2026-03-01', 'A', -1, 'inconnu-b'), tx(2, '2026-03-02', 'B', -1, 'inconnu-a')]
    expect(sortTransactions(rows, 'category', 'asc', labelOf).map(t => t.id)).toEqual([2, 1])
  })

  it('ne modifie pas le tableau reçu', () => {
    const rows = [...ROWS]
    sortTransactions(rows, 'amount', 'desc', labelOf)
    expect(rows.map(t => t.id)).toEqual([1, 2, 3])
  })

  it('accepte une liste vide', () => {
    expect(sortTransactions([], 'date', 'asc', labelOf)).toEqual([])
  })
})
