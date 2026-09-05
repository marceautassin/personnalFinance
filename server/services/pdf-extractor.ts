/**
 * pdf-extractor — extraction texte + métadonnées d'un relevé bancaire PDF.
 *
 * SEUL POINT D'ENTRÉE vers `unpdf` (NFR16, CLAUDE.md §Boundaries imperméables).
 * Tout autre import direct de `unpdf` ailleurs dans le code est un anti-pattern.
 */
import { extractText, getDocumentProxy } from 'unpdf'
import { eurosToCents, type Cents } from '~~/shared/types/money'

/** Marqueurs de colonne ajoutés aux montants. Consommés par le prompt de catégorisation. */
export const DEBIT_MARKER = '[DÉBIT]'
export const CREDIT_MARKER = '[CRÉDIT]'

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
  let flatText: string

  try {
    const result = await extractText(new Uint8Array(pdfBuffer), { mergePages: true })
    // `mergePages: true` type `text: string` côté `unpdf`, mais on garde une garde
    // défensive contre une éventuelle dérive de version (text: string[]).
    flatText = Array.isArray(result.text) ? result.text.join('\n') : (result.text ?? '')
  }
  catch (err) {
    throw new Error(`PDF extraction failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (!flatText || flatText.trim().length === 0) {
    throw new Error('PDF contains no extractable text')
  }

  // Le texte plat reste la source des métadonnées : ses expressions régulières sont calées
  // dessus depuis la story 2.2 et n'ont aucune raison de changer.
  const period = extractPeriod(flatText)
  const balances = extractBalances(flatText)

  return {
    rawText: (await extractPositionalText(pdfBuffer)) ?? flatText,
    periodStart: period.start,
    periodEnd: period.end,
    openingBalanceCents: balances.openingCents,
    closingBalanceCents: balances.closingCents,
  }
}

/** Un fragment de texte du PDF, avec sa position. `right` est le bord droit. */
export interface PositionedItem {
  x: number
  right: number
  y: number
  text: string
}

/** Tolérance verticale, en points, pour considérer deux fragments sur la même ligne. */
const ROW_TOLERANCE = 2

/** Un montant au format français, tel qu'il apparaît dans une colonne du relevé. */
const AMOUNT_RE = /^-?\d{1,3}(?:[\s\u00a0\u202f.]\d{3})*,\d{2}$/u

/**
 * Reconstruit le texte du relevé en RESPECTANT LES COLONNES, et marque chaque montant
 * `[DÉBIT]` ou `[CRÉDIT]` selon la colonne où il se trouve.
 *
 * **Pourquoi (constaté le 2026-09-05).** L'extraction à plat perd les colonnes : une ligne
 * arrivait au modèle sous la forme `VIR INST SOCIETEX 02/03/2026 500,00`, sans rien qui dise si
 * ce montant est au débit ou au crédit. Le modèle devinait — et se trompait, jusqu'à donner
 * DEUX SIGNES OPPOSÉS au même libellé récurrent (`VIR Epargne programmee`, −10,00 puis
 * +10,00). Sur les deux relevés réels, la réconciliation accusait 2 187 € et 1 764 € d'écart.
 *
 * L'information existe pourtant dans le PDF : les colonnes Débit et Crédit sont séparées de
 * plus de soixante points. La lire est déterministe ; la deviner ne l'est pas. C'est aussi
 * l'esprit de NFR15 — le modèle ne doit rien inventer qu'on puisse constater.
 *
 * Retourne `null` si la structure de colonnes n'est pas reconnue (autre banque, autre
 * gabarit) : l'appelant retombe alors sur le texte plat, dégradé mais fonctionnel.
 */
async function extractPositionalText(pdfBuffer: Buffer): Promise<string | null> {
  let pages: PositionedItem[][]
  try {
    pages = await readPositionedPages(pdfBuffer)
  }
  catch {
    // L'extraction positionnelle est un CONFORT DE FIABILITÉ, pas un prérequis : son échec
    // ne doit pas faire échouer une ingestion que le texte plat rend possible.
    return null
  }

  const rendered: string[] = []
  let anyColumnFound = false

  for (const items of pages) {
    const separator = findDebitCreditSeparator(items)
    if (separator !== null) anyColumnFound = true
    rendered.push(renderRows(items, separator))
  }

  return anyColumnFound ? rendered.join('\n') : null
}

async function readPositionedPages(pdfBuffer: Buffer): Promise<PositionedItem[][]> {
  const doc = await getDocumentProxy(new Uint8Array(pdfBuffer))
  const pages: PositionedItem[][] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent()
    const items = (content.items as { str?: string, transform?: number[], width?: number }[])
      .flatMap((i) => {
        const text = (i.str ?? '').trim()
        const x = i.transform?.[4]
        const y = i.transform?.[5]
        if (text.length === 0 || typeof x !== 'number' || typeof y !== 'number') return []
        return [{ x, right: x + (i.width ?? 0), y, text }]
      })
    pages.push(items)
  }
  return pages
}

/**
 * Abscisse qui sépare la colonne Débit de la colonne Crédit, déduite des en-têtes.
 *
 * On prend le milieu entre les CENTRES des deux en-têtes plutôt qu'un bord : les montants
 * sont alignés à droite et débordent de leur en-tête, si bien qu'un seuil calé sur un bord
 * classait mal les montants les plus larges.
 */
export function findDebitCreditSeparator(items: PositionedItem[]): number | null {
  const center = (i: PositionedItem) => (i.x + i.right) / 2
  const debit = items.find(i => /^d[ée]bit$/iu.test(i.text))
  const credit = items.find(i => /^cr[ée]dit$/iu.test(i.text))
  if (!debit || !credit) return null
  // Les deux en-têtes doivent être sur la même ligne et dans cet ordre : sinon on lit autre
  // chose qu'un tableau d'opérations et le seuil n'aurait aucun sens.
  if (Math.abs(debit.y - credit.y) > ROW_TOLERANCE) return null
  if (center(debit) >= center(credit)) return null
  return (center(debit) + center(credit)) / 2
}

/** Regroupe les fragments par ligne (y décroissant), puis par abscisse croissante. */
export function renderRows(items: PositionedItem[], separator: number | null): string {
  const rows: PositionedItem[][] = []
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const current = rows.at(-1)
    if (current && Math.abs(current[0]!.y - item.y) <= ROW_TOLERANCE) current.push(item)
    else rows.push([item])
  }

  return rows
    .map(row => row
      .sort((a, b) => a.x - b.x)
      .map((item) => {
        if (separator === null || !AMOUNT_RE.test(item.text)) return item.text
        // Le montant est aligné à droite dans sa colonne : c'est son bord droit qui la désigne.
        return `${item.text} ${item.right <= separator ? DEBIT_MARKER : CREDIT_MARKER}`
      })
      .join(' '))
    .join('\n')
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
