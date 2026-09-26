/**
 * bank-formats/credit-mutuel-export — lecture PURE de l'export Excel Crédit Mutuel (D44,
 * story 28.4). Ne dépend pas d'`exceljs` : reçoit des grilles neutres déjà produites par
 * `spreadsheet-extractor.ts`, ce qui le rend testable sans binaire.
 *
 * N'implémente PAS `BankFormat` (contrat pensé pour du texte de PDF) : une seule banque exporte
 * aujourd'hui — pas d'interface pour un seul membre (Rule of Three, Dev Notes de la story).
 */
import { eurosToCents, type Cents } from '~~/shared/types/money'
import { frDateToIso } from './fr-parsing'
import { ExportFormatError, BankMismatchError, type SheetGrid, type GridCell, type RawExport } from './types'
import type { Bank } from '~~/shared/types/bank'

const HEADER_KEYS = ['date', 'valeur', 'libelle', 'debit', 'credit', 'solde', 'dev'] as const
type HeaderKey = typeof HEADER_KEYS[number]

const COMPTE_COURANT_PATTERN = /C\/C|COMPTE\s+COURANT|COMPTE\s+CHEQUES/iu
const RIB_LINE_PATTERN = /^R\.I\.B\.\s*:?/iu
const SOLDE_AU_PATTERN = /^Solde au (\d{2})\/(\d{2})\/(\d{4})\s*:?/iu

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase().trim()
}

function cellText(cell: GridCell): string | null {
  return cell?.kind === 'text' ? cell.value : null
}

interface HeaderMatch {
  rowIndex: number
  columns: Record<HeaderKey, number>
}

/** Cherche une ligne d'en-tête (colonnes localisées PAR LEUR TEXTE, pas par index fixe). */
function findHeader(grid: SheetGrid): HeaderMatch | null {
  for (let rowIndex = 0; rowIndex < grid.rows.length; rowIndex++) {
    const row = grid.rows[rowIndex]!
    const found = new Map<string, number>()
    row.forEach((cell, colIndex) => {
      const text = cellText(cell)
      if (text !== null) found.set(normalize(text), colIndex)
    })
    if (HEADER_KEYS.every(key => found.has(key))) {
      const columns = Object.fromEntries(HEADER_KEYS.map(key => [key, found.get(key)!])) as Record<HeaderKey, number>
      return { rowIndex, columns }
    }
  }
  return null
}

/** Une ligne texte (concaténation de toutes les cellules texte) au-dessus/en-dessous de l'en-tête. */
function textRows(grid: SheetGrid, fromInclusive: number, toExclusive: number): string[] {
  const lines: string[] = []
  for (let i = fromInclusive; i < toExclusive && i < grid.rows.length; i++) {
    for (const cell of grid.rows[i]!) {
      const text = cellText(cell)
      if (text !== null && text.trim().length > 0) lines.push(text.trim())
    }
  }
  return lines
}

interface AccountSheet {
  grid: SheetGrid
  header: HeaderMatch
  ribLine: string
  aboveHeaderLines: string[]
}

/** Une « feuille de compte » (D44) : en-tête + ligne R.I.B. au-dessus + ligne Solde au en dessous. */
function findAccountSheets(grids: readonly SheetGrid[]): AccountSheet[] {
  const out: AccountSheet[] = []
  for (const grid of grids) {
    const header = findHeader(grid)
    if (!header) continue
    const above = textRows(grid, 0, header.rowIndex)
    const ribLine = above.find(l => RIB_LINE_PATTERN.test(l))
    if (!ribLine) continue
    const below = textRows(grid, header.rowIndex + 1, grid.rows.length)
    const hasSoldeAu = below.some(l => SOLDE_AU_PATTERN.test(l))
    if (!hasSoldeAu) continue
    out.push({ grid, header, ribLine, aboveHeaderLines: above })
  }
  return out
}

function isCompteCourant(sheet: AccountSheet): boolean {
  return sheet.aboveHeaderLines.some(l => COMPTE_COURANT_PATTERN.test(l))
}

const DIGIT_GROUP = /\d{5,}/gu
const RIB_FULL = /\b(\d{5})[ \u{a0}](\d{5})[ \u{a0}](\d{11})\b/gu

function collectKnownNumbers(grids: readonly SheetGrid[], chosen: AccountSheet): string[] {
  const numbers = new Set<string>()
  const addFrom = (text: string) => {
    for (const m of text.matchAll(DIGIT_GROUP)) numbers.add(m[0]!)
    for (const m of text.matchAll(RIB_FULL)) {
      numbers.add(`${m[1]} ${m[2]} ${m[3]}`)
      numbers.add(`${m[1]}${m[2]}${m[3]}`)
    }
  }
  for (const g of grids) addFrom(g.name)
  addFrom(chosen.ribLine)
  // « Vos comptes » et toute autre feuille : les colonnes R.I.B. y figurent en texte.
  for (const g of grids) {
    if (g === chosen.grid) continue
    for (const row of g.rows) {
      for (const cell of row) {
        if (cell?.kind === 'text') addFrom(cell.value)
      }
    }
  }
  return [...numbers]
}

