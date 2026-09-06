import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  extractStatement,
  parseFrAmount,
  findDebitCreditSeparator,
  findDebitCreditHeader,
  operationRows,
  redactIdentity,
  cutBeforeOperations,
  extractBalances,
  renderRows,
  DEBIT_MARKER,
  CREDIT_MARKER,
  type PositionedItem,
} from './pdf-extractor'
import { eurosToCents } from '~~/shared/types/money'

const FIXTURE_DIR = resolve('tests/fixtures/pdfs')
const fixtureByName = (name: string): string | null => {
  const p = resolve(FIXTURE_DIR, name)
  return existsSync(p) ? p : null
}
const firstFixturePdf = (): string | null => {
  if (!existsSync(FIXTURE_DIR)) return null
  const files = readdirSync(FIXTURE_DIR).filter(f => f.toLowerCase().endsWith('.pdf'))
  return files.length > 0 ? resolve(FIXTURE_DIR, files[0]!) : null
}
const fixturePath = firstFixturePdf()

/**
 * Cas Boursobank verrouillés. Chaque entrée = un relevé réel ; les valeurs ont été
 * extraites manuellement et confirmées sur le PDF (cf. Completion Notes Story 2.2).
 *
 * Cohérence inter-relevés : closing(t) === opening(t+1). Boursobank rapporte au centime.
 */
const BOURSOBANK_FIXTURES: Array<{
  file: string
  periodStart: string
  periodEnd: string
  openingEuros: number
  closingEuros: number
}> = [
  {
    file: 'Releve-compte-27-02-2026.pdf',
    periodStart: '2026-01-31',
    periodEnd: '2026-02-27',
    openingEuros: 577.07,
    closingEuros: 478.41,
  },
  {
    file: 'Releve-compte-31-03-2026.pdf',
    periodStart: '2026-02-28',
    periodEnd: '2026-03-31',
    openingEuros: 478.41,
    closingEuros: 1023.98,
  },
]

describe('parseFrAmount', () => {
  it('parses a standard FR amount with thin space and comma', () => {
    expect(parseFrAmount('1 234,56')).toBe(eurosToCents(1234.56))
  })

  it('parses an amount with euro symbol', () => {
    expect(parseFrAmount('1 234,56 €')).toBe(eurosToCents(1234.56))
  })

  it('parses a negative amount (overdraft)', () => {
    expect(parseFrAmount('-12,34')).toBe(eurosToCents(-12.34))
  })

  it('parses an amount with non-breaking spaces (U+00A0)', () => {
    expect(parseFrAmount('1 234,56')).toBe(eurosToCents(1234.56))
  })

  it('parses an amount with narrow no-break space (U+202F)', () => {
    expect(parseFrAmount('1 234,56')).toBe(eurosToCents(1234.56))
  })

  it('parses dot decimal as fallback', () => {
    expect(parseFrAmount('1234.56')).toBe(eurosToCents(1234.56))
  })

  it('parses Boursobank thousands-dot + comma-decimal ("1.023,98")', () => {
    expect(parseFrAmount('1.023,98')).toBe(eurosToCents(1023.98))
  })

  it('parses millions with thousands-dot ("1.234.567,89")', () => {
    expect(parseFrAmount('1.234.567,89')).toBe(eurosToCents(1234567.89))
  })

  it('returns null on garbage input', () => {
    expect(parseFrAmount('hello')).toBeNull()
  })

  it('returns null on empty string', () => {
    expect(parseFrAmount('')).toBeNull()
  })

  it('returns null on ambiguous "1.234" (no comma, dot+3 digits)', () => {
    // Pourrait être 1.234 € ASCII OU 1 234 € milliers-point — on refuse de deviner.
    expect(parseFrAmount('1.234')).toBeNull()
  })

  it('returns null on ambiguous "12.345" (no comma, dot+3 digits)', () => {
    expect(parseFrAmount('12.345')).toBeNull()
  })

  it('parses non-ambiguous "1234.56" (2 decimals, ASCII fallback)', () => {
    expect(parseFrAmount('1234.56')).toBe(eurosToCents(1234.56))
  })
})

