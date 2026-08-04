import { defineEventHandler } from 'h3'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { sasConfig, taxSettings, revenueModels, transactions } from '~~/server/db/schema'
import { validateQuery } from '~~/server/utils/validation'
import { resolveNextAgMonth, monthOf } from '~~/server/utils/period'
import { buildForecastInput, computeForecast, type ForecastResult } from '~~/server/services/forecast-engine'
import { computeRequiredDividend, type RequiredDividend } from '~~/server/services/dividend-calculator'
import { DEFAULT_PROJECTION_WINDOW_MONTHS } from '~~/server/services/variable-projection'
import { computeDividendCapacity, type DividendCapacity } from '~~/shared/services/dividend-capacity'
import type { Cents } from '~~/shared/types/money'

const ForecastQuerySchema = z.object({
  horizon: z.coerce.number().int().refine(h => h === 6 || h === 12 || h === 24, 'horizon ∈ {6,12,24}').default(12),
})

/** Leviers d'ajustement (FR51) — codes, libellés FR en UI (7.7). */
const ADJUSTMENT_LEVERS = ['reduce_expenses', 'increase_revenue', 'defer_objectives'] as const

export interface ForecastResponse {
  horizonMonths: number
  startMonth: string
  forecast: ForecastResult
  dividend: RequiredDividend
  capacity: DividendCapacity
  agMonth: string
  warnings: { areOverlap: boolean, areEndMonth: string | null }
  levers: string[]
  reducedReliability: boolean
}

/** Mois courant serveur `YYYY-MM` (ancre ; le calcul reste pur). */
function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Forecast inverse assemblé (FR46-53), calculé à la demande (D9, non stocké). Orchestre
 * forecast-engine (7.3) + dividend-calculator (7.4) + capacité SAS (5.4) + taux (5.5) + AG/ARE.
 */
export default defineEventHandler(async (event): Promise<ForecastResponse> => {
  const { horizon } = validateQuery(event, ForecastQuerySchema)
  const startMonth = currentMonth()

  // Forecast de trésorerie (7.3).
  const forecast = computeForecast(buildForecastInput(startMonth, horizon), horizon)

  // Capacité dividendable (5.4) + taux (5.5) → dividende requis (7.4).
  const sas = db.select().from(sasConfig).limit(1).get()
  const capacity = computeDividendCapacity({
    revenueForecastCents: (sas?.revenueForecastCents ?? 0) as Cents,
    expensesForecastCents: (sas?.expensesForecastCents ?? 0) as Cents,
    currentTreasuryCents: (sas?.currentTreasuryCents ?? 0) as Cents,
    isRatePct: sas?.isRatePct ?? 0,
  })
  const tax = db.select().from(taxSettings).limit(1).get()
  const dividend = computeRequiredDividend(forecast, {
    dividendTaxRatePct: tax?.dividendTaxRatePct ?? 0,
    capacityGrossCents: capacity.dividendableCapacityCents,
  })

  // AG (FR52) + alerte ARE.
  const agMonth = resolveNextAgMonth(startMonth, sas?.fiscalYearEndDate ?? '12-31')
  const revenue = db.select().from(revenueModels).limit(1).get()
  const areEndMonth = revenue?.unemploymentBenefitEndDate ? monthOf(revenue.unemploymentBenefitEndDate) : null
  const areOverlap = dividend.requiredNetCents > 0 && areEndMonth !== null && agMonth <= areEndMonth

  // Leviers (FR51).
  const levers = dividend.fitsCapacity ? [] : [...ADJUSTMENT_LEVERS]

  // Fiabilité (FR45) : mois ingérés < N.
  const monthCount = db
    .select({ n: sql<number>`count(distinct strftime('%Y-%m', ${transactions.transactionDate}))` })
    .from(transactions)
    .get()
  const reducedReliability = Number(monthCount?.n ?? 0) < DEFAULT_PROJECTION_WINDOW_MONTHS

  return {
    horizonMonths: horizon,
    startMonth,
    forecast,
    dividend,
    capacity,
    agMonth,
    warnings: { areOverlap, areEndMonth },
    levers,
    reducedReliability,
  }
})
