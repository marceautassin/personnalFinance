/**
 * Schéma Drizzle — personnalFinance
 *
 * CONVENTIONS (non négociables, cf. CLAUDE.md §Naming Patterns) :
 *   - Tables : snake_case PLURIEL (ex: bank_statements, fixed_charges)
 *   - Colonnes : snake_case (ex: amount_cents, period_start)
 *   - Foreign keys : {singular_target}_id (ex: statement_id → bank_statements.id ou .hash_sha256)
 *   - Index : {table}_{cols}_idx (ex: transactions_period_idx)
 *   - Suffixes obligatoires :
 *       * _cents pour tout montant monétaire (typé Cents en TS, integer en SQLite)
 *       * _date pour toute date métier (text YYYY-MM-DD)
 *       * _at pour les timestamps techniques (integer epoch secondes)
 *
 * V1 : drizzle-kit push (pas de migrations versionnées). Bascule possible vers
 * drizzle-kit generate + apply-migration plus tard sans changement de schéma.
 */
import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core'

/**
 * Référentiel des catégories de transaction (seedé par bootstrap, FR16).
 * is_variable distingue les catégories projetées par moyenne mobile (variable_projection)
 * de celles déclarées explicitement (fixed_charges).
 */
export const categoryDefinitions = sqliteTable('category_definitions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  label: text('label').notNull(),
  isVariable: integer('is_variable', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
})

export type CategoryDefinition = typeof categoryDefinitions.$inferSelect
export type NewCategoryDefinition = typeof categoryDefinitions.$inferInsert

/**
 * Reliabilité d'un mois ingéré.
 * - reliable : la réconciliation auto a passé OU l'utilisateur a ajouté manuellement
 *              les transactions manquantes jusqu'à équilibrer le solde.
 * - unreliable : l'utilisateur a accepté un gap résiduel (cf. Story 3.x). Le forecast
 *                doit le signaler.
 */
export const RELIABILITY_VALUES = ['reliable', 'unreliable'] as const
export type ReliabilityValue = typeof RELIABILITY_VALUES[number]

/**
 * bank_statements — un PDF de relevé bancaire ingéré.
 * Le hash SHA-256 du PDF EST la PK : idempotence par contenu (FR2, D3).
 */
export const bankStatements = sqliteTable('bank_statements', {
  hashSha256: text('hash_sha256').primaryKey(),
  periodStart: text('period_start').notNull(),
  periodEnd: text('period_end').notNull(),
  openingBalanceCents: integer('opening_balance_cents').notNull(),
  closingBalanceCents: integer('closing_balance_cents').notNull(),
  reliability: text('reliability', { enum: RELIABILITY_VALUES }).notNull().default('reliable'),
  ingestedAt: integer('ingested_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
})

export type BankStatement = typeof bankStatements.$inferSelect
export type NewBankStatement = typeof bankStatements.$inferInsert

/**
 * transactions — opérations extraites d'un relevé OU saisies manuellement (réconciliation).
 *
 * NOTES :
 *  - amount_cents est SIGNÉ : négatif pour les sorties, positif pour les entrées.
 *  - is_manual = true pour les transactions ajoutées en réconciliation manuelle (Story 3.x)
 *    OU créées en marquage "remboursement dette" (Story 6.x).
 *  - debt_id est nullable et SANS FK en V1 (la table debts n'existe pas encore).
 *    La FK sera ajoutée en Story 6.1 via une migration.
 */
export const transactions = sqliteTable(
  'transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    statementHash: text('statement_hash')
      .notNull()
      .references(() => bankStatements.hashSha256, { onDelete: 'cascade' }),
    transactionDate: text('transaction_date').notNull(),
    label: text('label').notNull(),
    amountCents: integer('amount_cents').notNull(),
    categoryCode: text('category_code')
      .notNull()
      .references(() => categoryDefinitions.code, { onDelete: 'restrict' }),
    isManual: integer('is_manual', { mode: 'boolean' }).notNull().default(false),
    isDebtRepayment: integer('is_debt_repayment', { mode: 'boolean' }).notNull().default(false),
    debtId: integer('debt_id'),
    createdAt: integer('created_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  t => ({
    transactionsPeriodIdx: index('transactions_period_idx').on(t.transactionDate),
    transactionsStatementIdx: index('transactions_statement_idx').on(t.statementHash),
  }),
)

export type TransactionRow = typeof transactions.$inferSelect
export type NewTransactionRow = typeof transactions.$inferInsert

/**
 * Fréquences d'une charge fixe. La sémantique de projection vit dans forecast-engine.ts
 * (Story 7.3) — ici on déclare seulement. `punctual` = une seule occurrence au mois de
 * `start_date` (`end_date` ignoré).
 */
export const FREQUENCY_VALUES = ['monthly', 'quarterly', 'annual', 'punctual'] as const
export type FrequencyValue = typeof FREQUENCY_VALUES[number]

