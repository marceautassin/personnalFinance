/**
 * bank-formats/credit-mutuel — format Crédit Mutuel (D41).
 *
 * Périmètre de la story 28.1 : seul `recognizes` est réel. L'extraction (`operationsText`,
 * `balancesAndPeriod`) arrive en story 28.2 — en attendant, ces deux fonctions lèvent une
 * erreur explicite, traduite en `400 pdf_parse_failed` par l'orchestrateur, AVANT tout appel
 * au fournisseur (AC 9).
 */
import type { BankFormat, PositionedItem } from './types'

const NOT_SUPPORTED_YET = 'credit_mutuel_not_supported_yet'

/**
 * Critère de reconnaissance : BIC ou domaine de l'émetteur, jamais le nom de banque en clair
 * (une ligne d'opération Boursorama peut citer « CREDIT MUTUEL » dans un libellé de
 * virement — reconnaître sur ce texte produirait un faux positif).
 *
 * `CMCIFR` (sans ancrage sur les caractères suivants) accepte VOLONTAIREMENT le CIC
 * (`CMCIFRPP…`), filiale du groupe Crédit Mutuel qui partage ce préfixe de BIC : un relevé CIC
 * suit le même format d'extraction que Crédit Mutuel, les classer ensemble n'est pas un défaut
 * — c'est la décision retenue par D41 (architecture.md), validée sur le relevé d'exemple
 * disponible lors du cadrage. À revoir seulement si un gabarit CIC réel s'avère différent.
 */
export function recognizes(flatText: string): boolean {
  return /\bCMCIFR/u.test(flatText) || /creditmutuel\.fr/iu.test(flatText)
}

export function operationsText(_input: { pages: PositionedItem[][] | null, flatText: string }): string {
  throw new Error(NOT_SUPPORTED_YET)
}

export function balancesAndPeriod(_flatText: string): ReturnType<BankFormat['balancesAndPeriod']> {
  throw new Error(NOT_SUPPORTED_YET)
}

export const creditMutuelFormat: BankFormat = {
  bank: 'credit_mutuel',
  recognizes,
  operationsText,
  balancesAndPeriod,
}
