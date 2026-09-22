import { defineEventHandler } from 'h3'
import { and, gte, lte, lt, eq, asc, sql } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { transactions, categoryItems, categoryGroups } from '~~/server/db/schema'
import { validateQuery } from '~~/server/utils/validation'
import { EvolutionQuerySchema, EVOLUTION_ALL } from '~~/shared/schemas/evolution.schema'
import {
  analyze,
  categorySeries,
  resultTotalCents,
  type AnalysisItemRef,
  type AnalysisSeriesPoint,
  type CategorySeriesPoint,
} from '~~/server/services/analysis-engine'
import { bucketBounds, shiftBucket, bucketLabel, bucketOf, type Granularity } from '~~/shared/types/granularity'
import type { MovementNature } from '~~/shared/types/movement-nature'
import { cents } from '~~/shared/types/money'

/**
 * GET /api/evolution — la trajectoire sur la période regardée (FR31, FR34).
 *
 * Page distincte de l'analyse, et endpoint distinct, parce que la PORTÉE est différente :
 * `/api/analysis` décrit une période d'un bloc, celui-ci la DÉCOUPE. Les mélanger sous un même
 * sélecteur rendait la page d'analyse incompréhensible — on choisissait « juillet 2026 » et
 * deux blocs sur trois répondaient autre chose (recette du 2026-09-05).
 *
 * Le découpage est toujours le MOIS : une année en donne douze, un trimestre trois, « tout
 * l'historique » autant que de mois portant des mouvements (refonte du 2026-09-07).
 */

/**
 * Mois d'une période regardée — les douze d'une année, les trois d'un trimestre.
 *
 * Les tranches sont CALCULÉES et non déduites des données : un mois sans mouvement doit
 * apparaître à zéro, sinon la série se lirait comme une accélération.
 */
function monthsOf(period: string): string[] {
  const year = period.slice(0, 4)
  if (period.includes('-T')) {
    const first = (Number(period.slice(-1)) - 1) * 3 + 1
    return [0, 1, 2].map(i => `${year}-${String(first + i).padStart(2, '0')}`)
  }
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
}

/** Tous les mois portant ou séparant des transactions, du premier au dernier. */
async function allHistoryBuckets(): Promise<string[]> {
  const row = await db
    .select({
      first: sql<string | null>`min(${transactions.transactionDate})`,
      last: sql<string | null>`max(${transactions.transactionDate})`,
    })
    .from(transactions)
    .get()
  if (!row?.first || !row.last) return []

  const out: string[] = []
  let cursor = bucketOf(row.first, 'month')
  const end = bucketOf(row.last, 'month')
  // Borne dure : un historique aberrant ne doit pas produire une série sans fin.
  while (cursor <= end && out.length < 600) {
    out.push(cursor)
    cursor = shiftBucket(cursor, 'month', 1)
  }
  return out
}

function loadReferential(): Promise<AnalysisItemRef[]> {
  return db
    .select({
      code: categoryItems.code,
      label: categoryItems.label,
      nature: categoryItems.nature,
      groupCode: categoryGroups.code,
      groupLabel: categoryGroups.label,
    })
    .from(categoryItems)
    .innerJoin(categoryGroups, eq(categoryItems.groupId, categoryGroups.id))
    .orderBy(asc(categoryGroups.position), asc(categoryItems.position))
}

export interface EvolutionResponse {
  buckets: string[]
  /** Vue d'ensemble : recettes, dépenses, résultat et cumul par tranche. */
  series: AnalysisSeriesPoint[]
  /**
   * Patrimoine accumulé AVANT la première tranche affichée.
   *
   * Le cumul de `series` en repart, au lieu de zéro : sans ce report la courbe décrivait la
   * trésorerie de la fenêtre, pas la trajectoire du patrimoine depuis le début de l'historique
   * (demande du 2026-09-06). Permet aussi à l'écran de dire depuis QUAND la courbe compte.
   */
  priorCumulativeCents: number
  /** Trajectoire de la cible demandée, `null` si aucune. */
  targetSeries: CategorySeriesPoint[] | null
  targetLabel: string | null
  /**
   * Nature de la cible — sert à ORIENTER sa courbe.
   *
   * Les dépenses sont stockées en négatif : tracées telles quelles, dépenser davantage faisait
   * DESCENDRE la courbe, à l'inverse de ce que tout le monde lit (recette du 2026-09-05).
   */
  targetNature: MovementNature | null
  /** Référentiel, pour peupler le sélecteur de cible sans second appel. */
  groups: Array<{ code: string, label: string, items: Array<{ code: string, label: string }> }>
}

