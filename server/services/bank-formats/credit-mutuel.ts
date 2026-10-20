/**
 * bank-formats/credit-mutuel — format Crédit Mutuel, relevé PDF du COMPTE COURANT (D41, D42,
 * story 28.2).
 *
 * Règle d'AR41 (levée le 2026-10-20) : on code ce qu'on a VU, on refuse explicitement le reste
 * (`StatementFormatError` → `400 statement_format_unrecognized`, avant l'appel au fournisseur).
 * Corpus vu : relevés mensuels (3 pages, livrets, PEL, bloc détail carte) et extrait à la demande
 * (une page, code de marge au milieu des opérations). Jamais vu, donc refusé : solde débiteur,
 * plusieurs comptes courants, page de continuation sans titre ni en-tête, ligne de solde
 * intermédiaire.
 *
 * Le relevé porte plusieurs SECTIONS de compte (courant, livrets, PEL). Seule celle du compte
 * courant est lue. Le texte transmis au modèle est construit LIGNE PAR LIGNE depuis cette
 * section — jamais par coupe géométrique d'une page, qui laisserait passer les lignes `IBAN :`,
 * les titres numérotés et les tableaux de situation (D42).
 */
import type { Cents } from '~~/shared/types/money'
import { AMOUNT_RE, ROW_TOLERANCE, renderRows } from './columns'
import { frDateToIso, parseFrAmount } from './fr-parsing'
import { maskAccountNumbers } from './identity'
import { StatementFormatError, type BankFormat, type PositionedItem } from './types'

/**
 * Critère de reconnaissance : BIC ou domaine de l'émetteur, jamais le nom de banque en clair
 * (une ligne d'opération Boursorama peut citer « CREDIT MUTUEL » dans un libellé de
 * virement — reconnaître sur ce texte produirait un faux positif).
 *
 * `CMCIFR` (sans ancrage sur les caractères suivants) accepte VOLONTAIREMENT le CIC
 * (`CMCIFRPP…`), filiale du groupe Crédit Mutuel qui partage ce préfixe de BIC : un relevé CIC
 * suit le même format d'extraction que Crédit Mutuel, les classer ensemble n'est pas un défaut
 * — c'est la décision retenue par D41 (architecture.md), validée sur le relevé d'exemple
 * disponible lors du cadrage. À revoir seulement si un gabarit CIC réel s'avère différent.
 */
export function recognizes(flatText: string): boolean {
  return /\bCMCIFR/u.test(flatText) || /creditmutuel\.fr/iu.test(flatText)
}

/** Code vertical imprimé dans la marge gauche (`HT.…`, `X`, `0`, `2`) : jamais une opération. */
const MARGIN_X = 40

const FOOTER_RE = /<<Suite au verso>>|^Information sur la protection des comptes|^Page \d+$/u
const SECTION_TITLE_RE = /^(.+?)\s+N°\s*(\d{6,})\s+en euros\b/u
const NON_ACCOUNT_BLOCK_RE = /^(?:RELEVE DE VOTRE CARTE|SITUATION DE VOS AUTRES COMPTES|SITUATION DE VOS CREDITS|AUTORISATIONS DE DECOUVERTS|TOTAL MENSUEL DES FRAIS|TOTAL INTERETS)/u
const BALANCE_RE = /SOLDE\s+(.+?)\s+AU\s+(\d{2})\/(\d{2})\/(\d{4})/u
const SECTION_END_RE = /Réf\s*:/u
const CURRENT_ACCOUNT_RE = /C\/C|COMPTE COURANT|COMPTE CHEQUES/iu

interface OperationRow {
  items: PositionedItem[]
  /** Séparateur Débit/Crédit de l'en-tête vu au-dessus, recalculé par page (les colonnes se décalent). */
  separator: number
}

interface BalanceLine {
  /** Le mot entre `SOLDE` et `AU` (`CREDITEUR`, `DEBITEUR`, `TOTAL`…). */
  kind: string
  isoDate: string | null
  amountCents: Cents | null
}

interface Section {
  number: string
  label: string
  operations: OperationRow[]
  balances: BalanceLine[]
  /** Clôturée par sa ligne `Réf : … SOLDE … AU`. */
  closed: boolean
}

interface Analysis {
  sections: Section[]
  /** Identifiants lus dans le document ENTIER, à masquer partout (couche 2, AR39). */
  knownNumbers: string[]
}

const refuse = (reason: string, data: Record<string, string | number> = {}): never => {
  throw new StatementFormatError(reason, data)
}

