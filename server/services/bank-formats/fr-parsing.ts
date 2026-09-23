/**
 * bank-formats/fr-parsing — lecture de montants et de dates au format français.
 *
 * Déplacé DEPUIS `pdf-extractor.ts` SANS MODIFICATION (Tâche 3, AC 6) : ces fonctions sont
 * génériques, partagées par toutes les banques.
 */
import { eurosToCents, type Cents } from '~~/shared/types/money'

/**
 * Un montant au format français, séparateurs de milliers compris (espace ASCII, insécable,
 * fine, ou point). Partagé par la lecture des soldes et la coupe du texte plat.
 */
export const FR_AMOUNT_TOKEN = /-?\d{1,3}(?:[\s\u00a0\u202f.]\d{3})*,\d{2}|-?\d+[.,]\d{2}/gu

/**
 * Parse un montant FR vers Cents. Formats acceptés :
 *   - "1 234,56" / "1 234,56" / "1 234,56" (espace standard, U+00A0, U+202F en milliers)
 *   - "1.023,56" (point milliers, virgule décimale — format Boursobank récap)
 *   - "-12,34" (signe négatif)
 *   - "1234.56" (point décimal seul, fallback ASCII — au plus 2 décimales)
 *   - "1 234,56 €" (symbole euro)
 *
 * Heuristique :
 *   - Si la chaîne contient une virgule → `,` est décimal, tous les `.` et espaces sont
 *     des séparateurs de milliers et doivent être supprimés.
 *   - Sinon → on suppose `.` décimal (style ASCII), on supprime juste les espaces.
 *
 * Mode strict : on rejette `\d+\.\d{3}` (un seul point suivi d'exactement 3 chiffres,
 * sans virgule) qui est ambigu — pourrait être 1.234 € ASCII OU 1 234 € au format
 * milliers-point. Renvoyer `null` force la chaîne d'appel à fournir un format levé.
 */
export function parseFrAmount(s: string): Cents | null {
  const stripped = s.replace(/[\s   €]/g, '')
  if (stripped === '' || stripped === '-' || stripped === '.' || stripped === ',') return null

  if (!stripped.includes(',') && /^-?\d+\.\d{3}$/.test(stripped)) return null

  const cleaned = stripped.includes(',')
    ? stripped.replace(/\./g, '').replace(',', '.')
    : stripped

  const num = Number(cleaned)
  if (!Number.isFinite(num)) return null
  return eurosToCents(num)
}

/**
 * Montants français lus juste après un intitulé.
 *
 * Le jeton accepte les séparateurs de milliers — espace ASCII, insécable, fine, ou point — ce
 * qui lève le défaut de la story 17.2. L'ambiguïté résiduelle (`2 817,46` peut se lire « 2 »
 * puis « 817,46 ») est tranchée en faveur du groupement : sur un relevé bancaire, tout montant
 * porte ses deux décimales, et un montant isolé de « 3 » n'existe pas.
 */
export function amountsAfter(rawText: string, anchor: RegExp, count = 1): Array<Cents | null> {
  const m = anchor.exec(rawText)
  if (!m) return []
  // Fenêtre courte : au-delà, on lirait des montants d'opérations, pas le solde annoncé.
  // Les dates sont neutralisées d'abord : sur `Ancien solde 31.12.2024 1 500,00`, le jeton
  // aurait lu `31.12` comme un montant de 31,12 € (revue du 2026-09-06).
  const window = rawText
    .slice(m.index + m[0].length, m.index + m[0].length + 60)
    .replace(/\d{2}[./-]\d{2}[./-]\d{2,4}/gu, ' ')
  const found = window.match(FR_AMOUNT_TOKEN) ?? []
  return found.slice(0, count).map(parseFrAmount)
}

export function frDateToIso(dd: string, mm: string, yyyy: string): string | null {
  const day = Number(dd)
  const month = Number(mm)
  const year = Number(yyyy)
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null
  if (month < 1 || month > 12 || day < 1) return null
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (day > daysInMonth[month - 1]!) return null
  return `${yyyy}-${mm}-${dd}`
}
