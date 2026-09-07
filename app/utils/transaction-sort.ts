import type { TransactionListItem } from '~/composables/useTransactions'

export const SORT_KEYS = ['date', 'label', 'amount', 'category'] as const
export type SortKey = typeof SORT_KEYS[number]
export type SortDirection = 'asc' | 'desc'

/**
 * Comparaison de libellés insensible à la casse et aux accents.
 *
 * `localeCompare` en `fr` place « Épargne » à sa place alphabétique plutôt qu'après « Z », ce
 * qu'une comparaison brute de chaînes ferait.
 */
const byText = (a: string, b: string) => a.localeCompare(b, 'fr', { sensitivity: 'base' })

/**
 * Trie les lignes d'un relevé selon une colonne.
 *
 * **Le tri est TOTAL, jamais partiel.** Chaque critère retombe sur l'`id` en cas d'égalité :
 * sans ce départage, deux lignes du même jour ou du même montant pourraient changer d'ordre
 * d'un rendu à l'autre, et une ligne semblerait bouger toute seule pendant qu'on la reclasse.
 *
 * **Le montant se trie SIGNÉ**, sans valeur absolue : croissant, la plus grosse dépense arrive
 * en tête, ce qui est la lecture qu'on cherche. Trier par magnitude mélangerait une dépense de
 * 500 € et un remboursement de 500 €, que le produit s'attache justement à distinguer (D28).
 *
 * Rend un NOUVEAU tableau : la liste reçue en prop appartient à son propriétaire.
 */
export function sortTransactions(
  rows: readonly TransactionListItem[],
  key: SortKey,
  direction: SortDirection,
  labelOf: (code: string) => string,
): TransactionListItem[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    let d = 0
    if (key === 'date') d = a.transactionDate.localeCompare(b.transactionDate)
    else if (key === 'label') d = byText(a.label, b.label)
    else if (key === 'amount') d = a.amountCents - b.amountCents
    else d = byText(labelOf(a.categoryItemCode), labelOf(b.categoryItemCode))
    // Le départage par `id` n'est PAS inversé : il ne sert qu'à rendre l'ordre déterministe,
    // pas à porter le sens du tri.
    return d === 0 ? a.id - b.id : d * sign
  })
}
