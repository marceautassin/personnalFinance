import { describe, it, expect } from 'vitest'
import { extractCreditMutuelExport } from './credit-mutuel-export'
import { ExportFormatError, BankMismatchError, type SheetGrid, type GridCell } from './types'

function t(value: string): GridCell {
  return { kind: 'text', value }
}
function n(value: number): GridCell {
  return { kind: 'number', value }
}
function d(iso: string): GridCell {
  return { kind: 'date', iso }
}
const f: GridCell = { kind: 'formula' }

const HEADER: GridCell[] = [t('Date'), t('Valeur'), t('Libellé'), t('Débit'), t('Crédit'), t('Solde'), t('Dev')]

/** Une feuille de compte courant minimale et valide, paramétrable par ses opérations. */
function accountSheet(opts: {
  name?: string
  hidden?: boolean
  title?: string
  ops?: { date: string, label: string, debit?: number, credit?: number }[]
  soldeAu?: string // 'jj/mm/aaaa'
  soldeAmount?: number
  header?: GridCell[]
  extraTrailingRows?: GridCell[][]
} = {}): SheetGrid {
  const ops = opts.ops ?? [
    { date: '2026-04-05', label: 'CARTE ACHAT SUPERMARCHE FICTIF', debit: -87.50 },
    { date: '2026-04-10', label: 'VIR RECU AMI FICTIF', credit: 50.00 },
  ]
  const soldeAu = opts.soldeAu ?? '11/04/2026'
  const soldeAmount = opts.soldeAmount ?? 962.50
  const rows: GridCell[][] = [
    [t(opts.title ?? 'Situation de votre compte C/C EUROCOMPTE FICTIF')],
    [t('R.I.B. : 10000 12345 00012345678')],
    [t('Solde initial : '), null, null, f, null, null, t('EUR')],
    [t('Liste de vos comptes')],
    opts.header ?? HEADER,
    ...ops.map(op => [
      d(op.date),
      d(op.date),
      t(op.label),
      op.debit !== undefined ? n(op.debit) : null,
      op.credit !== undefined ? n(op.credit) : null,
      f,
      t('EUR'),
    ]),
    [],
    [null, null, null, t(`Solde au ${soldeAu} : `), null, n(soldeAmount), t('EUR')],
    ...(opts.extraTrailingRows ?? []),
    [t('Liste de vos comptes')],
  ]
  return { name: opts.name ?? 'Cpt 12345 00012345678', hidden: opts.hidden ?? false, rows }
}

const VOS_COMPTES: SheetGrid = {
  name: 'Vos comptes',
  hidden: false,
  rows: [
    [t('Votre situation financière au 11/04/2026')],
    [t('Compte'), t('R.I.B.'), t('Solde'), t('Dev')],
    [t('C/C EUROCOMPTE FICTIF'), t('10000 12345 00012345678'), n(962.50), t('EUR')],
  ],
}

function hiddenTechSheet(name: string): SheetGrid {
  return { name, hidden: true, rows: [[t('table interne')]] }
}

describe('extractCreditMutuelExport — cas nominal (AC 1, 2, 3, 4)', () => {
  it('lit les opérations, les soldes et la période depuis la feuille du compte courant', () => {
    const grids = [VOS_COMPTES, accountSheet(), hiddenTechSheet('feuille technique 1')]
    const result = extractCreditMutuelExport(grids, 'credit_mutuel')

    expect(result.operations).toHaveLength(2)
    expect(result.operations[0]).toEqual({ transactionDate: '2026-04-05', label: 'CARTE ACHAT SUPERMARCHE FICTIF', amountCents: -8750 })
    expect(result.operations[1]).toEqual({ transactionDate: '2026-04-10', label: 'VIR RECU AMI FICTIF', amountCents: 5000 })
    expect(result.closingBalanceCents).toBe(96250)
    expect(result.periodStart).toBe('2026-04-05')
    expect(result.periodEnd).toBe('2026-04-11')
  })

  it('nomme les feuilles ignorées, chiffres des numéros masqués, feuille masquée suffixée', () => {
    const grids = [VOS_COMPTES, accountSheet(), hiddenTechSheet('Cpt 12345 00012345678 interne')]
    const result = extractCreditMutuelExport(grids, 'credit_mutuel')
    expect(result.ignoredSheets).toContain('Vos comptes')
    expect(result.ignoredSheets.some(s => s.includes('12345'))).toBe(false)
    expect(result.ignoredSheets.some(s => s.endsWith('(masquée)'))).toBe(true)
    // La feuille retenue n'y figure pas.
    expect(result.ignoredSheets).not.toContain('Cpt 12345 00012345678')
  })

  it('en-tête dans un autre ordre de colonnes → lu correctement (colonnes localisées par leur texte)', () => {
    const reordered = [t('Crédit'), t('Débit'), t('Date'), t('Libellé'), t('Valeur'), t('Solde'), t('Dev')]
    const sheet = accountSheet({
      header: reordered,
      ops: [{ date: '2026-04-05', label: 'OP', debit: -10 }],
    })
    // Les lignes d'opération suivent le même ordre de colonnes que l'en-tête reordonné.
    sheet.rows[4] = reordered
    sheet.rows[5] = [null, n(-10), d('2026-04-05'), t('OP'), d('2026-04-05'), f, t('EUR')]
    const result = extractCreditMutuelExport([sheet], 'credit_mutuel')
    expect(result.operations).toEqual([{ transactionDate: '2026-04-05', label: 'OP', amountCents: -1000 }])
  })
})

