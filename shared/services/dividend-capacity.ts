import { type Cents, subCents, addCents } from '~~/shared/types/money'

/**
 * Entrées du calcul de capacité dividendable (story 5.4).
 * `isRatePct` = taux IS en pourcentage × 100 (1500 = 15 %).
 */
export interface SasConfigInput {
  revenueForecastCents: Cents
  expensesForecastCents: Cents
  currentTreasuryCents: Cents
  isRatePct: number
}

export interface DividendCapacity {
  profitBeforeTaxCents: Cents
  taxCents: Cents
  profitAfterTaxCents: Cents
  dividendableCapacityCents: Cents
}

/**
 * Capacité dividendable estimée de la SAS (FR28).
 *
 * Fonction PURE (aucun accès `db`/`fs`) → importable côté serveur ET côté client pour le
 * recalcul live de l'UI. Étendue par `dividend-calculator.ts` (story 7.4) qui ajoutera le
 * calcul du dividende NET requis.
 *
 * V1 SIMPLIFIÉE — ne gère PAS :
 *  - les reports déficitaires antérieurs (pas de récupération de pertes)
 *  - le taux IS réduit 15 % jusqu'à 42 500 € puis 25 % (l'utilisateur saisit son taux EFFECTIF)
 *  - les réserves légales obligatoires (5 % jusqu'à 10 % du capital)
 *  - les dividendes antérieurs déjà distribués
 * Voir defer-work si enrichissement V2 nécessaire.
 *
 * HYPOTHÈSE SUR LA TRÉSORERIE (explicitée à la revue 2026-08-04) : `currentTreasuryCents`
 * est additionné au résultat APRÈS IS, donc il doit représenter la trésorerie **hors
 * résultat de l'exercice en cours** (report à nouveau, bénéfices non distribués des
 * exercices antérieurs). Y saisir la trésorerie brute du compte en cours d'exercice
 * comptabiliserait deux fois le résultat déjà encaissé et surestimerait la capacité.
 * Le libellé UI porte cette précision (`SasConfigForm.vue`).
 *
 * Règles :
 *  - profitBeforeTax = revenue - expenses (signé, peut être négatif)
 *  - tax = profitBeforeTax > 0 ? floor(profitBeforeTax × isRatePct / 10000) : 0
 *  - profitAfterTax = profitBeforeTax - tax
 *  - capacity = max(0, profitAfterTax + treasury) (floor à 0 — pas de dividende négatif)
 *
 * @throws RangeError si `isRatePct` n'est pas un entier de 0 à 10000 (pct × 100). La
 * décomposition arithmétique ci-dessous suppose un entier : un taux fractionnaire
 * produirait des « cents » à décimales et romprait l'invariant `Cents`, un taux négatif
 * une taxe négative qui gonflerait la capacité.
 */
export function computeDividendCapacity(input: SasConfigInput): DividendCapacity {
  if (!Number.isInteger(input.isRatePct) || input.isRatePct < 0 || input.isRatePct > 10000) {
    throw new RangeError(`isRatePct doit être un entier de 0 à 10000 (pct × 100), reçu : ${input.isRatePct}`)
  }

  const profitBeforeTaxCents = subCents(input.revenueForecastCents, input.expensesForecastCents)

  // floor(profit × isRatePct / 10000), décomposé pour rester exact même au plafond du schéma :
  // profit (≤ 1e12) × isRatePct (≤ 1e4) = 1e16 dépasserait Number.MAX_SAFE_INTEGER (~9e15) et
  // perdrait des centimes. profit = 10000·q + r ⇒ floor(profit·rate/10000) = q·rate + floor(r·rate/10000),
  // chaque produit restant < 1e13.
  const taxCents = (profitBeforeTaxCents > 0
    ? Math.floor(profitBeforeTaxCents / 10000) * input.isRatePct
    + Math.floor(((profitBeforeTaxCents % 10000) * input.isRatePct) / 10000)
    : 0) as Cents

  const profitAfterTaxCents = subCents(profitBeforeTaxCents, taxCents)

  const dividendableCapacityCents = Math.max(
    0,
    addCents(profitAfterTaxCents, input.currentTreasuryCents),
  ) as Cents

  return { profitBeforeTaxCents, taxCents, profitAfterTaxCents, dividendableCapacityCents }
}
