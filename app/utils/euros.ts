import { eurosToCents, centsToEuros, type Cents } from '~~/shared/types/money'

/**
 * Parse une saisie utilisateur en euros (texte) vers Cents, ou `null` si invalide.
 * Accepte la virgule décimale fr-FR et l'espace comme séparateur de milliers, max 2
 * décimales, valeur ≥ 0 (les revenus ne sont jamais négatifs — cf. story 5.3).
 *
 * L'espace n'est toléré qu'en position de séparateur de milliers (groupes de 3 chiffres) :
 * une frappe accidentelle comme `"1 5"` est rejetée plutôt que lue comme 15 € (revue
 * 2026-08-04 — un `replace(/\s+/g, '')` global avalait silencieusement l'erreur).
 *
 * Helper partagé par les panneaux de la page Revenus (ArePanel, SasRentPanel,
 * ReimbursementsPanel) pour éviter la duplication de la logique de validation (AC#11).
 */
export function parseEurosToCents(input: string): Cents | null {
  const trimmed = input.trim()
  // Partie entière : soit des chiffres collés, soit des groupes de 3 séparés par un espace.
  if (!/^(\d+|\d{1,3}(\s\d{3})+)([.,]\d{1,2})?$/u.test(trimmed)) return null
  const normalized = trimmed.replace(/\s/gu, '').replace(',', '.')
  const n = Number(normalized)
  if (!Number.isFinite(n) || n < 0) return null
  return eurosToCents(n)
}

/** Borne haute des montants de revenus, alignée sur `RevenueAmountCentsSchema.max(1e11)`. */
export const MAX_REVENUE_CENTS = 1e11

/** Formate des cents en saisie euros, chaîne vide quand le champ n'est pas renseigné (0). */
export function centsToInput(cents: Cents): string {
  return cents > 0 ? String(centsToEuros(cents)) : ''
}

/**
 * Resynchronise un champ de saisie depuis la valeur persistée, SANS écraser une saisie en
 * cours qui représente déjà cette valeur — ce qui préserve le format utilisateur
 * (ex. `"1500,50"`) après un enregistrement équivalent.
 *
 * Ne protège que le cas « saisie équivalente » ; pour préserver une saisie **divergente**
 * (l'utilisateur est en train de taper autre chose), les formulaires s'appuient en plus sur
 * `useDirtyForm` — sans quoi tout refetch, y compris celui d'un autre panneau, remet les
 * champs à la valeur persistée sous les doigts de l'utilisateur (revue 2026-08-04).
 */
export function syncEurosInput(currentInput: string, cents: Cents): string {
  return parseEurosToCents(currentInput || '0') === cents ? currentInput : centsToInput(cents)
}
