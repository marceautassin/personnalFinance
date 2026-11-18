/**
 * bank-formats/columns — reconstruction d'un texte positionné en respectant les colonnes
 * Débit / Crédit.
 *
 * Déplacé DEPUIS `pdf-extractor.ts` SANS MODIFICATION (Tâche 3, AC 6). Générique en principe
 * mais validé seulement sur Boursorama à ce stade — la story 28.2 le réutilisera pour
 * Crédit Mutuel.
 */
import type { ColumnHeader, PositionedItem } from './types'

/** Marqueurs de colonne ajoutés aux montants. Consommés par le prompt de catégorisation. */
export const DEBIT_MARKER = '[DÉBIT]'
export const CREDIT_MARKER = '[CRÉDIT]'

/** Tolérance verticale, en points, pour considérer deux fragments sur la même ligne. */
export const ROW_TOLERANCE = 2

/** Un montant au format français, tel qu'il apparaît dans une colonne du relevé. */
export const AMOUNT_RE = /^-?\d{1,3}(?:[\s\u00a0\u202f.]\d{3})*,\d{2}$/u

export function findDebitCreditHeader(items: PositionedItem[]): ColumnHeader | null {
  const center = (i: PositionedItem) => (i.x + i.right) / 2
  const debit = items.find(i => /^d[ée]bit$/iu.test(i.text))
  const credit = items.find(i => /^cr[ée]dit$/iu.test(i.text))
  if (!debit || !credit) return null
  // Les deux en-têtes doivent être sur la même ligne et dans cet ordre : sinon on lit autre
  // chose qu'un tableau d'opérations et le seuil n'aurait aucun sens.
  if (Math.abs(debit.y - credit.y) > ROW_TOLERANCE) return null
  if (center(debit) >= center(credit)) return null
  return { separator: (center(debit) + center(credit)) / 2, y: debit.y }
}

/**
 * Abscisse qui sépare la colonne Débit de la colonne Crédit, déduite des en-têtes.
 *
 * On prend le milieu entre les CENTRES des deux en-têtes plutôt qu'un bord : les montants
 * sont alignés à droite et débordent de leur en-tête, si bien qu'un seuil calé sur un bord
 * classait mal les montants les plus larges.
 */
export function findDebitCreditSeparator(items: PositionedItem[]): number | null {
  return findDebitCreditHeader(items)?.separator ?? null
}

/**
 * Garde les fragments situés sur la ligne d'en-tête ou EN DESSOUS (NFR6, story 17.1).
 *
 * **Pourquoi.** Le bloc situé au-dessus de l'en-tête de colonnes n'est pas un tableau
 * d'opérations : c'est l'identité — IBAN, numéro de compte, nom et adresse du titulaire.
 * Vérifié sur les relevés réels du 2026-09-06 : l'IBAN `FR76…` s'y trouve sur les cinq pages,
 * toujours au-dessus de l'en-tête. Comme le texte transmis au fournisseur est construit ici,
 * c'est ici que la coupe doit avoir lieu — pas plus loin.
 *
 * Les ordonnées PDF croissent vers le haut : « en dessous » signifie `y` inférieur.
 */
export function operationRows(items: PositionedItem[], header: ColumnHeader | null): PositionedItem[] {
  if (header === null) return items
  return items.filter(i => i.y <= header.y + ROW_TOLERANCE)
}

/** Regroupe les fragments par ligne (y décroissant), puis par abscisse croissante. */
export function renderRows(items: PositionedItem[], separator: number | null): string {
  const rows: PositionedItem[][] = []
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const current = rows.at(-1)
    if (current && Math.abs(current[0]!.y - item.y) <= ROW_TOLERANCE) current.push(item)
    else rows.push([item])
  }

  return rows
    .map(row => row
      .sort((a, b) => a.x - b.x)
      .map((item) => {
        if (separator === null || !AMOUNT_RE.test(item.text)) return item.text
        // Le montant est aligné à droite dans sa colonne : c'est son bord droit qui la désigne.
        return `${item.text} ${item.right <= separator ? DEBIT_MARKER : CREDIT_MARKER}`
      })
      .join(' '))
    .join('\n')
}
