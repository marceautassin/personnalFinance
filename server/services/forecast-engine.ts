import { db } from '~~/server/db/client'
import { desc } from 'drizzle-orm'
import { bankStatements, revenueModels, fixedCharges, monthlyOverrides, debts } from '~~/server/db/schema'
import { nextMonths, monthOf, monthOffset } from '~~/server/utils/period'
import { buildVariableHistory, projectVariableCategories } from './variable-projection'
import { projectDebt } from './debt-projection'
import { currentBalanceForDebt as currentDebtBalance } from '~~/server/utils/debt-balance'
import type { Cents } from '~~/shared/types/money'
import type { FrequencyValue } from '~~/server/db/schema'

/**
 * forecast-engine — projection PURE de trésorerie personnelle mensuelle (FR43/FR46/FR47).
 *
 * `computeForecast` est pure (aucun accès DB, aucun `Date.now()` : mois de départ injecté) → 100%
 * testable + snapshots (NFR18). Le dividende requis (FR48+) est calculé en aval (7.4). Le builder
 * `buildForecastInput` isole l'accès DB.
 */

export interface ForecastRevenue {
  unemploymentBenefitMonthlyCents: Cents
  unemploymentBenefitEndDate: string | null
  sasMonthlyRentCents: Cents
  expenseReimbursementsMonthlyCents: Cents
}

export interface ForecastFixedCharge {
  amountCents: Cents // signé (dépense négative)
  frequency: FrequencyValue
  startDate: string
  endDate: string | null
}

export interface ForecastInput {
  startMonth: string
  startingTreasuryCents: Cents
  revenue: ForecastRevenue
  fixedCharges: ForecastFixedCharge[]
  variableProjections: { categoryCode: string, projectedMonthlyCents: Cents }[]
  overrides: { month: string, categoryCode: string, amountCents: Cents }[]
  /** Sorties de dette par mois, réparties par mode : recurring (monthly) / punctual (lump_sum). */
  debtRecurringByMonth: Map<string, Cents>
  debtPunctualByMonth: Map<string, Cents>
}

export interface ForecastMonth {
  month: string
  incomeCents: Cents
  fixedChargesCents: Cents // signé (≤ 0 en général)
  variableCents: Cents // ≤ 0
  punctualCents: Cents // ≤ 0
  netCents: Cents
  endingBalanceCents: Cents
}

export interface ForecastResult {
  startMonth: string
  horizonMonths: number
  startingTreasuryCents: Cents
  months: ForecastMonth[]
  firstNegativeMonth: string | null
}

/** Revenu du mois : ARE (mois entier si les droits couvrent une partie du mois) + loyer + défraiements. */
function incomeForMonth(revenue: ForecastRevenue, month: string): number {
  let income = revenue.sasMonthlyRentCents + revenue.expenseReimbursementsMonthlyCents
  const end = revenue.unemploymentBenefitEndDate
  if (end && monthOf(end) >= month) income += revenue.unemploymentBenefitMonthlyCents
  return income
}

/** Une charge (non ponctuelle) s'applique-t-elle au mois M selon sa fréquence et sa plage ? */
function recurringChargeApplies(charge: ForecastFixedCharge, month: string): boolean {
  const startM = monthOf(charge.startDate)
  if (month < startM) return false
  if (charge.endDate && month > monthOf(charge.endDate)) return false
  const offset = monthOffset(startM, month)
  switch (charge.frequency) {
    case 'monthly': return true
    case 'quarterly': return offset % 3 === 0
    case 'annual': return offset % 12 === 0
    default: return false // 'punctual' traité séparément
  }
}

/**
 * Projette la trésorerie personnelle sur `horizonMonths` mois à partir de `input.startMonth`.
 * Buckets signés (revenus positifs, dépenses négatives). `firstNegativeMonth` = premier mois à
 * solde de fin négatif (FR47), sinon null.
 */
