/**
 * analysis-engine — agrégation d'une période en arbre nature → rubrique → poste, plus les
 * quatre indicateurs (D19, FR26-FR34).
 *
 * Fonction PURE : elle reçoit des lignes et un référentiel, elle n'importe jamais le client de
 * base de données. C'est ce qui rend les cas limites de NFR3 testables sans SQLite — période
 * vide, recettes nulles, signe inattendu — et c'est le contrat qui a fait ses preuves sur
 * `reconciler.ts`.
 *
 * **Somme algébrique, jamais de valeur absolue (D28).** `amount_cents` est signé : négatif
 * pour les sorties, positif pour les entrées. Un remboursement rangé sur un poste de dépense
 * diminue cette dépense — il n'est ni ignoré, ni rerouté vers les recettes. Les totaux
 * conservent donc le signe bancaire, et l'orientation d'affichage appartient à l'UI.
 */
import { type Cents, cents, sumCents } from '~~/shared/types/money'
import { ratio, type Ratio } from '~~/shared/types/ratio'
import type { MovementNature } from '~~/shared/types/movement-nature'
import { MOVEMENT_NATURES } from '~~/shared/types/movement-nature'
import { bucketOf, bucketLabel, type Granularity } from '~~/shared/types/granularity'

/** Une ligne à agréger. Le moteur ne connaît rien d'autre d'une transaction. */
export interface AnalysisTransaction {
  transactionDate: string
  amountCents: number
  categoryItemCode: string
}

/** Le référentiel, aplati : de quoi situer un poste dans l'arbre. */
export interface AnalysisItemRef {
  code: string
  label: string
  nature: MovementNature
  groupCode: string
  groupLabel: string
}

export interface AnalysisItemNode {
  itemCode: string
  label: string
  totalCents: Cents
  /** Même poste sur la période précédente. `null` si cette période n'est pas fournie. */
  previousTotalCents: Cents | null
  transactionCount: number
}

export interface AnalysisGroupNode {
  groupCode: string
  label: string
  totalCents: Cents
  previousTotalCents: Cents | null
  transactionCount: number
  items: AnalysisItemNode[]
}

export interface AnalysisNatureNode {
  nature: MovementNature
  totalCents: Cents
  previousTotalCents: Cents | null
  groups: AnalysisGroupNode[]
}

export interface AnalysisIndicators {
  /** Recettes de la période, hors mouvements internes. */
  incomeCents: Cents
  /** Dépenses de la période, hors mouvements internes. Négatif en convention bancaire. */
  expenseCents: Cents
  /** Mouvements internes, exposés à part : ils n'entrent dans aucun des deux totaux (NFR4). */
  internalCents: Cents
  /** Trésorerie de la période = recettes + dépenses, hors mouvements internes. */
  resultCents: Cents
  /** Trésorerie cumulée sur la série, jusqu'à la fin de la période. */
  cumulativeResultCents: Cents
  /** Part des recettes consommée par les dépenses. `null` sans recette. */
  spendRate: Ratio | null
  /** Part des recettes conservée. `null` sans recette. */
  savingsRate: Ratio | null
}

export interface AnalysisSeriesPoint {
  bucket: string
  label: string
  incomeCents: Cents
  expenseCents: Cents
  resultCents: Cents
  cumulativeResultCents: Cents
}

export interface AnalysisResult {
  natures: AnalysisNatureNode[]
  indicators: AnalysisIndicators
  series: AnalysisSeriesPoint[]
  /** Lignes dont le poste est absent du référentiel — ni agrégées, ni tues. */
  orphanCount: number
}

export interface AnalysisInput {
  transactions: readonly AnalysisTransaction[]
  /**
   * Lignes de la FENÊTRE d'évolution, plus large que la période analysée.
   *
   * L'arbre décrit la période choisie ; la série, elle, n'a de sens que sur plusieurs
   * tranches. Les confondre donnait, en granularité mois, une série d'un seul point — un
   * graphique d'évolution qui n'évolue pas. Par défaut, la fenêtre est la période elle-même.
   */
  seriesTransactions?: readonly AnalysisTransaction[]
  /** Lignes de la période précédente, pour `previousTotalCents` (D24). Vide si non demandée. */
  previousTransactions?: readonly AnalysisTransaction[]
  referential: readonly AnalysisItemRef[]
  granularity: Granularity
  /** Vrai si la période précédente a été fournie — distingue « zéro » de « inconnu ». */
  hasPrevious?: boolean
}

/** Totaux par code de poste. */
function totalsByItem(transactions: readonly AnalysisTransaction[]) {
  const totals = new Map<string, { cents: number, count: number }>()
  for (const tx of transactions) {
    const entry = totals.get(tx.categoryItemCode) ?? { cents: 0, count: 0 }
    entry.cents += tx.amountCents
    entry.count++
    totals.set(tx.categoryItemCode, entry)
  }
  return totals
}

/**
 * Agrège une période.
 *
 * Les nœuds à zéro sont conservés dès lors qu'ils portent au moins une transaction sur l'une
 * des deux périodes : un poste tombé à zéro ce mois-ci est une information, pas un vide.
 * Les postes jamais touchés, eux, sont omis — afficher 48 lignes dont 40 à zéro noierait le
 * signal.
 */
