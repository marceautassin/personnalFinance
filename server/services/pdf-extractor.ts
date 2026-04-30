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
    rawText = typeof result.text === 'string'
      ? result.text
      : (Array.isArray(result.text) ? result.text.join('\n') : '')
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
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${yyyy}-${mm}-${dd}`
}

interface PeriodResult {
  start: string | null
  end: string | null
}

function extractPeriod(rawText: string): PeriodResult {
  const patterns: RegExp[] = [
    /[Pp]ériode\s+du\s+(\d{2})\/(\d{2})\/(\d{4})\s+au\s+(\d{2})\/(\d{2})\/(\d{4})/,
    /[Dd]u\s+(\d{2})\/(\d{2})\/(\d{4})\s+au\s+(\d{2})\/(\d{2})\/(\d{4})/,
    /(\d{2})\/(\d{2})\/(\d{4})\s*[-–]\s*(\d{2})\/(\d{2})\/(\d{4})/,
  ]

  for (const re of patterns) {
    const m = rawText.match(re)
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

function extractBalances(rawText: string): BalancesResult {
  const opening = matchAmountByLabels(rawText, [
    /[Ss]olde\s+pr[ée]c[ée]dent[^\d-]{0,30}(-?[\d   .,]+)/,
    /[Aa]ncien\s+solde[^\d-]{0,30}(-?[\d   .,]+)/,
  ])

  const closing = matchAmountByLabels(rawText, [
    /[Nn]ouveau\s+solde[^\d-]{0,30}(-?[\d   .,]+)/,
    /[Ss]olde\s+au\s+\d{2}\/\d{2}\/\d{4}[^\d-]{0,10}(-?[\d   .,]+)/,
  ])

  return { openingCents: opening, closingCents: closing }
}

function matchAmountByLabels(rawText: string, patterns: RegExp[]): Cents | null {
  for (const re of patterns) {
    const m = rawText.match(re)
    if (m && m[1]) {
      const cents = parseFrAmount(m[1])
      if (cents !== null) return cents
    }
  }
  return null
}

/**
 * Parse un montant FR ("1 234,56", "-1 234,56", "1234.56") vers Cents.
 * Gère les espaces insécables (U+00A0) et fines (U+202F) typographiques FR.
 */
export function parseFrAmount(s: string): Cents | null {
  const cleaned = s.replace(/[\s   €]/g, '').replace(',', '.')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null
  const num = Number(cleaned)
  if (!Number.isFinite(num)) return null
  return eurosToCents(num)
}
