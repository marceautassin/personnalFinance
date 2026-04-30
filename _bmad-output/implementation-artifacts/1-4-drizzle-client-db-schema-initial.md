# Story 1.4: Configurer Drizzle, créer le client DB et un schéma initial vide

Status: done

## Story

As a dev,
I want a Drizzle client connected to a local SQLite database with an initial schema for default categories,
so that future stories can declare tables, run migrations, and seed reference data.

## Acceptance Criteria

1. **Given** Drizzle, drizzle-kit et better-sqlite3 installés (Story 1.1),
   **When** je crée `drizzle.config.ts` pointant vers `_data/personnalfinance.db` et `server/db/schema.ts`,
   **Then** `yarn db:studio` peut se lancer (potentiellement sur une base inexistante — accepté à ce stade, sera créée par bootstrap en Story 1.5).

2. **Given** la config Drizzle,
   **When** je crée `server/db/client.ts` exposant une instance unique `db = drizzle(better-sqlite3(...))`,
   **Then** un import depuis n'importe quel endroit du serveur retourne le même singleton (vérifié par un test simple).

3. **Given** le client DB,
   **When** je crée `server/db/schema.ts` avec la table `category_definitions` (`id` integer PK auto, `code` text unique not null, `label` text not null, `is_variable` integer not null default 0, `created_at` integer not null),
   **Then** `yarn db:push` crée la table sans erreur sur une base de test (à supprimer après vérification).

4. **Given** la liste des catégories par défaut,
   **When** je crée `shared/constants/default-categories.ts`,
   **Then** le fichier exporte un tableau `DEFAULT_CATEGORIES: ReadonlyArray<{ code: string; label: string; isVariable: boolean }>` couvrant les catégories courantes (voir Dev Notes pour la liste figée V1).

5. **Given** la convention de nommage,
   **When** je vérifie `server/db/schema.ts`,
   **Then** un commentaire d'en-tête documente : tables en `snake_case` pluriel, colonnes en `snake_case`, suffixes `_cents`/`_date`, FK en `{singular_target}_id`, index en `{table}_{cols}_idx`.

## Tasks / Subtasks

- [x] **Task 1 — Créer la config Drizzle** (AC: #1)
  - [x] Créer `drizzle.config.ts` selon le snippet Dev Notes
  - [x] Vérifier que `yarn db:studio` se lance (peut afficher "no database found" — OK)

- [x] **Task 2 — Créer le client DB singleton** (AC: #2)
  - [x] Créer `server/db/client.ts` selon le snippet Dev Notes
  - [x] Le client crée le dossier `_data/` parent si manquant et ouvre/crée le fichier `_data/personnalfinance.db`
  - [x] Vérifier que deux imports `import { db } from '@/server/db/client'` (depuis deux modules différents) retournent la même instance via un test rapide

- [x] **Task 3 — Définir le schéma initial** (AC: #3, #5)
  - [x] Créer `server/db/schema.ts` avec :
    - Le commentaire d'en-tête de conventions
    - La table `category_definitions`
  - [x] Lancer `yarn db:push` pour créer la table (pour validation — la base sera ensuite gérée par le bootstrap en Story 1.5)
  - [x] Si une base de test a été créée pendant cette validation, la supprimer (`rm _data/personnalfinance.db`) pour laisser le bootstrap de la Story 1.5 s'exécuter proprement

- [x] **Task 4 — Définir les catégories par défaut** (AC: #4)
  - [x] Créer `shared/constants/default-categories.ts` selon le snippet Dev Notes
  - [x] Vérifier `yarn typecheck` propre

- [x] **Task 5 — Sanity check final**
  - [x] `yarn typecheck`, `yarn lint` propres
  - [x] `_data/` reste gitignored, ne pas committer la base

## Dev Notes

### Snippet `drizzle.config.ts` (Task 1)

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './_data/personnalfinance.db',
  },
  // Important: en V1 on utilise db:push, mais drizzle-kit migrate (apply-migration) doit aussi pouvoir générer ici
  verbose: true,
  strict: true,
})
```

### Snippet `server/db/client.ts` (Task 2)

```ts
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import * as schema from './schema'

const DB_PATH = process.env.DATABASE_URL ?? './_data/personnalfinance.db'

// S'assurer que le dossier parent existe (idempotent — Story 1.5 le fait aussi mais on est défensif)
const dir = dirname(DB_PATH)
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true })
}

