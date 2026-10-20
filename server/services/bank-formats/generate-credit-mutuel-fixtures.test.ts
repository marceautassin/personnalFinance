/**
 * generate-credit-mutuel-fixtures — (re)génère `tests/fixtures/statements/credit-mutuel-*.json`
 * (D43, story 28.2, dépôt PUBLIC).
 *
 * **Aucune donnée réelle, même anonymisée.** La STRUCTURE est celle des relevés Crédit Mutuel
 * observés : pages, positions x/y, en-têtes `Débit EUROS` / `Crédit EUROS` décalés d'une page à
 * l'autre, ligne de titre de section avec glyphe `€` séparé, `TITULAIRE(S)`, lignes de solde,
 * `Réf :` de fin de section, ligne `IBAN :` / `QXBAN :` sous la clôture, bloc détail carte,
 * tableaux de situation, code vertical de marge (`x < 40`) jusqu'au milieu des opérations. Le
 * CONTENU — libellés, montants, dates (2030), noms, numéros — est entièrement INVENTÉ ici : pas
 * de substitution de chiffres, donc rien à inverser. Aucune table vrai → faux n'existe dans le dépôt.
 *
 * Ce fichier ne lit aucun PDF et aucun fichier externe. Gardé par `GENERATE_FIXTURE` pour ne
 * jamais réécrire les fixtures versionnées par accident :
 *
 *   GENERATE_FIXTURE=1 yarn test:run generate-credit-mutuel-fixtures
 */
import { describe, it } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseFrAmount } from './fr-parsing'
import type { PositionedItem } from './types'

const GENERATE_FIXTURE = process.env.GENERATE_FIXTURE

/** Faux identifiants plantés : leur absence du texte transmis est ce que les tests vérifient. */
const FAKE_CURRENT = '99900000001'
const FAKE_LIVRET = '99900000002'
const FAKE_CREDIT = '99900000003'
const FAKE_PEL = '99900000005'
const FAKE_IBAN_CURRENT = 'FR76 3000 0000 0100 0000 0012 345'
const FAKE_IBAN_LIVRET = 'FR76 3000 0000 0100 0000 0099 912'
const FAKE_QXBAN = 'QX00 ZZZZ ZZZ ZZZZ 0000 0ZZZ ZZZZ ZZZZ ZZZ'
const FAKE_HOLDER = 'JEAN EXEMPLE'

const WIDTH = 5.4
const text = (x: number, y: number, t: string, right?: number): PositionedItem => ({ x, right: right ?? x + t.length * WIDTH, y, text: t })
/** Montant aligné à droite : c'est son bord droit qui désigne la colonne. */
const amount = (rightEdge: number, y: number, t: string): PositionedItem => ({ x: rightEdge - t.length * WIDTH, right: rightEdge, y, text: t })

/** Géométrie d'une page : `shift` vaut 0 sur les pages 1 et 3, 10 sur la page 2 (observé). */
function geometry(shift: number) {
  return {
    date: 52 + shift,
    value: 100 + shift,
    label: 148 + shift,
    debitRight: 460 + shift,
    creditRight: 534 + shift,
    header: (y: number): PositionedItem[] => [
      text(63 + shift, y, 'Date', 81 + shift),
      text(98 + shift, y, 'Date valeur', 142 + shift),
      text(161 + shift, y, 'Opération', 199 + shift),
      text(409 + shift, y, 'Débit EUROS', 460 + shift),
      text(480 + shift, y, 'Crédit EUROS', 534 + shift),
    ],
  }
}

interface Op {
  date: string
  value: string
  label: string
  side: 'debit' | 'credit'
  amount: string
  /** Lignes de libellé sans date ni montant (prolongent la précédente). */
  continuation?: string[]
}

function opRows(g: ReturnType<typeof geometry>, startY: number, ops: Op[], midRowHook?: (index: number, y: number) => PositionedItem[]): { items: PositionedItem[], nextY: number } {
  const items: PositionedItem[] = []
  let y = startY
  ops.forEach((op, index) => {
    items.push(
      text(g.date, y, op.date, g.date + 40),
      text(g.value, y, op.value, g.value + 40),
      text(g.label, y, op.label),
      amount(op.side === 'debit' ? g.debitRight : g.creditRight, y, op.amount),
    )
    if (midRowHook) items.push(...midRowHook(index, y))
    y -= 11
    for (const line of op.continuation ?? []) {
      items.push(text(g.label, y, line))
      y -= 11
    }
  })
  return { items, nextY: y }
}