export function computeForecast(input: ForecastInput, horizonMonths: number): ForecastResult {
  const months = nextMonths(input.startMonth, horizonMonths)

  // Overrides indexés par `mois|catégorie`.
  const overrideByKey = new Map(input.overrides.map(o => [`${o.month}|${o.categoryCode}`, o.amountCents]))
  // Catégories effectivement projetées : un override portant sur une catégorie absente de cet
  // ensemble est « orphelin » et doit malgré tout s'appliquer (cf. boucle ci-dessous).
  const projectedCodes = new Set(input.variableProjections.map(p => p.categoryCode))

  let running = input.startingTreasuryCents as number
  let firstNegativeMonth: string | null = null

  const rows: ForecastMonth[] = months.map((month) => {
    const incomeCents = incomeForMonth(input.revenue, month)

    // Charges fixes récurrentes (+ dette monthly).
    let fixed = input.debtRecurringByMonth.get(month) != null ? -(input.debtRecurringByMonth.get(month) as number) : 0
    for (const charge of input.fixedCharges) {
      if (charge.frequency !== 'punctual' && recurringChargeApplies(charge, month)) fixed += charge.amountCents
    }

    // Variables : override(mois, cat) ?? projection.
    let variable = 0
    for (const proj of input.variableProjections) {
      const overridden = overrideByKey.get(`${month}|${proj.categoryCode}`)
      variable -= overridden ?? proj.projectedMonthlyCents
    }
    // Overrides orphelins : l'override est un levier manuel indépendant (FR44). Sans cette
    // boucle, un override posé alors qu'aucune projection n'existe (historique vide, catégorie
    // jamais rencontrée) serait accepté par l'API puis silencieusement ignoré par le forecast.
    for (const o of input.overrides) {
      if (o.month === month && !projectedCodes.has(o.categoryCode)) variable -= o.amountCents
    }

    // Ponctuelles (+ dette lump_sum).
    let punctual = input.debtPunctualByMonth.get(month) != null ? -(input.debtPunctualByMonth.get(month) as number) : 0
    for (const charge of input.fixedCharges) {
      if (charge.frequency === 'punctual' && monthOf(charge.startDate) === month) punctual += charge.amountCents
    }

    const netCents = incomeCents + fixed + variable + punctual
    running += netCents
    if (running < 0 && firstNegativeMonth === null) firstNegativeMonth = month

    return {
      month,
      incomeCents: incomeCents as Cents,
      fixedChargesCents: fixed as Cents,
      variableCents: variable as Cents,
      punctualCents: punctual as Cents,
      netCents: netCents as Cents,
      endingBalanceCents: running as Cents,
    }
  })

  return {
    startMonth: input.startMonth,
    horizonMonths,
    startingTreasuryCents: input.startingTreasuryCents,
    months: rows,
    firstNegativeMonth,
  }
}

/**
 * Assemble `ForecastInput` depuis la base (accès DB isolé). Solde de départ = dernier relevé
 * ingéré. Dettes projetées via `projectDebt` (6.4), réparties monthly/lump_sum par mode.
 */
export function buildForecastInput(startMonth: string, horizonMonths: number): ForecastInput {
  const lastStatement = db
    .select({ closing: bankStatements.closingBalanceCents })
    .from(bankStatements)
    .orderBy(desc(bankStatements.periodEnd))
    .limit(1)
    .get()
  const startingTreasuryCents = (lastStatement?.closing ?? 0) as Cents

  const revenue = db.select().from(revenueModels).limit(1).get()
  const charges = db.select().from(fixedCharges).all()
  const overrides = db.select().from(monthlyOverrides).all()

  const projections = projectVariableCategories(buildVariableHistory())

  // Dettes → projection mensuelle, répartie par mode.
  const debtRows = db.select().from(debts).all()
  const debtRecurringByMonth = new Map<string, Cents>()
  const debtPunctualByMonth = new Map<string, Cents>()
  for (const d of debtRows) {
    if (d.repaymentMode === 'free') continue
    const series = projectDebt(
      {
        currentBalanceCents: currentDebtBalance(d.id, d.initialBalanceCents) as Cents,
        repaymentMode: d.repaymentMode,
        monthlyAmountCents: d.monthlyAmountCents as Cents | null,
        lumpSumDate: d.lumpSumDate,
      },
      startMonth,
      horizonMonths,
    )
    const target = d.repaymentMode === 'monthly' ? debtRecurringByMonth : debtPunctualByMonth
    for (const o of series) {
      if (o.amountCents === 0) continue
      target.set(o.month, ((target.get(o.month) ?? 0) + o.amountCents) as Cents)
    }
  }

  return {
    startMonth,
    startingTreasuryCents,
    revenue: {
      unemploymentBenefitMonthlyCents: (revenue?.unemploymentBenefitMonthlyCents ?? 0) as Cents,
      unemploymentBenefitEndDate: revenue?.unemploymentBenefitEndDate ?? null,
      sasMonthlyRentCents: (revenue?.sasMonthlyRentCents ?? 0) as Cents,
      expenseReimbursementsMonthlyCents: (revenue?.expenseReimbursementsMonthlyCents ?? 0) as Cents,
    },
    fixedCharges: charges.map(c => ({
      amountCents: c.amountCents as Cents,
      frequency: c.frequency,
      startDate: c.startDate,
      endDate: c.endDate,
    })),
    variableProjections: projections.map(p => ({
      categoryCode: p.categoryCode,
      projectedMonthlyCents: p.projectedMonthlyCents,
    })),
    overrides: overrides.map(o => ({ month: o.month, categoryCode: o.categoryCode, amountCents: o.amountCents as Cents })),
    debtRecurringByMonth,
    debtPunctualByMonth,
  }
}
