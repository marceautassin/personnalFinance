/**
 * bank-formats/boursorama — format Boursorama / Boursobank (D41).
 *
 * `operationsText` et `balancesAndPeriod` sont le corps de l'ancien `extractStatement`
 * monolithique (`pdf-extractor.ts`), déplacé SANS CHANGEMENT DE COMPORTEMENT (Tâche 3, AC 6).
 * Aucune regex n'a été retouchée dans ce déplacement.
 */
import type { Cents } from '~~/shared/types/money'
import type { BankFormat, PositionedItem } from './types'
import { FR_AMOUNT_TOKEN, amountsAfter, frDateToIso } from './fr-parsing'
import { findDebitCreditHeader, operationRows, renderRows } from './columns'

/**
 * Critère de reconnaissance : BIC ou domaine de l'émetteur, jamais le nom de banque en clair
 * (une ligne d'opération peut citer « CREDIT MUTUEL » dans un libellé de virement).
 */
export function recognizes(flatText: string): boolean {
  return /BOUSFRPP/u.test(flatText) || /www\.boursobank\.com|www\.boursorama\.(com|fr)/iu.test(flatText)
}

/**
 * Ne garde que les tableaux d'opérations d'un texte plat (NFR6, story 17.1).
 *
 * Repli du repli : quand la géométrie des colonnes n'est pas reconnue, on ne peut pas couper
 * par ordonnée, mais l'intitulé du tableau reste un point d'ancrage textuel fiable.
 *
 * **Chaque** occurrence de l'ancre est traitée, pas seulement la première (revue du
 * 2026-09-06) : un relevé multipage aplati réimprime son bloc d'identité en tête de chaque
 * page, et ne couper qu'en tête de document laissait passer les blocs des pages 2 à N.
 *
 * Chaque tranche est en outre TRONQUÉE APRÈS SON DERNIER MONTANT. Sans cela, la tranche
 * courant jusqu'à l'ancre suivante réavalait précisément le bloc d'identité qu'on cherche à
 * écarter — il se trouve entre la fin d'un tableau et l'en-tête de la page suivante. Le
 * dernier montant est une borne déterministe : au-delà, il n'y a plus d'opérations.
 *
 * Sans ancre, le texte est rendu inchangé — l'expurgation par motif reste la seule garde.
 */
export function cutBeforeOperations(flatText: string): string {
  const anchor = /Date\s+op[ée]ration[^\n]{0,40}?Cr[ée]dit|D[ée]bit\s+Cr[ée]dit/gu
  const starts = [...flatText.matchAll(anchor)].map(m => m.index)
  if (starts.length === 0) return flatText

  return starts
    .map((start, i) => {
      const slice = flatText.slice(start, starts[i + 1] ?? flatText.length)
      const amounts = [...slice.matchAll(FR_AMOUNT_TOKEN)]
      const last = amounts.at(-1)
      return last ? slice.slice(0, last.index + last[0].length) : slice
    })
    .join('\n')
}

/**
 * Reconstruit le texte du relevé en RESPECTANT LES COLONNES, et marque chaque montant
 * `[DÉBIT]` ou `[CRÉDIT]` selon la colonne où il se trouve. Retombe sur `cutBeforeOperations`
 * appliqué au texte plat si la lecture positionnelle n'est pas disponible (`pages === null`)
 * ou si aucune page ne présente d'en-tête Débit/Crédit reconnaissable.
 *
 * **Pourquoi (constaté le 2026-09-05).** L'extraction à plat perd les colonnes : une ligne
 * arrivait au modèle sous la forme `VIR INST SOCIETEX 02/03/2026 500,00`, sans rien qui dise si
 * ce montant est au débit ou au crédit. Le modèle devinait — et se trompait, jusqu'à donner
 * DEUX SIGNES OPPOSÉS au même libellé récurrent (`VIR Epargne programmee`, −10,00 puis
 * +10,00). Sur les deux relevés réels, la réconciliation accusait 2 187 € et 1 764 € d'écart.
 *
 * L'information existe pourtant dans le PDF : les colonnes Débit et Crédit sont séparées de
 * plus de soixante points. La lire est déterministe ; la deviner ne l'est pas.
 */
