import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { recognizes, operationsText, balancesAndPeriod } from './credit-mutuel'
import { DEBIT_MARKER, CREDIT_MARKER } from './columns'
import { StatementFormatError, type PositionedItem } from './types'
import { redactIdentity } from '~~/server/services/pdf-extractor'

interface Fixture {
  flatText: string
  pages: PositionedItem[][]
  expected: {
    periodStart: string
    periodEnd: string
    openingCents: number
    closingCents: number
    ignoredSections: string[]
    operationLineCount: number
    plantedIdentifiers: string[]
  }
}

function load(name: string): Fixture {
  return JSON.parse(readFileSync(resolve(__dirname, '../../../tests/fixtures/statements', name), 'utf8')) as Fixture
}

const monthly = load('credit-mutuel-mensuel.json')
const extract = load('credit-mutuel-extrait.json')

/** Copie profonde, pour muter une page sans toucher la fixture partagée. */
const clone = (pages: PositionedItem[][]): PositionedItem[][] => structuredClone(pages)

function renameText(pages: PositionedItem[][], from: string | RegExp, to: string): PositionedItem[][] {
  const copy = clone(pages)
  for (const page of copy) for (const item of page) item.text = item.text.replace(from, to)
  return copy
}

function removeItems(pages: PositionedItem[][], predicate: (i: PositionedItem, pageIndex: number) => boolean): PositionedItem[][] {
  return clone(pages).map((page, index) => page.filter(i => !predicate(i, index)))
}

function refusal(fn: () => unknown): StatementFormatError {
  try {
    fn()
  }
  catch (err) {
    expect(err).toBeInstanceOf(StatementFormatError)
    return err as StatementFormatError
  }
  throw new Error('aucun refus levé')
}

describe('credit-mutuel.recognizes', () => {
  it('reconnaît un relevé portant le BIC CMCIFR', () => {
    expect(recognizes('Émetteur BIC : CMCIFR2A contact@creditmutuel.example')).toBe(true)
  })

  it('reconnaît un relevé citant le domaine creditmutuel.fr', () => {
    expect(recognizes('Consultez vos comptes sur www.creditmutuel.fr')).toBe(true)
  })

  it('ne se laisse pas abuser par un libellé Boursorama citant l\'autre banque (garde anti faux positif)', () => {
    const boursoramaText = 'BOUSFRPP www.boursobank.com VIR SEPA VERS CREDIT MUTUEL EXEMPLE 42,00'
    expect(recognizes(boursoramaText)).toBe(false)
  })

  it('ne reconnaît pas un texte sans aucun marqueur', () => {
    expect(recognizes('un relevé quelconque')).toBe(false)
  })

  it.each([['mensuel', monthly], ['extrait', extract]])('reconnaît la fixture %s', (_name, fixture) => {
    expect(recognizes(fixture.flatText)).toBe(true)
  })
})

