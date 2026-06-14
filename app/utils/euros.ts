import { eurosToCents, type Cents } from '~~/shared/types/money'

/**
 * Parse une saisie utilisateur en euros (texte) vers Cents, ou `null` si invalide.
 * Accepte la virgule décimale fr-FR et les espaces (séparateurs de milliers), max 2
 * décimales, valeur ≥ 0 (les revenus ne sont jamais négatifs — cf. story 5.3).
 *
 * Helper partagé par les panneaux de la page Revenus (ArePanel, SasRentPanel,
 * ReimbursementsPanel) pour éviter la duplication de la logique de validation (AC#11).
 */
export function parseEurosToCents(input: string): Cents | null {
  const normalized = input.replace(/\s+/gu, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  const n = Number(normalized)
  if (!Number.isFinite(n) || n < 0) return null
  return eurosToCents(n)
}
