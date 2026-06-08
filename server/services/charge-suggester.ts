/**
 * charge-suggester — détection HEURISTIQUE (zéro LLM, déterministe) de charges
 * récurrentes à partir de l'historique `transactions` (FR17-FR18, Story 5.2).
 *
 * Boundaries (CLAUDE.md) : ce service LIT `transactions`, `fixed_charges`,
 * `dismissed_suggestions` via le `db` injecté et ne mute jamais. Aucun appel
 * `@anthropic-ai/sdk` (confiné à llm-categorizer.ts).
 */
import { type Cents, cents } from '~~/shared/types/money'
import { transactions, fixedCharges, dismissedSuggestions } from '~~/server/db/schema'
import type { DB } from '~~/server/db/client'

export interface Suggestion {
  normalizedLabel: string
  sampleLabel: string
  averageAmountCents: Cents
  occurrences: number
  suggestedFrequency: 'monthly' | 'quarterly' | 'annual'
  categoryCode: string
  transactionIds: number[]
  /** `YYYY-MM-01` du mois de la 1ère occurrence — sert de `start_date` à l'acceptation (AC#8). */
  startDate: string
}

interface TxLite {
  id: number
  transactionDate: string
  label: string
  amountCents: number
  categoryCode: string
}

/**
 * Mots non discriminants retirés avant groupement : codes devise, préfixes de moyen
 * de paiement Boursorama et descripteurs génériques. Sans cette liste il faudrait
 * abaisser le seuil de longueur sous 4, ce qui ferait fusionner des marques distinctes
 * de 3 lettres (EDF, SFR, AXA, MMA…) sous une même clé — un bug de sur-fusion.
 */
const STOP_WORDS = new Set([
  'eur', 'usd', 'gbp', 'chf',
  'prlv', 'vir', 'paiement', 'carte', 'achat', 'facture',
  'sub', 'abo',
])

/**
 * Canonise un libellé brut pour le groupement.
 * lowercase → strip accents → strip chiffres/montants/dates/séparateurs → garde les mots
 * de ≥ 3 lettres hors `STOP_WORDS` → collapse espaces.
 *
 * Seuil ≥ 3 (et non ≥ 4) pour préserver les marques de 3 lettres ; les mots génériques
 * type `EUR`/`Sub`/`PRLV` sont retirés explicitement via `STOP_WORDS` plutôt que par leur
 * longueur. V1 KISS : normalisation volontairement imparfaite (Modifier/Rejeter dispo).
 */
export function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[\d.,€\s\-_]+/gu, ' ')
    .split(' ')
    .filter(word => word.length >= 3 && !STOP_WORDS.has(word))
    .join(' ')
    .trim()
}

/** Index de mois absolu (year*12+month) à partir d'un `YYYY-MM-DD`. */
function monthIndex(isoDate: string): number {
  const [y, m] = isoDate.split('-')
  return Number(y) * 12 + (Number(m) - 1)
}

/** `YYYY-MM` d'une date `YYYY-MM-DD`. */
function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7)
}

