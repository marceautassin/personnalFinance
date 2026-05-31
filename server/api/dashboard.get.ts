/**
 * GET /api/dashboard?month=YYYY-MM — agrégats du mois (Story 4.1).
 *
 * Retourne en un seul snapshot :
 *  - balanceCents : closing du statement le plus récent couvrant le mois
 *  - totals : income/expense + byCategory
 *  - deltasVsPriorMonths : top 3 catégories avec écart vs moyenne des 2 mois précédents
 *  - phrases : phrases FR pré-formatées (1 par delta), prêtes à afficher
 *  - reliability : agrégée sur les statements chevauchant la période
 *
 * Convention monétaire : tous les `*Cents` sont signés (négatif = dépense). Pas d'inversion.
 *
 * Helpers `selectTopDeltas` et `phraseDelta` sont privés à cet endpoint. La story 4.2
 * (extraction dans `server/services/narrative-generator.ts`) a été retirée du scope —
 * les helpers restent donc inlinés ici. Le contrat de réponse (`phrases: string[]`) est inchangé.
 */
import { defineEventHandler } from 'h3'
import { sql, asc, and, lte, gte, desc } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { transactions, bankStatements, categoryDefinitions, type ReliabilityValue } from '~~/server/db/schema'
import { validateQuery } from '~~/server/utils/validation'
import { previousMonth, monthEnd } from '~~/server/utils/period'
import { TransactionListQuerySchema } from '~~/shared/schemas/transaction.schema'
import { type Cents, cents, formatEuros } from '~~/shared/types/money'

export interface DashboardDelta {
  categoryCode: string
  label: string
  currentCents: Cents
  priorAvgCents: Cents
  diffCents: Cents
  pct: number | null
}

export interface DashboardResponse {
  month: string
  balanceCents: Cents
  totals: {
    incomeCents: Cents
    expenseCents: Cents
    byCategory: Record<string, Cents>
  }
  deltasVsPriorMonths: DashboardDelta[]
  phrases: string[]
  reliability: ReliabilityValue | null
}

const TOP_DELTAS_LIMIT = 3
const DELTA_MIN_ABS_CENTS = 1000 // 10 €
const DELTA_MIN_PCT = 0.20

export default defineEventHandler(async (event): Promise<DashboardResponse> => {
  const { month } = validateQuery(event, TransactionListQuerySchema)

  // Périmètre du mois (dates ISO, comparaison lexicographique sûre).
  // monthEnd reflète la vraie longueur du mois plutôt qu'un '-31' littéral : borne de comparaison
  // exacte et sans date calendaire impossible (durcissement, cf. story 4.1 review).
  const monthStart = `${month}-01`
  const monthEndDate = monthEnd(month)

  // 1) Solde de fin de mois — closing du statement le plus récent couvrant le mois.
  const [stmtForBalance] = await db
    .select({ closing: bankStatements.closingBalanceCents })
    .from(bankStatements)
    .where(and(lte(bankStatements.periodStart, monthEndDate), gte(bankStatements.periodEnd, monthStart)))
    .orderBy(desc(bankStatements.periodEnd))
    .limit(1)
  const balanceCents = cents(stmtForBalance?.closing ?? 0)

  // 2) Totaux du mois courant : income + expense agrégés en une passe SQL.
  const [totalsRow] = await db
    .select({
      income: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.amountCents} > 0 THEN ${transactions.amountCents} ELSE 0 END), 0)`,
      expense: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.amountCents} < 0 THEN ${transactions.amountCents} ELSE 0 END), 0)`,
    })
    .from(transactions)
    .where(sql`${transactions.transactionDate} LIKE ${`${month}-%`}`)

  const incomeCents = cents(totalsRow?.income ?? 0)
  const expenseCents = cents(totalsRow?.expense ?? 0) // signé (négatif)

  // 3) Totaux par catégorie pour le mois courant.
  const currentByCategory = await aggregateByCategory(month)

  // 4) Totaux par catégorie pour les 2 mois précédents.
  // La moyenne priorAvg est calculée par catégorie (cf. story 4.1 review) : pour chaque catégorie,
  // on ne divise que par le nombre de mois où ELLE a réellement des transactions. Un mois où la
  // catégorie est absente ne tire pas sa moyenne vers zéro. Un mois entièrement vide ne contient
  // aucune catégorie et ne compte donc nulle part.
  const priorMonth1 = previousMonth(month)
  const priorMonth2 = previousMonth(priorMonth1)
  const prior1ByCategory = await aggregateByCategory(priorMonth1)
  const prior2ByCategory = await aggregateByCategory(priorMonth2)
  const priorMaps = [prior1ByCategory, prior2ByCategory]

  // 5) Charger les libellés des catégories pour annoter les deltas.
  const categoryDefRows = await db
    .select({ code: categoryDefinitions.code, label: categoryDefinitions.label })
    .from(categoryDefinitions)
    .orderBy(asc(categoryDefinitions.code))
  const labelByCode = Object.fromEntries(categoryDefRows.map(r => [r.code, r.label]))

  // 6) Calculer les deltas (helper privé — sera déplacé en `narrative-generator.ts` story 4.2).
  // Si aucun mois précédent n'a de données, toutes les catégories courantes sont "nouvelles"
  // (priorAvg = 0) et seront éligibles si |currentCents| >= seuil.
  const deltas = selectTopDeltas(currentByCategory, priorMaps, labelByCode)

  // 8) Formater les phrases (idem — helper privé en attendant story 4.2).
  const phrases = deltas.map((d, i) => phraseDelta(d, { isPrimary: i === 0 }))

  // 9) Agrégation reliability — pattern identique à `transactions/index.get.ts:31-41`.
  const stmtsCovering = await db
    .select({ reliability: bankStatements.reliability })
    .from(bankStatements)
    .where(and(lte(bankStatements.periodStart, monthEndDate), gte(bankStatements.periodEnd, monthStart)))

  let reliability: ReliabilityValue | null = null
  if (stmtsCovering.length > 0) {
    reliability = stmtsCovering.some(s => s.reliability === 'unreliable') ? 'unreliable' : 'reliable'
  }

  return {
    month,
    balanceCents,
    totals: {
      incomeCents,
      expenseCents,
      byCategory: currentByCategory as Record<string, Cents>,
    },
    deltasVsPriorMonths: deltas,
    phrases,
    reliability,
  }
})

