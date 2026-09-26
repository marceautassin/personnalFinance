/**
 * generate-synthetic-export — (re)génère `tests/fixtures/statements/credit-mutuel-export.xlsx`
 * (story 28.4, AC 9, D44).
 *
 * **La fixture ne contient AUCUNE donnée réelle, même anonymisée.** La structure (quatre
 * feuilles, fusions, formule « Solde initial », colonne Solde en formules SANS valeur en cache,
 * cellules date, Débit négatif, ligne « Solde au ») reproduit celle décrite dans les Dev Notes
 * de la story, relevée en LECTURE SEULE sur le fichier réel — jamais recopiée. Le CONTENU
 * (RIB, titre, libellés, montants, dates) est entièrement INVENTÉ ci-dessous.
 *
 * Gardé par `GENERATE_FIXTURE` — `yarn test:run` normal ne la touche pas :
 *
 *   GENERATE_FIXTURE=1 yarn test:run generate-synthetic-export
 *
 * `exceljs` : import EXEMPTÉ nommément (avec `spreadsheet-extractor.ts`) par le test
 * d'architecture `import-boundaries.test.ts` — ce fichier ne lit rien d'externe (aucun fichier
 * réel), il n'y a donc rien à garder hors dépôt.
 */
import { describe, it } from 'vitest'
import ExcelJS from 'exceljs'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const GENERATE_FIXTURE = process.env.GENERATE_FIXTURE

const RIB = '10000 12345 00012345678'
const RIB_NO_SPACE = RIB.replaceAll(' ', '')

interface SyntheticOp {
  date: Date
  label: string
  amountEuros: number // signé : négatif = débit, positif = crédit
}

const OPS: SyntheticOp[] = [
  { date: new Date(Date.UTC(2026, 0, 5)), label: 'VIRT SALAIRE SOCIETE FICTIVE', amountEuros: 2500.00 },
  { date: new Date(Date.UTC(2026, 0, 7)), label: 'PRLV ABONNEMENT INTERNET FICTIF', amountEuros: -39.99 },
  { date: new Date(Date.UTC(2026, 0, 10)), label: `VIR PEL ${RIB_NO_SPACE}`, amountEuros: -200.00 },
  { date: new Date(Date.UTC(2026, 0, 15)), label: 'CARTE ACHAT SUPERMARCHE FICTIF', amountEuros: -87.50 },
  { date: new Date(Date.UTC(2026, 0, 28)), label: 'RELEVE CARTE', amountEuros: -320.15 },
  { date: new Date(Date.UTC(2026, 1, 2)), label: 'VIRT SALAIRE SOCIETE FICTIVE', amountEuros: 2500.00 },
  { date: new Date(Date.UTC(2026, 1, 5)), label: 'VIR SEPA SOCIETE FICTIVE 123456789012345', amountEuros: -65.00 },
  { date: new Date(Date.UTC(2026, 1, 12)), label: 'CHQ 9876543', amountEuros: -150.00 },
  { date: new Date(Date.UTC(2026, 1, 18)), label: 'CARTE ESSENCE STATION FICTIVE', amountEuros: -60.00 },
  { date: new Date(Date.UTC(2026, 1, 27)), label: 'RELEVE CARTE', amountEuros: -410.30 },
  { date: new Date(Date.UTC(2026, 2, 3)), label: 'VIRT SALAIRE SOCIETE FICTIVE', amountEuros: 2500.00 },
  { date: new Date(Date.UTC(2026, 2, 9)), label: 'PRLV ASSURANCE HABITATION FICTIVE', amountEuros: -65.00 },
  { date: new Date(Date.UTC(2026, 2, 14)), label: 'REMBOURSEMENT ASSURANCE FICTIVE', amountEuros: 30.00 },
  { date: new Date(Date.UTC(2026, 2, 20)), label: 'CARTE LOISIRS CINEMA FICTIF', amountEuros: -15.00 },
  { date: new Date(Date.UTC(2026, 2, 22)), label: 'VIR EPARGNE VERS LIVRET FICTIF', amountEuros: -200.00 },
]

const OPENING_EUROS = 1000.00
const NET_EUROS = OPS.reduce((sum, op) => sum + op.amountEuros, 0)
const CLOSING_EUROS = Math.round((OPENING_EUROS + NET_EUROS) * 100) / 100
const LAST_OP_DATE = OPS.reduce((max, op) => (op.date > max ? op.date : max), OPS[0]!.date)
const SOLDE_AU_DATE = new Date(Date.UTC(
  LAST_OP_DATE.getUTCFullYear(),
  LAST_OP_DATE.getUTCMonth(),
  LAST_OP_DATE.getUTCDate() + 1,
))

function frDate(d: Date): string {
  const dd = d.getUTCDate().toString().padStart(2, '0')
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0')
  return `${dd}/${mm}/${d.getUTCFullYear()}`
}

