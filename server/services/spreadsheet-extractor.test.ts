import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readWorkbook, extractExport } from './spreadsheet-extractor'
import { BankMismatchError } from './bank-formats/types'
import { maskAccountNumbers } from './bank-formats/identity'

const FIXTURE_PATH = resolve('tests/fixtures/statements/credit-mutuel-export.xlsx')
const FIXTURE = readFileSync(FIXTURE_PATH)

describe('readWorkbook — normalisation des cellules (D44)', () => {
  it('produit une grille par feuille, dans l\'ordre du classeur, avec l\'état masqué détecté', async () => {
    const grids = await readWorkbook(FIXTURE)
    expect(grids.map(g => g.name)).toEqual([
      'Vos comptes',
      expect.stringContaining('Cpt'),
      'tblcptsync1',
      'tblcptsync2',
    ])
    expect(grids[0]!.hidden).toBe(false)
    expect(grids[2]!.hidden).toBe(true)
    expect(grids[3]!.hidden).toBe(true)
  })

  it('ne duplique pas la valeur d\'une cellule fusionnée sur ses cellules esclaves', async () => {
    const grids = await readWorkbook(FIXTURE)
    const cpt = grids.find(g => g.name.startsWith('Cpt'))!
    // Ligne 1 : titre fusionné A1:F1 — seule A1 doit porter le texte, B1..F1 sont null.
    const row0 = cpt.rows[0]!
    expect(row0[0]).toEqual({ kind: 'text', value: 'Situation de votre compte C/C EUROCOMPTE FICTIF' })
    expect(row0[1]).toBeNull()
  })

  it('ne lit jamais la valeur d\'une formule (Solde initial, colonne Solde)', async () => {
    const grids = await readWorkbook(FIXTURE)
    const cpt = grids.find(g => g.name.startsWith('Cpt'))!
    // Ligne 3 (index 2) : F3 = formule "Solde initial".
    expect(cpt.rows[2]![5]).toEqual({ kind: 'formula' })
    // Première ligne d'opération (index 5) : colonne Solde (index 5) = formule.
    expect(cpt.rows[5]![5]).toEqual({ kind: 'formula' })
  })

  it('lit un lien hypertexte par son seul texte', async () => {
    const grids = await readWorkbook(FIXTURE)
    const cpt = grids.find(g => g.name.startsWith('Cpt'))!
    expect(cpt.rows[3]![0]).toEqual({ kind: 'text', value: 'Liste de vos comptes' })
  })
})

describe('extractExport — fixture Crédit Mutuel synthétique (AC 9)', () => {
  it('lit les opérations, les signes, la période et le solde', async () => {
    const result = await extractExport(FIXTURE, 'credit_mutuel')
    expect(result.operations.length).toBeGreaterThan(10)
    expect(result.periodStart).toBe('2026-01-05')
    expect(result.periodEnd).toBe('2026-03-23')

    const salaire = result.operations.find(o => o.label.includes('SALAIRE'))!
    expect(salaire.amountCents).toBeGreaterThan(0)
    const abonnement = result.operations.find(o => o.label.includes('ABONNEMENT'))!
    expect(abonnement.amountCents).toBeLessThan(0)

    // Le solde final = solde de départ déduit + Σ opérations ; ici on vérifie juste sa cohérence
    // interne : Σ opérations doit correspondre à un delta plausible (aucune ligne perdue).
    const sum = result.operations.reduce((s, o) => s + o.amountCents, 0)
    expect(result.closingBalanceCents - sum).toBeGreaterThan(0) // solde de départ positif inventé
  })

  it('range deux lignes RELEVE CARTE sur deux mois distincts (FR84)', async () => {
    const result = await extractExport(FIXTURE, 'credit_mutuel')
    const cardOps = result.operations.filter(o => o.label.trim() === 'RELEVE CARTE')
    expect(cardOps.length).toBeGreaterThanOrEqual(2)
    const months = new Set(cardOps.map(o => o.transactionDate.slice(0, 7)))
    expect(months.size).toBeGreaterThanOrEqual(2)
  })

  it('nomme les feuilles ignorées, sans le numéro de compte en clair', async () => {
    const result = await extractExport(FIXTURE, 'credit_mutuel')
    expect(result.ignoredSheets).toContain('Vos comptes')
    expect(result.ignoredSheets.some(s => s.includes('12345'))).toBe(false)
    expect(result.ignoredSheets.filter(s => s.endsWith('(masquée)'))).toHaveLength(2)
  })

  it('collecte le numéro de compte comme identifiant connu, planté dans un libellé', async () => {
    const result = await extractExport(FIXTURE, 'credit_mutuel')
    expect(result.knownNumbers.length).toBeGreaterThan(0)
    const pelLabel = result.operations.find(o => o.label.startsWith('VIR PEL'))!.label
    const masked = maskAccountNumbers(pelLabel, result.knownNumbers)
    expect(masked).not.toMatch(/\d{10,}/)
    expect(masked).toContain('[COMPTE]')
  })

  it('un libellé avec référence de 15 chiffres est masqué même sans être un numéro connu', async () => {
    const result = await extractExport(FIXTURE, 'credit_mutuel')
    const sepaLabel = result.operations.find(o => o.label.includes('SEPA'))!.label
    const masked = maskAccountNumbers(sepaLabel, result.knownNumbers)
    expect(masked).not.toMatch(/\d{10,}/)
  })

  it('un chèque à 7 chiffres reste lisible après masquage', async () => {
    const result = await extractExport(FIXTURE, 'credit_mutuel')
    const chqLabel = result.operations.find(o => o.label.startsWith('CHQ'))!.label
    const masked = maskAccountNumbers(chqLabel, result.knownNumbers)
    expect(masked).toContain('9876543')
  })

  it('extractExport(fixture, \'boursorama\') → BankMismatchError', async () => {
    await expect(extractExport(FIXTURE, 'boursorama')).rejects.toBeInstanceOf(BankMismatchError)
  })
})
