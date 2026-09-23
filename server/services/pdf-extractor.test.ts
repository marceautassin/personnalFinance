import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  extractStatement,
  redactIdentity,
} from './pdf-extractor'
import { operationRows, findDebitCreditHeader } from './bank-formats/columns'
import { BankMismatchError } from './bank-formats/types'
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

describe('extractStatement', () => {
  it('rejects a non-PDF buffer with an explicit error', async () => {
    const garbage = Buffer.from('this is definitely not a pdf')
    await expect(extractStatement(garbage, 'boursorama')).rejects.toThrow()
  })

  it('rejects an empty buffer', async () => {
    await expect(extractStatement(Buffer.alloc(0), 'boursorama')).rejects.toThrow()
  })

  describe.each(BOURSOBANK_FIXTURES)('Boursobank fixture: $file', (fx) => {
    const path = fixtureByName(fx.file)

    it.skipIf(!path)('extracts period and balances exactly', async () => {
      const result = await extractStatement(readFileSync(path!), 'boursorama')

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

    it.skipIf(!path)('rejette avec BankMismatchError si on attend une autre banque (FR78, AR38)', async () => {
      const err = await extractStatement(readFileSync(path!), 'credit_mutuel').catch(e => e)
      expect(err).toBeInstanceOf(BankMismatchError)
      expect((err as BankMismatchError).expected).toBe('credit_mutuel')
      expect((err as BankMismatchError).detected).toBe('boursorama')
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
        const curRes = await extractStatement(readFileSync(fixtureByName(cur.file)!), 'boursorama')
        const nextRes = await extractStatement(readFileSync(fixtureByName(next.file)!), 'boursorama')
        expect(curRes.closingBalanceCents).toBe(nextRes.openingBalanceCents)
      }
    },
  )

  it.skipIf(!fixturePath)('extracts a non-empty rawText from any PDF fixture', async () => {
    const result = await extractStatement(readFileSync(fixturePath!), 'boursorama')
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
 * Expurgation de l'identité avant transmission au fournisseur — NFR6, story 17.1.
 *
 * L'audit du 2026-09-06 a constaté que le texte INTÉGRAL du relevé partait chez le fournisseur,
 * bloc d'identité compris : IBAN `FR76…`, numéro de compte, nom et adresse du titulaire. Le
 * PRD, l'architecture et CLAUDE.md décrivaient tous trois une garantie que le code n'appliquait
 * pas. Ces tests sont la garantie.
 */
describe('expurgation de l\'identité (NFR6, story 17.1)', () => {
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
      'VIR INST MME MARIE DUPONT',
    ])('laisse intact le libellé bancaire « %s »', (label) => {
      expect(redactIdentity(label)).toBe(label)
    })
  })

  const fx = fixtureByName('Releve-compte-31-03-2026.pdf')
  it.skipIf(!fx)('aucun IBAN ne subsiste dans ce qui part au fournisseur', async () => {
    const result = await extractStatement(readFileSync(fx!), 'boursorama')
    expect(result.rawText).not.toMatch(/FR\d{2}[\s\u00a0\u202f]?\d{4}/u)
    // La donnée métier, elle, doit survivre à la coupe.
    expect(result.rawText).toContain('SOLDE AU')
  })
})

/**
 * `operationRows`/`findDebitCreditHeader` (désormais dans `bank-formats/columns.ts`) restent
 * exercées ici sur un cas d'usage complet propre à `pdf-extractor` : la coupe géométrique du
 * bloc d'identité, avant `redactIdentity`. Les tests unitaires génériques de ces fonctions
 * vivent dans `bank-formats/columns.test.ts`.
 */
describe('coupe géométrique + expurgation par motif, bout en bout', () => {
  const item = (text: string, x: number, y: number, width = 20) => ({ text, x, right: x + width, y })

  it('la coupe géométrique retire déjà le bloc d\'identité avant même redactIdentity', () => {
    const header = [item('Débit', 400, 700), item('Crédit', 480, 700)]
    const identity = [item('FR76 1234 5678 9012 3456 7890 123', 50, 760), item('12 rue des Lilas', 50, 780)]
    const operations = [item('02/03/2026', 50, 660), item('VIR Epargne', 120, 660), item('10,00', 400, 660)]

    const kept = operationRows([...identity, ...header, ...operations], findDebitCreditHeader(header))
    expect(kept.map(i => i.text)).not.toContain('FR76 1234 5678 9012 3456 7890 123')
    expect(kept.map(i => i.text)).toEqual(expect.arrayContaining(['Débit', 'Crédit', 'VIR Epargne', '10,00']))
  })
})