describe.each([
  ['relevé mensuel (3 pages, section sur deux pages)', monthly],
  ['extrait à la demande (une page, code de marge au milieu)', extract],
])('credit-mutuel — %s', (_name, fixture) => {
  const { expected, pages, flatText } = fixture

  it('lit les soldes de la section du compte courant et la période (AC 5, 6)', () => {
    const result = balancesAndPeriod(flatText, pages)
    expect(result.openingCents).toBe(expected.openingCents)
    expect(result.closingCents).toBe(expected.closingCents)
    // La période s'ouvre le LENDEMAIN de la date du solde d'ouverture.
    expect(result.periodStart).toBe(expected.periodStart)
    expect(result.periodEnd).toBe(expected.periodEnd)
  })

  it('nomme les sections ignorées, sans numéros (AC 2)', () => {
    const { ignoredSections } = balancesAndPeriod(flatText, pages)
    expect(ignoredSections).toEqual(expected.ignoredSections)
    for (const title of ignoredSections ?? []) expect(title).not.toMatch(/\d{6,}/u)
  })

  it('ne transmet AUCUN faux identifiant planté, sous aucune forme (AC 9, 10)', () => {
    const text = redactIdentity(operationsText({ pages, flatText }))
    for (const planted of expected.plantedIdentifiers) {
      expect(text, `fuite de « ${planted.slice(0, 6)}… »`).not.toContain(planted)
      expect(text).not.toContain(planted.replace(/\s+/gu, ''))
    }
    expect(text).not.toMatch(/IBAN\s*:|QXBAN|TITULAIRE|N°|SOLDE/u)
    expect(text).not.toMatch(/\d{10,}/u)
  })

  it('ne rend que les lignes d\'opérations de la section retenue, montants marqués par colonne', () => {
    const text = operationsText({ pages, flatText })
    expect(text.split('\n')).toHaveLength(expected.operationLineCount)
    expect(text).toContain(DEBIT_MARKER)
    expect(text).toContain(CREDIT_MARKER)
    // Aucun montant nu : chacun porte son marqueur, y compris en page 2 dont les colonnes sont décalées.
    const amounts = [...text.matchAll(/\d{1,3}(?:\.\d{3})*,\d{2}(?! \[)/gu)]
    expect(amounts).toEqual([])
  })

  it('préserve les numéros de chèque (sept chiffres) et les références courtes', () => {
    const text = operationsText({ pages, flatText })
    expect(text).toMatch(/CHEQUE 000012\d/u)
    expect(text).toMatch(/SC000000\d \d/u)
  })

  it('ne perd aucun montant à cause du masquage IBAN (référence courte suivie d\'un montant)', () => {
    const text = redactIdentity(operationsText({ pages, flatText }))
    expect(text).not.toContain('[IBAN],')
    expect(text).toMatch(/ASSURANCE EXEMPLE SC\d+ \d+,\d{2} \[DÉBIT\]/u)
  })

  it('réconcilie au centime : somme des colonnes = clôture − ouverture', () => {
    const text = operationsText({ pages, flatText })
    let sum = 0
    for (const m of text.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2}) \[(DÉBIT|CRÉDIT)\]/gu)) {
      const cents = Number(m[1]!.replace(/\./gu, '').replace(',', ''))
      sum += m[2] === 'DÉBIT' ? -cents : cents
    }
    expect(expected.closingCents - expected.openingCents - sum).toBe(0)
  })
})

describe('credit-mutuel — section sur deux pages et raccord entre relevés (AC 3, 7)', () => {
  it('importe les opérations des DEUX pages comme une seule section', () => {
    const text = operationsText({ pages: monthly.pages, flatText: monthly.flatText })
    expect(text).toContain('CHEQUE 0000123') // page 1
    expect(text).toContain('CHEQUE 0000124') // page 2
    expect(text).toContain('RELEVE CARTE') // la ligne carte reste une opération ordinaire (AC 13)
  })

  it('n\'importe pas le bloc carte, le livret ni les tableaux de situation (AC 1, 13)', () => {
    const text = operationsText({ pages: monthly.pages, flatText: monthly.flatText })
    expect(text).not.toContain('COMMERCE EXEMPLE')
    expect(text).not.toContain('VIR DE M')
    expect(text).not.toContain('TOTAL PRELEVE')
    expect(text).not.toContain('SITUATION')
  })

  it('deux relevés consécutifs : clôture du premier = ouverture du second, aucune période commune', () => {
    // Le relevé précédent s'est clos à la date du solde d'ouverture (04/02/2030) : le nôtre commence
    // le lendemain, sans quoi FR6 signalerait un chevauchement à chaque relevé consécutif.
    const { periodStart } = balancesAndPeriod(monthly.flatText, monthly.pages)
    const previousPeriodEnd = '2030-02-04'
    expect(previousPeriodEnd < periodStart!).toBe(true)
    expect(periodStart).toBe('2030-02-05')
  })

  it('fragments de la marge (x < 40) exclus, y compris au milieu des opérations (extrait)', () => {
    const text = operationsText({ pages: extract.pages, flatText: extract.flatText })
    expect(text).not.toMatch(/HT\.\d/u)
    expect(text.split('\n').every(line => !/^[2 0X]$/u.test(line.trim()))).toBe(true)
    // Les opérations situées APRÈS le code de marge sont toujours lues.
    expect(text).toContain('CHEQUE 0000125')
  })
})

