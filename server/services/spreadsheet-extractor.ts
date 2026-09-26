/**
 * spreadsheet-extractor — SEUL POINT D'ENTRÉE vers `exceljs` (AR42, story 28.4, D44).
 *
 * `readWorkbook` normalise un classeur en grilles neutres (`SheetGrid[]`), sans rien connaître
 * du format d'une banque en particulier. `extractExport` enchaîne cette lecture et la
 * reconnaissance de format (`bank-formats/credit-mutuel-export.ts`, seule aujourd'hui — une
 * seule banque exporte, cf. Dev Notes de la story, Rule of Three).
 */
import ExcelJS from 'exceljs'
import type { SheetGrid, GridCell, RawExport } from './bank-formats/types'
import { extractCreditMutuelExport } from './bank-formats/credit-mutuel-export'
import type { Bank } from '~~/shared/types/bank'

/**
 * Normalise une cellule `exceljs` en `GridCell` neutre.
 *
 * - Une date est rendue en ISO `YYYY-MM-DD` via des GETTERS UTC : `exceljs` restitue minuit UTC,
 *   et `getDate()` (heure locale) décalerait d'un jour à l'ouest de Greenwich.
 * - Une formule (`{ formula }` / `{ sharedFormula }`) n'a jamais de valeur en cache fiable sur
 *   cet export : on ne lit JAMAIS `cell.result`.
 * - Un texte riche (`{ richText: [...] }`) est concaténé ; un hyperlien (`{ text, hyperlink }`)
 *   ne garde que son texte.
 */
function toGridCell(cell: ExcelJS.Cell): GridCell {
  // Cellule esclave d'une fusion : `exceljs` y recopie la valeur du maître, ce qui dupliquerait
  // une ligne comme « Solde au » (fusionnée D:E). Seul le maître compte.
  if (cell.isMerged && cell.master !== cell) return null

  const value = cell.value
  if (value === null || value === undefined) return null

  if (value instanceof Date) {
    return {
      kind: 'date',
      iso: `${value.getUTCFullYear().toString().padStart(4, '0')}-${(value.getUTCMonth() + 1).toString().padStart(2, '0')}-${value.getUTCDate().toString().padStart(2, '0')}`,
    }
  }

  if (typeof value === 'number') return { kind: 'number', value }

  if (typeof value === 'object') {
    if ('formula' in value || 'sharedFormula' in value) return { kind: 'formula' }
    if ('richText' in value && Array.isArray(value.richText)) {
      return { kind: 'text', value: value.richText.map(r => r.text).join('') }
    }
    if ('text' in value && 'hyperlink' in value) {
      return { kind: 'text', value: String(value.text) }
    }
    // Erreur de formule (`{ error: '#REF!' }`) ou toute autre forme non gérée : traité comme
    // absent plutôt que de propager un objet non textuel dans une grille censée être neutre.
    return null
  }

  return { kind: 'text', value: String(value) }
}

/** Lit un classeur `exceljs` en grilles neutres, une par feuille, dans l'ordre du classeur. */
export async function readWorkbook(buffer: Buffer): Promise<SheetGrid[]> {
  const workbook = new ExcelJS.Workbook()
  // `workbook.xlsx.load` attend un ArrayBuffer/Buffer ; le générique TypeScript de `Buffer` ne
  // passe pas toujours (TS 6) — conversion explicite, sans `any` (Dev Notes de la story).
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
  await workbook.xlsx.load(arrayBuffer)

  const grids: SheetGrid[] = []
  workbook.eachSheet((worksheet) => {
    const rows: GridCell[][] = []
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const cells: GridCell[] = []
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cells[colNumber - 1] = toGridCell(cell)
      })
      rows.push(cells)
    })
    grids.push({
      name: worksheet.name,
      hidden: worksheet.state !== 'visible',
      rows,
    })
  })
  return grids
}

/**
 * Lit et reconnaît un export de banque en ligne (D44, FR82 à FR84).
 *
 * @throws ExportFormatError si aucun format reconnu (`bank-formats/types.ts`)
 * @throws BankMismatchError si le format EST reconnu mais ne correspond pas à `bank`
 */
export async function extractExport(buffer: Buffer, bank: Bank): Promise<RawExport> {
  const grids = await readWorkbook(buffer)
  // Une seule banque exporte aujourd'hui (Rule of Three, Dev Notes) : pas de registre à la
  // `bank-formats/index.ts` pour un seul membre.
  return extractCreditMutuelExport(grids, bank)
}
