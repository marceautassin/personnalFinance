/**
 * bank-formats/types — contrat commun à toute banque supportée (D41).
 *
 * `pdf-extractor.ts` reste le seul fichier qui importe `unpdf` (NFR21) ; les formats de
 * banque ne reçoivent que des données déjà extraites (texte plat, pages positionnées).
 */
import type { Bank } from '~~/shared/types/bank'
import type { Cents } from '~~/shared/types/money'

/** Un fragment de texte du PDF, avec sa position. `right` est le bord droit. */
export interface PositionedItem {
  x: number
  right: number
  y: number
  text: string
}

/** L'en-tête de colonnes : son abscisse de séparation et l'ordonnée de sa ligne. */
export interface ColumnHeader {
  /** Abscisse qui sépare la colonne Débit de la colonne Crédit. */
  separator: number
  /** Ordonnée de la ligne d'en-tête. Tout ce qui est au-dessus n'est pas une opération. */
  y: number
}

/**
 * Le format propre à une banque : reconnaissance, texte transmis au modèle, soldes/période.
 *
 * La quatrième capacité prévue par D41 (`cardDebits`) n'est volontairement pas ajoutée ici :
 * aucun appelant ne l'utiliserait avant la story 28.3 (YAGNI).
 */
export interface BankFormat {
  readonly bank: Bank
  /** Le relevé est-il de cette banque ? Lu sur le texte plat complet, AVANT toute coupe. */
  recognizes(flatText: string): boolean
  /** Texte transmis au modèle, bloc d'identité coupé. `pages` vaut null si la lecture positionnelle a échoué. */
  operationsText(input: { pages: PositionedItem[][] | null, flatText: string }): string
  balancesAndPeriod(flatText: string): {
    periodStart: string | null
    periodEnd: string | null
    openingCents: Cents | null
    closingCents: Cents | null
  }
}

/**
 * Levée par `extractStatement` quand la banque déclarée ne reconnaît pas le relevé (FR78,
 * AR38) — AVANT tout appel au fournisseur, sans PDF sauvegardé ni ligne écrite.
 */
export class BankMismatchError extends Error {
  constructor(
    readonly expected: Bank,
    readonly detected: Bank | null,
  ) {
    super('bank_mismatch')
    this.name = 'BankMismatchError'
  }
}
