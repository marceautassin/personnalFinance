/**
 * Banque d'origine d'un relevé (D40 — la banque est portée PAR LE RELEVÉ, pas par le profil).
 *
 * Énumération EN ANGLAIS sans accent (règle projet : code en anglais, libellés UI en français).
 * `credit_mutuel` n'a pas encore d'extracteur (story 28.1) : la valeur existe dès cette story
 * pour que le type et la colonne DB n'aient pas à être réélargis plus tard.
 */
export const BANKS = ['boursorama', 'credit_mutuel'] as const

export type Bank = typeof BANKS[number]

/** Libellés FR des banques — vocabulaire d'écran, à un seul endroit. */
export const BANK_LABELS: Record<Bank, string> = {
  boursorama: 'Boursorama',
  credit_mutuel: 'Crédit Mutuel',
}

export function isBank(value: string): value is Bank {
  return (BANKS as readonly string[]).includes(value)
}