// Connexion synchrone — better-sqlite3 est sync par design (idéal pour single-process Nitro)
const sqlite = new Database(DB_PATH)
// Foreign keys ON par défaut SQLite est OFF → on l'active
sqlite.pragma('foreign_keys = ON')
// WAL mode pour de meilleures perfs concurrentes (lecture pendant écriture, etc.)
sqlite.pragma('journal_mode = WAL')

export const db = drizzle(sqlite, { schema })
export type DB = typeof db
```

### Snippet `server/db/schema.ts` (Task 3)

```ts
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
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'

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
```

### Snippet `shared/constants/default-categories.ts` (Task 4)

```ts
/**
 * Catégories par défaut seedées au premier démarrage (FR16, Story 1.5).
 * is_variable = true → catégorie projetée par moyenne mobile (variable_projection).
 * is_variable = false → catégorie déclarée explicitement comme fixed_charge si récurrente.
 *
 * Cette liste est volontairement courte et figée V1. L'utilisateur ajoute des catégories
 * personnalisées via l'UI (Story 5.x). Si tu hésites entre variable et fixe : variable
 * par défaut (l'utilisateur peut toujours déclarer une charge fixe explicite par-dessus).
 */
export interface DefaultCategory {
  readonly code: string
  readonly label: string
  readonly isVariable: boolean
}

