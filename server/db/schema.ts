/**
 * Schéma Drizzle — personnalFinance
 *
 * CONVENTIONS (non négociables, cf. CLAUDE.md §Naming Patterns) :
 *   - Tables : snake_case PLURIEL (ex: bank_statements, category_items)
 *   - Colonnes : snake_case (ex: amount_cents, period_start)
 *   - Foreign keys : {singular_target}_id (ex: statement_id → bank_statements.id ou .hash_sha256)
 *   - Index : {table}_{cols}_idx (ex: transactions_period_idx)
 *   - Suffixes obligatoires :
 *       * _cents pour tout montant monétaire (typé Cents en TS, integer en SQLite)
 *       * _date pour toute date métier (text YYYY-MM-DD)
 *       * _at pour les timestamps techniques (integer epoch secondes)
 *
 * Migrations VERSIONNÉES depuis le 2026-09-04 (D21) : `yarn db:generate` puis
 * `yarn apply-migration`. Le bootstrap refuse de démarrer sur un schéma périmé.
 */
import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core'
// Import RELATIF et non aliasé : `drizzle-kit generate` charge ce fichier hors du contexte
// Nuxt et ne résout pas `~~/` (MODULE_NOT_FOUND, constaté le 2026-09-05). C'est le seul
// fichier du projet lu par les deux runtimes.
// eslint-disable-next-line no-restricted-imports
import { MOVEMENT_NATURES } from '../../shared/types/movement-nature'

/**
 * category_groups — niveau 1 du référentiel : la RUBRIQUE (D17).
 *
 * Le `code` est la PK : c'est un identifiant métier stable, édité par l'utilisateur, et il
 * compose le code des postes (`<rubrique>-<poste>`, AR4). Un `ORDER BY code` sur les postes
 * les groupe donc naturellement par rubrique.
 */
export const categoryGroups = sqliteTable('category_groups', {
  code: text('code').primaryKey(),
  label: text('label').notNull(),
  position: integer('position').notNull().default(0),
  createdAt: integer('created_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
})

export type CategoryGroupRow = typeof categoryGroups.$inferSelect
export type NewCategoryGroupRow = typeof categoryGroups.$inferInsert

/**
 * category_items — niveau 2 du référentiel : le POSTE (D17).
 *
 * `nature` est portée ICI et nulle part ailleurs. C'est ce qui permet à un même libellé
 * d'exister sous plusieurs rubriques (« Restaurant » sous Alimentation ET sous Voyages)
 * sans ambiguïté, et ce qui rend la correction de nature d'une transaction équivalente à un
 * simple déplacement de poste (FR22).
 *
 * `ON DELETE RESTRICT` sur la rubrique : supprimer une rubrique peuplée est refusé, pas
 * silencieusement cascadé — des postes orphelins emporteraient des transactions.
 */
export const categoryItems = sqliteTable(
  'category_items',
  {
    code: text('code').primaryKey(),
    groupCode: text('group_code')
      .notNull()
      .references(() => categoryGroups.code, { onDelete: 'restrict' }),
    label: text('label').notNull(),
    nature: text('nature', { enum: MOVEMENT_NATURES }).notNull(),
    position: integer('position').notNull().default(0),
    createdAt: integer('created_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  t => ({
    categoryItemsGroupIdx: index('category_items_group_idx').on(t.groupCode),
  }),
)

export type CategoryItemRow = typeof categoryItems.$inferSelect
export type NewCategoryItemRow = typeof categoryItems.$inferInsert

/**
 * Reliabilité d'un mois ingéré.
 * - reliable : la réconciliation auto a passé OU l'utilisateur a ajouté manuellement
 *              les transactions manquantes jusqu'à équilibrer le solde.
 * - unreliable : l'utilisateur a accepté un gap résiduel (cf. Story 3.x). L'analyse
 *                doit le signaler au niveau période (D23).
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
 *    ET pour toute transaction dont l'utilisateur a corrigé le poste. C'est cette seconde
 *    sémantique qui rend le taux de correction mesurable (FR24, jalon ≤ 10 %).
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
    categoryItemCode: text('category_item_code')
      .notNull()
      .references(() => categoryItems.code, { onDelete: 'restrict' }),
    isManual: integer('is_manual', { mode: 'boolean' }).notNull().default(false),
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