/**
 * fixed_charges — charges récurrentes (ou ponctuelles) déclarées par l'utilisateur (FR16).
 *
 * NOTES :
 *  - amount_cents est SIGNÉ comme transactions.amount_cents : négatif = dépense,
 *    positif = revenu récurrent. On ne bride pas le sens (cf. Dev Notes story 5.1).
 *  - end_date nullable : une charge sans fin court indéfiniment ; une charge dont
 *    end_date est passée reste en base (historique) mais le forecast l'ignore.
 */
export const fixedCharges = sqliteTable(
  'fixed_charges',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    label: text('label').notNull(),
    amountCents: integer('amount_cents').notNull(),
    categoryCode: text('category_code')
      .notNull()
      .references(() => categoryDefinitions.code, { onDelete: 'restrict' }),
    frequency: text('frequency', { enum: FREQUENCY_VALUES }).notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date'),
    createdAt: integer('created_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  t => ({
    fixedChargesCategoryIdx: index('fixed_charges_category_idx').on(t.categoryCode),
  }),
)

export type FixedChargeRow = typeof fixedCharges.$inferSelect
export type NewFixedChargeRow = typeof fixedCharges.$inferInsert

/**
 * revenue_models — sources de revenus récurrentes déclarées par l'utilisateur (FR19-FR22).
 *
 * SINGLETON mono-utilisateur : une seule ligne `id = 1`, seedée au bootstrap (story 1.5
 * étendue). Pas de logique "current row" — V1 mono-user, pas d'auth. Si V2 multi-user :
 * ajouter `user_id` FK + index unique.
 *
 * NOTES :
 *  - Tous les montants sont des revenus → NON signés (≥ 0, garanti par le schéma Zod).
 *  - `unemployment_benefit_end_date` nullable : fin estimée des droits ARE. Une date
 *    passée acte "droits épuisés" — le forecast (story 7.x) l'intègre tel quel.
 *  - `expense_reimbursements_monthly_cents` : défraiements NON imposables (FR22). Le flag
 *    "non imposable" est implicite (sémantique figée par champ), pas une colonne.
 */
export const revenueModels = sqliteTable('revenue_models', {
  id: integer('id').primaryKey(),
  unemploymentBenefitMonthlyCents: integer('unemployment_benefit_monthly_cents').notNull().default(0),
  unemploymentBenefitEndDate: text('unemployment_benefit_end_date'),
  sasMonthlyRentCents: integer('sas_monthly_rent_cents').notNull().default(0),
  expenseReimbursementsMonthlyCents: integer('expense_reimbursements_monthly_cents').notNull().default(0),
  updatedAt: integer('updated_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
})

export type RevenueModelRow = typeof revenueModels.$inferSelect
export type NewRevenueModelRow = typeof revenueModels.$inferInsert

/**
 * sas_config — données fiscales de la SAS déclarées par l'utilisateur (FR23-FR28).
 *
 * SINGLETON mono-utilisateur : une seule ligne `id = 1`, seedée au bootstrap (story 5.4).
 *
 * NOTES :
 *  - `fiscal_year_end_date` au format `MM-DD` (sans année — clôture récurrente). Le forecast
 *    (story 7.x) le résout en `YYYY-MM-DD` selon l'année courante. Défaut `12-31`.
 *  - `is_rate_pct` = taux IS en pourcentage × 100 (entier, évite les floats en DB) :
 *    1500 = 15 %, 2500 = 25 %. La fonction de calcul divise par 10 000. Cohérent avec
 *    `tax_settings.*_pct` (story 5.5). L'utilisateur saisit son taux EFFECTIF (pas de
 *    gestion auto du seuil réduit 42 500 € en V1).
 *  - Montants NON signés (CA, charges, trésorerie ≥ 0, garanti par le schéma Zod).
 */
export const sasConfig = sqliteTable('sas_config', {
  id: integer('id').primaryKey(),
  fiscalYearEndDate: text('fiscal_year_end_date').notNull().default('12-31'),
  revenueForecastCents: integer('revenue_forecast_cents').notNull().default(0),
  expensesForecastCents: integer('expenses_forecast_cents').notNull().default(0),
  currentTreasuryCents: integer('current_treasury_cents').notNull().default(0),
  isRatePct: integer('is_rate_pct').notNull().default(1500),
  updatedAt: integer('updated_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
})

export type SasConfigRow = typeof sasConfig.$inferSelect
export type NewSasConfigRow = typeof sasConfig.$inferInsert

/**
 * dismissed_suggestions — libellés normalisés de suggestions de charges récurrentes
 * rejetées par l'utilisateur (Story 5.2). `charge-suggester` exclut ces labels.
 * Insert idempotent (UNIQUE) ; pas de soft-delete.
 */
export const dismissedSuggestions = sqliteTable('dismissed_suggestions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  normalizedLabel: text('normalized_label').notNull().unique(),
  createdAt: integer('created_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
})

export type DismissedSuggestionRow = typeof dismissedSuggestions.$inferSelect
export type NewDismissedSuggestionRow = typeof dismissedSuggestions.$inferInsert