export default defineEventHandler(async (event): Promise<EvolutionResponse> => {
  const { period, target } = await validateQuery(event, EvolutionQuerySchema)

  // Le PAS est toujours le mois : c'est la période regardée qui varie, pas le découpage
  // (refonte du 2026-09-07). Une année se lit en douze mois, un trimestre en trois.
  const granularity: Granularity = 'month'

  // Les tranches attendues sont calculées, pas déduites des données : une tranche sans
  // mouvement doit apparaître à zéro, sinon la série se lit comme une accélération.
  const buckets = period === EVOLUTION_ALL
    ? await allHistoryBuckets()
    : monthsOf(period)

  if (buckets.length === 0) {
    return {
      buckets: [],
      series: [],
      priorCumulativeCents: 0,
      targetSeries: null,
      targetLabel: null,
      targetNature: null,
      groups: groupsOf(await loadReferential()),
    }
  }

  const from = bucketBounds(buckets[0]!, granularity).from
  const toDate = bucketBounds(buckets.at(-1)!, granularity).to

  const referential = await loadReferential()

  const rows = await db
    .select({
      transactionDate: transactions.transactionDate,
      amountCents: transactions.amountCents,
      categoryItemCode: categoryItems.code,
      // Le moteur en a besoin pour écarter les avances remboursées (epic 19).
      settlementGroupId: transactions.settlementGroupId,
    })
    .from(transactions)
    .innerJoin(categoryItems, eq(categoryItems.id, transactions.categoryItemId))
    .where(and(gte(transactions.transactionDate, from), lte(transactions.transactionDate, toDate)))

  /**
   * Patrimoine accumulé AVANT la fenêtre (demande du 2026-09-06).
   *
   * Sans ce report, la courbe cumulée repartait de zéro à chaque fenêtre de douze tranches :
   * elle montrait la trésorerie DE LA FENÊTRE, pas la trajectoire du patrimoine. Or c'est cette
   * trajectoire que l'utilisateur cherche — « est-ce que mon patrimoine a augmenté ou baissé ».
   *
   * Les mouvements internes sont exclus, comme partout : ils déplacent de l'argent entre les
   * comptes de l'utilisateur sans en créer ni en détruire (NFR4).
   */
  const priorRows = await db
    .select({
      transactionDate: transactions.transactionDate,
      amountCents: transactions.amountCents,
      categoryItemCode: categoryItems.code,
      settlementGroupId: transactions.settlementGroupId,
    })
    .from(transactions)
    .innerJoin(categoryItems, eq(categoryItems.id, transactions.categoryItemId))
    .where(lt(transactions.transactionDate, from))
    .orderBy(asc(transactions.transactionDate), asc(transactions.id))
  // Par le MOTEUR, et non par une somme SQL : la coupe du compte joint et la neutralisation des
  // avances doivent s'appliquer ici comme dans la fenêtre, sans quoi le même mois ne pèse pas la
  // même chose des deux côtés de la borne (revue du 2026-09-08).
  const priorCents = resultTotalCents(priorRows, referential)

  const overview = analyze({ transactions: rows, referential, granularity })

  // Les tranches vides sont complétées : le moteur ne connaît que les lignes reçues, pas la
  // fenêtre demandée — c'est à l'appelant, qui l'a choisie, de la refermer.
  const byBucket = new Map(overview.series.map(p => [p.bucket, p]))
  let running = priorCents
  const series: AnalysisSeriesPoint[] = buckets.map((bucket) => {
    const point = byBucket.get(bucket)
    const result = point?.resultCents ?? 0
    running += result
    return {
      bucket,
      label: bucketLabel(bucket, granularity),
      incomeCents: cents(point?.incomeCents ?? 0),
      expenseCents: cents(point?.expenseCents ?? 0),
      resultCents: cents(result),
      cumulativeResultCents: cents(running),
    }
  })

  const parsed = target ? parseTarget(target) : null

  return {
    buckets,
    series,
    /**
     * Patrimoine accumulé avant la première tranche affichée. Permet à l'écran de dire depuis
     * QUAND la courbe compte, plutôt que de laisser croire qu'elle démarre à zéro.
     */
    priorCumulativeCents: priorCents,
    targetSeries: parsed
      ? categorySeries(rows, referential, granularity, parsed, buckets)
      : null,
    targetLabel: parsed ? labelOf(parsed, referential) : null,
    targetNature: parsed ? natureOf(parsed, referential) : null,
    groups: groupsOf(referential),
  }
})

function parseTarget(raw: string): { kind: 'group' | 'item', code: string } {
  const [kind, code] = raw.split(':')
  return { kind: kind as 'group' | 'item', code: code! }
}

/** Libellé lisible de la cible : « Alimentation · Restaurant », jamais un code. */
function labelOf(target: { kind: 'group' | 'item', code: string }, referential: AnalysisItemRef[]): string | null {
  if (target.kind === 'group') {
    return referential.find(r => r.groupCode === target.code)?.groupLabel ?? null
  }
  const item = referential.find(r => r.code === target.code)
  return item ? `${item.groupLabel} · ${item.label}` : null
}

/**
 * Nature d'une cible. Pour une rubrique, celle de ses postes — `null` si elle en mélange
 * plusieurs, auquel cas aucune orientation n'est défendable.
 */
function natureOf(
  target: { kind: 'group' | 'item', code: string },
  referential: AnalysisItemRef[],
): MovementNature | null {
  if (target.kind === 'item') return referential.find(r => r.code === target.code)?.nature ?? null
  const natures = new Set(referential.filter(r => r.groupCode === target.code).map(r => r.nature))
  return natures.size === 1 ? [...natures][0]! : null
}

function groupsOf(referential: AnalysisItemRef[]): EvolutionResponse['groups'] {
  const groups = new Map<string, EvolutionResponse['groups'][number]>()
  for (const ref of referential) {
    const entry = groups.get(ref.groupCode) ?? { code: ref.groupCode, label: ref.groupLabel, items: [] }
    entry.items.push({ code: ref.code, label: ref.label })
    groups.set(ref.groupCode, entry)
  }
  return [...groups.values()]
}