const center = (i: PositionedItem) => (i.x + i.right) / 2

/** Regroupe les fragments en lignes (y décroissant), chaque ligne triée par abscisse. */
function toRows(items: PositionedItem[]): PositionedItem[][] {
  const rows: PositionedItem[][] = []
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const current = rows.at(-1)
    if (current && Math.abs(current[0]!.y - item.y) <= ROW_TOLERANCE) current.push(item)
    else rows.push([item])
  }
  return rows.map(r => r.sort((a, b) => a.x - b.x))
}

const rowText = (row: PositionedItem[]) => row.map(i => i.text).join(' ')

/** En-tête `Débit EUROS` / `Crédit EUROS` : un fragment chacun (pas `Débit` seul, cf. Boursorama). */
function columnsSeparator(row: PositionedItem[]): number | null {
  const debit = row.find(i => /^d[ée]bit\s+euros$/iu.test(i.text))
  const credit = row.find(i => /^cr[ée]dit\s+euros$/iu.test(i.text))
  if (!debit || !credit || center(debit) >= center(credit)) return null
  return (center(debit) + center(credit)) / 2
}

/** Collecte les identifiants du document ENTIER (couche 2) : titres, tableaux, IBAN/QXBAN, total carte. */
function collectKnownNumbers(allRows: PositionedItem[][]): string[] {
  const known = new Set<string>()
  const add = (value: string) => {
    const trimmed = value.trim()
    if (trimmed.length === 0) return
    known.add(trimmed)
    known.add(trimmed.replace(/\s+/gu, ''))
  }
  for (const row of allRows) {
    const text = rowText(row)
    const title = SECTION_TITLE_RE.exec(text)
    if (title) add(title[2]!)
    const total = /TOTAL PRELEVE SUR VOTRE COMPTE\s+(\d+)\s+(\d+)\s+(\d+)/u.exec(text)
    if (total) {
      add(`${total[1]} ${total[2]} ${total[3]}`)
      add(total[3]!)
    }
    for (const item of row) {
      const bankId = /^(?:IB|QXB)AN\s*:\s*(.+)$/u.exec(item.text)
      if (bankId) add(bankId[1]!)
      // Colonne « Numéro » / « N° de compte » des tableaux de situation : un fragment de chiffres seuls.
      if (/^\d{9,}$/u.test(item.text)) add(item.text)
    }
  }
  return [...known]
}

/** Découpe le document en sections de compte (règles « Découpage en sections », story 28.2). */
function analyze(pages: PositionedItem[][]): Analysis {
  const sections: Section[] = []
  const allRows: PositionedItem[][] = []
  let open: Section | null = null

  for (const page of pages) {
    const rows = toRows(page.filter(i => i.x >= MARGIN_X))
    allRows.push(...rows)

    // Tout ce qui est à partir du premier pied de page n'appartient plus à la zone des opérations.
    const footerAt = rows.findIndex(r => FOOTER_RE.test(rowText(r)))
    const body = footerAt === -1 ? rows : rows.slice(0, footerAt)

    const openedAtPageStart = open
    let separator: number | null = null
    let headerSeen = false

    for (const row of body) {
      const text = rowText(row)

      const title = SECTION_TITLE_RE.exec(text)
      if (title) {
        const number = title[2]!
        // Réimpression du titre en tête de page : la section ouverte continue (AC 3).
        if (open && open.number === number && !open.closed) {
          separator = null
          headerSeen = false
          continue
        }
        open = { number, label: title[1]!.trim(), operations: [], balances: [], closed: false }
        sections.push(open)
        separator = null
        headerSeen = false
        continue
      }

      if (NON_ACCOUNT_BLOCK_RE.test(text)) {
        // Section encore ouverte devant un bloc hors compte : jamais vu, elle reste non clôturée
        // (refusée à la sélection si c'est le compte courant) et n'avale pas ce bloc.
        open = null
        continue
      }

      const header = columnsSeparator(row)
      if (header !== null) {
        separator = header
        headerSeen = true
        continue
      }

      // Au-dessus du premier en-tête de la page (identité, date d'édition) : pas une opération.
      if (!open || open.closed || !headerSeen || separator === null) continue

      const balance = BALANCE_RE.exec(text)
      if (balance) {
        const amountItem = [...row].reverse().find(i => AMOUNT_RE.test(i.text))
        open.balances.push({
          kind: balance[1]!,
          isoDate: frDateToIso(balance[2]!, balance[3]!, balance[4]!),
          amountCents: amountItem ? parseFrAmount(amountItem.text) : null,
        })
        if (SECTION_END_RE.test(text)) open.closed = true
        continue
      }

      if (/^TITULAIRE\(S\)\s*:/u.test(text) || text === '€') continue

      open.operations.push({ items: row, separator })
    }

    // Une section du compte courant ouverte en début de page doit y retrouver titre ET en-tête :
    // sinon ses opérations de la page seraient perdues sans bruit (page sans titre : jamais vue).
    if (openedAtPageStart && !openedAtPageStart.closed && CURRENT_ACCOUNT_RE.test(openedAtPageStart.label) && !headerSeen && body.length > 0) {
      refuse('continuation_page_without_header')
    }
  }

  return { sections, knownNumbers: collectKnownNumbers(allRows) }
}