function ignoredSheetNames(grids: readonly SheetGrid[], chosen: SheetGrid): string[] {
  return grids
    .filter(g => g !== chosen)
    .map((g) => {
      const masked = g.name.replace(/\d+/gu, '…')
      return g.hidden ? `${masked} (masquée)` : masked
    })
}

/**
 * Lit un export Crédit Mutuel depuis des grilles neutres.
 *
 * @throws ExportFormatError si aucune feuille de compte reconnaissable n'existe, ou si la
 *   feuille du compte courant n'est pas identifiable sans ambiguïté (zéro ou plusieurs).
 * @throws BankMismatchError si le format EST reconnu mais que `bank` n'est pas `credit_mutuel`.
 */
export function extractCreditMutuelExport(grids: readonly SheetGrid[], bank: Bank): RawExport {
  const accountSheets = findAccountSheets(grids)
  if (accountSheets.length === 0) {
    throw new ExportFormatError('no_recognized_account_sheet')
  }
  if (bank !== 'credit_mutuel') {
    throw new BankMismatchError(bank, 'credit_mutuel')
  }

  const compteCourantSheets = accountSheets.filter(isCompteCourant)
  if (compteCourantSheets.length !== 1) {
    throw new ExportFormatError(
      compteCourantSheets.length === 0 ? 'compte_courant_not_found' : 'compte_courant_ambiguous',
    )
  }
  const sheet = compteCourantSheets[0]!
  const { grid, header } = sheet
  const cols = header.columns

  let closingBalanceCents: Cents | null = null
  let periodEnd: string | null = null
  let soldeAuCount = 0
  const operations: RawExport['operations'] = []

  for (let rowIndex = header.rowIndex + 1; rowIndex < grid.rows.length; rowIndex++) {
    const row = grid.rows[rowIndex]!

    const soldeAuText = row
      .map(cellText)
      .find((t): t is string => t !== null && SOLDE_AU_PATTERN.test(t.trim()))
    if (soldeAuText !== undefined) {
      soldeAuCount++
      const match = SOLDE_AU_PATTERN.exec(soldeAuText.trim())!
      const iso = frDateToIso(match[1]!, match[2]!, match[3]!)
      if (!iso) throw new ExportFormatError('solde_au_invalid_date')
      periodEnd = iso
      const soldeCell = row[cols.solde]
      if (!soldeCell || soldeCell.kind !== 'number') {
        throw new ExportFormatError('solde_au_not_numeric')
      }
      closingBalanceCents = eurosToCents(soldeCell.value)
      continue
    }

    const dateCell = row[cols.date]
    if (!dateCell || dateCell.kind !== 'date') continue // ligne non-opération (vide, titre…)

    const labelCell = row[cols.libelle]
    const label = labelCell?.kind === 'text' ? labelCell.value.trim() : ''
    if (label.length === 0) {
      throw new ExportFormatError(`empty_label_row_${rowIndex}`)
    }

    const debitCell = row[cols.debit]
    const creditCell = row[cols.credit]
    const debitNum = debitCell?.kind === 'number' ? debitCell.value : null
    const creditNum = creditCell?.kind === 'number' ? creditCell.value : null
    const debitFilled = debitNum !== null && debitNum !== 0
    const creditFilled = creditNum !== null && creditNum !== 0

    if (debitFilled === creditFilled) {
      // Les deux remplies, ou aucune.
      throw new ExportFormatError(`amount_ambiguous_row_${rowIndex}`)
    }
    if (debitFilled && debitNum! >= 0) {
      throw new ExportFormatError(`unexpected_sign_row_${rowIndex}`)
    }
    if (creditFilled && creditNum! <= 0) {
      throw new ExportFormatError(`unexpected_sign_row_${rowIndex}`)
    }

    operations.push({
      transactionDate: dateCell.iso,
      label,
      amountCents: eurosToCents(debitFilled ? debitNum! : creditNum!),
    })
  }

  if (soldeAuCount === 0) throw new ExportFormatError('solde_au_missing')
  if (soldeAuCount > 1) throw new ExportFormatError('solde_au_duplicate')
  if (operations.length === 0) throw new ExportFormatError('no_operations')

  const periodStart = operations.reduce((min, op) => (op.transactionDate < min ? op.transactionDate : min), operations[0]!.transactionDate)
  const afterPeriod = operations.filter(op => op.transactionDate > periodEnd!)
  if (afterPeriod.length > 0) {
    throw new ExportFormatError('operation_after_solde_au')
  }

  return {
    operations,
    closingBalanceCents: closingBalanceCents!,
    periodStart,
    periodEnd: periodEnd!,
    knownNumbers: collectKnownNumbers(grids, sheet),
    ignoredSheets: ignoredSheetNames(grids, grid),
  }
}