export const DEFAULT_CATEGORIES: ReadonlyArray<DefaultCategory> = [
  // Variables — projetées par moyenne mobile
  { code: 'courses', label: 'Courses', isVariable: true },
  { code: 'restaurants', label: 'Restaurants', isVariable: true },
  { code: 'transports', label: 'Transports', isVariable: true },
  { code: 'sante', label: 'Santé', isVariable: true },
  { code: 'loisirs', label: 'Loisirs', isVariable: true },
  { code: 'shopping', label: 'Shopping', isVariable: true },
  { code: 'voyages', label: 'Voyages', isVariable: true },
  { code: 'enfants', label: 'Enfants', isVariable: true },

  // Fixes — typiquement déclarées comme fixed_charges
  { code: 'logement', label: 'Logement', isVariable: false },
  { code: 'abonnements', label: 'Abonnements', isVariable: false },
  { code: 'assurances', label: 'Assurances', isVariable: false },
  { code: 'energies', label: 'Énergie & fluides', isVariable: false },
  { code: 'telecoms', label: 'Téléphone & Internet', isVariable: false },
  { code: 'impots', label: 'Impôts & taxes', isVariable: false },

  // Spéciales (revenus & techniques)
  { code: 'are', label: 'ARE (chômage)', isVariable: false },
  { code: 'loyer_sas', label: 'Loyer SAS', isVariable: false },
  { code: 'defraiements', label: 'Défraiements', isVariable: false },
  { code: 'remboursement_dette', label: 'Remboursement de dette', isVariable: false },
  { code: 'divers', label: 'Divers / Inconnu', isVariable: false },
] as const
```

### Validation manuelle de db:push

Procédure pour Task 3 :
```bash
yarn db:push
# Devrait afficher quelque chose comme "Changes applied" ou "No changes detected"
yarn db:studio
# Ouvrir http://localhost:0.0.0.0:4983 (ou similaire), vérifier que la table category_definitions existe
# Stop le studio (Ctrl+C)
rm _data/personnalfinance.db   # nettoyage — la Story 1.5 recréera + seedera
```

⚠️ Si `db:push` est interactif et demande "Yes/No" sur des changements destructifs, vérifier qu'il n'y a aucune drop accidentelle (la base est vide donc improbable).

### Anti-patterns à éviter

- ❌ Créer plusieurs instances de la DB ailleurs : utiliser exclusivement le singleton `db` exporté par `server/db/client.ts`.
- ❌ Activer la connexion sans `pragma foreign_keys = ON` — SQLite est par défaut **non strict** sur les FK, ce qui annulerait la sécurité du schéma futur.
- ❌ Stocker les catégories par défaut dans la DB en code (table `category_definitions`) **sans** seed reproductible : la liste vit dans `shared/constants/default-categories.ts`, le seed (Story 1.5) la fait converger.
- ❌ Stocker les montants en `numeric` ou `real` SQLite : **toujours** `integer` pour les montants en cents (NFR8).
- ❌ Hardcoder le chemin de la base : utiliser `process.env.DATABASE_URL` avec fallback `./_data/personnalfinance.db` (utile pour les tests futurs qui voudront une base in-memory ou alternative).

### Sécurité

- `_data/` est gitignored (Story 1.1).
- `better-sqlite3` est synchrone et ne fait aucun appel réseau — aucune surface d'attaque externe.
- Le pragma `journal_mode = WAL` crée des fichiers `*.db-shm` et `*.db-wal` à côté de la base — déjà couverts par `_data/` dans le `.gitignore`.

### Project Structure Notes

Cette story crée :
- `drizzle.config.ts` (racine)
- `server/db/client.ts`
- `server/db/schema.ts`
- `server/db/migrations/` (dossier généré, vide à ce stade — créé par drizzle-kit si besoin)
- `shared/constants/default-categories.ts`

Les dossiers `server/db/` et `shared/constants/` peuvent ne pas exister encore — les créer.

### Definition of Done

- [ ] `drizzle.config.ts` créé et valide
- [ ] `server/db/client.ts` exporte un singleton `db` avec FK + WAL activés
- [ ] `server/db/schema.ts` contient la table `category_definitions` + commentaire d'en-tête de conventions
- [ ] `shared/constants/default-categories.ts` exporte la liste des catégories par défaut
- [ ] `yarn db:push` fonctionne (validation manuelle puis suppression de la base test)
- [ ] `yarn typecheck` propre
- [ ] Commit unique

### References

- [Source: `CLAUDE.md`#Stack verrouillée] — Drizzle + better-sqlite3
- [Source: `CLAUDE.md`#Naming Patterns] — conventions DB
- [Source: `CLAUDE.md`#Invariants critiques §Boundaries imperméables] — DB accédée via instance unique
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Core Architectural Decisions §D2, §D4] — dates en text ISO, push V1
- [Source: `_bmad-output/planning-artifacts/architecture.md`#NFR8] — integer cents partout
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 1.4] — story originale et ACs
- [Previous story: `1-3-branded-cents-et-helpers-monetaires.md`] — type Cents disponible (sera utilisé en Story 2.1+)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context)

### Debug Log References

- `yarn db:push` est interactif en TTY ; en environnement non-TTY il faut `yarn db:push --force` (auto-approve). À documenter pour CI éventuel. Aucune destruction réelle ici (base vide).
- `yarn db:push` exige que `_data/` existe avant l'appel (better-sqlite3 ne crée pas le dossier). En usage applicatif, c'est `server/db/client.ts` (ou le bootstrap Story 1.5) qui crée le dossier — pour la validation manuelle on a fait `mkdir -p _data` avant.

### Completion Notes List

- Versions effectives : drizzle-orm 0.45.2, drizzle-kit 0.31.10, better-sqlite3 12.9.0.
- `db:push --force` a généré et appliqué le DDL attendu (table `category_definitions` + index unique sur `code`).
- Schéma vérifié via `sqlite_master` puis base de test supprimée comme prévu (Story 1.5 recréera + seedera).
- Test de singleton ajouté (`server/db/client.test.ts`) : utilise un `DATABASE_URL` temporaire pour ne pas polluer `_data/`.
- Test de cohérence des `DEFAULT_CATEGORIES` ajouté (`shared/constants/default-categories.test.ts`).
- `yarn test:run`, `yarn typecheck`, `yarn lint` tous verts.

### File List

- `drizzle.config.ts` (nouveau)
- `server/db/client.ts` (nouveau)
- `server/db/schema.ts` (nouveau)
- `server/db/client.test.ts` (nouveau)
- `shared/constants/default-categories.ts` (nouveau)
- `shared/constants/default-categories.test.ts` (nouveau)

### Review Findings

- [x] [Review][Decision] Sémantique de `divers` (`isVariable: false`) — Le LLM categorizer (Story 2.4) est susceptible de tomber sur `divers` pour toute dépense inconnue. Avec `isVariable: false`, ces montants n'entrent **pas** dans la projection variable (moyenne mobile) du forecast. Risque : trou silencieux dans la prévision pour tout spend non catégorisé. Choix à arbitrer : (a) basculer `divers` en `isVariable: true` ; (b) rester `false` et imposer une règle "pas de divers en sortie LLM" ; (c) traitement spécial dans variable-projection. Voir `shared/constants/default-categories.ts:40`.
- [x] [Review][Patch] Test pollue `process.env.DATABASE_URL` au top-level sans restauration + `rmSync` du tmpDir sans `db.close()` préalable [server/db/client.test.ts:6-11] — la mutation env fuit vers les autres test files du même worker Vitest ; la suppression du tmpDir sans fermeture du handle SQLite peut échouer sur Windows / laisser des fd orphelins.
- [x] [Review][Patch] `existsSync(dir)` redondant et dangereux avant `mkdirSync({ recursive: true })` [server/db/client.ts:9-12] — `recursive: true` est idempotent (donc le `if` est dead code) ; pire, `existsSync` retourne `true` si `dir` est un fichier régulier, ce qui saute le `mkdir` et fait échouer `new Database` plus loin avec un message confus. Supprimer le `if`.
- [x] [Review][Patch] `drizzle.config.ts` ignore `process.env.DATABASE_URL` alors que `server/db/client.ts` l'honore [drizzle.config.ts:8] — divergence silencieuse : `yarn db:push` cible toujours `_data/personnalfinance.db` même quand le runtime pointe ailleurs (CI, tests). Lire `process.env.DATABASE_URL` avec le même fallback.
- [x] [Review][Defer] Test singleton ne prouve que le cache ESM, pas l'unicité de `new Database` [server/db/client.test.ts:14-18] — deferred, la story accepte explicitement "un test simple" (AC #2) ; renforcer plus tard si besoin.
- [x] [Review][Defer] `createdAt` via `$defaultFn` JS-side, non déterministe pour snapshots et collisions sur même tick lors d'un seed bulk [server/db/schema.ts:29] — deferred, conforme à la convention `_at` epoch secondes ; à revoir si snapshot tests forecast l'exigent.
- [x] [Review][Defer] Paths relatifs CWD-dépendants dans `drizzle.config.ts` et `server/db/client.ts` — deferred, mono-projet lancé depuis la racine en V1.
- [x] [Review][Defer] `journal_mode = WAL` silencieusement ignoré sur certains FS (NFS, FAT, readonly) [server/db/client.ts:16] — deferred, environnement local de confiance ; ajouter un guard si déploiement étendu.
- [x] [Review][Defer] `as const` annulé par l'annotation `ReadonlyArray<DefaultCategory>` [shared/constants/default-categories.ts:16] — deferred, perd les types littéraux pour `code` mais aucun consommateur ne s'en sert en V1.
- [x] [Review][Defer] Aucun garde-fou format sur `code` (regex `/^[a-z_]+$/`) [shared/constants/default-categories.test.ts] — deferred, codes actuels conformes ; à ajouter si autres contributeurs.
- [x] [Review][Defer] Pas de fermeture DB explicite ni de hook process exit [server/db/client.ts] — deferred, Nitro single-process gère la fin de vie ; pertinent surtout en tests (cf. patch ci-dessus).
