# Story 27.1: Tout mon historique m'appartient, sans rien perdre

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

En tant que Marceau,
je veux que chacune de mes données existantes soit rattachée à mon profil,
afin qu'un second profil puisse exister sans que rien de ce que j'ai construit ne bouge.

## Acceptance Criteria

1. **Profil et banque.** Après la migration `0010`, une table `profiles` existe et contient le profil
   `marceau`, `default_bank = 'boursorama'`. Chaque rubrique, poste, relevé, règle et groupe porte
   `profile_id` = celui de `marceau`. Chaque relevé porte `bank = 'boursorama'` (AR37).
2. **Sauvegarde vérifiée avant.** La migration n'est appliquée qu'après une sauvegarde **dont la
   restaurabilité est vérifiée** : ouverture de la copie, `PRAGMA integrity_check` = `ok`, comptage
   de chaque table égal à la source. Sinon, rien n'est migré.
3. **Rien de perdu.** Le nombre de lignes de chaque table, la somme de `amount_cents` **par relevé** et
   le couple (nombre de lignes, somme) **par code de poste** sont identiques avant et après ; tout
   écart fait échouer la procédure (FR75).
4. **Clés.** `category_groups` et `category_items` ont une clé de substitution entière `id` ;
   `(profile_id, code)` est unique sur chacune. `category_items` référence sa rubrique par
   `group_id`. `transactions` et `classification_rules` référencent le poste par
   `category_item_id`. `classification_rules` est unique par `(profile_id, pattern)` (AR34).
5. **Pas de propriétaire sur `transactions`.** Aucune colonne de profil sur `transactions` : une
   transaction appartient au profil de son relevé.
6. **Contrat d'API inchangé.** Tous les endpoints exposent et reçoivent toujours des **codes**
   (`categoryItemCode`, `groupCode`, `/api/categories/items/[code]`…). Chaque écran affiche
   exactement les mêmes chiffres qu'avant : analyse, évolution, relevés, fiabilité, règles, groupes.
7. **Base neuve.** Sur une base reconstruite depuis les migrations (E2E), le profil `marceau`
   existe et le bootstrap lui sème le référentiel initial (AR36).
8. **Tests verts, lint, typecheck OK**, E2E Chromium verts.

## Tasks / Subtasks

- [x] **T1 — Schéma Drizzle** (AC 1, 4, 5)
  - [x] `shared/types/bank.ts` : `BANKS = ['boursorama', 'credit_mutuel'] as const`, type `Bank`,
        libellés FR à côté (`BANK_LABELS`). Anglais sans accent pour les valeurs (CLAUDE.md).
  - [x] `server/db/schema.ts` : table `profiles` (`id` integer PK autoincrement, `name` text unique
        not null, `default_bank` text enum `BANKS` not null, `created_at`).
  - [x] `category_groups` : `id` PK entier, `profile_id` FK `profiles.id` NOT NULL, `code` text,
        `uniqueIndex(profile_id, code)`.
  - [x] `category_items` : `id` PK entier, `profile_id` FK NOT NULL, `code`, `group_id` FK
        `category_groups.id` `ON DELETE RESTRICT` (remplace `group_code`), `uniqueIndex(profile_id,
        code)`, index sur `group_id`.
  - [x] `bank_statements` : + `profile_id` FK NOT NULL, + `bank` enum NOT NULL. **PK reste
        `hash_sha256`** (D37, arbitrage du 2026-09-22).
  - [x] `transactions` : `category_item_id` FK `category_items.id` `ON DELETE RESTRICT` (remplace
        `category_item_code`), index `transactions_item_idx` sur la nouvelle colonne. **Aucun**
        `profile_id`. `settlement_group_id` : voir T2, profiter du rebuild pour déclarer ce qui est
        réellement en base (commentaire existant l.100-111 du schéma).
  - [x] `classification_rules` : + `profile_id`, `category_item_id` (remplace le code),
        `uniqueIndex(profile_id, pattern)` à la place de `.unique()` sur `pattern`.
  - [x] `settlement_groups` : + `profile_id` FK NOT NULL.
  - [x] Garder en tête du fichier l'import RELATIF (`drizzle-kit` ne résout pas `~~/`, l.17-22).
