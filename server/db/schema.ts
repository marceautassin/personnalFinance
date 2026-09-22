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
import { sqliteTable, integer, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
// Import RELATIF et non aliasé : `drizzle-kit generate` charge ce fichier hors du contexte
// Nuxt et ne résout pas `~~/` (MODULE_NOT_FOUND, constaté le 2026-09-05). C'est le seul
// fichier du projet lu par les deux runtimes.
// eslint-disable-next-line no-restricted-imports
import { MOVEMENT_NATURES } from '../../shared/types/movement-nature'
// eslint-disable-next-line no-restricted-imports
import { BANKS } from '../../shared/types/bank'

/**
 * profiles — le PROPRIÉTAIRE de chaque donnée possédée (D37, story 27.1).
 *
 * Migration 0010 sème inconditionnellement le profil `marceau` — sur une base neuve comme sur
 * une base existante — pour que tout ce qui a déjà été construit se rattache à quelqu'un.
 * `default_bank` porte la banque proposée par défaut à l'ingestion pour ce profil ; la banque
 * RÉELLE d'un relevé donné est portée par `bank_statements.bank` (D40), pas ici.
 */
export const profiles = sqliteTable('profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  defaultBank: text('default_bank', { enum: BANKS }).notNull(),
  createdAt: integer('created_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
})

export type ProfileRow = typeof profiles.$inferSelect
export type NewProfileRow = typeof profiles.$inferInsert

/**
 * category_groups — niveau 1 du référentiel : la RUBRIQUE (D17), désormais possédée par un
 * profil (D37).
 *
 * `code` reste l'identifiant métier stable, édité par l'utilisateur, qui compose le code des
 * postes (`<rubrique>-<poste>`, AR4) — mais ce n'est plus la PK : deux profils doivent pouvoir
 * porter chacun une rubrique `alimentation` sans collision. La clé de substitution `id` est
 * entière, et `(profile_id, code)` porte l'unicité métier (AC 4).
 */
export const categoryGroups = sqliteTable(
  'category_groups',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    profileId: integer('profile_id')
      .notNull()
      .references(() => profiles.id),
    code: text('code').notNull(),
    label: text('label').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: integer('created_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  t => ({
    categoryGroupsProfileCodeIdx: uniqueIndex('category_groups_profile_code_idx').on(t.profileId, t.code),
  }),
)

export type CategoryGroupRow = typeof categoryGroups.$inferSelect
export type NewCategoryGroupRow = typeof categoryGroups.$inferInsert

/**
 * category_items — niveau 2 du référentiel : le POSTE (D17), désormais possédé par un profil
 * (D37).
 *
 * `nature` est portée ICI et nulle part ailleurs. C'est ce qui permet à un même libellé
 * d'exister sous plusieurs rubriques (« Restaurant » sous Alimentation ET sous Voyages)
 * sans ambiguïté, et ce qui rend la correction de nature d'une transaction équivalente à un
 * simple déplacement de poste (FR22).
 *
 * `group_id` référence la rubrique par sa clé de substitution — `group_code` n'existe plus,
 * un code de rubrique n'étant unique que DANS un profil. `ON DELETE RESTRICT` : supprimer une
 * rubrique peuplée est refusé, pas silencieusement cascadé — des postes orphelins
 * emporteraient des transactions.
 */
export const categoryItems = sqliteTable(
  'category_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    profileId: integer('profile_id')
      .notNull()
      .references(() => profiles.id),
    code: text('code').notNull(),
    groupId: integer('group_id')
      .notNull()
      .references(() => categoryGroups.id, { onDelete: 'restrict' }),
    label: text('label').notNull(),
    nature: text('nature', { enum: MOVEMENT_NATURES }).notNull(),
    position: integer('position').notNull().default(0),
    createdAt: integer('created_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  t => ({
    categoryItemsProfileCodeIdx: uniqueIndex('category_items_profile_code_idx').on(t.profileId, t.code),
    categoryItemsGroupIdx: index('category_items_group_idx').on(t.groupId),
  }),
)

export type CategoryItemRow = typeof categoryItems.$inferSelect
export type NewCategoryItemRow = typeof categoryItems.$inferInsert

/**
 * bank_statements — un PDF de relevé bancaire ingéré, possédé par un profil (D37) et portant
 * sa banque d'origine (D40, AR37).
 *
 * Le hash SHA-256 du PDF EST TOUJOURS la PK : idempotence par contenu (FR2, D3). Arbitrage du
 * 2026-09-22 (D37) : passer à une PK entière n'apportait rien ici, `hash_sha256` n'étant
 * référencé que par `transactions.statement_hash`, déjà textuel.
 */