/** Reconvertit un index de mois absolu en `YYYY-MM-01`. */
function monthIndexToStartDate(idx: number): string {
  const year = Math.floor(idx / 12)
  const month = (idx % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}-01`
}

/** Élément le plus fréquent d'une liste ; égalité départagée par ordre alphabétique (stabilité). */
function modeWithAlphaTiebreak(values: string[]): string {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best = ''
  let bestCount = -1
  for (const [value, count] of counts) {
    if (count > bestCount || (count === bestCount && value < best)) {
      best = value
      bestCount = count
    }
  }
  return best
}

/** Y a-t-il un run d'au moins 3 mois calendaires consécutifs dans l'ensemble fourni ? */
function hasThreeConsecutiveMonths(sortedMonthIdx: number[]): boolean {
  let run = 1
  for (let i = 1; i < sortedMonthIdx.length; i++) {
    run = sortedMonthIdx[i]! === sortedMonthIdx[i - 1]! + 1 ? run + 1 : 1
    if (run >= 3) return true
  }
  return false
}

/** Amplitude relative (max-min)/|moyenne| des montants. Retourne Infinity si moyenne nulle. */
function amplitudeRatio(amounts: number[]): number {
  const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length
  if (mean === 0) return Number.POSITIVE_INFINITY
  return (Math.max(...amounts) - Math.min(...amounts)) / Math.abs(mean)
}

function inferFrequency(distinctMonthIdx: number[]): Suggestion['suggestedFrequency'] {
  const occurrences = distinctMonthIdx.length
  if (occurrences < 2) return 'monthly'
  // Écart moyen entre deux occurrences consécutives = (dernier - premier) / (n - 1).
  // L'ancienne formule span/occurrences sous-estimait l'intervalle (ex: [0,12] → 6.5
  // au lieu de 12), rendant la branche 'annual' inatteignable.
  const avgGap = (distinctMonthIdx[occurrences - 1]! - distinctMonthIdx[0]!) / (occurrences - 1)
  if (avgGap <= 1.5) return 'monthly'
  if (avgGap <= 4.5) return 'quarterly'
  if (avgGap >= 10) return 'annual'
  return 'monthly'
}

/**
 * Calcule les suggestions de charges récurrentes.
 * Exclut les libellés déjà déclarés en `fixed_charges` (AC#5) ou rejetés (AC#4).
 * Trié par `occurrences` desc puis `|averageAmountCents|` desc (AC#6).
 */
export async function suggestRecurringCharges(db: DB): Promise<Suggestion[]> {
  const txns = (await db
    .select({
      id: transactions.id,
      transactionDate: transactions.transactionDate,
      label: transactions.label,
      amountCents: transactions.amountCents,
      categoryCode: transactions.categoryCode,
    })
    .from(transactions)) as TxLite[]

  if (txns.length === 0) return []

  // Exclusions : libellés déjà en fixed_charges (re-normalisés) + rejetés.
  const existingCharges = await db.select({ label: fixedCharges.label }).from(fixedCharges)
  const dismissed = await db
    .select({ normalizedLabel: dismissedSuggestions.normalizedLabel })
    .from(dismissedSuggestions)
  const excluded = new Set<string>([
    ...existingCharges.map(c => normalizeLabel(c.label)),
    ...dismissed.map(d => d.normalizedLabel),
  ])

  // Les 3 derniers mois ingérés (tous confondus) — heuristique "récurrence active".
  const allMonths = [...new Set(txns.map(t => monthKey(t.transactionDate)))].sort()
  const last3Ingested = new Set(allMonths.slice(-3))

  // Groupement par libellé normalisé non vide.
  const groups = new Map<string, TxLite[]>()
  for (const tx of txns) {
    const key = normalizeLabel(tx.label)
    if (key.length === 0 || excluded.has(key)) continue
    const bucket = groups.get(key)
    if (bucket) bucket.push(tx)
    else groups.set(key, [tx])
  }

  const suggestions: Suggestion[] = []
  for (const [normalizedLabel, group] of groups) {
    const monthKeys = [...new Set(group.map(t => monthKey(t.transactionDate)))]
    const distinctMonthIdx = [...new Set(group.map(t => monthIndex(t.transactionDate)))].sort((a, b) => a - b)
    const amounts = group.map(t => t.amountCents)

    const activeRecurrence
      = distinctMonthIdx.length >= 3 && [...last3Ingested].every(m => monthKeys.includes(m))
    const stableConsecutive
      = hasThreeConsecutiveMonths(distinctMonthIdx) && amplitudeRatio(amounts) <= 0.15
    // Récurrence annuelle (AC#34) : ≥ 2 occurrences sur ≥ 2 années, espacées d'~12 mois.
    const distinctYears = new Set(group.map(t => t.transactionDate.slice(0, 4))).size
    const annualRecurrence
      = distinctMonthIdx.length >= 2 && distinctYears >= 2
        && (distinctMonthIdx[distinctMonthIdx.length - 1]! - distinctMonthIdx[0]!) / (distinctMonthIdx.length - 1) >= 10

    if (!activeRecurrence && !stableConsecutive && !annualRecurrence) continue

    const rawSum = amounts.reduce((a, b) => a + b, 0)
    const averageAmountCents = cents(rawSum / amounts.length)
    // Groupe dégénéré (ex: un débit et son remboursement de même libellé) → moyenne
    // nulle : non représentable en charge fixe (POST refuse amount=0). On l'écarte.
    if (averageAmountCents === 0) continue

    suggestions.push({
      normalizedLabel,
      sampleLabel: modeWithAlphaTiebreak(group.map(t => t.label)),
      averageAmountCents,
      occurrences: distinctMonthIdx.length,
      suggestedFrequency: inferFrequency(distinctMonthIdx),
      categoryCode: modeWithAlphaTiebreak(group.map(t => t.categoryCode)),
      transactionIds: group.map(t => t.id).sort((a, b) => a - b),
      startDate: monthIndexToStartDate(distinctMonthIdx[0]!),
    })
  }

  suggestions.sort(
    (a, b) =>
      b.occurrences - a.occurrences
      || Math.abs(b.averageAmountCents) - Math.abs(a.averageAmountCents),
  )
  return suggestions
}
