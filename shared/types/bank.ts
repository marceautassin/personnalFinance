/**
 * bank — banques supportées pour l'ingestion d'un relevé (D40, D41).
 *
 * Posé ici par anticipation de la story 27.1 (table `profiles`, colonne
 * `bank_statements.bank`) : ce fichier est la source de vérité partagée avant même que la
 * persistance existe. Énumération en anglais (convention CLAUDE.md), libellés FR séparés.
 */
export const BANKS = ['boursorama', 'credit_mutuel'] as const

export type Bank = (typeof BANKS)[number]

/** Libellé français affiché à l'utilisateur (sélecteur, liste des relevés). */
export const BANK_LABELS: Record<Bank, string> = {
  boursorama: 'Boursorama',
  credit_mutuel: 'Crédit Mutuel',
}