export const bankStatements = sqliteTable('bank_statements', {
  hashSha256: text('hash_sha256').primaryKey(),
  profileId: integer('profile_id')
    .notNull()
    .references(() => profiles.id),
  bank: text('bank', { enum: BANKS }).notNull(),
  periodStart: text('period_start').notNull(),
  periodEnd: text('period_end').notNull(),
  openingBalanceCents: integer('opening_balance_cents').notNull(),
  closingBalanceCents: integer('closing_balance_cents').notNull(),
  /**
   * L'utilisateur a examiné l'écart de ce relevé et l'a assumé.
   *
   * Seule la DÉCISION est stockée ; l'écart lui-même est recalculé depuis les transactions
   * (cf. `shared/types/statement-reliability.ts`). Le champ `reliability` d'origine
   * confondait les deux, et deux relevés portant 2 187 € et 1 764 € d'écart s'affichaient
   * « fiables » parce que personne n'avait encore rien accepté.
   */
  gapAccepted: integer('gap_accepted', { mode: 'boolean' }).notNull().default(false),
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
 *  - AUCUNE colonne de profil ICI (AC 5, D37) : une transaction appartient au profil de son
 *    relevé, atteint par jointure sur `statement_hash`.
 *  - `category_item_id` référence le poste par sa clé de substitution — `category_item_code`
 *    n'existe plus, un code de poste n'étant unique que DANS un profil.
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
    categoryItemId: integer('category_item_id')
      .notNull()
      .references(() => categoryItems.id, { onDelete: 'restrict' }),
    isManual: integer('is_manual', { mode: 'boolean' }).notNull().default(false),
    /**
     * Groupe de réconciliation auquel la ligne appartient (epic 19), ou `null`.
     *
     * ⚠️ **Aucune action `ON DELETE` n'est déclarée, et c'est délibéré.** `ALTER TABLE` de
     * SQLite ne sait pas porter d'action de clé étrangère : la migration 0007, qui ajoute cette
     * colonne à une table existante, produit une contrainte nue. Le rebuild de la migration
     * 0010 recrée `transactions` de zéro (`CREATE TABLE`, pas `ALTER TABLE`) : il PEUT porter
     * l'action, mais on la garde nue pour ne pas déclarer une garantie qu'aucun test ne défend
     * — c'est `DELETE /api/settlements/:id` qui continue de LIBÉRER explicitement les lignes
     * avant de supprimer le groupe, dans la même transaction.
     *
     * Une transaction est un fait bancaire ; un groupe n'est qu'une lecture qu'on en fait, et
     * défaire la lecture ne défait pas le fait.
     */
    settlementGroupId: integer('settlement_group_id')
      .references(() => settlementGroups.id),
    createdAt: integer('created_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  t => ({
    transactionsPeriodIdx: index('transactions_period_idx').on(t.transactionDate),
    transactionsStatementIdx: index('transactions_statement_idx').on(t.statementHash),
    // Story 17.8 : porte le filtre par poste, le dépliage d'une rubrique et la vérification
    // de clé étrangère avant suppression d'un poste. Sans lui, chacune scannait la table.
    transactionsItemIdx: index('transactions_item_idx').on(t.categoryItemId),
    transactionsSettlementIdx: index('transactions_settlement_idx').on(t.settlementGroupId),
  }),
)

export type TransactionRow = typeof transactions.$inferSelect
export type NewTransactionRow = typeof transactions.$inferInsert

/**
 * classification_rules — règles de classement déterministes, écrites par l'utilisateur,
 * possédées par un profil (D37).
 *
 * Une règle dit : « tout libellé contenant ce motif va dans ce poste ». Elle s'applique APRÈS
 * le modèle et l'écrase.
 *
 * **Pourquoi une règle plutôt qu'un meilleur prompt.** Les libellés bancaires sont très
 * répétitifs : `VIR INST SOCIETEX` revient quatre fois en deux mois, donc une cinquantaine sur
 * deux ans. Le modèle, lui, n'a aucun moyen de savoir que SOCIETEX est la SASU de l'utilisateur —
 * et sur ces quatre occurrences identiques il en avait classé trois en repli et une ailleurs
 * (constaté le 2026-09-05). Une règle écrite une fois règle les cinquante, sans token et sans
 * hasard. C'est la même logique que la lecture des colonnes Débit/Crédit : retirer une
 * décision au modèle plutôt que mieux la lui suggérer.
 *
 * `is_manual` reste FAUX sur une transaction classée par règle : la règle est un automatisme,
 * pas une reprise à la main. Le taux de correction mesure donc ce qui reste à corriger APRÈS
 * les règles — ce qui est exactement le chiffre utile.
 *
 * `(profile_id, pattern)` remplace l'unicité globale du motif (AC 4) : deux profils peuvent
 * écrire la même règle sans se marcher dessus.
 */
export const classificationRules = sqliteTable(
  'classification_rules',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    profileId: integer('profile_id')
      .notNull()
      .references(() => profiles.id),
    /** Motif recherché dans le libellé, en forme normalisée (minuscules, sans accents). */
    pattern: text('pattern').notNull(),
    categoryItemId: integer('category_item_id')
      .notNull()
      .references(() => categoryItems.id, { onDelete: 'restrict' }),
    createdAt: integer('created_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  t => ({
    classificationRulesProfilePatternIdx: uniqueIndex('classification_rules_profile_pattern_idx').on(t.profileId, t.pattern),
    classificationRulesItemIdx: index('classification_rules_item_idx').on(t.categoryItemId),
  }),
)

/**
 * settlement_groups — avances faites pour un tiers, et le ou les virements qui les remboursent,
 * possédées par un profil (D37).
 *
 * **Pourquoi une table et non un drapeau** (epic 19). Un remboursement groupe PLUSIEURS achats,
 * arrive souvent un mois plus tard, et ne tombe pas toujours juste. Il faut donc un objet qui
 * réunit N lignes, pas une marque posée sur chacune : c'est le groupe qui porte la
 * réconciliation, et lui seul sait ce qui est couvert.
 *
 * Le groupe ne stocke AUCUN montant : tout se recalcule depuis ses lignes. Un total persisté
 * divergerait dès qu'une ligne entre ou sort — c'est la même raison qui interdit les agrégats
 * dans ce produit (D19).
 */
export const settlementGroups = sqliteTable('settlement_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  profileId: integer('profile_id')
    .notNull()
    .references(() => profiles.id),
  /** Libellé libre — « courses parents », « voyage Espagne ». */
  label: text('label').notNull(),
  createdAt: integer('created_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
})

export type SettlementGroupRow = typeof settlementGroups.$inferSelect
export type NewSettlementGroupRow = typeof settlementGroups.$inferInsert

export type ClassificationRuleRow = typeof classificationRules.$inferSelect
export type NewClassificationRuleRow = typeof classificationRules.$inferInsert