describe('extractStatement', () => {
  it('rejects a non-PDF buffer with an explicit error', async () => {
    const garbage = Buffer.from('this is definitely not a pdf')
    await expect(extractStatement(garbage)).rejects.toThrow()
  })

  it('rejects an empty buffer', async () => {
    await expect(extractStatement(Buffer.alloc(0))).rejects.toThrow()
  })

  describe.each(BOURSOBANK_FIXTURES)('Boursobank fixture: $file', (fx) => {
    const path = fixtureByName(fx.file)

    it.skipIf(!path)('extracts period and balances exactly', async () => {
      const result = await extractStatement(readFileSync(path!))

      expect(result.rawText.length).toBeGreaterThan(1000)
      // Le bloc d'identité est coupé (story 17.1) : « BOURSOBANK » et l'IBAN n'y figurent
      // plus. Ce qui reste commence à l'en-tête de colonnes.
      expect(result.rawText).toContain('SOLDE AU')
      expect(result.rawText).not.toContain('BOURSOBANK')
      expect(result.periodStart).toBe(fx.periodStart)
      expect(result.periodEnd).toBe(fx.periodEnd)
      expect(result.openingBalanceCents).toBe(eurosToCents(fx.openingEuros))
      expect(result.closingBalanceCents).toBe(eurosToCents(fx.closingEuros))
    })
  })

  /**
   * Cohérence inter-relevés : un relevé qui clôt à X € doit ouvrir le suivant à X €.
   * Garde-fou contre une régression silencieuse des regex de soldes.
   * Skipped si une seule des fixtures consécutives manque (sinon le test passerait
   * vert sans assertion — faux positif).
   */
  const allFixturesPresent = BOURSOBANK_FIXTURES.every(fx => fixtureByName(fx.file))
  it.skipIf(!allFixturesPresent)(
    'closing(month n) equals opening(month n+1) across Boursobank fixtures',
    async () => {
      const sorted = [...BOURSOBANK_FIXTURES].sort((a, b) => a.periodStart.localeCompare(b.periodStart))
      expect.assertions(sorted.length - 1)
      for (let i = 0; i < sorted.length - 1; i++) {
        const cur = sorted[i]!
        const next = sorted[i + 1]!
        const curRes = await extractStatement(readFileSync(fixtureByName(cur.file)!))
        const nextRes = await extractStatement(readFileSync(fixtureByName(next.file)!))
        expect(curRes.closingBalanceCents).toBe(nextRes.openingBalanceCents)
      }
    },
  )

  it.skipIf(!fixturePath)('extracts a non-empty rawText from any PDF fixture', async () => {
    const result = await extractStatement(readFileSync(fixturePath!))
    expect(result.rawText.length).toBeGreaterThan(100)
    if (result.periodStart !== null) {
      expect(result.periodStart).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
    if (result.openingBalanceCents !== null) {
      expect(Number.isInteger(result.openingBalanceCents)).toBe(true)
    }
  })
})

/**
 * Reconstruction en colonnes (2026-09-05).
 *
 * L'extraction à plat perdait la distinction Débit / Crédit et le modèle devinait le signe —
 * jusqu'à donner deux signes opposés au même libellé récurrent. Sur les deux relevés réels,
 * la réconciliation accusait 2 187 € et 1 764 € d'écart ; avec les marqueurs, elle tombe à
 * zéro. Ces tests portent sur les fonctions PURES, sans PDF : la géométrie se simule.
 */
describe('reconstruction en colonnes', () => {
  const item = (text: string, x: number, y: number, width = 20): PositionedItem =>
    ({ text, x, right: x + width, y })

  // Géométrie relevée sur un extrait Boursobank réel : en-têtes Débit x≈442, Crédit x≈506 ;
  // montants alignés à droite, bord droit ≈480 au débit et ≈546 au crédit.
  const headers = [item('Débit', 442, 427, 23), item('Crédit', 506, 427, 27)]

  it('déduit le séparateur des en-têtes', () => {
    expect(findDebitCreditSeparator(headers)).toBeCloseTo(486.5, 1)
  })

  it('rend null sans en-tête reconnaissable', () => {
    expect(findDebitCreditSeparator([item('Montant', 442, 427)])).toBeNull()
  })

  it('rend null si les en-têtes ne sont pas sur la même ligne', () => {
    expect(findDebitCreditSeparator([headers[0]!, item('Crédit', 506, 300, 27)])).toBeNull()
  })

  it('rend null si Crédit précède Débit — ce n\'est pas le tableau attendu', () => {
    expect(findDebitCreditSeparator([item('Débit', 506, 427, 23), item('Crédit', 442, 427, 27)])).toBeNull()
  })

  it('marque un montant de la colonne gauche en DÉBIT, celui de droite en CRÉDIT', () => {
    const rows = renderRows([
      item('VIR Epargne programmee', 95, 371, 120),
      item('10,00', 455, 371, 25),
      item('VIR INST SOCIETEX', 95, 314, 90),
      item('500,00', 516, 314, 30),
    ], 486.5)
    expect(rows).toContain(`10,00 ${DEBIT_MARKER}`)
    expect(rows).toContain(`500,00 ${CREDIT_MARKER}`)
  })

  it('n\'annote rien quand la structure de colonnes est inconnue', () => {
    const rows = renderRows([item('Libellé', 95, 371, 40), item('10,00', 455, 371, 25)], null)
    expect(rows).toBe('Libellé 10,00')
  })

  it('regroupe une ligne par ordonnée et ordonne par abscisse', () => {
    const rows = renderRows([
      item('C', 300, 100, 10),
      item('A', 100, 100, 10),
      item('B', 200, 100, 10),
      item('suivante', 100, 80, 10),
    ], null)
    expect(rows).toBe('A B C\nsuivante')
  })

  it('tolère un décalage vertical de moins de deux points sur une même ligne', () => {
    const rows = renderRows([item('A', 100, 100, 10), item('B', 200, 101.5, 10)], null)
    expect(rows).toBe('A B')
  })

  it('n\'annote que les montants, pas les dates ni les références', () => {
    const rows = renderRows([
      item('02/03/2026', 46, 371, 40),
      item('CB*0000', 300, 371, 40),
      item('12,34', 455, 371, 25),
    ], 486.5)
    expect(rows).toBe(`02/03/2026 CB*0000 12,34 ${DEBIT_MARKER}`)
  })

  it('reconnaît un montant à séparateur de milliers', () => {
    const rows = renderRows([item('1 234,56', 440, 371, 40)], 486.5)
    expect(rows).toBe(`1 234,56 ${DEBIT_MARKER}`)
  })
})

/**
 * Report du séparateur sur les pages de continuation.
 *
 * Une page qui ne réimprime pas l'en-tête « Débit / Crédit » sortait sans marqueur, et le
 * prompt renvoyait alors le modèle à la déduction du signe — la panne d'origine, sur une
 * partie du relevé (revue du 2026-09-05).
 */
describe('report du séparateur entre pages', () => {
  const item = (text: string, x: number, y: number, width = 20): PositionedItem =>
    ({ text, x, right: x + width, y })

  it('applique le séparateur d\'une page à celles qui n\'ont pas d\'en-tête', () => {
    const headers = [item('Débit', 442, 427, 23), item('Crédit', 506, 427, 27)]
    const separator = findDebitCreditSeparator(headers)!

    // Page de continuation : un montant au débit, aucun en-tête.
    const continuation = renderRows([item('CARTE CARREFOUR', 95, 300, 100), item('42,37', 455, 300, 25)], separator)
    expect(continuation).toContain(DEBIT_MARKER)
  })
})

/**
 * Expurgation de l'identité avant transmission au fournisseur — NFR6, story 17.1.
 *
 * L'audit du 2026-09-06 a constaté que le texte INTÉGRAL du relevé partait chez le fournisseur,
 * bloc d'identité compris : IBAN `FR76…`, numéro de compte, nom et adresse du titulaire. Le
 * PRD, l'architecture et CLAUDE.md décrivaient tous trois une garantie que le code n'appliquait
 * pas. Ces tests sont la garantie.
 */
describe('expurgation de l\'identité (NFR6, story 17.1)', () => {
  const item = (text: string, x: number, y: number, width = 20): PositionedItem =>
    ({ text, x, right: x + width, y })

  describe('coupe géométrique', () => {
    const header = [item('Débit', 400, 700), item('Crédit', 480, 700)]
    const identity = [item('FR76 1234 5678 9012 3456 7890 123', 50, 760), item('12 rue des Lilas', 50, 780)]
    const operations = [item('02/03/2026', 50, 660), item('VIR Epargne', 120, 660), item('10,00', 400, 660)]

    it('retire tout ce qui se trouve au-dessus de la ligne d\'en-tête', () => {
      const kept = operationRows([...identity, ...header, ...operations], findDebitCreditHeader(header))
      expect(kept.map(i => i.text)).not.toContain('FR76 1234 5678 9012 3456 7890 123')
      expect(kept.map(i => i.text)).not.toContain('12 rue des Lilas')
    })

    it('garde la ligne d\'en-tête et les opérations en dessous', () => {
      const kept = operationRows([...identity, ...header, ...operations], findDebitCreditHeader(header))
      expect(kept.map(i => i.text)).toEqual(expect.arrayContaining(['Débit', 'Crédit', 'VIR Epargne', '10,00']))
    })

    it('ne coupe rien sur une page sans en-tête — l\'expurgation par motif prend le relais', () => {
      const all = [...identity, ...operations]
      expect(operationRows(all, null)).toHaveLength(all.length)
    })
  })

  describe('expurgation par motif', () => {
    it('remplace un IBAN, espacé ou non', () => {
      expect(redactIdentity('Titulaire FR76 1234 5678 9012 3456 7890 123 fin')).toBe('Titulaire [IBAN] fin')
      expect(redactIdentity('IBAN FR7612345678901234567890123 fin')).toBe('IBAN [IBAN] fin')
    })

    it('remplace un BIC ancré sur son intitulé', () => {
      expect(redactIdentity('BIC : BOUSFRPPXXX')).toBe('BIC : [BIC]')
    })

    it.each([
      'CARTE 08/08/25 CARREFOUR MARKET CB*0000',
      'PRLV SEPA SAS EXEMPLE LA CARTE',
      'VIR SEPA DUPONT Jean charges Jean',
      'CARTE 30/03/26 Amazon.fr*X000X0X CB*0000',
      'VIR INST MME JEANNE EXEMPLE',
    ])('laisse intact le libellé bancaire « %s »', (label) => {
      expect(redactIdentity(label)).toBe(label)
    })
  })

  describe('coupe du texte plat (repli)', () => {
    it('coupe au début du tableau d\'opérations', () => {
      const flat = 'Boursorama SA FR76 1234 5678 9012 3456 7890 123 Date opération Libellé Valeur Débit Crédit SOLDE AU'
      expect(cutBeforeOperations(flat)).toMatch(/^Date opération/)
    })

    /**
     * Défaut trouvé en revue le 2026-09-06 : ne couper qu'à la PREMIÈRE ancre laissait passer
     * les blocs d'identité des pages 2 à N d'un relevé multipage aplati.
     */
    it('écarte le bloc d\'identité de CHAQUE page, pas seulement de la première', () => {
      const flat = [
        'Boursorama SA FR76 1234 5678 9012 3456 7890 123 M JEAN DUPONT 12 rue des Lilas',
        'Date opération Libellé Valeur Débit Crédit',
        '02/03/2026 VIR Epargne programmee 10,00',
        'Mentions légales page 1 — M JEAN DUPONT 12 rue des Lilas 75000 PARIS',
        'Date opération Libellé Valeur Débit Crédit',
        '05/03/2026 CARTE CARREFOUR 42,37',
        'Mentions légales page 2 — M JEAN DUPONT 12 rue des Lilas 75000 PARIS',
      ].join(' ')

      const cut = cutBeforeOperations(flat)
      expect(cut).not.toContain('12 rue des Lilas')
      expect(cut).not.toContain('EXEMPLEVILLE')
      // Les deux tableaux d'opérations, eux, survivent intégralement.
      expect(cut).toContain('VIR Epargne programmee 10,00')
      expect(cut).toContain('CARTE CARREFOUR 42,37')
    })

    it('rend le texte inchangé quand l\'ancre est introuvable', () => {
      expect(cutBeforeOperations('un relevé d\'une autre banque')).toBe('un relevé d\'une autre banque')
    })
  })

  const fx = fixtureByName('Releve-compte-31-03-2026.pdf')
  it.skipIf(!fx)('aucun IBAN ne subsiste dans ce qui part au fournisseur', async () => {
    const result = await extractStatement(readFileSync(fx!))
    expect(result.rawText).not.toMatch(/FR\d{2}[\s\u00a0\u202f]?\d{4}/u)
    expect(result.rawText).not.toContain('4061 8804 5700 0402 1868')
    // La donnée métier, elle, doit survivre à la coupe.
    expect(result.rawText).toContain('SOLDE AU')
  })
})

/**
 * Lecture des soldes — story 17.2.
 *
 * Les captures paresseuses s'arrêtaient à la première espace : `2 817,46` rendait `"3"`.
 * Ça ne se voyait pas parce qu'`unpdf` aplatit sans séparateur ; un changement de version
 * aurait fait basculer tous les relevés à quatre chiffres en écart de plusieurs milliers.
 */
describe('extractBalances (story 17.2)', () => {
  const SEPARATORS: Array<[string, string]> = [
    ['espace ASCII', ' '],
    ['espace insécable', '\u00a0'],
    ['espace fine insécable', '\u202f'],
    ['sans séparateur', ''],
  ]

  it.each(SEPARATORS)('lit un solde d\'ouverture à quatre chiffres — %s', (_name, sep) => {
    const text = `SOLDE AU : 31/12/2024 2${sep}817,46 02/01/2025 CARTE`
    expect(extractBalances(text).openingCents).toBe(eurosToCents(2817.46))
  })

  it.each(SEPARATORS)('retient le DEUXIÈME des trois montants du récapitulatif — %s', (_name, sep) => {
    const text = `Nouveau solde en EUR : Montant frais bancaires* : 0,00 1${sep}023,98 0,00`
    expect(extractBalances(text).closingCents).toBe(eurosToCents(1023.98))
  })

  it('lit le format à point de milliers du récapitulatif réel', () => {
    const text = 'Nouveau solde en EUR : Montant frais bancaires* : 0,00 1.023,98 0,00'
    expect(extractBalances(text).closingCents).toBe(eurosToCents(1023.98))
  })

  it('rend null quand l\'intitulé est absent', () => {
    expect(extractBalances('un relevé sans solde')).toEqual({ openingCents: null, closingCents: null })
  })

  it('lit un solde négatif (découvert)', () => {
    expect(extractBalances('SOLDE AU : 31/12/2024 -1 250,40 suite').openingCents).toBe(eurosToCents(-1250.40))
  })

  it('ne prend pas une date pointée pour un montant', () => {
    // Sur ce gabarit, `31.12` se lisait comme 31,12 € (revue du 2026-09-06).
    expect(extractBalances('Ancien solde 31.12.2024 1 500,00 suite').openingCents)
      .toBe(eurosToCents(1500))
  })

  it('accepte les intitulés de repli des autres gabarits', () => {
    expect(extractBalances('Ancien solde : 1 500,00').openingCents).toBe(eurosToCents(1500))
    expect(extractBalances('Nouveau solde : 2 500,00').closingCents).toBe(eurosToCents(2500))
  })
})