/** La section du compte courant, ou refus (AC 4, 5). */
function selectCurrentAccount(analysis: Analysis): Section {
  const current = analysis.sections.filter(s => CURRENT_ACCOUNT_RE.test(s.label))
  if (current.length === 0) refuse('no_current_account')
  const numbers = new Set(current.map(s => s.number))
  if (numbers.size > 1) refuse('multiple_current_accounts', { count: numbers.size })
  // Même numéro réimprimé APRÈS sa clôture : structure jamais vue.
  if (current.length > 1) refuse('current_account_section_repeated')
  const section = current[0]!
  if (!section.closed) refuse('current_account_section_not_closed')
  return section
}

function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10)
}

function requirePages(pages: PositionedItem[][] | null | undefined): PositionedItem[][] {
  // Crédit Mutuel n'a PAS de repli sur le texte plat : sans colonnes ni sections, rien ne garantit
  // ni le signe des montants ni l'absence des lignes d'identité.
  if (!pages) return refuse('positional_reading_unavailable')
  return pages
}

export function operationsText(input: { pages: PositionedItem[][] | null, flatText: string }): string {
  const analysis = analyze(requirePages(input.pages))
  const section = selectCurrentAccount(analysis)
  const text = section.operations
    .map(row => renderRows(row.items, row.separator))
    .join('\n')
  // Couches 2 et 3 d'AR39 : numéros connus du document entier, puis motif ≥ 10 chiffres + IBAN.
  // `redactIdentity` (IBAN, BIC) passe ensuite dans `extractStatement`, pour toutes les banques.
  return maskAccountNumbers(text, analysis.knownNumbers)
}

export function balancesAndPeriod(_flatText: string, pages?: PositionedItem[][] | null): ReturnType<BankFormat['balancesAndPeriod']> {
  const analysis = analyze(requirePages(pages))
  const section = selectCurrentAccount(analysis)

  // Seul `SOLDE CREDITEUR AU` a été observé : tout autre libellé de solde est refusé, jamais lu.
  for (const balance of section.balances) {
    if (balance.kind !== 'CREDITEUR') {
      // `kind` vient du document : on ne le renvoie que s'il n'est qu'un mot, jamais un fragment de libellé.
      refuse('unsupported_balance_line', /^[A-Z]{1,20}$/u.test(balance.kind) ? { label: `SOLDE ${balance.kind} AU` } : {})
    }
  }
  // Ouverture et clôture, exactement : une ligne de solde intermédiaire n'a jamais été vue.
  if (section.balances.length !== 2) refuse('unexpected_balance_line_count', { count: section.balances.length })
  const [opening, closing] = section.balances as [BalanceLine, BalanceLine]
  if (opening.isoDate === null || closing.isoDate === null || opening.amountCents === null || closing.amountCents === null) {
    refuse('balance_unreadable')
  }

  const ignored: string[] = []
  for (const s of analysis.sections) {
    if (s.number !== section.number && !ignored.includes(s.label)) ignored.push(s.label)
  }

  return {
    // Le relevé s'ouvre le LENDEMAIN de la date du solde d'ouverture (celle où le précédent
    // s'est clos) : sans ce décalage, FR6 se déclenche à chaque relevé consécutif.
    periodStart: nextDay(opening.isoDate!),
    periodEnd: closing.isoDate!,
    openingCents: opening.amountCents,
    closingCents: closing.amountCents,
    ignoredSections: ignored,
  }
}

export const creditMutuelFormat: BankFormat = {
  bank: 'credit_mutuel',
  recognizes,
  operationsText,
  balancesAndPeriod,
}
