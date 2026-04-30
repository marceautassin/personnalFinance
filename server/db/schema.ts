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

export type Transaction = typeof transactions.$inferSelect
export type NewTransaction = typeof transactions.$inferInsert
