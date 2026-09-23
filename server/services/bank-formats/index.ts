/**
 * bank-formats/index — registre des formats de banque et détection (D41).
 */
import type { Bank } from '~~/shared/types/bank'
import { BANKS } from '~~/shared/types/bank'
import type { BankFormat } from './types'
import { boursoramaFormat } from './boursorama'
import { creditMutuelFormat } from './credit-mutuel'

export const BANK_FORMATS: Record<Bank, BankFormat> = {
  boursorama: boursoramaFormat,
  credit_mutuel: creditMutuelFormat,
}

/**
 * La première banque dont `recognizes` est vrai sur le texte plat, sinon `null`.
 *
 * Si **les deux** reconnaissent (non observé en pratique), rend `null` : le message d'erreur
 * dira « banque non reconnue » plutôt que de trancher arbitrairement.
 */
export function detectBank(flatText: string): Bank | null {
  const matches = BANKS.filter(bank => BANK_FORMATS[bank].recognizes(flatText))
  return matches.length === 1 ? matches[0]! : null
}

export type { BankFormat, PositionedItem, ColumnHeader } from './types'
export { BankMismatchError } from './types'