- [x] **T2 — Migration `0010`** (AC 1, 3, 4, 5, 7)
  - [x] `yarn db:generate` refuse le mode non interactif sur un rebuild de cette ampleur
        (`Interactive prompts require a TTY terminal`) : migration, snapshot et entrée de journal
        écrits **entièrement à la main**, au format exact produit par drizzle-kit (vérifié contre
        `0008`/`0009`). Copies de données via jointures code → id, comme prévu.
  - [x] Ordre de rebuild — voir « Piège n°1 » : créer les `__new_*` parents avant enfants, copier,
        **supprimer les anciennes tables enfants avant les parents**, puis renommer.
  - [x] `INSERT INTO profiles (id, name, default_bank, created_at) VALUES (1, 'marceau',
        'boursorama', strftime('%s','now'))` — inconditionnel : sur une base neuve aussi (AC 7).
  - [x] Copies : `profile_id = 1` partout ; `group_id` et `category_item_id` résolus par jointure
        sur les anciens codes ; `bank = 'boursorama'`. `id` existants de `transactions`,
        `classification_rules` et `settlement_groups` préservés (URLs, groupes, export).
  - [x] Tous les index recréés.
  - [x] `yarn db:generate` non rejouable sans TTY (cf. ci-dessus) : la cohérence du snapshot 0010
        écrit à la main est validée autrement — test de migration dédié (AC 3) + `db:migrate-safe`
        exécuté de bout en bout sur une base construite par `drizzle-kit migrate` (voir Completion
        Notes, bug réel trouvé et corrigé à cette occasion).
- [x] **T3 — Procédure de migration sûre** (AC 2, 3)
  - [x] Nouveau script `scripts/migrate-safely.mjs` + entrée `package.json` (`db:migrate-safe`) :
        1) copie binaire via `db.backup()` (même mécanisme que `backup-db.mjs`, sûr en WAL) ;
        2) vérification de la copie : ouverture, `integrity_check`, comptage par table = source ;
        3) photo « avant » : comptage par table, `SUM(amount_cents)` par `statement_hash`,
           `(COUNT, SUM)` par code de poste (jointure adaptée au schéma lu) ;
        4) `drizzle-kit migrate` ;
        5) photo « après », comparaison, `PRAGMA foreign_key_check` vide ;
        6) tout écart → sortie non nulle, message en français donnant le chemin de la sauvegarde
           à restaurer.
  - [x] La photo « avant » fonctionne sur l'**ancien** schéma et la photo « après » sur le
        **nouveau** : lecture adaptative (`PRAGMA table_info(transactions)`), jamais supposée.
  - [x] Documenté dans `CLAUDE.md` § Commandes utiles : `yarn db:migrate-safe`.
  - [x] Validé de bout en bout sur une base jetable (`/tmp`, hors dépôt) construite par
        `drizzle-kit migrate` depuis 0000 à 0009, puis migrée vers 0010 par le script : sauvegarde
        vérifiée, migration appliquée, comptages/sommes identiques, `foreign_key_check` vide. Cette
        exécution a révélé et fait corriger un bug réel de la migration 0010 (voir Completion Notes).
- [x] **T4 — `scripts/backup-db.mjs`** : l'export JSON lisait `category_item_code` et `group_code`,
      qui n'existent plus. Réécrit avec jointures pour **ré-exposer des codes** (l'export reste
      indépendant des identifiants techniques — c'est sa raison d'être, en-tête du fichier)
      et y ajoute le nom du profil par ligne.
- [x] **T5 — Profil courant, version minimale** (AC 6)
  - [x] `server/utils/current-profile.ts` : `requireProfile(event?): number`. Dans CETTE story, il
        renvoie l'identifiant de **l'unique** profil et lève une erreur explicite s'il y en a zéro
        ou plusieurs. Le cookie et le filtrage arrivent en 27.2 ; la signature, elle, est finale
        (AR35). `event` optionnel pour ne pas casser les 21 appels de test de l'orchestrateur
        d'ingestion, qui n'en construisent pas.
  - [x] Toutes les **écritures** dans une table possédée l'utilisent pour `profile_id` : voir la
        liste « Points d'insertion » (tous couverts : bootstrap/seed, rules, settlements,
        categories/groups, categories/items, statement-ingestion-orchestrator).