async function buildWorkbook(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()

  const comptes = wb.addWorksheet('Vos comptes')
  comptes.mergeCells('A1:D1')
  comptes.getCell('A1').value = 'Votre situation financière au ' + frDate(SOLDE_AU_DATE)
  comptes.getCell('A3').value = 'Compte'
  comptes.getCell('B3').value = 'R.I.B.'
  comptes.getCell('C3').value = 'Solde'
  comptes.getCell('D3').value = 'Dev'
  comptes.getCell('A4').value = 'Synthèse'
  comptes.getCell('C4').value = CLOSING_EUROS
  comptes.getCell('D4').value = 'EUR'
  comptes.getCell('A5').value = 'C/C EUROCOMPTE FICTIF'
  comptes.getCell('B5').value = RIB
  comptes.getCell('C5').value = CLOSING_EUROS
  comptes.getCell('D5').value = 'EUR'

  const cpt = wb.addWorksheet(`Cpt ${RIB}`)
  cpt.mergeCells('A1:F1')
  cpt.getCell('A1').value = 'Situation de votre compte C/C EUROCOMPTE FICTIF'
  cpt.mergeCells('A2:F2')
  cpt.getCell('A2').value = `R.I.B. : ${RIB}`
  cpt.getCell('D3').value = 'Solde initial : '
  // Formule SANS valeur en cache (jamais `result`) — le seul solde fiable est « Solde au ».
  cpt.getCell('F3').value = { formula: `=F${5 + OPS.length + 2}-SUM(D6:D${5 + OPS.length})-SUM(E6:E${5 + OPS.length})` }
  cpt.getCell('G3').value = 'EUR'
  cpt.mergeCells('A4:G4')
  cpt.getCell('A4').value = { text: 'Liste de vos comptes', hyperlink: 'https://example.invalid/comptes' }

  const headerRow = 5
  cpt.getCell(`A${headerRow}`).value = 'Date'
  cpt.getCell(`B${headerRow}`).value = 'Valeur'
  cpt.getCell(`C${headerRow}`).value = 'Libellé'
  cpt.getCell(`D${headerRow}`).value = 'Débit'
  cpt.getCell(`E${headerRow}`).value = 'Crédit'
  cpt.getCell(`F${headerRow}`).value = 'Solde'
  cpt.getCell(`G${headerRow}`).value = 'Dev'

  OPS.forEach((op, i) => {
    const r = headerRow + 1 + i
    const dateCell = cpt.getCell(`A${r}`)
    dateCell.value = op.date
    dateCell.numFmt = 'mm-dd-yy'
    const valeurCell = cpt.getCell(`B${r}`)
    valeurCell.value = op.date
    valeurCell.numFmt = 'mm-dd-yy'
    cpt.getCell(`C${r}`).value = op.label
    if (op.amountEuros < 0) cpt.getCell(`D${r}`).value = op.amountEuros
    else cpt.getCell(`E${r}`).value = op.amountEuros
    // Colonne Solde : formule sans valeur en cache, comme sur le fichier réel.
    cpt.getCell(`F${r}`).value = { formula: `=F${r - 1}+D${r}+E${r}` }
    cpt.getCell(`G${r}`).value = 'EUR'
  })

  const blankRow = headerRow + 1 + OPS.length
  const soldeRow = blankRow + 1
  cpt.mergeCells(`D${soldeRow}:E${soldeRow}`)
  cpt.getCell(`D${soldeRow}`).value = `Solde au ${frDate(SOLDE_AU_DATE)} : `
  cpt.getCell(`F${soldeRow}`).value = CLOSING_EUROS
  cpt.getCell(`G${soldeRow}`).value = 'EUR'

  const lastRow = soldeRow + 1
  cpt.mergeCells(`A${lastRow}:G${lastRow}`)
  cpt.getCell(`A${lastRow}`).value = 'Liste de vos comptes'

  const hidden1 = wb.addWorksheet('tblcptsync1', { state: 'veryHidden' })
  hidden1.getCell('A1').value = 'table interne — synchronisation'

  const hidden2 = wb.addWorksheet('tblcptsync2', { state: 'veryHidden' })
  hidden2.getCell('A1').value = 'Compte'
  hidden2.getCell('B1').value = 'Numéro'
  hidden2.getCell('A2').value = 'C/C EUROCOMPTE FICTIF'
  hidden2.getCell('B2').value = RIB_NO_SPACE

  return wb
}

describe.skipIf(!GENERATE_FIXTURE)('génération de la fixture Crédit Mutuel synthétique (D44)', () => {
  it('écrit tests/fixtures/statements/credit-mutuel-export.xlsx', async () => {
    const wb = await buildWorkbook()
    const outDir = resolve('tests/fixtures/statements')
    mkdirSync(outDir, { recursive: true })
    await wb.xlsx.writeFile(resolve(outDir, 'credit-mutuel-export.xlsx'))
  })
})
