/**
 * Défauts fiscaux — valeurs de référence (CLAUDE.md §Taux fiscaux paramétrables).
 *
 * Rôle :
 *  - **Default** au premier seed (bootstrap `INSERT OR IGNORE`).
 *  - **Fallback** si la table `tax_settings` est vide (cas de test exotique).
 *  - **Source de vérité** pour les constantes non éditables (seuil IS réduit = loi française).
 *
 * Les taux en pct × 100 (entier) évitent les floats en DB / le drift FP. La conversion vers
 * float (÷ 10 000) se fait dans la fonction de calcul, juste avant la multiplication.
 *
 * ❌ Ne JAMAIS hardcoder `30`/`0.3` dans un calcul : lire `tax_settings` ou ces constantes.
 */

/** Flat tax PFU par défaut : 30 % (pct × 100). */
export const FLAT_TAX_DEFAULT_PCT = 3000

/** Taux IS réduit : 15 % (pct × 100). */
export const IS_RATE_REDUCED = 1500

/** Taux IS normal : 25 % (pct × 100). */
export const IS_RATE_NORMAL = 2500

/** Seuil de bénéfice sous lequel le taux IS réduit s'applique : 42 500 € (cents). Loi FR. */
export const IS_REDUCED_THRESHOLD_CENTS = 4_250_000

/** Modes d'imposition des dividendes. `progressive` est déclaratif en V1 (FR36). */
export const DIVIDEND_TAX_MODES = ['flat_tax', 'progressive'] as const
export type DividendTaxMode = typeof DIVIDEND_TAX_MODES[number]
