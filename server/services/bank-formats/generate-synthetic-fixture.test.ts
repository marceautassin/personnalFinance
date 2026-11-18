/**
 * generate-synthetic-fixture — (re)génère `tests/fixtures/statements/boursorama-2026-03.json`
 * (D43, story 28.1, décision Marceau du 2026-09-22, contre-revue du 2026-09-23).
 *
 * **La fixture ne contient AUCUNE donnée réelle, même anonymisée.** La géométrie (nombre de
 * pages, positions x/right/y, en-tête de colonnes Débit/Crédit, bloc d'identité au-dessus de
 * l'en-tête, récapitulatif de soldes) est authentique — c'est ce que le test doit éprouver.
 * Le CONTENU (libellés, montants, dates, tiers, IBAN, nom, adresse) est entièrement INVENTÉ
 * ci-dessous. Les soldes d'ouverture/clôture sont calculés à partir des lignes inventées : la
 * réconciliation tombe juste par construction.
 *
 * **Trois pages, pas deux (contre-revue du 2026-09-23).** Sur les 20 relevés réels examinés,
 * CHAQUE page porte son propre en-tête Débit/Crédit (mêmes y, mêmes colonnes) ET son propre
 * bloc d'identité au-dessus — la première version de cette fixture n'avait ni l'un ni l'autre
 * sur sa page 2, et ne prouvait donc la coupe d'identité que sur une seule page, alors que
 * c'est exactement la régression corrigée le 2026-09-06 (« blocs des pages 2 à N », story
 * 17.1). Page 1 et page 2 réimpriment donc le même bloc d'identité et le même en-tête, aux
 * mêmes positions relatives. Page 3 reste une page de continuation SANS en-tête ni identité —
 * cas de repli existant (`operationsText`, report du séparateur) qu'on veut garder couvert,
 * même s'il n'a pas été observé sur les 20 relevés réels.
 *
 * Aucun `unpdf`, aucun PDF, aucune table réel → faux : ce fichier ne lit rien d'externe, il
 * n'y a donc rien à garder hors dépôt. Gardé par `GENERATE_FIXTURE` pour ne jamais réécrire la
 * fixture committée par accident (`yarn test:run` normal ne la touche pas).
 *
 *   GENERATE_FIXTURE=1 yarn test:run generate-synthetic-fixture
 */
import { describe, it } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PositionedItem } from './types'

const GENERATE_FIXTURE = process.env.GENERATE_FIXTURE

/** Marqueurs de colonne, identiques à `bank-formats/columns.ts` (pas d'import croisé test→prod ici). */
const DEBIT_X = { x: 442, right: 465 }
const CREDIT_X = { x: 506, right: 533 }
const HEADER_Y = 538

interface SyntheticOp {
  date: string // JJ/MM/AAAA
  label: string
  amountEuros: number // toujours positif, `side` porte le signe
  side: 'debit' | 'credit'
}

/** Bloc d'identité FICTIF, identique sur les pages 1 et 2 (comme sur un relevé réel). */
const IDENTITY_LINES = [
  'RELEVE DE COMPTE',
  'M JEAN DUPONT',
  '12 RUE DES LILAS',
  '75000 PARIS',
  'IBAN : FR76 1234 5678 9012 3456 7890 123',
  // Marqueur d'émetteur (BIC) : donnée PUBLIQUE de la banque, pas de l'utilisateur — requise
  // pour que `recognizes()` reconnaisse un relevé Boursorama (D41).
  'BIC : BOUSFRPPXXX',
  'Boursorama SA - www.boursobank.com',
]

/** Toutes fictives : aucun marchand, tiers, ville ou référence de relevé réel. */
const PAGE1_OPS: SyntheticOp[] = [
  { date: '02/03/2026', label: 'VIRT SALAIRE SOCIETE FICTIVE', amountEuros: 2500.00, side: 'credit' },
  { date: '03/03/2026', label: 'PRLV ABONNEMENT INTERNET FICTIF', amountEuros: 39.99, side: 'debit' },
  { date: '05/03/2026', label: 'CARTE ACHAT SUPERMARCHE FICTIF', amountEuros: 87.50, side: 'debit' },
  { date: '07/03/2026', label: 'CARTE RESTAURANT LE FICTIF', amountEuros: 42.00, side: 'debit' },
]

const PAGE2_OPS: SyntheticOp[] = [
  { date: '10/03/2026', label: 'VIR RECU AMI FICTIF', amountEuros: 50.00, side: 'credit' },
  { date: '15/03/2026', label: 'PRLV ASSURANCE HABITATION FICTIVE', amountEuros: 65.00, side: 'debit' },
  { date: '18/03/2026', label: 'CARTE ESSENCE STATION FICTIVE', amountEuros: 60.00, side: 'debit' },
  { date: '22/03/2026', label: 'VIR EPARGNE VERS LIVRET FICTIF', amountEuros: 200.00, side: 'debit' },
]

/** Page 3 : continuation SANS en-tête ni bloc d'identité (cas de repli, cf. docblock). */
const PAGE3_OPS: SyntheticOp[] = [
  { date: '25/03/2026', label: 'CARTE LOISIRS CINEMA FICTIF', amountEuros: 15.00, side: 'debit' },
  { date: '29/03/2026', label: 'REMBOURSEMENT ASSURANCE FICTIVE', amountEuros: 30.00, side: 'credit' },
]