- [x] **T6 — Résolution code ↔ id côté serveur** (AC 6)
  - [x] `server/utils/category-fk.ts` : `assertCategoryItemExists(code)` remplacé par
        `resolveItemId(profileId, code): Promise<number>` (422 si inconnu, même payload
        qu'avant) et `assertGroupExists` par `resolveGroupId(profileId, code): number` (404
        `group_not_found` inchangé). Toujours **dans le profil**.
  - [x] Lectures : partout où une requête sélectionnait `transactions.categoryItemCode`, jointure
        `categoryItems` sur `categoryItems.id = transactions.categoryItemId`, sélection
        `categoryItemCode: categoryItems.code`. Même chose pour `groupCode` via `group_id`.
        Endpoints/services touchés : `analysis.get.ts`, `evolution.get.ts`,
        `transactions/index.get.ts`, `transactions/[id].patch.ts`, `statements/index.get.ts`,
        `statements/[hash].get.ts`, `reconciliation/[hash].post.ts`, `rules/index.get.ts`,
        `rules/index.post.ts`, `rules/[id]/apply.post.ts`, `categories/index.get.ts`,
        `categories/groups/*`, `categories/items/*`, `statement-ingestion-orchestrator.ts`,
        `category-references.ts`, `category-labels.ts`, `rule-coverage.ts`.
  - [x] Le moteur (`analysis-engine.ts`), `rule-matcher.ts`, `settlement-status.ts` et le prompt
        n'ont **pas été modifiés** — confirmé par la non-régression de leurs tests dédiés.
