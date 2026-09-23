import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { recognizes as boursoramaRecognizes, cutBeforeOperations, extractBalances, balancesAndPeriod, operationsText } from './boursorama'
import { recognizes as creditMutuelRecognizes } from './credit-mutuel'
import { DEBIT_MARKER, CREDIT_MARKER } from './columns'
import { redactIdentity } from '~~/server/services/pdf-extractor'
import { eurosToCents } from '~~/shared/types/money'
import type { PositionedItem } from './types'

describe('boursorama.recognizes', () => {
  it('reconnaît un relevé sur le BIC BOUSFRPP', () => {
    expect(boursoramaRecognizes('Émetteur BOUSFRPPXXX contact')).toBe(true)
  })

  it('reconnaît un relevé citant le domaine boursobank.com', () => {
    expect(boursoramaRecognizes('www.boursobank.com')).toBe(true)
  })

  it('reconnaît un relevé citant le domaine boursorama.com ou .fr', () => {
    expect(boursoramaRecognizes('www.boursorama.com')).toBe(true)
    expect(boursoramaRecognizes('www.boursorama.fr')).toBe(true)
  })

  it('ne reconnaît pas un texte sans aucun marqueur', () => {
    expect(boursoramaRecognizes('un relevé quelconque')).toBe(false)
  })
})

/**
 * Coupe du texte plat (repli) — story 17.1. Déplacée depuis pdf-extractor.test.ts, comportement
 * inchangé (Tâche 3, AC 6). Valeurs (IBAN, nom, adresse) FICTIVES — aucun rapport avec une
 * donnée réelle, seule la FORME compte pour ces tests unitaires.
 */
describe('cutBeforeOperations (repli, story 17.1)', () => {
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
    expect(cut).not.toContain('PARIS')
    // Les deux tableaux d'opérations, eux, survivent intégralement.
    expect(cut).toContain('VIR Epargne programmee 10,00')
    expect(cut).toContain('CARTE CARREFOUR 42,37')
  })

  it('rend le texte inchangé quand l\'ancre est introuvable', () => {
    expect(cutBeforeOperations('un relevé d\'une autre banque')).toBe('un relevé d\'une autre banque')
  })
})

describe('operationsText — repli sans pages positionnées', () => {
  it('retombe sur cutBeforeOperations quand pages est null', () => {
    const flat = 'Date opération Libellé Valeur Débit Crédit 02/03/2026 VIR Epargne 10,00'
    expect(operationsText({ pages: null, flatText: flat })).toBe(cutBeforeOperations(flat))
  })

  it('retombe sur cutBeforeOperations quand aucune page n\'a d\'en-tête reconnaissable', () => {
    const flat = 'Date opération Libellé Valeur Débit Crédit 02/03/2026 VIR Epargne 10,00'
    const noHeaderPage: PositionedItem[] = [{ text: 'VIR Epargne', x: 50, right: 100, y: 300 }]
    expect(operationsText({ pages: [noHeaderPage], flatText: flat })).toBe(cutBeforeOperations(flat))
  })
})

/**
 * Lecture des soldes — story 17.2. Déplacée depuis pdf-extractor.test.ts.
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

/**
 * Fixture versionnée — AC 7, NFR36, AR40, D43, décision Marceau du 2026-09-22.
 *
 * `tests/fixtures/statements/boursorama-2026-03.json` est ENTIÈREMENT SYNTHÉTIQUE : la
 * géométrie (pages, positions x/right/y, en-tête Débit/Crédit, bloc d'identité au-dessus de
 * l'en-tête, récapitulatif de soldes) est réaliste, mais AUCUNE opération, aucun montant,
 * aucun tiers, aucun IBAN, nom ou adresse n'est réel — tout est inventé et généré par
 * `generate-synthetic-fixture.test.ts`. Ce test n'est JAMAIS sauté.
 */
