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
import { sqliteTable, integer, text, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

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
 *  - debt_id est nullable et SANS FK (choix V1) : la suppression d'une dette délie ses
 *    transactions (debt_id → null, is_debt_repayment → false) dans le handler DELETE.
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
    /**
     * FK `ON DELETE SET NULL` (story 6.7) : l'intégrité ne dépend plus du seul handler de
     * suppression. Elle en dépendait entièrement — choix documenté à l'origine, mais fragile
     * dès qu'un second chemin d'écriture apparaît (epic 10).
     */
    debtId: integer('debt_id').references(() => debts.id, { onDelete: 'set null' }),
    createdAt: integer('created_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  t => ({
    transactionsPeriodIdx: index('transactions_period_idx').on(t.transactionDate),
    transactionsStatementIdx: index('transactions_statement_idx').on(t.statementHash),
    /**
     * `debt_id` et `is_debt_repayment` encodent LE MÊME FAIT. Le calcul de solde filtre sur les
     * deux : une ligne `debt_id = 3, is_debt_repayment = 0` disparaissait silencieusement du
     * solde. Ce n'est pas théorique — le PATCH antérieur à la story 6.3 persistait un `debtId`
     * seul (revue du 2026-09-04).
     *
     * ⚠️ ÉCART ASSUMÉ au CLAUDE.md (« pas d'état dérivé ») : `is_debt_repayment` EST dérivable
     * de `debt_id IS NOT NULL`. Le supprimer serait plus pur, mais il est consommé par
     * **28 fichiers**, très majoritairement des tests d'autres epics (dashboard, réconciliation,
     * statements, charge-suggester, forecast) — 28 fichiers contre une contrainte. Arbitrage
     * rendu le 2026-09-04 : on garde le flag et on rend l'incohérence IMPOSSIBLE, ce qui est
     * l'objectif réel. Ne pas « nettoyer » ce doublon sans repayer ce coût.
     */
    transactionsDebtCoherenceCheck: check(
      'transactions_debt_coherence_check',
      sql`(${t.debtId} IS NULL) = (${t.isDebtRepayment} = 0)`,
    ),
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
 * tax_settings — mode et taux d'imposition des dividendes déclarés par l'utilisateur
 * (FR35-FR36). SINGLETON mono-utilisateur : une seule ligne `id = 1`, seedée au bootstrap
 * (story 5.5).
 *
 * NOTES :
 *  - `dividend_tax_rate_pct` = taux en pourcentage × 100 (entier, évite les floats en DB) :
 *    3000 = 30 % (flat tax PFU). La fonction de calcul (story 7.4) divise par 10 000.
 *    Cohérent avec `sas_config.is_rate_pct` (story 5.4).
 *  - `dividend_tax_mode` : `flat_tax` (PFU 30 %) ou `progressive` (barème IR). Le mode
 *    `progressive` est DÉCLARATIF en V1 (FR36) — le forecast applique le taux `dividend_tax_rate_pct`
 *    quel que soit le mode, aucune simulation IR détaillée.
 */
export const taxSettings = sqliteTable('tax_settings', {
  id: integer('id').primaryKey(),
  dividendTaxRatePct: integer('dividend_tax_rate_pct').notNull().default(3000),
  dividendTaxMode: text('dividend_tax_mode', { enum: ['flat_tax', 'progressive'] })
    .notNull()
    .default('flat_tax'),
  updatedAt: integer('updated_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
}, table => [
  check('tax_settings_mode_check', sql`${table.dividendTaxMode} IN ('flat_tax', 'progressive')`),
])

export type TaxSettingsRow = typeof taxSettings.$inferSelect
export type NewTaxSettingsRow = typeof taxSettings.$inferInsert

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

/**
 * debts — dettes déclarées par l'utilisateur (FR29-FR34, story 6.1).
 *
 * NOTES :
 *  - `initial_balance_cents` NON signé (≥ 0) : montant dû à la création. Garanti par Zod.
 *  - `repayment_mode` : `free` / `monthly` / `lump_sum` (cf. `shared/types/repayment-mode.ts`),
 *    CHECK DB + validation croisée Zod (mode ↔ champs).
 *  - `monthly_amount_cents` (mensualité) requis SEULEMENT en mode `monthly`, sinon null.
 *  - `lump_sum_date` (YYYY-MM-DD) requis SEULEMENT en mode `lump_sum`, sinon null.
 *  - Le SOLDE COURANT n'est PAS stocké : calculé à la demande (initial + Σavances −
 *    Σremboursements) — cf. invariant CLAUDE.md « aucun état dérivé en base ».
 */
export const debts = sqliteTable('debts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  creditor: text('creditor').notNull(),
  initialBalanceCents: integer('initial_balance_cents').notNull(),
  repaymentMode: text('repayment_mode', { enum: ['free', 'monthly', 'lump_sum'] })
    .notNull()
    .default('free'),
  monthlyAmountCents: integer('monthly_amount_cents'),
  lumpSumDate: text('lump_sum_date'),
  createdAt: integer('created_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
}, table => [
  check('debts_mode_check', sql`${table.repaymentMode} IN ('free', 'monthly', 'lump_sum')`),
])

export type DebtRow = typeof debts.$inferSelect
export type NewDebtRow = typeof debts.$inferInsert

/**
 * debt_events — ledger d'événements SIGNÉS d'une dette (FR31, FR66-FR68 ; story 6.5, D16).
 * Remplace `debt_advances`, qui ne portait que des montants positifs.
 *
 *  - `amount_cents` **signé** : > 0 augmente le solde dû (une avance reçue), < 0 le diminue
 *    (un règlement, un ajustement). C'est ce qui rend un solde négatif — une **créance** —
 *    exprimable, condition de FR68 (« solde net créance/dette ») et donc de l'epic 10.
 *  - `kind` : `advance` (avance reçue) | `settlement` (règlement) | `adjustment` (correction).
 *    Purement descriptif — le signe seul porte l'arithmétique.
 *  - `source_transaction_id` : trace optionnelle vers la transaction bancaire à l'origine de
 *    l'événement. Pas de FK : une transaction peut être supprimée avec son relevé sans que
 *    l'historique de la dette devienne faux.
 *  - `debt_id` → cascade : supprimer une dette supprime ses événements.
 *
 * Pourquoi ce modèle (revue du 2026-09-04) : `debt_advances.amount_cents` était `positive()`,
 * donc aucun événement ne pouvait diminuer le solde hors transaction marquée, et
 * `initial_balance_cents` était contraint ≥ 0. Une créance était inexprimable.
 */
export const debtEvents = sqliteTable('debt_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  debtId: integer('debt_id')
    .notNull()
    .references(() => debts.id, { onDelete: 'cascade' }),
  amountCents: integer('amount_cents').notNull(),
  eventDate: text('event_date').notNull(),
  kind: text('kind', { enum: ['advance', 'settlement', 'adjustment'] })
    .notNull()
    .default('advance'),
  sourceTransactionId: integer('source_transaction_id'),
  note: text('note'),
  createdAt: integer('created_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
}, t => ({
  debtEventsDebtIdx: index('debt_events_debt_idx').on(t.debtId),
}))

export type DebtEventRow = typeof debtEvents.$inferSelect
export type NewDebtEventRow = typeof debtEvents.$inferInsert

/**
 * monthly_overrides — valeur manuelle qui outrepasse la projection d'une catégorie variable
 * pour un mois donné (FR44, story 7.2).
 *
 *  - `month` au format `YYYY-MM`.
 *  - `amount_cents` NON signé (≥ 0) : dépense projetée forcée pour ce mois × catégorie.
 *  - UNIQUE(month, category_code) : un seul override par couple (POST = upsert).
 *  - FK `category_code` RESTRICT : la catégorie référencée ne peut être supprimée (cf. 5.6).
 */
export const monthlyOverrides = sqliteTable('monthly_overrides', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  month: text('month').notNull(),
  categoryCode: text('category_code')
    .notNull()
    .references(() => categoryDefinitions.code, { onDelete: 'restrict' }),
  amountCents: integer('amount_cents').notNull(),
  createdAt: integer('created_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
}, t => ({
  monthlyOverridesUnique: uniqueIndex('monthly_overrides_month_cat_idx').on(t.month, t.categoryCode),
  monthlyOverridesAmountPositive: check('monthly_overrides_amount_positive', sql`${t.amountCents} >= 0`),
}))

export type MonthlyOverrideRow = typeof monthlyOverrides.$inferSelect
export type NewMonthlyOverrideRow = typeof monthlyOverrides.$inferInsert
