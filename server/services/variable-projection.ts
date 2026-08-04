import { sql } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { transactions, categoryDefinitions } from '~~/server/db/schema'
import type { Cents } from '~~/shared/types/money'

/**
 * variable-projection — moyenne mobile des dépenses variables par catégorie (FR41/FR45).
 *
 * `projectVariableCategories` est PURE (aucun accès DB, aucun `Date.now()`) → 100% testable
 * (NFR18). `buildVariableHistory` isole l'accès DB (agrégation + alignement + fenêtre) pour que
 * la moyenne reste reproductible. `forecast-engine` (7.3) enchaîne les deux.
 */

/** Fenêtre par défaut de la moyenne mobile (FR41, N mois). */
export const DEFAULT_PROJECTION_WINDOW_MONTHS = 3

export interface VariableCategoryHistory {
  categoryCode: string
  /** Totaux mensuels chronologiques (ancien → récent), un par mois ingéré. 0 autorisé. */
  monthlyTotalsCents: Cents[]
}

export interface VariableProjectionResult {
  categoryCode: string
  /** Dépense mensuelle projetée = moyenne (arrondie) des `monthsUsed` derniers mois. */
  projectedMonthlyCents: Cents
  /** Nombre de mois effectivement moyennés (≤ fenêtre). */
  monthsUsed: number
  /** false si moins de `windowMonths` mois d'historique (FR45 — fiabilité réduite). */
  sufficientHistory: boolean
}

/**
 * Projette chaque catégorie variable par moyenne mobile sur les `windowMonths` derniers mois.
 * Historique vide → 0 (pas de division par zéro). Moins de `windowMonths` mois →
 * `sufficientHistory = false`. Arrondi au centime le plus proche.
 */
export function projectVariableCategories(
  inputs: VariableCategoryHistory[],
  windowMonths: number = DEFAULT_PROJECTION_WINDOW_MONTHS,
): VariableProjectionResult[] {
  return inputs.map(({ categoryCode, monthlyTotalsCents }) => {
    const window = monthlyTotalsCents.slice(-windowMonths)
    const monthsUsed = window.length
    const projectedMonthlyCents = (
      monthsUsed === 0
        ? 0
        : Math.round(window.reduce((sum, c) => sum + c, 0) / monthsUsed)
    ) as Cents
    return {
      categoryCode,
      projectedMonthlyCents,
      monthsUsed,
      sufficientHistory: monthlyTotalsCents.length >= windowMonths,
    }
  })
}

/**
 * Construit l'historique par catégorie VARIABLE depuis la DB : aligné sur les mois ingérés
 * (distinct `YYYY-MM` de `transaction_date`, triés), 0-fill des mois sans dépense, borné aux
 * `windowMonths` derniers mois. Total mensuel = `max(0, −Σ amount_cents)` (nette les avoirs).
 */
export function buildVariableHistory(
  windowMonths: number = DEFAULT_PROJECTION_WINDOW_MONTHS,
): VariableCategoryHistory[] {
  // Mois ingérés (tous), triés, puis borne aux `windowMonths` derniers.
  const monthRows = db
    .select({ month: sql<string>`strftime('%Y-%m', ${transactions.transactionDate})` })
    .from(transactions)
    .groupBy(sql`strftime('%Y-%m', ${transactions.transactionDate})`)
    .orderBy(sql`strftime('%Y-%m', ${transactions.transactionDate})`)
    .all()
  const months = monthRows.map(r => r.month).slice(-windowMonths)
  if (months.length === 0) return []

  // Catégories variables uniquement.
  const variableCats = db
    .select({ code: categoryDefinitions.code })
    .from(categoryDefinitions)
    .where(sql`${categoryDefinitions.isVariable} = 1`)
    .all()
    .map(c => c.code)
  if (variableCats.length === 0) return []

  // Total net de dépense par (catégorie, mois) : max(0, −Σ amount_cents).
  const totals = db
    .select({
      code: transactions.categoryCode,
      month: sql<string>`strftime('%Y-%m', ${transactions.transactionDate})`,
      net: sql<number>`max(0, -sum(${transactions.amountCents}))`,
    })
    .from(transactions)
    .groupBy(transactions.categoryCode, sql`strftime('%Y-%m', ${transactions.transactionDate})`)
    .all()
  const byKey = new Map(totals.map(t => [`${t.code}|${t.month}`, Number(t.net)]))

  return variableCats.map(code => ({
    categoryCode: code,
    monthlyTotalsCents: months.map(m => (byKey.get(`${code}|${m}`) ?? 0) as Cents),
  }))
}
