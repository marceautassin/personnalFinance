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
 * Règles :
 *  - profitBeforeTax = revenue - expenses (signé, peut être négatif)
 *  - tax = profitBeforeTax > 0 ? floor(profitBeforeTax × isRatePct / 10000) : 0
 *  - profitAfterTax = profitBeforeTax - tax
 *  - capacity = max(0, profitAfterTax + treasury) (floor à 0 — pas de dividende négatif)
 */
export function computeDividendCapacity(input: SasConfigInput): DividendCapacity {
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
