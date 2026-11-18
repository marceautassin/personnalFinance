/**
 * Granularité d'analyse — le DÉCOUPAGE de la série, distinct des BORNES de la période.
 *
 * Deux notions qu'un identifiant unique (`2026-Q1`) confondrait, et qui divergeraient dès
 * qu'une plage libre serait demandée : on peut vouloir la répartition d'un semestre découpé
 * en mois. Les bornes disent QUOI agréger, la granularité dit COMMENT le découper.
 */
export const GRANULARITIES = ['month', 'quarter', 'year'] as const

export type Granularity = typeof GRANULARITIES[number]

export function isGranularity(value: string): value is Granularity {
  return (GRANULARITIES as readonly string[]).includes(value)
}

/**
 * Clé de la tranche à laquelle appartient une date, selon la granularité.
 *
 * Le tri lexicographique de ces clés est chronologiquement correct — c'est ce qui permet
 * d'ordonner la série sans reconvertir en `Date`, et donc sans piège de fuseau horaire.
 */
export function bucketOf(dateIso: string, granularity: Granularity): string {
  const year = dateIso.slice(0, 4)
  if (granularity === 'year') return year
  if (granularity === 'month') return dateIso.slice(0, 7)
  const month = Number(dateIso.slice(5, 7))
  return `${year}-T${Math.floor((month - 1) / 3) + 1}`
}

/** Libellé FR d'une tranche, pour l'affichage. */
const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

export function bucketLabel(bucket: string, granularity: Granularity): string {
  if (granularity === 'year') return bucket
  if (granularity === 'quarter') {
    const [year, quarter] = bucket.split('-T')
    return `T${quarter} ${year}`
  }
  const [year, month] = bucket.split('-')
  return `${MONTHS_FR[Number(month) - 1]} ${year}`
}

/**
 * Bornes inclusives d'une tranche, au format `YYYY-MM-DD`.
 *
 * Les bornes sont dérivées de la tranche et non l'inverse : c'est la tranche que l'utilisateur
 * choisit, et deux notions distinctes (le périmètre, le découpage) doivent le rester côté API.
 */
export function bucketBounds(bucket: string, granularity: Granularity): { from: string, to: string } {
  if (granularity === 'year') {
    return { from: `${bucket}-01-01`, to: `${bucket}-12-31` }
  }
  if (granularity === 'quarter') {
    const [year, quarter] = bucket.split('-T')
    const firstMonth = (Number(quarter) - 1) * 3 + 1
    return {
      from: `${year}-${pad(firstMonth)}-01`,
      to: `${year}-${pad(firstMonth + 2)}-${lastDayOf(Number(year), firstMonth + 2)}`,
    }
  }
  const [year, month] = bucket.split('-')
  return { from: `${bucket}-01`, to: `${bucket}-${lastDayOf(Number(year), Number(month))}` }
}

/**
 * Tranche décalée de `delta` unités. `-1` donne la précédente, celle à laquelle on compare.
 *
 * Le décalage est CALENDAIRE et non en jours : comparer mars à « les 31 jours précédents »
 * donnerait une fenêtre à cheval sur janvier et février, que personne ne reconnaîtrait comme
 * « le mois d'avant ».
 */
export function shiftBucket(bucket: string, granularity: Granularity, delta: number): string {
  if (granularity === 'year') return String(Number(bucket) + delta)
  if (granularity === 'quarter') {
    const [year, quarter] = bucket.split('-T')
    const index = Number(year) * 4 + (Number(quarter) - 1) + delta
    return `${Math.floor(index / 4)}-T${(index % 4) + 1}`
  }
  const [year, month] = bucket.split('-')
  const index = Number(year) * 12 + (Number(month) - 1) + delta
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Dernier jour du mois, années bissextiles comprises. */
function lastDayOf(year: number, month: number): string {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const days = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return pad(days[month - 1]!)
}