describe('fixture Boursorama synthétique (AC 7, D43)', () => {
  interface Fixture {
    bank: string
    source: string
    flatText: string
    pages: PositionedItem[][]
    expected: {
      periodStart: string
      periodEnd: string
      openingCents: number
      closingCents: number
    }
  }

  const fixture: Fixture = JSON.parse(
    readFileSync(resolve('tests/fixtures/statements/boursorama-2026-03.json'), 'utf8'),
  )

  /** IBAN-like : même motif que `redactIdentity` (pdf-extractor.ts). */
  const IBAN_LIKE_RE = /\b[A-Z]{2}\d{2}(?:[ \u00a0\u202f]?[A-Z0-9]{2,4}){3,8}\b/gu
  const LONG_DIGIT_RUN_RE = /\d{10,}/gu

  it('recognizes est vrai pour Boursorama et faux pour Crédit Mutuel', () => {
    expect(boursoramaRecognizes(fixture.flatText)).toBe(true)
    expect(creditMutuelRecognizes(fixture.flatText)).toBe(false)
  })

  it('balancesAndPeriod rend la période ET les soldes attendus (les quatre champs)', () => {
    const result = balancesAndPeriod(fixture.flatText)
    expect(result.periodStart).toBe(fixture.expected.periodStart)
    expect(result.periodEnd).toBe(fixture.expected.periodEnd)
    expect(result.openingCents).toBe(fixture.expected.openingCents)
    expect(result.closingCents).toBe(fixture.expected.closingCents)
  })

  it('operationsText est non vide et contient des marqueurs [DÉBIT]/[CRÉDIT]', () => {
    const text = operationsText({ pages: fixture.pages, flatText: fixture.flatText })
    expect(text.length).toBeGreaterThan(100)
    expect(text).toContain(DEBIT_MARKER)
    expect(text).toContain(CREDIT_MARKER)
  })

  describe('ce qui part au fournisseur (après redactIdentity)', () => {
    const text = redactIdentity(operationsText({ pages: fixture.pages, flatText: fixture.flatText }))

    it('ne contient plus aucune séquence de forme IBAN (bloc d\'identité coupé)', () => {
      expect([...text.matchAll(IBAN_LIKE_RE)]).toEqual([])
    })

    it('ne contient aucune suite d\'au moins dix chiffres (la fixture n\'en plante aucune)', () => {
      expect([...text.matchAll(LONG_DIGIT_RUN_RE)]).toEqual([])
    })

    /**
     * Preuve explicite que la coupe agit sur CHAQUE page qui porte un bloc d'identité, pas
     * seulement la première — la régression corrigée le 2026-09-06 (story 17.1). L'adresse
     * fictive du bloc d'identité (« 12 RUE DES LILAS ») ne matche NI le motif IBAN NI le motif
     * BIC de `redactIdentity` : seule la coupe GÉOMÉTRIQUE (`operationRows`, par page) peut
     * l'écarter. La retrouver ici prouverait qu'une des deux pages n'a pas été coupée.
     */
    it('l\'adresse du bloc d\'identité (pages 1 ET 2) a disparu — preuve de la coupe géométrique', () => {
      expect(text).not.toContain('12 RUE DES LILAS')
    })

    it('le contenu des opérations de la page 2 est bien transmis (rien n\'a été perdu avec le bloc d\'identité)', () => {
      expect(text).toContain('VIR RECU AMI FICTIF')
      expect(text).toContain('PRLV ASSURANCE HABITATION FICTIVE')
    })

    /** Snapshot — protège la sortie transmise au fournisseur d'une régression silencieuse. */
    it('correspond au snapshot verrouillé', () => {
      expect(text).toMatchSnapshot()
    })
  })

  /**
   * Chemin de repli : quand la lecture positionnelle échoue (`pages === null`), seule
   * l'expurgation PAR MOTIF de `redactIdentity` protège l'IBAN/BIC — `cutBeforeOperations`
   * coupe déjà le bloc d'identité par ancre textuelle (story 17.1), mais ne connaît rien à la
   * géométrie. Ce test couvre spécifiquement ce cas, distinct de la coupe géométrique testée
   * ci-dessus.
   */
  it('le chemin de repli (pages null) ne laisse fuir aucun IBAN', () => {
    const text = redactIdentity(operationsText({ pages: null, flatText: fixture.flatText }))
    expect([...text.matchAll(IBAN_LIKE_RE)]).toEqual([])
  })
})