const OPENING_EUROS = 1000.00
const ALL_OPS = [...PAGE1_OPS, ...PAGE2_OPS, ...PAGE3_OPS]
const NET_EUROS = ALL_OPS.reduce((sum, op) => sum + (op.side === 'credit' ? op.amountEuros : -op.amountEuros), 0)
const CLOSING_EUROS = Math.round((OPENING_EUROS + NET_EUROS) * 100) / 100

function euros(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Item positionné, largeur approximée (n'a pas besoin d'être exacte : seule la position relative compte). */
function item(text: string, x: number, y: number): PositionedItem {
  return { text, x, right: x + text.length * 5.2, y }
}

/** Une ligne d'opération : date + libellé + montant aligné dans la bonne colonne. */
function opRow(op: SyntheticOp, y: number): PositionedItem[] {
  const col = op.side === 'debit' ? DEBIT_X : CREDIT_X
  const amountText = euros(op.amountEuros)
  const amountWidth = amountText.length * 5.2
  return [
    item(op.date, 46, y),
    item(op.label, 100, y),
    { text: amountText, x: col.right - amountWidth, right: col.right, y },
  ]
}

/** Bloc d'identité + en-tête de colonnes, aux MÊMES positions relatives sur chaque page qui les porte. */
function identityAndHeader(): PositionedItem[] {
  return [
    ...IDENTITY_LINES.map((line, i) => item(line, 50, 700 - i * 20)),
    item('Date', 46, HEADER_Y),
    item('opération', 94, HEADER_Y),
    item('Libellé', 200, HEADER_Y),
    item('Valeur', 300, HEADER_Y),
    { text: 'Débit', x: DEBIT_X.x, right: DEBIT_X.right, y: HEADER_Y },
    { text: 'Crédit', x: CREDIT_X.x, right: CREDIT_X.right, y: HEADER_Y },
  ]
}

function buildPages(): PositionedItem[][] {
  const page1: PositionedItem[] = [
    ...identityAndHeader(),
    // Solde d'ouverture (première ligne sous l'en-tête, comme sur un relevé réel).
    item(`SOLDE AU : 27/02/2026 ${euros(OPENING_EUROS)}`, 46, HEADER_Y - 18),
    ...PAGE1_OPS.flatMap((op, i) => opRow(op, HEADER_Y - 38 - i * 20)),
  ]

  // Page 2 : MÊME bloc d'identité, MÊME en-tête, aux mêmes positions — comme sur les 20
  // relevés réels examinés. C'est ce qui prouve que la coupe géométrique agit page par page,
  // et pas seulement sur la première.
  const page2: PositionedItem[] = [
    ...identityAndHeader(),
    ...PAGE2_OPS.flatMap((op, i) => opRow(op, HEADER_Y - 20 - i * 20)),
  ]

  // Page 3 : continuation SANS en-tête ni identité (cas de repli couvert par choix, cf. docblock).
  const page3: PositionedItem[] = [
    ...PAGE3_OPS.flatMap((op, i) => opRow(op, 750 - i * 20)),
    item(
      `Nouveau solde en EUR : Montant frais bancaires* : 0,00 ${euros(CLOSING_EUROS)} 0,00`,
      46,
      750 - PAGE3_OPS.length * 20 - 20,
    ),
  ]

  return [page1, page2, page3]
}

/** Reconstruit le texte plat tel qu'`unpdf` le rendrait (mergePages: true) — mêmes ancres. */
function buildFlatText(): string {
  const lines = [
    'Boursorama SA - www.boursobank.com',
    'Période du 28/02/2026 au 31/03/2026',
    ...IDENTITY_LINES,
    'Date opération Libellé Valeur Débit Crédit',
    `SOLDE AU : 27/02/2026 ${euros(OPENING_EUROS)}`,
    ...PAGE1_OPS.map(op => `${op.date} ${op.label} ${euros(op.amountEuros)}`),
    ...IDENTITY_LINES,
    'Date opération Libellé Valeur Débit Crédit',
    ...PAGE2_OPS.map(op => `${op.date} ${op.label} ${euros(op.amountEuros)}`),
    ...PAGE3_OPS.map(op => `${op.date} ${op.label} ${euros(op.amountEuros)}`),
    `Nouveau solde en EUR : Montant frais bancaires* : 0,00 ${euros(CLOSING_EUROS)} 0,00`,
  ]
  return lines.join('\n')
}

describe.skipIf(!GENERATE_FIXTURE)('génération de la fixture Boursorama synthétique (D43)', () => {
  it('écrit tests/fixtures/statements/boursorama-2026-03.json', () => {
    const fixture = {
      bank: 'boursorama' as const,
      source: 'synthétique — aucune donnée réelle (décision Marceau, 2026-09-22)',
      flatText: buildFlatText(),
      pages: buildPages(),
      expected: {
        periodStart: '2026-02-28',
        periodEnd: '2026-03-31',
        openingCents: Math.round(OPENING_EUROS * 100),
        closingCents: Math.round(CLOSING_EUROS * 100),
      },
    }

    const outDir = resolve('tests/fixtures/statements')
    mkdirSync(outDir, { recursive: true })
    writeFileSync(resolve(outDir, 'boursorama-2026-03.json'), `${JSON.stringify(fixture, null, 2)}\n`)
  })
})
