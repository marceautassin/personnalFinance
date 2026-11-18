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

/**
 * Libellés FR des natures — vocabulaire d'écran, à un seul endroit.
 *
 * Ils étaient recopiés dans trois composants ; le quatrième usage (filtres de la story 18.1)
 * a franchi le seuil de la règle des trois occurrences. Le code reste anglais, l'affichage
 * français : c'est la frontière posée par CLAUDE.md.
 */
export const NATURE_LABELS: Record<MovementNature, string> = {
  income: 'Recette',
  expense: 'Dépense',
  internal_transfer: 'Mouvement interne',
}

/** Les natures et leur libellé, dans l'ordre déclaré — pour peupler un sélecteur. */
export const NATURE_OPTIONS: ReadonlyArray<readonly [MovementNature, string]>
  = MOVEMENT_NATURES.map(n => [n, NATURE_LABELS[n]] as const)

export function isMovementNature(value: string): value is MovementNature {
  return (MOVEMENT_NATURES as readonly string[]).includes(value)
}
