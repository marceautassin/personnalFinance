# Story 2.1: Schéma DB pour `bank_statements` et `transactions`

Status: review

## Story

As a dev,
I want the bank statement and transaction tables defined with proper indexes and Zod schemas,
so that the ingestion pipeline (Stories 2.2-2.6) can persist its results in a typed, integrity-protected way.

## Acceptance Criteria

1. **Given** `server/db/schema.ts`,
   **When** j'ajoute la table `bank_statements` (`hash_sha256` text PK, `period_start` text YYYY-MM-DD, `period_end` text YYYY-MM-DD, `opening_balance_cents` integer, `closing_balance_cents` integer, `reliability` text 'reliable'|'unreliable' default 'reliable', `ingested_at` integer epoch),
   **Then** `yarn db:push` (ou `db:generate` + `apply-migration`) crée la table sans erreur.

2. **Given** la table bank_statements,
   **When** j'ajoute la table `transactions` (`id` integer PK auto, `statement_hash` text FK → bank_statements.hash_sha256 ON DELETE CASCADE, `transaction_date` text YYYY-MM-DD, `label` text, `amount_cents` integer signed, `category_code` text FK → category_definitions.code, `is_manual` integer boolean default false, `is_debt_repayment` integer boolean default false, `debt_id` integer FK nullable (table debts n'existe pas encore — déclarer la colonne sans la contrainte FK pour V1, ajouter la FK en Story 6.1), `created_at` integer epoch),
   **Then** `yarn db:push` crée la table sans erreur.

3. **Given** les tables,
   **When** j'ajoute les index `transactions_period_idx` sur `transaction_date` et `transactions_statement_idx` sur `statement_hash`,
   **Then** ils sont créés (visible via `yarn db:studio`).

4. **Given** les tables,
   **When** je crée `shared/schemas/statement.schema.ts` et `shared/schemas/transaction.schema.ts`,
   **Then** chaque fichier expose un schéma Zod (`StatementSchema`, `TransactionSchema`) **et** des sous-schémas (`NewStatementSchema`, `NewTransactionSchema` pour les inserts) **et** les types TS dérivés via `z.infer<>`.

5. **Given** les schémas,
   **When** je vérifie l'utilisation,
   **Then** les types TS dérivés des schémas Zod sont compatibles avec les types Drizzle `$inferSelect` / `$inferInsert` (vérifié par un test de compilation simple).

## Tasks / Subtasks

