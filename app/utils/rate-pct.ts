/**
 * Conversion saisie utilisateur ↔ taux en pct × 100 (entier), convention partagée par
 * `sas_config.is_rate_pct` et `tax_settings.*_pct` (stories 5.4 et 5.5).
 *
 * Extrait de `SasConfigForm.vue` à la revue 2026-08-04 : la conversion était inline et
 * dupliquée dans le composant, alors que la même convention est réutilisée ailleurs.
 */

/** Borne haute des montants SAS, alignée sur `SasAmountCentsSchema.max(1e12)`. */
export const MAX_SAS_CENTS = 1e12

/** Borne haute du taux en pct × 100, alignée sur `IsRatePctSchema.max(10000)`. */
export const MAX_RATE_PCT = 10000

/**
 * Parse un pourcentage saisi (`"15"`, `"15,5"`) en pct × 100 entier, ou `null` si invalide.
 * Refuse les valeurs hors [0, 100] % et plus de 2 décimales (au-delà, l'arrondi produirait
 * un pct × 100 non entier, que `computeDividendCapacity` rejette).
 */
export function parseRatePct(input: string): number | null {
  const normalized = input.trim().replace(/\s/gu, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/u.test(normalized)) return null
  const pct = Number(normalized)
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null
  return Math.round(pct * 100)
}

/**
 * Formate un taux pct × 100 pour la saisie. Contrairement aux montants, `0` est une valeur
 * significative (taux IS à 0 %) et non « champ vide » : la renvoyer en chaîne vide rendrait
 * un taux nul indiscernable d'un champ non renseigné (revue 2026-08-04).
 */
export function ratePctToInput(ratePct: number): string {
  // Virgule décimale : le champ est saisi en fr-FR (`parseRatePct` accepte `"15,5"`), et
  // réafficher `"15.5"` après un save contredisait la convention que l'AC#6 amendé assume
  // explicitement (revue 2026-09-04).
  return String(ratePct / 100).replace('.', ',')
}