const signed = (op: Op) => (op.side === 'debit' ? -1 : 1) * (parseFrAmount(op.amount) as number)

/** Texte plat d'un document, dans l'ordre de lecture — suffit à `recognizes` (BIC dans l'en-tête). */
function flatten(pages: PositionedItem[][]): string {
  return pages
    .map(items => [...items].sort((a, b) => b.y - a.y || a.x - b.x).map(i => i.text).join(' '))
    .join('\n')
}

const letterhead = (): PositionedItem[] => [
  text(249, 773, 'CCM EXEMPLEVILLE', 347),
  text(233, 763, '1 RUE DE L\'EXEMPLE 99000 EXEMPLEVILLE', 362),
  text(140, 753, '00 00 00 00 00 FAX 00 00 00 00 00', 283),
  text(308, 753, 'agence@creditmutuel.fr BIC : CMCIFR2A', 473),
  text(517, 707, '99999', 534),
  text(517, 699, '99999', 534),
  text(303, 669, 'M', 309),
  text(315, 669, 'JEAN', 364),
  text(370, 669, 'EXEMPLE', 406),
  text(303, 660, '1', 309),
  text(315, 660, 'RUE', 333),
  text(339, 660, 'DE L\'EXEMPLE', 424),
  text(7, 561, '.'.repeat(40), 563),
]

function footer(y: number, pageNumber: number, withSuite: boolean): PositionedItem[] {
  return [
    ...(withSuite ? [text(460, y + 2, '<<Suite au verso>>', 547)] : []),
    text(48, y, 'Information sur la protection des comptes :', 172),
    text(48, y - 7, '( GE ) : protégé par la Garantie de l\'Etat, ( GD ) : protégé par la Garantie des Dépôts', 266),
    text(501, y - 43, `Page ${pageNumber}`, 533),
  ]
}

/** Code vertical de marge : x < 40, il apparaît parfois au MILIEU des opérations. */
const marginCode = (y: number): PositionedItem[] => [
  text(14, y, 'HT.20301017.000000.0000.0000.0001', 192),
  text(14, y - 11, '2', 20),
  text(14, y - 21, '0', 20),
  text(14, y - 32, 'X', 20),
]

// ---------------------------------------------------------------------------------------------
// Fixture A — relevé mensuel, 3 pages : compte courant sur DEUX pages, livret, PEL, bloc carte.
// ---------------------------------------------------------------------------------------------

const MONTHLY_PAGE_1: Op[] = [
  { date: '05/02/2030', value: '05/02/2030', label: 'PRLV SEPA FOURNISSEUR EAU EXEMPLE', side: 'debit', amount: '40,00', continuation: ['REF CLIENT 0000001'] },
  { date: '07/02/2030', value: '07/02/2030', label: 'ASSURANCE EXEMPLE SC0000001', side: 'debit', amount: '55,28' },
  { date: '08/02/2030', value: '08/02/2030', label: 'VIR SEPA EMPLOYEUR EXEMPLE', side: 'credit', amount: '2.000,00' },
  { date: '10/02/2030', value: '10/02/2030', label: 'CHEQUE 0000123', side: 'debit', amount: '120,00' },
  { date: '12/02/2030', value: '12/02/2030', label: 'PRLV SEPA IMPOTS EXEMPLE', side: 'debit', amount: '300,00', continuation: ['ICS : FR00ZZZ000000', 'RUM : ++FR00ZZZ000000M000000000001'] },
  { date: '14/02/2030', value: '14/02/2030', label: `VIR PEL 99999 ${FAKE_PEL}`, side: 'debit', amount: '50,00' },
  { date: '20/02/2030', value: '01/03/2030', label: 'VIR EPARGNE EXEMPLE', side: 'debit', amount: '100,00' },
]
const MONTHLY_PAGE_2: Op[] = [
  { date: '28/02/2030', value: '28/02/2030', label: 'PRLV SEPA OPERATEUR MOBILE EXEMPLE', side: 'debit', amount: '20,00', continuation: ['VOTRE ABONNEMENT EXEMPLE'] },
  { date: '28/02/2030', value: '28/02/2030', label: 'RELEVE CARTE', side: 'debit', amount: '100,00' },
  { date: '01/03/2030', value: '01/03/2030', label: 'VIR RETRAITE EXEMPLE', side: 'credit', amount: '1.500,00' },
  { date: '02/03/2030', value: '02/03/2030', label: 'CHEQUE 0000124', side: 'debit', amount: '250,00' },
]
const MONTHLY_OPENING = '1.000,00'
const MONTHLY_CLOSING = '3.464,72'