/**
 * Agrège les transactions du mois par categoryCode (somme signée).
 */
async function aggregateByCategory(month: string): Promise<Record<string, Cents>> {
  const rows = await db
    .select({
      categoryCode: transactions.categoryCode,
      sum: sql<number>`SUM(${transactions.amountCents})`,
    })
    .from(transactions)
    .where(sql`${transactions.transactionDate} LIKE ${`${month}-%`}`)
    .groupBy(transactions.categoryCode)

  const out: Record<string, Cents> = {}
  for (const r of rows) {
    out[r.categoryCode] = cents(r.sum)
  }
  return out
}

/**
 * Sélectionne au plus TOP_DELTAS_LIMIT catégories avec un écart significatif vs la moyenne
 * des mois précédents. Tri par |diffCents| desc, tie-break alphabétique sur categoryCode.
 *
 * Éligibilité : |diffCents| >= 10 € ET (priorAvg = 0 OU |pct| >= 20%).
 */
function selectTopDeltas(
  current: Record<string, Cents>,
  priorMaps: ReadonlyArray<Record<string, Cents>>,
  labelByCode: Record<string, string>,
): DashboardDelta[] {
  // Univers des codes : union du courant + des priors. Les "disparitions" (catégorie présente
  // seulement dans les priors) sont incluses ; elles passent le filtre AC#6 comme une baisse, ce
  // qui est le comportement voulu.
  const codes = new Set<string>(Object.keys(current))
  for (const m of priorMaps) for (const c of Object.keys(m)) codes.add(c)

  const candidates: DashboardDelta[] = []
  for (const code of codes) {
    const currentCents = current[code] ?? cents(0)
    // Moyenne par catégorie : seuls les mois où la catégorie apparaît comptent au diviseur.
    const monthsWithCategory = priorMaps.filter(m => code in m)
    const priorSum = monthsWithCategory.reduce((acc, m) => acc + (m[code] ?? 0), 0)
    const priorAvgCents = monthsWithCategory.length === 0
      ? cents(0)
      : cents(Math.round(priorSum / monthsWithCategory.length))
    const diffCents = cents(currentCents - priorAvgCents)
    if (Math.abs(diffCents) < DELTA_MIN_ABS_CENTS) continue
    const pct = priorAvgCents === 0 ? null : diffCents / priorAvgCents
    if (pct !== null && Math.abs(pct) < DELTA_MIN_PCT) continue

    candidates.push({
      categoryCode: code,
      label: labelByCode[code] ?? code,
      currentCents,
      priorAvgCents,
      diffCents,
      pct,
    })
  }

  candidates.sort((a, b) =>
    Math.abs(b.diffCents) - Math.abs(a.diffCents) || a.categoryCode.localeCompare(b.categoryCode),
  )
  return candidates.slice(0, TOP_DELTAS_LIMIT)
}

/**
 * Formate un Delta en phrase FR. La fonction est pure et ignore la position du delta dans
 * la liste — l'option `isPrimary` est passée explicitement par l'appelant.
 */
function phraseDelta(d: DashboardDelta, { isPrimary }: { isPrimary?: boolean } = {}): string {
  const absDiff = Math.abs(d.diffCents) as Cents
  const formattedDiff = formatEuros(absDiff)
  const pctLabel = d.pct === null ? '' : `${Math.round(Math.abs(d.pct) * 100)} %`
  const tail = isPrimary ? ', principal facteur du delta de solde' : ''

  // Catégorie nouvelle : pas d'historique (priorAvg = 0).
  if (d.priorAvgCents === 0) {
    const isExpense = d.currentCents < 0
    const kind = isExpense ? 'dépense' : 'revenu'
    const article = isExpense ? 'Une nouvelle' : 'Un nouveau'
    const amount = formatEuros(Math.abs(d.currentCents) as Cents)
    return `${article} ${kind} « ${d.label} » apparaît ce mois pour ${amount}${tail}.`
  }

  // Catégorie de dépense (current OU priorAvg < 0).
  const isExpenseCategory = d.currentCents < 0 || d.priorAvgCents < 0
  if (isExpenseCategory) {
    // Hausse de dépense = diffCents négatif (sortie plus négative qu'avant).
    if (d.diffCents < 0) {
      return `Tes ${d.label.toLowerCase()} ont augmenté de ${formattedDiff} (+${pctLabel}) ce mois${tail}.`
    }
    // Baisse de dépense = diffCents positif (sortie moins négative).
    return `Tes ${d.label.toLowerCase()} ont baissé de ${formattedDiff} (-${pctLabel}) ce mois${tail}.`
  }

  // Catégorie de revenu : diff > 0 = hausse, diff < 0 = baisse (KISS — pas de symétrie spéciale V1).
  if (d.diffCents > 0) {
    return `Tes revenus ${d.label.toLowerCase()} ont augmenté de ${formattedDiff} (+${pctLabel}) ce mois${tail}.`
  }
  return `Tes revenus ${d.label.toLowerCase()} ont baissé de ${formattedDiff} (-${pctLabel}) ce mois${tail}.`
}