export function analyze(input: AnalysisInput): AnalysisResult {
  const { transactions, referential, granularity } = input
  const previous = input.previousTransactions ?? []
  const hasPrevious = input.hasPrevious ?? input.previousTransactions !== undefined

  const byCode = new Map(referential.map(r => [r.code, r]))
  const current = totalsByItem(transactions)
  const prior = totalsByItem(previous)

  // Une ligne dont le poste n'existe plus au référentiel ne peut être placée nulle part.
  // On la compte plutôt que de la faire disparaître : un total qui ne dit pas ce qu'il omet
  // est exactement le chiffre invérifiable que ce produit refuse.
  let orphanCount = 0
  for (const [code, entry] of current) {
    if (!byCode.has(code)) orphanCount += entry.count
  }

  const natures: AnalysisNatureNode[] = []
  for (const nature of MOVEMENT_NATURES) {
    const groups = new Map<string, AnalysisGroupNode>()

    for (const ref of referential) {
      if (ref.nature !== nature) continue
      const cur = current.get(ref.code)
      const pre = prior.get(ref.code)
      if (!cur && !pre) continue

      const group = groups.get(ref.groupCode) ?? {
        groupCode: ref.groupCode,
        label: ref.groupLabel,
        totalCents: cents(0),
        previousTotalCents: hasPrevious ? cents(0) : null,
        transactionCount: 0,
        items: [],
      }
      const item: AnalysisItemNode = {
        itemCode: ref.code,
        label: ref.label,
        totalCents: cents(cur?.cents ?? 0),
        previousTotalCents: hasPrevious ? cents(pre?.cents ?? 0) : null,
        transactionCount: cur?.count ?? 0,
      }
      group.items.push(item)
      group.totalCents = cents(group.totalCents + item.totalCents)
      if (group.previousTotalCents !== null && item.previousTotalCents !== null) {
        group.previousTotalCents = cents(group.previousTotalCents + item.previousTotalCents)
      }
      group.transactionCount += item.transactionCount
      groups.set(ref.groupCode, group)
    }

    if (groups.size === 0) continue
    const groupList = [...groups.values()]
    natures.push({
      nature,
      totalCents: sumCents(groupList.map(g => g.totalCents)),
      previousTotalCents: hasPrevious
        ? sumCents(groupList.map(g => g.previousTotalCents ?? cents(0)))
        : null,
      groups: groupList,
    })
  }

  const series = buildSeries(input.seriesTransactions ?? transactions, byCode, granularity)
  const indicators = computeIndicators(natures, series)

  return { natures, indicators, series, orphanCount }
}

/** Total d'une nature dans l'arbre, ou zéro si elle n'y figure pas. */
function natureTotal(natures: readonly AnalysisNatureNode[], nature: MovementNature): Cents {
  return natures.find(n => n.nature === nature)?.totalCents ?? cents(0)
}

function computeIndicators(
  natures: readonly AnalysisNatureNode[],
  series: readonly AnalysisSeriesPoint[],
): AnalysisIndicators {
  const incomeCents = natureTotal(natures, 'income')
  const expenseCents = natureTotal(natures, 'expense')
  const internalCents = natureTotal(natures, 'internal_transfer')

  // NFR4 : les mouvements internes n'entrent PAS dans le résultat. Un virement vers un livret
  // n'appauvrit ni n'enrichit — le compter gonflerait les recettes et masquerait un déficit.
  const resultCents = cents(incomeCents + expenseCents)

  return {
    incomeCents,
    expenseCents,
    internalCents,
    resultCents,
    // Cumul à la FIN de la fenêtre d'évolution : c'est ce que « trésorerie cumulée » veut
    // dire — ce qui reste après tout ce qui précède, pas le résultat de la seule période.
    cumulativeResultCents: series.at(-1)?.cumulativeResultCents ?? resultCents,
    // Dénominateur nul → `null`, jamais zéro : un mois sans recette n'a pas un taux
    // d'épargne nul, il n'en a pas (AR10).
    spendRate: ratio(Math.abs(expenseCents), incomeCents),
    savingsRate: ratio(resultCents, incomeCents),
  }
}

/**
 * Série temporelle découpée selon la granularité.
 *
 * Les tranches sans aucune transaction ne sont pas inventées : le moteur ne connaît pas les
 * bornes demandées, seulement les lignes reçues. C'est à l'appelant de compléter s'il veut
 * une série continue — et il est le seul à savoir ce qu'il a demandé.
 */
function buildSeries(
  transactions: readonly AnalysisTransaction[],
  byCode: ReadonlyMap<string, AnalysisItemRef>,
  granularity: Granularity,
): AnalysisSeriesPoint[] {
  const buckets = new Map<string, { income: number, expense: number }>()
  for (const tx of transactions) {
    const ref = byCode.get(tx.categoryItemCode)
    if (!ref || ref.nature === 'internal_transfer') continue
    const key = bucketOf(tx.transactionDate, granularity)
    const entry = buckets.get(key) ?? { income: 0, expense: 0 }
    if (ref.nature === 'income') entry.income += tx.amountCents
    else entry.expense += tx.amountCents
    buckets.set(key, entry)
  }

  let running = 0
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, { income, expense }]) => {
      const result = income + expense
      running += result
      return {
        bucket,
        label: bucketLabel(bucket, granularity),
        incomeCents: cents(income),
        expenseCents: cents(expense),
        resultCents: cents(result),
        cumulativeResultCents: cents(running),
      }
    })
}
