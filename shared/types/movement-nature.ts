/**
 * Nature d'un mouvement — portée EXCLUSIVEMENT par le poste (D17).
 *
 * La troisième valeur est structurante : un virement vers un livret n'est ni une recette
 * ni une dépense. Le confondre avec une recette gonfle les revenus et masque un déficit —
 * c'est le défaut constaté dans le tableur d'origine de l'utilisateur.
 *
 * Énumération EN ANGLAIS (règle projet : code en anglais, libellés UI en français).
 * Les libellés FR vivent dans l'UI, jamais en base.
 */
export const MOVEMENT_NATURES = ['income', 'expense', 'internal_transfer'] as const

export type MovementNature = typeof MOVEMENT_NATURES[number]

/**
 * Sens attendu du montant pour une nature donnée, en convention bancaire signée
 * (`amount_cents` négatif = sortie, positif = entrée).
 *
 * ⚠️ C'est une ORIENTATION D'AFFICHAGE, pas une contrainte de données. Une ligne de signe
 * contraire est légitime (remboursement sur un poste de dépense) et le moteur la somme
 * algébriquement sans la corriger (D28).
 */
export const NATURE_EXPECTED_SIGN: Record<MovementNature, 1 | -1 | 0> = {
  income: 1,
  expense: -1,
  internal_transfer: 0,
}

export function isMovementNature(value: string): value is MovementNature {
  return (MOVEMENT_NATURES as readonly string[]).includes(value)
}
