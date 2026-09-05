import { defineEventHandler } from 'h3'
import { and, gte, lte, eq, asc } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { transactions, categoryItems, categoryGroups } from '~~/server/db/schema'
import { validateQuery } from '~~/server/utils/validation'
import { EvolutionQuerySchema } from '~~/shared/schemas/evolution.schema'
import {
  analyze,
  categorySeries,
  type AnalysisItemRef,
  type AnalysisSeriesPoint,
  type CategorySeriesPoint,
} from '~~/server/services/analysis-engine'
import { bucketBounds, shiftBucket, bucketLabel } from '~~/shared/types/granularity'
import type { MovementNature } from '~~/shared/types/movement-nature'

/**
 * GET /api/evolution — la trajectoire sur douze tranches (FR31, FR34).
 *
 * Page distincte de l'analyse, et endpoint distinct, parce que la PORTÉE est différente :
 * `/api/analysis` décrit une période, celui-ci en traverse douze. Les mélanger sous un même
 * sélecteur rendait la page d'analyse incompréhensible — on choisissait « juillet 2026 » et
 * deux blocs sur trois répondaient autre chose (recette du 2026-09-05).
 *
 * La fenêtre est FIXE à douze tranches. Réglable le jour où l'historique le justifiera ;
 * aujourd'hui, un choix de plus serait un choix sans conséquence.
 */
export const EVOLUTION_WINDOW = 12

export interface EvolutionResponse {
  buckets: string[]
  /** Vue d'ensemble : recettes, dépenses, résultat et cumul par tranche. */
  series: AnalysisSeriesPoint[]
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
  const { to, granularity, target } = await validateQuery(event, EvolutionQuerySchema)

  // Les tranches attendues sont calculées, pas déduites des données : une tranche sans
  // mouvement doit apparaître à zéro, sinon la série se lit comme une accélération.
  const buckets = Array.from({ length: EVOLUTION_WINDOW }, (_, i) =>
    shiftBucket(to, granularity, i - (EVOLUTION_WINDOW - 1)))

  const from = bucketBounds(buckets[0]!, granularity).from
  const toDate = bucketBounds(to, granularity).to

  const referential: AnalysisItemRef[] = await db
    .select({
      code: categoryItems.code,
      label: categoryItems.label,
      nature: categoryItems.nature,
      groupCode: categoryGroups.code,
      groupLabel: categoryGroups.label,
    })
    .from(categoryItems)
    .innerJoin(categoryGroups, eq(categoryItems.groupCode, categoryGroups.code))
    .orderBy(asc(categoryGroups.position), asc(categoryItems.position))

  const rows = await db
    .select({
      transactionDate: transactions.transactionDate,
      amountCents: transactions.amountCents,
      categoryItemCode: transactions.categoryItemCode,
    })
    .from(transactions)
    .where(and(gte(transactions.transactionDate, from), lte(transactions.transactionDate, toDate)))

  const overview = analyze({ transactions: rows, referential, granularity })

  // Les tranches vides sont complétées : le moteur ne connaît que les lignes reçues, pas la
  // fenêtre demandée — c'est à l'appelant, qui l'a choisie, de la refermer.
  const byBucket = new Map(overview.series.map(p => [p.bucket, p]))
  let running = 0
  const series: AnalysisSeriesPoint[] = buckets.map((bucket) => {
    const point = byBucket.get(bucket)
    const result = point?.resultCents ?? 0
    running += result
    return {
      bucket,
      label: bucketLabel(bucket, granularity),
      incomeCents: point?.incomeCents ?? (0 as AnalysisSeriesPoint['incomeCents']),
      expenseCents: point?.expenseCents ?? (0 as AnalysisSeriesPoint['expenseCents']),
      resultCents: result as AnalysisSeriesPoint['resultCents'],
      cumulativeResultCents: running as AnalysisSeriesPoint['cumulativeResultCents'],
    }
  })

  const parsed = target ? parseTarget(target) : null

  return {
    buckets,
    series,
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