- [x] **T7 — Bootstrap** (AC 7)
  - [x] Seed extrait de `server/middleware/0.bootstrap.ts` vers `server/utils/seed-referential.ts` :
        `seedReferential(runner, profileId)` (runner = `db` ou transaction). Réutilisable par 27.3.
  - [x] Bootstrap : sème **chaque profil sans rubrique** (boucle sur `profiles`, anti-résurrection
        conservée : un profil qui a déjà des rubriques n'est jamais ré-semé — testé explicitement).
  - [x] `SCHEMA_MARKERS` : marqueur `transactions.category_item_code` remplacé par
        `transactions.category_item_id`, marqueur `table profiles` ajouté ; le marqueur des
        postes du compte joint devient **par profil** (boucle sur tous les profils peuplés). Garde
        « base vierge » conservée.
- [x] **T8 — Tests** (AC 3, 6, 7, 8) — voir « Tests ».

## Dev Notes

### Pourquoi cette story est la plus risquée du chantier

Rebuild de **six** tables (`category_groups`, `category_items`, `bank_statements`,
`transactions`, `classification_rules`, `settlement_groups`) sur deux ans de données dont la perte
**n'est pas rattrapable** : corrections manuelles, règles, groupes, écarts acceptés n'existent dans
aucun PDF (NFR12 inversée, D30). AR5/D18 (vidage + ré-ingestion) **ne s'appliquent plus**.

### ⚠️ Piège n°1 — `PRAGMA foreign_keys=OFF` n'a pas le même effet selon le chemin

- `drizzle-kit migrate` (`yarn apply-migration`) applique les migrations **dans une transaction** :
  un `PRAGMA foreign_keys=OFF` y est **sans effet** (SQLite l'ignore dans une transaction).
- `tests/e2e/global-setup.ts` exécute chaque instruction **hors transaction**, `foreign_keys = ON` :
  le même `PRAGMA` y est effectif.

Une migration qui ne marche que grâce à ce PRAGMA **passe en E2E et casse en production**. Les
migrations 0002/0008 s'en sont tirées parce qu'elles ne supprimaient qu'une table **enfant**. Ici on
reconstruit des **parents** référencés.

**Recette qui ne dépend pas du PRAGMA** (FK activées de bout en bout) :

1. créer `__new_category_groups`, `__new_category_items` (FK → `__new_category_groups`),
   `__new_bank_statements`, `__new_settlement_groups`, puis `__new_transactions` et
   `__new_classification_rules` qui référencent les tables `__new_*` ;
2. copier parents puis enfants ;
3. `DROP` des anciennes tables **enfants d'abord** : `transactions`, `classification_rules`, puis
   `category_items`, `category_groups`, `bank_statements`, `settlement_groups` — plus aucune ligne ne
   les référence, le `DELETE` implicite du `DROP` ne viole rien ;
4. `ALTER TABLE __new_x RENAME TO x` : avec `legacy_alter_table=OFF` (défaut), SQLite **réécrit les
   clés étrangères** des autres tables qui pointent vers `__new_x`.
5. recréer les index ; `PRAGMA foreign_key_check` doit être vide.

**Validation obligatoire sur les deux chemins** : `yarn test:e2e` **et** `yarn db:migrate-safe`
sur une **copie** de `_data/personnalfinance.db`. Jamais directement sur la base réelle en premier.

### ⚠️ Piège n°2 — `drizzle push`

La base de dev dérive déjà et `push` veut reconstruire `transactions` (mémoire projet
« Drift DB dev »). Sur cette migration, un `push` appliquerait un rebuild **sans** la traduction
code → id : perte des classements. **Interdit.**

### ⚠️ Piège n°3 — l'export JSON de la sauvegarde

`scripts/backup-db.mjs` lit `category_item_code`/`group_code` (l.39-58). La sauvegarde **avant**
migration doit tourner sur l'ancien schéma, les suivantes sur le nouveau. `migrate-safely.mjs` n'a
besoin que de la copie binaire ; l'export JSON est mis à jour pour le nouveau schéma (T4).

### État actuel des fichiers touchés, et ce qui doit être préservé

**Schéma et infrastructure**
- `server/db/schema.ts` — PK textuelles `category_groups.code`, `category_items.code` ;
  FK texte `category_items.group_code`, `transactions.category_item_code`,
  `classification_rules.category_item_code`. Commentaires porteurs de décisions (is_manual à double
  sens l.93-98, settlement_group_id sans ON DELETE l.100-111, règles l.148-165) : **les conserver**.
- `server/db/migrations/` — 0000 à 0009, journal `meta/_journal.json`.
- `server/middleware/0.bootstrap.ts` — marqueurs de schéma + seed inline, seed uniquement sur base
  vierge (anti-résurrection, revue du 2026-09-05).
- `scripts/backup-db.mjs` — copie binaire + export JSON des corrections par codes.
- `tests/fixtures/test-schema.ts` — DDL miroir du schéma pour les tests unitaires : **à répercuter à
  l'identique** (« un seul endroit », en-tête du fichier). Garder l'écart assumé sur `created_at`.
- `tests/e2e/global-setup.ts` — rejoue le journal : rien à changer, mais c'est lui qui valide AC 7.

**Utilitaires serveur (code → id, dans le profil)**
- `server/utils/category-fk.ts` — `assertCategoryItemExists`, `assertGroupExists`.
- `server/utils/category-references.ts` — comptages par `transactions.categoryItemCode` et
  `categoryItems.groupCode` (FR18) : passer par les id.
- `server/utils/category-labels.ts` — unicité des libellés **sur tout le référentiel** : désormais
  **dans le profil** (sinon le second profil ne pourra jamais créer « Alimentation »).
- `server/utils/rule-coverage.ts` — sélectionne `transactions.categoryItemCode` : joindre.
- `server/utils/settlement-status.ts` — reçoit des lignes avec `categoryItemCode` : inchangé si les
  appelants fournissent le code.

**Endpoints (lecture : joindre ; écriture : résoudre + `profile_id`)**
- `server/api/analysis.get.ts` (l.57-71), `server/api/evolution.get.ts` (l.71-78, 142, 163)
- `server/api/transactions/index.get.ts` (filtres par poste/rubrique l.56-70, coupe du joint
  `JOINT_TRANSFER_ITEM_CODE` l.70 et l.147 : **à conserver**, résoudre le code en id)
- `server/api/transactions/[id].patch.ts` (reclassement + suggestion de règle l.74-91)
- `server/api/statements/index.get.ts` (l.50, `ACCEPT_GAP_ITEM_CODE` exclu de l'écart)
- `server/api/statements/[hash].get.ts` (l.42)
- `server/api/reconciliation/[hash].post.ts` (pré-check FK l.78-87, ligne d'écart accepté l.127-151)
- `server/api/rules/index.get.ts`, `index.post.ts`, `[id]/apply.post.ts`, `preview.get.ts`,
  `[id].delete.ts`
- `server/api/categories/index.get.ts`, `groups/index.post.ts`, `groups/[code].patch.ts`,
  `groups/[code].delete.ts`, `items/index.post.ts`, `items/[code].patch.ts`,
  `items/[code].delete.ts` — les paramètres d'URL restent des **codes**, résolus dans le profil.
- `server/api/settlements/index.post.ts`, `[id].delete.ts`

**Services**
- `server/services/statement-ingestion-orchestrator.ts` — lecture du référentiel (l.123-136),
  règles (l.273), insertion du relevé (l.299 : + `profileId`, + `bank: 'boursorama'`) et des
  transactions (l.312-317 : code → id). Le modèle renvoie des **codes** : la résolution se fait
  ici, sur une table code → id chargée une fois par ingestion.
- `server/services/llm-categorizer.ts`, `rule-matcher.ts`, `analysis-engine.ts` — travaillent sur
  des codes. **Pas de changement fonctionnel.**

**Points d'insertion dans une table possédée (tous doivent fournir `profile_id`)**
`0.bootstrap.ts` (seed), `rules/index.post.ts:47`, `settlements/index.post.ts:50`,
`categories/groups/index.post.ts:53`, `categories/items/index.post.ts:82`,
`statement-ingestion-orchestrator.ts:299`. Les insertions dans `transactions`
(`reconciliation/[hash].post.ts:95,146`, orchestrateur l.312) n'en portent pas (AC 5), mais
résolvent le code en id.

**Front** : aucun changement attendu — c'est le critère de réussite de l'AC 6. Si un composant
casse, c'est que le contrat d'API a bougé.

### Conventions à respecter (CLAUDE.md)

- Colonnes `snake_case`, FK `{singulier}_id`, index `{table}_{cols}_idx`.
- Aucune écriture hors Drizzle, sauf **migrations** (SQL assumé) et scripts de sauvegarde/benchs.
- `createError` + codes stables dans `shared/schemas/api-errors.ts`, messages FR dans
  `app/composables/useApiError.ts`. Nouveau code possible : `profile_required` — **pas avant 27.2**.
- Pas de `try/catch` silencieux ; pas de `console.log` (seulement `warn`/`error`).
- `git add` fichier par fichier ; ne jamais commiter `_data/`.

### Tests

- `tests/fixtures/test-schema.ts` : DDL et seeds mis à jour ; ajouter `profiles` et un profil 1.
- Tests qui insèrent en SQL brut, à adapter : `server/api/analysis.get.test.ts`,
  `evolution.get.test.ts`, `categories/categories.test.ts`, `reconciliation/[hash].post.test.ts`,
  `rules/rules.test.ts`, `statements/[hash].get.test.ts`, `statements/index.get.test.ts`,
  `transactions/[id].patch.test.ts`, `transactions/index.get.test.ts`,
  `middleware/bootstrap.test.ts`, `services/statement-ingestion-orchestrator.test.ts`.
- **Nouveau** — test de migration : construire une base au schéma 0009 (en rejouant 0000-0009),
  y insérer un jeu représentatif (deux rubriques, un poste créé à la main, transactions dont une
  corrigée `is_manual`, une ligne d'écart accepté, une règle, un groupe avec deux lignes, un virement
  du joint), appliquer 0010 **dans une transaction** (comme `drizzle-kit migrate`), puis vérifier :
  comptages, sommes par relevé, `(COUNT, SUM)` par code, `foreign_key_check` vide, `profile_id` = 1
  partout, `bank = 'boursorama'`. C'est ce test qui attrape le Piège n°1.
- **Nouveau** — `seedReferential` : un profil vide est semé, un profil qui a des rubriques ne l'est
  jamais.
- **Non-régression** — les tests du moteur (`analysis-engine.test.ts`) et de `rule-matcher` ne
  doivent **pas** bouger : s'ils bougent, la frontière code/id a fui dans le moteur.
- E2E : `yarn test:e2e` (base reconstruite depuis les migrations) — valide AC 7.
- NFR3 inchangée : aucune fonction de calcul modifiée.

### Hors périmètre de cette story

- Cookie `pf_profile`, filtrage des lectures par profil, 404 inter-profils, test d'architecture →
  **27.2**.
- Création / choix de profil, en-tête → **27.3**.
- Champ `bank` au dépôt, formats par banque → **28.1**. Ici, l'orchestrateur écrit
  `bank: 'boursorama'` en dur, **avec un commentaire** pointant vers 28.1.

### Project Structure Notes

- Nouveaux fichiers : `shared/types/bank.ts`, `server/utils/current-profile.ts`,
  `server/utils/seed-referential.ts`, `scripts/migrate-safely.mjs`,
  `server/db/migrations/0010_*.sql` + snapshot.
- Aucun conflit de structure détecté. `requireProfile` vit dans `server/utils/` comme les autres
  utilitaires transverses (`errors.ts`, `validation.ts`).

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#D37 — Le profil est le propriétaire]
- [Source: _bmad-output/planning-artifacts/architecture.md#D38] (signature `requireProfile`)
- [Source: _bmad-output/planning-artifacts/architecture.md#D39 — seed par profil]
- [Source: _bmad-output/planning-artifacts/architecture.md#D40 — banque portée par le relevé]
- [Source: _bmad-output/planning-artifacts/architecture.md#D30] (clés, rebuild, garde-fous)
- [Source: _bmad-output/planning-artifacts/architecture.md#D21] (migrations versionnées)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 27.1]
- [Source: _bmad-output/planning-artifacts/prd.md#FR75] · NFR12 · « Profil et membre »
- [Source: CLAUDE.md] conventions, anti-patterns, boundaries
- [Source: server/db/migrations/0008_exotic_darkstar.sql] précédent de rebuild (table enfant seule)

### Questions ouvertes (à trancher par le dev ou remonter)

1. **Transaction de `drizzle-kit migrate` 0.31** : confirmer sur la version installée
   (`drizzle-orm ^0.45.2`, `drizzle-kit ^0.31.10`) que les migrations SQLite tournent bien dans une
   transaction. La recette « enfants d'abord » est sûre dans les deux cas ; la confirmation dit
   seulement si le Piège n°1 était réel.
2. **Grain du contrôle « rien de perdu »** : `(COUNT, SUM)` par code de poste suffit à prouver
   que les classements ont survécu ; il ne prouve pas qu'une ligne n'a pas échangé son poste avec
   une autre de même montant. Si le dev veut une preuve ligne à ligne, comparer
   `(id, category code)` avant/après — coût négligeable sur ~2 400 lignes. Recommandé.

## Dev Agent Record

### Agent Model Used

Agent de développement (exécution du skill `bmad-dev-story`).

### Debug Log References

- Confirmation Q1 (transaction `drizzle-kit migrate`) : oui, `drizzle-orm/better-sqlite3/migrator.js`
  exécute chaque fichier de migration comme un seul appel `db.transaction(...)` — le Piège n°1
  décrit dans les Dev Notes est réel. Vérifié en isolant la migration 0010 (déplacement temporaire
  hors de `server/db/migrations/`), en construisant une base 0000-0009 via `drizzle-kit migrate`
  (bookkeeping `__drizzle_migrations` correct), puis en la migrant vers 0010.
- Bug réel trouvé et corrigé pendant cette validation : le fichier `0010_profiles_and_category_ids.sql`
  ouvrait sur un bloc de commentaires suivi d'un marqueur `--> statement-breakpoint` isolé. Le
  migrateur drizzle-orm découpe le fichier sur ce marqueur et prépare CHAQUE segment comme une
  requête SQL individuelle ; un segment ne contenant QUE des commentaires fait échouer
  `Database.prepare()` avec `RangeError: The supplied SQL string contains no statements`. Le
  test unitaire de migration (`db.exec()` sur le texte complet, qui tolère les commentaires) ne
  l'attrapait PAS — seul un passage par le vrai migrateur drizzle-orm/`drizzle-kit migrate` le
  révèle. Corrigé en fusionnant l'en-tête dans le même segment que le premier `CREATE TABLE`, et
  en reformulant le commentaire pour qu'aucun texte du fichier ne cite littéralement le marqueur
  de segment (qui aurait réintroduit la même coupure). Revalidé de bout en bout avec
  `db:migrate-safe` : sauvegarde vérifiée, migration appliquée, comptages/sommes identiques,
  `foreign_key_check` vide.
- `yarn db:generate` non interactif a échoué (`Interactive prompts require a TTY terminal`) sur ce
  rebuild : drizzle-kit ne peut pas décider seul si un changement de PK est un rename ou un
  drop+add. Migration, snapshot (`meta/0010_snapshot.json`) et entrée de journal écrits à la main,
  au format exact de drizzle-kit (vérifié champ à champ contre `0008`/`0009_snapshot.json`).
- Worktree initial branché sur un point très antérieur de l'historique (story 5.4, avant le pivot
  du 2026-09-04) au lieu de la branche `master` locale courante — écart découvert au premier
  `git log`. Recalé sur `master` (`git reset --hard master`, arbre alors propre, aucun travail
  perdu) avant de commencer l'implémentation.

### Completion Notes List

- Schéma Drizzle réécrit (T1) : `profiles`, `category_groups`/`category_items` à clé de
  substitution + `uniqueIndex(profile_id, code)`, `bank_statements` + `profile_id`/`bank`,
  `transactions.category_item_id` sans `profile_id` (AC 5), `classification_rules` +
  `profile_id`/`category_item_id` + `uniqueIndex(profile_id, pattern)`, `settlement_groups` +
  `profile_id`.
- Migration `0010` (T2) suit la recette « Piège n°1 » à la lettre : parents `__new_*` créés et
  peuplés avant les enfants, anciennes tables enfants supprimées avant les parentes, renommage
  (réécriture des FK par SQLite en `legacy_alter_table=OFF`), index recréés. Test de migration
  dédié (`0010-profiles-and-category-ids.test.ts`) rejoue 0000-0009 hors transaction puis applique
  0010 DANS une transaction (comme `drizzle-kit migrate`) sur un jeu représentatif (deux
  rubriques, poste créé à la main, transaction corrigée `is_manual`, écart accepté, règle, groupe
  de réconciliation) : comptages, sommes par relevé, `(COUNT, SUM)` par code ET grain ligne à
  ligne (id, code) identiques avant/après, `foreign_key_check` vide, `profile_id = 1`/
  `bank = 'boursorama'` partout, ids de `transactions`/`classification_rules`/`settlement_groups`
  préservés.
- `scripts/migrate-safely.mjs` (T3) validé de bout en bout hors dépôt (voir Debug Log) — c'est
  cette validation qui a fait remonter le bug réel de segmentation SQL de la migration.
- `scripts/backup-db.mjs` (T4) réécrit avec jointures ; chaque ligne exportée porte désormais le
  nom du profil.
- `requireProfile` (T5) a une signature finale `(event?): number` — le `?` est un détail
  d'implémentation pour ne pas devoir modifier 21 appels de test de l'orchestrateur d'ingestion
  qui ne construisent pas d'`H3Event` ; la fonction n'inspecte pas encore l'event (27.2).
- Résolution code ↔ id (T6) : tous les endpoints/services listés dans les Dev Notes ont été
  vérifiés et corrigés. Contrat d'API inchangé (AC 6) — confirmé par la suite E2E existante, qui
  passe sans modification des specs ni des composants Vue.
- Bootstrap (T7) : seed par profil, marqueurs de schéma mis à jour, garde anti-résurrection
  couverte par un test dédié (`seed-referential.test.ts`) — profil sans rubrique semé, profil
  déjà peuplé jamais re-semé (même après suppression de la quasi-totalité de son référentiel),
  profils indépendants les uns des autres.
- **Résultats réels** : `yarn test:run` → 616 passed, 5 skipped (0 failed) ; `yarn lint` → 0
  erreur ; `yarn typecheck` → 0 erreur ; `yarn test:e2e` → 37 passed, 7 skipped (skips
  pré-existants, non liés à cette story : PDF de fixture / `MISTRAL_API_KEY` absents de cet
  environnement) ; `db:migrate-safe` validé de bout en bout hors dépôt.
- **Écart à la story** : le second `yarn db:generate` demandé en T2 pour prouver l'absence de
  diff n'a pas pu tourner (pas de TTY dans cet environnement, cf. Debug Log). Compensé par la
  vérification manuelle du snapshot écrit à la main contre le format de drizzle-kit, et surtout
  par l'exécution réelle de `drizzle-kit migrate` (via `db:migrate-safe`) sur une base construite
  par drizzle-kit lui-même — preuve plus forte qu'un diff de snapshot, puisqu'elle exerce le
  migrateur réel plutôt qu'une comparaison statique.
- **Point à prioriser en revue** : la migration `0010_profiles_and_category_ids.sql` elle-même
  (recette de rebuild, jointures code → id, ordre des DROP/RENAME) et le test de migration
  associé ; c'est la partie la plus risquée de la story et celle qui a déjà révélé un bug réel
  pendant le développement.

### Corrections post-revue (pr-reviewer)

- Migration 0010 : `JOIN` → `LEFT JOIN` sur les trois copies code→id (category_items,
  transactions, classification_rules) — un code orphelin ne disparaît plus en silence, l'INSERT
  échoue sur la colonne `NOT NULL` et toute la transaction de migration s'annule. Cas orphelin
  ajouté au test de migration (doit lever, 0 perte).
- `0.bootstrap.ts` : message de schéma périmé pointe vers `yarn db:migrate-safe`.
- `backup-db.mjs` : lecture adaptative (0009/0010, via `PRAGMA table_info`), comme
  `migrate-safely.mjs`. Validé sur les deux schémas hors dépôt.
- Test de migration : segments appliqués via `db.prepare(stmt).run()` (comme le migrateur réel),
  plus le cas orphelin.
- `migrate-safely.mjs` : photo étendue aux triplets (transaction.id, code), (règle.id, code),
  (poste.code, code de rubrique) ; `fail()` distingue échec avant/après migration et ne prétend
  plus « rien touché » quand la migration a déjà écrit.
- `requireProfile`/`ingestStatement` : `event` redevenu obligatoire (21 appels de test mis à
  jour avec un `H3Event` factice).
- `statements/index.get.ts` : sous-requête scalaire → `NOT IN`, robuste à plusieurs profils.
- `rules/[id]/apply.post.ts` : `continue` silencieux remplacé par une erreur explicite (500).
- `reconciliation/[hash].post.ts` : le `catch` ne reconvertit plus que l'erreur domaine 422 de
  `resolveItemId` ; le reste remonte tel quel.
- `0.bootstrap.ts` : `seedReferential` appelé dans `db.transaction()` par profil.
- **Validation sur copie de la vraie base** (`_data/personnalfinance.db`, jamais modifiée —
  copie en lecture seule via l'API `backup()` de SQLite vers le scratchpad, supprimée après) :
  `integrity_check` = `ok`, `foreign_key_check` = `[]`, 0 ligne orpheline (transactions, règles,
  postes) avant migration. `db:migrate-safe` appliqué sur la copie : migration réussie, aucune
  perte — comptages identiques avant/après (bank_statements 20, category_groups 15,
  category_items 61, transactions 1855, classification_rules 31, settlement_groups 2), profil
  `marceau` créé.
- Suite verte après corrections : `yarn test:run` 617 passed / 5 skipped ; `yarn lint` 0 erreur ;
  `yarn typecheck` 0 erreur ; `yarn test:e2e` 37 passed / 7 skipped (pré-existants).

### File List

**Nouveaux fichiers**
- `shared/types/bank.ts`
- `server/db/migrations/0010_profiles_and_category_ids.sql`
- `server/db/migrations/meta/0010_snapshot.json`
- `server/db/migrations/0010-profiles-and-category-ids.test.ts`
- `server/utils/current-profile.ts`
- `server/utils/seed-referential.ts`
- `server/utils/seed-referential.test.ts`
- `scripts/migrate-safely.mjs`

**Fichiers modifiés**
- `server/db/schema.ts`
- `server/db/migrations/meta/_journal.json`
- `server/middleware/0.bootstrap.ts`
- `server/utils/category-fk.ts`
- `server/utils/category-labels.ts`
- `server/utils/category-references.ts`
- `server/utils/rule-coverage.ts`
- `server/services/statement-ingestion-orchestrator.ts`
- `server/services/statement-ingestion-orchestrator.test.ts`
- `server/api/analysis.get.ts`
- `server/api/evolution.get.ts`
- `server/api/transactions/index.get.ts`
- `server/api/transactions/[id].patch.ts`
- `server/api/statements/index.get.ts`
- `server/api/statements/[hash].get.ts`
- `server/api/statements/index.post.ts`
- `server/api/reconciliation/[hash].post.ts`
- `server/api/rules/index.get.ts`
- `server/api/rules/index.post.ts`
- `server/api/rules/[id]/apply.post.ts`
- `server/api/categories/index.get.ts`
- `server/api/categories/groups/index.post.ts`
- `server/api/categories/groups/[code].patch.ts`
- `server/api/categories/items/index.post.ts`
- `server/api/categories/items/[code].patch.ts`
- `server/api/settlements/index.post.ts`
- `scripts/backup-db.mjs`
- `package.json`
- `CLAUDE.md`
- `tests/fixtures/test-schema.ts`
- `server/middleware/bootstrap.test.ts`
- `server/api/analysis.get.test.ts`
- `server/api/evolution.get.test.ts`
- `server/api/categories/categories.test.ts`
- `server/api/reconciliation/[hash].post.test.ts`
- `server/api/rules/rules.test.ts`
- `server/api/statements/[hash].get.test.ts`
- `server/api/statements/index.get.test.ts`
- `server/api/transactions/[id].patch.test.ts`
- `server/api/transactions/index.get.test.ts`