export function operationsText(input: { pages: PositionedItem[][] | null, flatText: string }): string {
  const { pages, flatText } = input
  if (pages === null) return cutBeforeOperations(flatText)

  // Le séparateur est cherché page par page, mais REPORTÉ sur celles qui n'ont pas d'en-tête.
  //
  // Sur Boursorama, chaque page réimprime « Débit / Crédit » (vérifié sur 20 relevés réels,
  // revue du 2026-09-23) : ce report est un FILET DE SÉCURITÉ, pas le cas normal. Au cas où
  // une page n'aurait pas d'en-tête (autre gabarit, extraction incomplète), ses montants
  // sortiraient sans marqueur et la règle du prompt renverrait le modèle à la déduction — la
  // panne d'origine, sur une partie du relevé (revue du 2026-09-05). La géométrie des colonnes
  // ne change pas d'une page à l'autre dans un même document : le report est sûr.
  const headers = pages.map(findDebitCreditHeader)
  const known = headers.find(h => h !== null) ?? null
  if (!known) return cutBeforeOperations(flatText)

  let current = known.separator
  return pages
    .map((items, index) => {
      const header = headers[index]
      if (header) current = header.separator
      // Coupe du bloc d'identité : voir `operationRows` (NFR6). Une page sans en-tête ne peut
      // pas être coupée géométriquement — l'expurgation par motif prend alors le relais.
      return renderRows(operationRows(items, header ?? null), current)
    })
    .join('\n')
}

interface PeriodResult {
  start: string | null
  end: string | null
}

function extractPeriod(rawText: string): PeriodResult {
  // Ancrage en-tête : on limite la recherche aux premiers caractères pour éviter
  // qu'un intervalle de dates parasite (description de prestation, etc.) plus bas
  // dans le PDF ne soit confondu avec la période du relevé.
  const header = rawText.slice(0, 2000)

  const patterns: RegExp[] = [
    /[Pp]ériode\s+du\s+(\d{2})\/(\d{2})\/(\d{4})\s+au\s+(\d{2})\/(\d{2})\/(\d{4})/,
    /[Dd]u\s+(\d{2})\/(\d{2})\/(\d{4})\s+au\s+(\d{2})\/(\d{2})\/(\d{4})/,
    /(\d{2})\/(\d{2})\/(\d{4})\s*[-–]\s*(\d{2})\/(\d{2})\/(\d{4})/,
  ]

  for (const re of patterns) {
    const m = header.match(re)
    if (m && m.length >= 7) {
      const start = frDateToIso(m[1]!, m[2]!, m[3]!)
      const end = frDateToIso(m[4]!, m[5]!, m[6]!)
      if (start && end && start <= end) return { start, end }
    }
  }

  return { start: null, end: null }
}

interface BalancesResult {
  openingCents: Cents | null
  closingCents: Cents | null
}

/**
 * Patterns soldes Boursobank (validés sur Releve-compte-31-03-2026.pdf) :
 *   Ouverture : "SOLDE AU : JJ/MM/AAAA  XXX,XX" (avant les premières transactions)
 *   Clôture   : "Nouveau solde en EUR : Montant frais bancaires* : <m1> <m2> <m3>"
 *               où <m2> est le solde, <m3> les frais (souvent 0,00).
 *
 * Fallbacks préservés pour formats Boursorama legacy / autres banques.
 *
 * **Correctif du 2026-09-06 (story 17.2).** Les captures étaient paresseuses et s'arrêtaient à
 * la première espace : `SOLDE AU : 31/12/2024 2 817,46` rendait `"2"`, soit 2,00 € au lieu de
 * 2 817,46 €. Le défaut ne se voyait pas parce qu'`unpdf` aplatit sans séparateur de milliers ;
 * un changement de version l'aurait réveillé en silence, avec des écarts de plusieurs milliers
 * d'euros. On ancre désormais sur l'intitulé, puis on lit des MONTANTS ENTIERS derrière lui.
 */
export function extractBalances(rawText: string): BalancesResult {
  const opening
    = amountsAfter(rawText, /SOLDE\s+AU\s*:\s*\d{2}\/\d{2}\/\d{4}/i)[0]
      ?? amountsAfter(rawText, /[Ss]olde\s+pr[ée]c[ée]dent/)[0]
      ?? amountsAfter(rawText, /[Aa]ncien\s+solde/)[0]

  // Le récapitulatif aplatit trois montants : total, SOLDE, frais. C'est le deuxième.
  const closing
    = amountsAfter(rawText, /Nouveau\s+solde\s+en\s+EUR\s*:\s*Montant\s+frais\s+bancaires\*?\s*:/i, 3)[1]
      ?? amountsAfter(rawText, /[Nn]ouveau\s+solde/)[0]

  return { openingCents: opening ?? null, closingCents: closing ?? null }
}

export function balancesAndPeriod(flatText: string): {
  periodStart: string | null
  periodEnd: string | null
  openingCents: Cents | null
  closingCents: Cents | null
} {
  const period = extractPeriod(flatText)
  const balances = extractBalances(flatText)
  return {
    periodStart: period.start,
    periodEnd: period.end,
    openingCents: balances.openingCents,
    closingCents: balances.closingCents,
  }
}

export const boursoramaFormat: BankFormat = {
  bank: 'boursorama',
  recognizes,
  operationsText,
  balancesAndPeriod,
}