- [x] **Task 1 — Ajouter `bank_statements` au schéma Drizzle** (AC: #1)
  - [x] Modifier `server/db/schema.ts` selon le snippet Dev Notes
  - [x] Vérifier que `reliability` est typé via une enum-like (string littéral check ou check constraint si Drizzle le supporte)

- [x] **Task 2 — Ajouter `transactions` au schéma Drizzle** (AC: #2, #3)
  - [x] Ajouter la table avec FK vers `bank_statements.hash_sha256` (CASCADE) et `category_definitions.code` (RESTRICT)
  - [x] Déclarer `debt_id` comme integer nullable **sans FK** pour V1 (commentaire `// FK ajoutée en Story 6.1`)
  - [x] Ajouter les deux index

- [x] **Task 3 — Pousser le schéma** (AC: #1, #2, #3)
  - [x] `yarn db:push` (ou si tu préfères versionner dès maintenant : `yarn db:generate` puis `yarn apply-migration`)
  - [x] Vérifier les tables et index via `yarn db:studio`
  - [x] Vérifier que le bootstrap (Story 1.5) ne casse pas (il ne touche pas à ces tables)

- [x] **Task 4 — Schémas Zod partagés** (AC: #4)
  - [x] Créer `shared/schemas/statement.schema.ts` selon le snippet Dev Notes
  - [x] Créer `shared/schemas/transaction.schema.ts` selon le snippet Dev Notes
  - [x] Les types TS dérivés (`Statement`, `NewStatement`, `Transaction`, `NewTransaction`) sont exportés

- [x] **Task 5 — Compatibilité Drizzle ↔ Zod** (AC: #5)
  - [x] Créer un fichier de check rapide ou un test unitaire qui assigne un `typeof bankStatements.$inferSelect` à un `Statement` (via Zod) et inversement, pour valider la compat des types
  - [x] Si écart : ajuster les schémas Zod pour matcher (notamment booleans en Drizzle qui sont sérialisés en `0/1` côté DB mais `boolean` côté TS via le mode `boolean`)

- [x] **Task 6 — Sanity check final**
  - [x] `yarn typecheck`, `yarn lint`, `yarn test:run` propres
  - [ ] Commit unique (à faire par l'utilisateur)

## Dev Notes

### Snippet à ajouter dans `server/db/schema.ts` (Tasks 1-3)

```ts
import { sqliteTable, integer, text, index, foreignKey } from 'drizzle-orm/sqlite-core'
import { categoryDefinitions } from './schema' // self-import — déjà présent, juste pour clarté

/**
 * Reliabilité d'un mois ingéré.
 * - reliable : la réconciliation auto a passé OU l'utilisateur a ajouté manuellement les transactions manquantes
 *              jusqu'à équilibrer le solde.
 * - unreliable : l'utilisateur a accepté un gap résiduel (cf. Story 3.x). Le forecast doit le signaler.
 */
export const RELIABILITY_VALUES = ['reliable', 'unreliable'] as const
export type ReliabilityValue = typeof RELIABILITY_VALUES[number]

/**
 * bank_statements — un PDF de relevé bancaire ingéré.
 * Le hash SHA-256 du PDF EST la PK : idempotence par contenu (FR2).
 */
export const bankStatements = sqliteTable('bank_statements', {
  hashSha256: text('hash_sha256').primaryKey(),
  periodStart: text('period_start').notNull(),  // YYYY-MM-DD
  periodEnd: text('period_end').notNull(),      // YYYY-MM-DD
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
    transactionDate: text('transaction_date').notNull(), // YYYY-MM-DD
    label: text('label').notNull(),
    amountCents: integer('amount_cents').notNull(),       // signé
    categoryCode: text('category_code')
      .notNull()
      .references(() => categoryDefinitions.code, { onDelete: 'restrict' }),
    isManual: integer('is_manual', { mode: 'boolean' }).notNull().default(false),
    isDebtRepayment: integer('is_debt_repayment', { mode: 'boolean' }).notNull().default(false),
    debtId: integer('debt_id'), // FK ajoutée en Story 6.1 (table debts inexistante en Epic 2)
    createdAt: integer('created_at').notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  (t) => ({
    transactionsPeriodIdx: index('transactions_period_idx').on(t.transactionDate),
    transactionsStatementIdx: index('transactions_statement_idx').on(t.statementHash),
  }),
)

export type Transaction = typeof transactions.$inferSelect
export type NewTransaction = typeof transactions.$inferInsert
```

### Snippet `shared/schemas/statement.schema.ts` (Task 4)

```ts
import { z } from 'zod'

/** YYYY-MM-DD */
const DateIsoSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (YYYY-MM-DD attendu)')

const ReliabilityEnum = z.enum(['reliable', 'unreliable'])

/** Schéma d'un BankStatement complet (lecture). */
export const StatementSchema = z.object({
  hashSha256: z.string().regex(/^[a-f0-9]{64}$/i, 'Hash SHA-256 attendu'),
  periodStart: DateIsoSchema,
  periodEnd: DateIsoSchema,
  openingBalanceCents: z.number().int(),
  closingBalanceCents: z.number().int(),
  reliability: ReliabilityEnum,
  ingestedAt: z.number().int(),
})

/** Schéma d'insertion d'un BankStatement (sans ingestedAt — généré par défaut). */
export const NewStatementSchema = StatementSchema.omit({ ingestedAt: true }).extend({
  reliability: ReliabilityEnum.default('reliable'),
})

export type Statement = z.infer<typeof StatementSchema>
export type NewStatement = z.infer<typeof NewStatementSchema>
```

### Snippet `shared/schemas/transaction.schema.ts` (Task 4)

```ts
import { z } from 'zod'

const DateIsoSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (YYYY-MM-DD attendu)')

/** Schéma d'une Transaction complète (lecture). */
export const TransactionSchema = z.object({
  id: z.number().int().positive(),
  statementHash: z.string().regex(/^[a-f0-9]{64}$/i),
  transactionDate: DateIsoSchema,
  label: z.string().min(1),
  amountCents: z.number().int(),
  categoryCode: z.string().min(1),
  isManual: z.boolean(),
  isDebtRepayment: z.boolean(),
  debtId: z.number().int().positive().nullable(),
  createdAt: z.number().int(),
})

/** Schéma d'insertion (id et createdAt générés). */
export const NewTransactionSchema = TransactionSchema.omit({
  id: true,
  createdAt: true,
}).extend({
  isManual: z.boolean().default(false),
  isDebtRepayment: z.boolean().default(false),
  debtId: z.number().int().positive().nullable().default(null),
})

/**
 * Schéma intermédiaire utilisé par le pipeline d'ingestion (Story 2.6) — on n'a pas encore le statementHash
 * à l'étape catégorisation. Le hash est ajouté juste avant l'INSERT.
 */
export const ExtractedTransactionSchema = z.object({
  transactionDate: DateIsoSchema,
  label: z.string().min(1),
  amountCents: z.number().int(),
  categoryCode: z.string().min(1),
})

export type Transaction = z.infer<typeof TransactionSchema>
export type NewTransaction = z.infer<typeof NewTransactionSchema>
export type ExtractedTransaction = z.infer<typeof ExtractedTransactionSchema>
```

### Compatibilité Drizzle ↔ Zod (Task 5)

Drizzle inférence vs Zod : l'`integer` Drizzle en mode `boolean` retourne bien un `boolean` côté TS (pas `0/1`), donc compatible. Pour les enums string littéral (`reliability`), Drizzle expose `'reliable' | 'unreliable'` qui matche `z.enum`. Aucune transformation nécessaire normalement.

Test simple à mettre dans `server/db/schema.test.ts` (à supprimer après validation) :
```ts
import { describe, it, expectTypeOf } from 'vitest'
import type { Statement, NewStatement, Transaction, NewTransaction } from '~/shared/schemas/statement.schema'
import type { BankStatement, NewBankStatement, Transaction as DrizzleTransaction, NewTransaction as DrizzleNewTransaction } from './schema'

describe('Drizzle ↔ Zod type compatibility', () => {
  it('Statement is compatible with Drizzle BankStatement', () => {
    expectTypeOf<Statement>().toEqualTypeOf<BankStatement>()
  })
  // ... idem pour Transaction
})
```

⚠️ Si `expectTypeOf` détecte un écart, ajuste le schéma Zod (pas le schéma Drizzle qui est la source de vérité DB).

### Anti-patterns à éviter

- ❌ Stocker `amount_cents` en `numeric` ou `real` — toujours `integer` (cf. NFR8 + CLAUDE.md).
- ❌ Stocker une date en `integer` (epoch) pour une date métier — toujours `text` ISO (cf. D2).
- ❌ Définir `is_manual` ou `is_debt_repayment` en `text 'true'/'false'` — utiliser `integer({ mode: 'boolean' })`.
- ❌ Oublier l'ON DELETE CASCADE sur `transactions.statement_hash` — sans ça, supprimer un statement laisserait des transactions orphelines.
- ❌ Ajouter la FK `debts` maintenant — la table n'existe pas, ça casserait `yarn db:push`. À faire en Story 6.1.

### Project Structure Notes

Cette story modifie/crée :
- `server/db/schema.ts` (modification — ajout de 2 tables)
- `shared/schemas/statement.schema.ts` (création)
- `shared/schemas/transaction.schema.ts` (création)
- `server/db/schema.test.ts` (création éphémère — à supprimer en fin de story)

### Definition of Done

- [ ] Tables `bank_statements` et `transactions` ajoutées avec FK et index
- [ ] Schémas Zod partagés créés et compatibles avec Drizzle
- [ ] `yarn db:push` passe ; tables visibles dans `yarn db:studio`
- [ ] `yarn typecheck`, `yarn lint`, `yarn test:run` propres
- [ ] Test de compat Drizzle/Zod supprimé après validation
- [ ] Commit unique

### References

- [Source: `CLAUDE.md`#Naming Patterns] — conventions DB
- [Source: `CLAUDE.md`#Invariants critiques §Représentation monétaire] — integer cents
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Core Architectural Decisions §D1, §D2, §D3] — Cents, dates ISO, hash = chemin
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Project Structure] — emplacement des schémas
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 2.1] — story originale
- [Previous stories: `1-3` (Cents), `1-4` (Drizzle setup), `1-5` (bootstrap), `1-6` (Zod patterns)]

## Dev Agent Record

### Agent Model Used

_(à remplir)_

### Debug Log References

_(à remplir — notamment si Drizzle ne supporte pas la syntaxe enum text directement, fallback sur check contraint manuel)_

### Completion Notes List

_(à remplir — choix push vs generate, version Drizzle, ajustements types Zod si différence détectée)_

### File List

_(à remplir)_
