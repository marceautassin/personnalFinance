/**
 * pdf-extractor — extraction texte + métadonnées d'un relevé bancaire PDF.
 *
 * SEUL POINT D'ENTRÉE vers `unpdf` (NFR16, CLAUDE.md §Boundaries imperméables).
 * Tout autre import direct de `unpdf` ailleurs dans le code est un anti-pattern.
 */
import { extractText } from 'unpdf'
import { eurosToCents, type Cents } from '~~/shared/types/money'

export interface RawStatement {
  /** Texte concaténé de toutes les pages du PDF. */
  rawText: string
  /** Première date de la période couverte (YYYY-MM-DD) ou null si non détectée. */
  periodStart: string | null
  /** Dernière date de la période couverte (YYYY-MM-DD) ou null. */
  periodEnd: string | null
  /** Solde d'ouverture du relevé en Cents, null si non détecté. */
  openingBalanceCents: Cents | null
  /** Solde de clôture du relevé en Cents, null si non détecté. */
  closingBalanceCents: Cents | null
}

export async function extractStatement(pdfBuffer: Buffer): Promise<RawStatement> {
  let rawText: string

  try {
    const result = await extractText(new Uint8Array(pdfBuffer), { mergePages: true })
    // `mergePages: true` type `text: string` côté `unpdf`, mais on garde une garde
    // défensive contre une éventuelle dérive de version (text: string[]).
    rawText = Array.isArray(result.text) ? result.text.join('\n') : (result.text ?? '')
  }
  catch (err) {
    throw new Error(`PDF extraction failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (!rawText || rawText.trim().length === 0) {
    throw new Error('PDF contains no extractable text')
  }

  const period = extractPeriod(rawText)
  const balances = extractBalances(rawText)

  return {
    rawText,
    periodStart: period.start,
    periodEnd: period.end,
    openingBalanceCents: balances.openingCents,
    closingBalanceCents: balances.closingCents,
  }
}

function frDateToIso(dd: string, mm: string, yyyy: string): string | null {
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

interface PeriodResult {
  start: string | null
  end: string | null
}

function extractPeriod(rawText: string): PeriodResult {
  // Ancrage en-tête : on limite la recherche aux premiers caractères pour éviter
  // qu'un intervalle de dates parasite (description de prestation, etc.) plus bas
  // dans le PDF ne soit confondu avec la période du relevé.
  const header = rawText.slice(0, 2000)

  const patterns: RegExp[] = [
    /[Pp]ériode\s+du\s+(\d{2})\/(\d{2})\/(\d{4})\s+au\s+(\d{2})\/(\d{2})\/(\d{4})/,
    /[Dd]u\s+(\d{2})\/(\d{2})\/(\d{4})\s+au\s+(\d{2})\/(\d{2})\/(\d{4})/,
    /(\d{2})\/(\d{2})\/(\d{4})\s*[-–]\s*(\d{2})\/(\d{2})\/(\d{4})/,
  ]

  for (const re of patterns) {
    const m = header.match(re)
    if (m && m.length >= 7) {
      const start = frDateToIso(m[1]!, m[2]!, m[3]!)
      const end = frDateToIso(m[4]!, m[5]!, m[6]!)
      if (start && end && start <= end) return { start, end }
    }
  }

  return { start: null, end: null }
}

interface BalancesResult {
  openingCents: Cents | null
  closingCents: Cents | null
}

/**
 * Patterns soldes Boursobank (validés sur Releve-compte-31-03-2026.pdf) :
 *   Ouverture : "SOLDE AU : JJ/MM/AAAA  XXX,XX" (avant les premières transactions)
 *   Clôture   : "Nouveau solde en EUR : Montant frais bancaires* : <m1> <m2> <m3>"
 *               où <m2> est le solde, <m3> les frais (souvent 0,00).
 *
 * Fallbacks préservés pour formats Boursorama legacy / autres banques.
 */
function extractBalances(rawText: string): BalancesResult {
  const opening
    = matchFirstAmount(rawText, /SOLDE\s+AU\s*:\s*\d{2}\/\d{2}\/\d{4}\s+(-?[\d   .,]+?)\s/i)
      ?? matchFirstAmount(rawText, /[Ss]olde\s+pr[ée]c[ée]dent[^\d-]{0,30}(-?[\d   .,]+?)\s/)
      ?? matchFirstAmount(rawText, /[Aa]ncien\s+solde[^\d-]{0,30}(-?[\d   .,]+?)\s/)

  const closing
    = matchClosingBoursobank(rawText)
      ?? matchFirstAmount(rawText, /[Nn]ouveau\s+solde[^\d-]{0,30}(-?[\d   .,]+?)\s/)

  return { openingCents: opening, closingCents: closing }
}

function matchFirstAmount(rawText: string, re: RegExp): Cents | null {
  const m = rawText.match(re)
  if (m && m[1]) return parseFrAmount(m[1])
  return null
}

/**
 * Boursobank aplatit le tableau récap en : "Nouveau solde en EUR : Montant frais bancaires* : <m1> <m2> <m3>".
 * Le solde de clôture est le **2e** des 3 montants (m1=total, m2=solde, m3=frais).
 */
function matchClosingBoursobank(rawText: string): Cents | null {
  // Charset inclut U+00A0 (NBSP) et U+202F (NNBSP) — séparateurs de milliers
  // typographiques FR — mais PAS l'espace ASCII, qui sépare les 3 montants.
  const re = /Nouveau\s+solde\s+en\s+EUR\s*:\s*Montant\s+frais\s+bancaires\*?\s*:\s*(-?[\d  .,]+)\s+(-?[\d  .,]+)\s+(-?[\d  .,]+)/i
  const m = rawText.match(re)
  if (m && m[2]) return parseFrAmount(m[2])
  return null
}

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