describe('extractCreditMutuelExport — refus de format (AC 8)', () => {
  it('Débit positif → refus', () => {
    const sheet = accountSheet({ ops: [{ date: '2026-04-05', label: 'OP', debit: 10 }] })
    expect(() => extractCreditMutuelExport([sheet], 'credit_mutuel')).toThrow(ExportFormatError)
  })

  it('Crédit négatif → refus', () => {
    const sheet = accountSheet({ ops: [{ date: '2026-04-05', label: 'OP', credit: -10 }] })
    expect(() => extractCreditMutuelExport([sheet], 'credit_mutuel')).toThrow(ExportFormatError)
  })

  it('Débit ET Crédit remplis → refus', () => {
    const sheet = accountSheet({ ops: [{ date: '2026-04-05', label: 'OP', debit: -10, credit: 10 }] })
    expect(() => extractCreditMutuelExport([sheet], 'credit_mutuel')).toThrow(ExportFormatError)
  })

  it('aucun montant → refus', () => {
    const sheet = accountSheet({ ops: [{ date: '2026-04-05', label: 'OP' }] })
    expect(() => extractCreditMutuelExport([sheet], 'credit_mutuel')).toThrow(ExportFormatError)
  })

  it('libellé vide → refus', () => {
    const sheet = accountSheet({ ops: [{ date: '2026-04-05', label: '   ', debit: -10 }] })
    expect(() => extractCreditMutuelExport([sheet], 'credit_mutuel')).toThrow(ExportFormatError)
  })

  it('« Solde au » absent → refus', () => {
    const sheet = accountSheet()
    sheet.rows = sheet.rows.filter(row => !row.some(c => c?.kind === 'text' && c.value.startsWith('Solde au')))
    expect(() => extractCreditMutuelExport([sheet], 'credit_mutuel')).toThrow(ExportFormatError)
  })

  it('« Solde au » en double → refus', () => {
    const sheet = accountSheet({
      extraTrailingRows: [[null, null, null, t('Solde au 12/04/2026 : '), null, n(1000), t('EUR')]],
    })
    expect(() => extractCreditMutuelExport([sheet], 'credit_mutuel')).toThrow(ExportFormatError)
  })

  it('zéro feuille "compte courant" → refus', () => {
    const sheet = accountSheet({ title: 'Livret A' })
    expect(() => extractCreditMutuelExport([sheet], 'credit_mutuel')).toThrow(ExportFormatError)
  })

  it('deux feuilles "compte courant" → refus (choix arbitraire interdit)', () => {
    const a = accountSheet({ name: 'Cpt A' })
    const b = accountSheet({ name: 'Cpt B' })
    expect(() => extractCreditMutuelExport([a, b], 'credit_mutuel')).toThrow(ExportFormatError)
  })

  it('opération après le "Solde au" → refus', () => {
    const sheet = accountSheet({
      ops: [
        { date: '2026-04-05', label: 'OP1', debit: -10 },
        { date: '2026-04-20', label: 'OP APRES SOLDE', debit: -5 },
      ],
      soldeAu: '11/04/2026',
    })
    expect(() => extractCreditMutuelExport([sheet], 'credit_mutuel')).toThrow(ExportFormatError)
  })

  it('grille quelconque, sans feuille de compte reconnaissable → ExportFormatError', () => {
    const noise: SheetGrid = { name: 'Feuille1', hidden: false, rows: [[t('bonjour')], [n(42)]] }
    expect(() => extractCreditMutuelExport([noise], 'credit_mutuel')).toThrow(ExportFormatError)
  })
})

describe('extractCreditMutuelExport — refus croisé de banque (AC 8, FR78)', () => {
  it('un export reconnu déposé sous boursorama → BankMismatchError', () => {
    const sheet = accountSheet()
    expect(() => extractCreditMutuelExport([sheet], 'boursorama')).toThrow(BankMismatchError)
  })

  it('un .xlsx non reconnu sous boursorama → format non reconnu, PAS bank_mismatch', () => {
    const noise: SheetGrid = { name: 'Feuille1', hidden: false, rows: [[t('rien à voir')]] }
    expect(() => extractCreditMutuelExport([noise], 'boursorama')).toThrow(ExportFormatError)
  })
})