describe('credit-mutuel — refus explicites, jamais de supposition (AC 4, 5, AR41)', () => {
  const { pages, flatText } = monthly

  it('solde débiteur dans la section : refusé, libellé rencontré dans data', () => {
    const debtor = renameText(pages, 'SOLDE CREDITEUR AU 04/02/2030', 'SOLDE DEBITEUR AU 04/02/2030')
    const err = refusal(() => balancesAndPeriod(flatText, debtor))
    expect(err.reason).toBe('unsupported_balance_line')
    expect(err.data).toEqual({ label: 'SOLDE DEBITEUR AU' })
  })

  it('libellé de solde inconnu dans la section : refusé', () => {
    const unknown = renameText(pages, 'SOLDE CREDITEUR AU 04/03/2030', 'SOLDE PROVISOIRE AU 04/03/2030')
    expect(refusal(() => balancesAndPeriod(flatText, unknown)).reason).toBe('unsupported_balance_line')
  })

  it('ligne de solde intermédiaire : refusée', () => {
    const copy = clone(pages)
    const extra = copy[0]!.filter(i => i.text.startsWith('SOLDE CREDITEUR AU 04/02/2030') || i.text === '1.000,00')
    copy[0]!.push(...extra.map(i => ({ ...i, y: i.y - 200 })))
    expect(refusal(() => balancesAndPeriod(flatText, copy)).reason).toBe('unexpected_balance_line_count')
  })

  it('aucun compte courant : refusé, sans lire plus loin', () => {
    const none = renameText(pages, 'C/C EUROCOMPTE SERENITE', 'LIVRET EXEMPLE')
    expect(refusal(() => operationsText({ pages: none, flatText })).reason).toBe('no_current_account')
    expect(refusal(() => balancesAndPeriod(flatText, none)).reason).toBe('no_current_account')
  })

  it('deux comptes courants distincts : refusé', () => {
    const two = renameText(pages, 'PLAN D\'EPARGNE LOGEMENT EXEMPLE', 'C/C AUTRE EXEMPLE')
    const err = refusal(() => operationsText({ pages: two, flatText }))
    expect(err.reason).toBe('multiple_current_accounts')
    expect(err.data).toEqual({ count: 2 })
  })

  it('section du compte courant jamais clôturée (pas de ligne Réf) : refusée', () => {
    const open = removeItems(pages, i => i.text === 'Réf : 002')
    expect(refusal(() => operationsText({ pages: open, flatText })).reason).toBe('current_account_section_not_closed')
  })

  it('page de continuation sans en-tête de colonnes : refusée plutôt que de perdre ses opérations', () => {
    const noHeader = removeItems(pages, (i, p) => p === 1 && /EUROS$/u.test(i.text))
    expect(refusal(() => operationsText({ pages: noHeader, flatText })).reason).toBe('continuation_page_without_header')
  })

  it('lecture positionnelle indisponible (pages null) : refusée, pas de repli sur le texte plat', () => {
    expect(refusal(() => operationsText({ pages: null, flatText })).reason).toBe('positional_reading_unavailable')
    expect(refusal(() => balancesAndPeriod(flatText, null)).reason).toBe('positional_reading_unavailable')
    expect(refusal(() => balancesAndPeriod(flatText)).reason).toBe('positional_reading_unavailable')
  })

  it('le refus ne porte jamais de valeur lue hors intitulé de solde', () => {
    const none = renameText(pages, 'C/C EUROCOMPTE SERENITE', 'LIVRET EXEMPLE')
    const err = refusal(() => operationsText({ pages: none, flatText }))
    expect(JSON.stringify({ reason: err.reason, data: err.data })).not.toMatch(/\d{6,}/u)
  })
})

describe('credit-mutuel — numéro de compte dans un libellé d\'opération (couche 2, AR39)', () => {
  it('masque le numéro du PEL d\'un libellé `VIR PEL <code> <numéro>`, garde le reste lisible', () => {
    const text = operationsText({ pages: monthly.pages, flatText: monthly.flatText })
    expect(text).toMatch(/VIR PEL 99999 \[COMPTE\] 50,00 \[DÉBIT\]/u)
  })

  it('masque une suite d\'au moins 10 chiffres inconnue du document (couche 3)', () => {
    const unknown = renameText(monthly.pages, 'VOTRE ABONNEMENT EXEMPLE', 'REF 1234567890123')
    const text = operationsText({ pages: unknown, flatText: monthly.flatText })
    expect(text).toContain('REF [NUMÉRO]')
    expect(text).not.toContain('1234567890123')
  })
})
