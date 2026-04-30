/**
 * Cents — type monétaire de l'app.
 *
 * Toutes les valeurs monétaires sont stockées et manipulées en entiers représentant
 * des centimes d'euro. La conversion en euros n'a lieu qu'à l'affichage via formatEuros.
 *
 * Le branded type empêche au compile-time d'assigner un `number` brut à un paramètre
 * attendant un `Cents`. Pour produire un Cents : `cents()`, `eurosToCents()` ou un helper dérivé.
 *
 * Validation : `cents()` et `eurosToCents()` sont les frontières — ils rejettent NaN/Infinity
 * pour empêcher l'introduction de valeurs poison. Les opérateurs purs (addCents, sumCents…)
 * ne re-valident pas (CLAUDE.md §"validation aux frontières").
 *
 * Mode d'arrondi : `Math.round` JS = round-half-toward-+∞ (ex: round(0.5)=1, round(-0.5)=0,
 * round(2.5)=3, round(-2.5)=-2). Cohérent avec les attentes fiscales courantes en France.
 * Si du banker's rounding est requis ailleurs, factoriser dans un helper dédié — pas ici.
 *
 * Sécurité « ratio ≠ Cents » : reposera UNIQUEMENT sur le brand compile-time + revue.
 * Aucun guard runtime fiable n'est possible (Cents = number après compilation).
 *
 * Référence : NFR8 (architecture.md), CLAUDE.md §Invariants critiques.
 */
export type Cents = number & { readonly __brand: 'Cents' }

const assertFiniteNumber = (n: number, fn: string): void => {
  if (Number.isNaN(n) || !Number.isFinite(n)) {
    throw new Error(`${fn}: valeur invalide (${n})`)
  }
}

/** Construit un Cents à partir d'un nombre. Arrondit au plus proche entier. Rejette NaN/Infinity. */
export const cents = (n: number): Cents => {
  assertFiniteNumber(n, 'cents')
  return Math.round(n) as Cents
}

/**
 * Convertit un montant en euros (potentiellement décimal) vers Cents. Rejette NaN/Infinity.
 *
 * Compense l'imprécision IEEE-754 sur la multiplication par 100 (ex: `1.005 * 100 = 100.4999...`)
 * en normalisant via `toFixed(8)` avant l'arrondi final.
 */
export const eurosToCents = (euros: number): Cents => {
  assertFiniteNumber(euros, 'eurosToCents')
  return Math.round(Number((euros * 100).toFixed(8))) as Cents
}

const eurosFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Formate un Cents en chaîne fr-FR : "1 234,56 €" (espaces insécables Intl). */
export const formatEuros = (c: Cents): string => eurosFormatter.format(c / 100)

export const addCents = (a: Cents, b: Cents): Cents => (a + b) as Cents

export const subCents = (a: Cents, b: Cents): Cents => (a - b) as Cents

export const negateCents = (c: Cents): Cents => -c as Cents

export const sumCents = (arr: readonly Cents[]): Cents =>
  arr.reduce<Cents>((acc, c) => (acc + c) as Cents, 0 as Cents)

/**
 * Multiplie un Cents par un ratio scalaire (ex: taux IS 0.15, flat tax 0.30).
 * Le ratio doit être un `number` brut, pas un Cents (€ × € = €², insensé).
 *
 * La protection « ratio ≠ Cents » repose sur le brand compile-time + revue de code.
 * Pas de guard runtime : Cents = number après compilation, toute heuristique aurait
 * des faux positifs (ex: ratio=100 légitime) ou faux négatifs (ex: cents(50)).
 */
export const mulCentsByRatio = (c: Cents, ratio: number): Cents => {
  assertFiniteNumber(ratio, 'mulCentsByRatio')
  return Math.round(c * ratio) as Cents
}