function buildMonthly() {
  const g1 = geometry(0)
  const g2 = geometry(10)

  const p1: PositionedItem[] = [
    ...letterhead(),
    text(48, 542, 'RELEVE ET INFORMATIONS BANCAIRES', 285),
    text(481, 542, 'Caisse 99999', 538),
    text(48, 528, '04 mars 2030', 109),
    text(82, 505, `C/C EUROCOMPTE SERENITE N° ${FAKE_CURRENT} en euros (GD)`, 373),
    text(50, 498, '€', 56),
    text(82, 493, `TITULAIRE(S) : M ${FAKE_HOLDER}`, 252),
    ...g1.header(477),
    text(158, 458, 'SOLDE CREDITEUR AU 04/02/2030', 291),
    amount(g1.creditRight, 458, MONTHLY_OPENING),
    ...opRows(g1, 441, MONTHLY_PAGE_1, (i, y) => (i === 4 ? marginCode(y) : [])).items,
    ...footer(105, 1, true),
  ]

  const p2: PositionedItem[] = []
  p2.push(
    text(58, 770, 'RELEVE ET INFORMATIONS BANCAIRES', 295),
    text(491, 770, 'Caisse 99999', 547),
    text(91, 733, `C/C EUROCOMPTE SERENITE N° ${FAKE_CURRENT} en euros (GD)`, 383),
    text(60, 726, '€', 66),
    text(91, 721, `TITULAIRE(S) : M ${FAKE_HOLDER}`, 262),
    ...g2.header(705),
  )
  const ops2 = opRows(g2, 689, MONTHLY_PAGE_2)
  p2.push(...ops2.items)
  let y = ops2.nextY - 3
  p2.push(
    text(62, y, 'Réf : 002', 95),
    text(168, y, 'SOLDE CREDITEUR AU 04/03/2030', 300),
    amount(g2.creditRight, y, MONTHLY_CLOSING),
  )
  y -= 17
  p2.push(text(380, y, `IBAN : ${FAKE_IBAN_CURRENT}`, 542))
  y -= 28
  p2.push(
    text(58, y, 'RELEVE DE VOTRE CARTE Exemple N° ------0000--- Au 21/02/2030', 400),
    text(58, y - 12, `TITULAIRE : M ${FAKE_HOLDER}`, 260),
    text(67, y - 31, 'Date', 85),
    text(115, y - 31, 'Commerce', 157),
    text(274, y - 31, 'Ville', 290),
    text(414, y - 31, 'Montant euros', 469),
    text(481, y - 31, 'Montant devises', 544),
    text(61, y - 47, '31/01/2030', 101),
    text(109, y - 47, 'COMMERCE EXEMPLE', 190),
    text(268, y - 47, 'EXEMPLEVILLE', 330),
    amount(469, y - 47, '60,00'),
    text(61, y - 58, '02/02/2030', 101),
    text(109, y - 58, 'AUTRE COMMERCE EXEMPLE', 210),
    text(268, y - 58, 'EXEMPLEVILLE', 330),
    amount(469, y - 58, '40,00'),
    text(62, y - 72, `TOTAL PRELEVE SUR VOTRE COMPTE 99999 99999 ${FAKE_CURRENT} AU 28/02/2030 : 100,00 euros`, 426),
    text(91, y - 100, `LIVRET BLEU N° ${FAKE_LIVRET} en euros (GE)`, 303),
    text(60, y - 107, '€', 66),
    text(91, y - 112, `TITULAIRE(S) : M ${FAKE_HOLDER}`, 262),
    ...g2.header(y - 128),
    text(162, y - 147, 'SOLDE CREDITEUR AU 04/01/2030', 294),
    amount(g2.creditRight, y - 147, '500,00'),
    text(62, y - 164, '26/02/2030', 102),
    text(110, y - 164, '01/03/2030', 150),
    text(157, y - 164, `VIR DE M ${FAKE_HOLDER}`, 262),
    amount(g2.creditRight, y - 164, '100,00'),
    text(62, y - 178, 'Réf : 098', 95),
    text(172, y - 178, 'SOLDE TOTAL AU 04/03/2030', 284),
    amount(g2.creditRight, y - 178, '600,00'),
    text(380, y - 214, `IBAN : ${FAKE_IBAN_LIVRET}`, 542),
    ...footer(80, 2, false),
  )

  const g3 = geometry(0)
  const p3: PositionedItem[] = [
    text(249, 773, 'CCM EXEMPLEVILLE', 347),
    text(308, 753, 'agence@creditmutuel.fr BIC : CMCIFR2A', 473),
    text(48, 722, 'RELEVE ET INFORMATIONS BANCAIRES', 285),
    text(48, 708, '04 mars 2030', 109),
    text(82, 685, `PLAN D'EPARGNE LOGEMENT EXEMPLE N° ${FAKE_PEL} en euros (GD)`, 429),
    text(82, 673, `TITULAIRE(S) : M ${FAKE_HOLDER}`, 252),
    ...g3.header(657),
    text(197, 638, 'SOLDE CREDITEUR AU 04/02/2030', 329),
    amount(g3.creditRight, 638, '2.000,00'),
    text(60, 618, 'Réf : 021', 95),
    text(197, 618, 'SOLDE CREDITEUR AU 04/03/2030', 329),
    amount(g3.creditRight, 618, '2.000,00'),
    text(72, 589, 'TOTAL INTERETS AU 28/02/2030', 196),
    text(77, 535, 'SITUATION DE VOS AUTRES COMPTES en euros au 04 mars 2030', 392),
    text(67, 513, 'Numéro', 97),
    text(168, 513, 'Libellé du compte', 236),
    text(512, 513, 'Solde', 534),
    text(60, 497, FAKE_LIVRET, 109),
    text(125, 497, 'LIVRET BLEU (GE)', 379),
    amount(g3.creditRight, 497, '+600,00'),
    text(77, 462, 'SITUATION DE VOS CREDITS en euros au 04 mars 2030', 342),
    text(60, 423, FAKE_CREDIT, 109),
    text(125, 423, 'PLAN EXEMPLE', 152),
    amount(g3.creditRight, 423, '+0,00'),
    text(48, 375, 'AUTORISATIONS DE DECOUVERTS', 220),
    text(60, 342, FAKE_CURRENT, 108),
    text(125, 342, 'DECOUVERT AUTORISE EXEMPLE', 348),
    amount(g3.creditRight, 342, '800,00'),
    text(48, 315, 'TOTAL MENSUEL DES FRAIS DEBITES SUR PRODUITS ET SERVICES BANCAIRES', 445),
    text(60, 282, FAKE_CURRENT, 108),
    amount(g3.creditRight, 282, '20,00'),
    ...footer(105, 3, false),
  ]

  const pages = [p1, p2, p3]
  const all = [...MONTHLY_PAGE_1, ...MONTHLY_PAGE_2]
  const sum = all.reduce((acc, op) => acc + signed(op), 0)
  const opening = parseFrAmount(MONTHLY_OPENING) as number
  const closing = parseFrAmount(MONTHLY_CLOSING) as number
  if (opening + sum !== closing) throw new Error('fixture mensuelle : soldes incohérents avec les lignes')
  return {
    pages,
    expected: {
      periodStart: '2030-02-05',
      periodEnd: '2030-03-04',
      openingCents: opening,
      closingCents: closing,
      ignoredSections: ['LIVRET BLEU', 'PLAN D\'EPARGNE LOGEMENT EXEMPLE'],
      operationLineCount: 15,
      plantedIdentifiers: [FAKE_CURRENT, FAKE_LIVRET, FAKE_CREDIT, FAKE_PEL, FAKE_IBAN_CURRENT, FAKE_IBAN_LIVRET, FAKE_IBAN_CURRENT.replace(/ /g, ''), FAKE_HOLDER, '------0000---'],
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Fixture B — extrait à la demande, section courante sur UNE page, code de marge au milieu.
// ---------------------------------------------------------------------------------------------

const EXTRACT_OPS: Op[] = [
  { date: '02/10/2030', value: '02/10/2030', label: 'PRLV SEPA FOURNISSEUR GAZ EXEMPLE', side: 'debit', amount: '80,00', continuation: ['NUMERO DE CLIENT 0000001'] },
  { date: '03/10/2030', value: '03/10/2030', label: 'ASSURANCE EXEMPLE SC0000002', side: 'debit', amount: '60,50' },
  { date: '05/10/2030', value: '05/10/2030', label: 'VIR SEPA CAISSE RETRAITE EXEMPLE', side: 'credit', amount: '1.200,00' },
  { date: '07/10/2030', value: '03/10/2030', label: 'FRAIS TENUE DE COMPTE EXEMPLE', side: 'debit', amount: '18,40' },
  { date: '09/10/2030', value: '09/10/2030', label: 'CHEQUE 0000125', side: 'debit', amount: '75,00' },
  { date: '12/10/2030', value: '12/10/2030', label: 'PRLV SEPA IMPOTS EXEMPLE', side: 'debit', amount: '100,00', continuation: ['ICS : FR00ZZZ000000', 'RUM : NNFR00ZZZ000000M000000000002'] },
]
const EXTRACT_OPENING = '5.000,00'
const EXTRACT_CLOSING = '5.866,10'

function buildExtract() {
  const g = geometry(0)
  const ops = opRows(g, 436, EXTRACT_OPS, (i, y) => (i === 3 ? marginCode(y + 4) : []))
  const closeY = ops.nextY - 3
  const p1: PositionedItem[] = [
    ...letterhead(),
    text(48, 542, 'RELEVE ET INFORMATIONS BANCAIRES', 285),
    text(481, 542, 'Caisse 99999', 538),
    text(48, 528, '16 octobre 2030', 120),
    text(48, 504, `C/C EUROCOMPTE SERENITE N° ${FAKE_CURRENT} en euros (GD)`, 339),
    text(48, 492, `TITULAIRE(S) : M ${FAKE_HOLDER}`, 219),
    ...g.header(472),
    text(158, 453, 'SOLDE CREDITEUR AU 01/10/2030', 291),
    amount(g.creditRight, 453, EXTRACT_OPENING),
    ...ops.items,
    text(53, closeY, 'Réf : 019', 85),
    text(158, closeY, 'SOLDE CREDITEUR AU 16/10/2030', 291),
    amount(g.creditRight, closeY, EXTRACT_CLOSING),
    text(48, closeY - 17, `QXBAN : ${FAKE_QXBAN}`, 287),
    text(371, closeY - 17, `IBAN : ${FAKE_IBAN_CURRENT}`, 533),
    ...footer(105, 1, true),
  ]
  const p2: PositionedItem[] = [
    text(58, 770, 'RELEVE ET INFORMATIONS BANCAIRES', 295),
    text(491, 770, 'Caisse 99999', 547),
    text(58, 742, 'Vous disposez d\'une carte de paiement : paiements de moins de 10 EUR regroupés.', 547),
    text(58, 683, 'SITUATION DE VOS AUTRES COMPTES en euros au 16 octobre 2030', 385),
    text(77, 666, 'Numéro', 107),
    text(178, 666, 'Libellé du compte', 246),
    text(522, 666, 'Solde', 544),
    text(70, 650, FAKE_LIVRET, 119),
    text(134, 650, 'LIVRET BLEU (GE)', 205),
    text(503, 650, '+1.000,00', 544),
    text(70, 639, '99900000006', 119),
    text(134, 639, 'LIVRET EXEMPLE (GE)', 220),
    text(503, 639, '+2.000,00', 544),
    ...footer(81, 2, false),
  ]
  const opening = parseFrAmount(EXTRACT_OPENING) as number
  const closing = parseFrAmount(EXTRACT_CLOSING) as number
  if (opening + EXTRACT_OPS.reduce((acc, op) => acc + signed(op), 0) !== closing) {
    throw new Error('fixture extrait : soldes incohérents avec les lignes')
  }
  return {
    pages: [p1, p2],
    expected: {
      periodStart: '2030-10-02',
      periodEnd: '2030-10-16',
      openingCents: opening,
      closingCents: closing,
      ignoredSections: [] as string[],
      operationLineCount: 9,
      plantedIdentifiers: [FAKE_CURRENT, FAKE_LIVRET, '99900000006', FAKE_IBAN_CURRENT, FAKE_QXBAN, FAKE_HOLDER],
    },
  }
}

function write(name: string, built: { pages: PositionedItem[][], expected: object }) {
  const dir = resolve(__dirname, '../../../tests/fixtures/statements')
  mkdirSync(dir, { recursive: true })
  const payload = {
    bank: 'credit_mutuel',
    source: 'synthétique — aucune donnée réelle (story 28.2, dépôt public)',
    flatText: flatten(built.pages),
    pages: built.pages,
    expected: built.expected,
  }
  writeFileSync(resolve(dir, name), `${JSON.stringify(payload, null, 2)}\n`)
}

describe.skipIf(!GENERATE_FIXTURE)('génération des fixtures Crédit Mutuel (GENERATE_FIXTURE=1)', () => {
  it('écrit credit-mutuel-mensuel.json et credit-mutuel-extrait.json', () => {
    write('credit-mutuel-mensuel.json', buildMonthly())
    write('credit-mutuel-extrait.json', buildExtract())
  })
})
