# Story 27.1: Tout mon historique m'appartient, sans rien perdre

Status: ready-for-dev

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

- [ ] **T1 — Schéma Drizzle** (AC 1, 4, 5)
  - [ ] `shared/types/bank.ts` : `BANKS = ['boursorama', 'credit_mutuel'] as const`, type `Bank`,
        libellés FR à côté (`BANK_LABELS`). Anglais sans accent pour les valeurs (CLAUDE.md).
  - [ ] `server/db/schema.ts` : table `profiles` (`id` integer PK autoincrement, `name` text unique
        not null, `default_bank` text enum `BANKS` not null, `created_at`).
  - [ ] `category_groups` : `id` PK entier, `profile_id` FK `profiles.id` NOT NULL, `code` text,
        `uniqueIndex(profile_id, code)`.
  - [ ] `category_items` : `id` PK entier, `profile_id` FK NOT NULL, `code`, `group_id` FK
        `category_groups.id` `ON DELETE RESTRICT` (remplace `group_code`), `uniqueIndex(profile_id,
        code)`, index sur `group_id`.
  - [ ] `bank_statements` : + `profile_id` FK NOT NULL, + `bank` enum NOT NULL. **PK reste
        `hash_sha256`** (D37, arbitrage du 2026-09-22).
  - [ ] `transactions` : `category_item_id` FK `category_items.id` `ON DELETE RESTRICT` (remplace
        `category_item_code`), index `transactions_item_idx` sur la nouvelle colonne. **Aucun**
        `profile_id`. `settlement_group_id` : voir T2, profiter du rebuild pour déclarer ce qui est
        réellement en base (commentaire existant l.100-111 du schéma).
  - [ ] `classification_rules` : + `profile_id`, `category_item_id` (remplace le code),
        `uniqueIndex(profile_id, pattern)` à la place de `.unique()` sur `pattern`.
  - [ ] `settlement_groups` : + `profile_id` FK NOT NULL.
  - [ ] Garder en tête du fichier l'import RELATIF (`drizzle-kit` ne résout pas `~~/`, l.17-22).
- [ ] **T2 — Migration `0010`** (AC 1, 3, 4, 5, 7)
  - [ ] `yarn db:generate` pour obtenir le snapshot et le squelette, puis **réécrire à la main** les
        copies de données (le `INSERT … SELECT` généré ne sait pas traduire code → id).
        Précédents : `0002` (INSERT généré retiré à la main), `0005` et `0009` (DML dans une
        migration générée).
  - [ ] Ordre de rebuild — voir « Piège n°1 » : créer les `__new_*` parents avant enfants, copier,
        **supprimer les anciennes tables enfants avant les parents**, puis renommer.
  - [ ] `INSERT INTO profiles (id, name, default_bank, created_at) VALUES (1, 'marceau',
        'boursorama', strftime('%s','now'))` — inconditionnel : sur une base neuve aussi (AC 7).
  - [ ] Copies : `profile_id = 1` partout ; `group_id` et `category_item_id` résolus par jointure
        sur les anciens codes ; `bank = 'boursorama'`. Conserver les `id` existants de
        `transactions`, `classification_rules` et `settlement_groups` (URLs, groupes, export).
  - [ ] Recréer tous les index (le rebuild les perd).
  - [ ] Vérifier qu'un second `yarn db:generate` **ne produit aucun diff** (snapshot cohérent).
- [ ] **T3 — Procédure de migration sûre** (AC 2, 3)
  - [ ] Nouveau script `scripts/migrate-safely.mjs` + entrée `package.json` (`db:migrate-safe`) :
        1) copie binaire via `db.backup()` (même mécanisme que `backup-db.mjs`, sûr en WAL) ;
        2) vérification de la copie : ouverture, `integrity_check`, comptage par table = source ;
        3) photo « avant » : comptage par table, `SUM(amount_cents)` par `statement_hash`,
           `(COUNT, SUM)` par code de poste (jointure adaptée au schéma lu) ;
        4) `drizzle-kit migrate` ;
        5) photo « après », comparaison, `PRAGMA foreign_key_check` vide ;
        6) tout écart → sortie non nulle, message en français donnant le chemin de la sauvegarde
           à restaurer.
  - [ ] La photo « avant » doit fonctionner sur l'**ancien** schéma et la photo « après » sur le
        **nouveau** : lire le schéma (`PRAGMA table_info`) plutôt que supposer.
  - [ ] Documenter dans `CLAUDE.md` § Commandes utiles : `yarn db:migrate-safe`.
- [ ] **T4 — `scripts/backup-db.mjs`** : l'export JSON lit `category_item_code` et `group_code`,
      qui n'existeront plus. Le réécrire avec jointures pour **ré-exposer des codes** (l'export doit
      rester indépendant des identifiants techniques — c'est sa raison d'être, en-tête du fichier)
      et y ajouter le nom du profil par ligne.
- [ ] **T5 — Profil courant, version minimale** (AC 6)
  - [ ] `server/utils/current-profile.ts` : `requireProfile(event): number`. Dans CETTE story, il
        renvoie l'identifiant de **l'unique** profil et lève une erreur explicite s'il y en a zéro
        ou plusieurs. Le cookie et le filtrage arrivent en 27.2 ; la signature, elle, est finale
        (AR35).
  - [ ] Toutes les **écritures** dans une table possédée l'utilisent pour `profile_id` : voir la
        liste « Points d'insertion ».
- [ ] **T6 — Résolution code ↔ id côté serveur** (AC 6)
  - [ ] `server/utils/category-fk.ts` : remplacer `assertCategoryItemExists(code)` par
        `resolveItemId(profileId, code): number` (422 si inconnu, même payload qu'aujourd'hui) et
        `assertGroupExists` par `resolveGroupId(profileId, code)` (404 `group_not_found`
        inchangé). Toujours **dans le profil** : un code n'est unique que dans un profil.
  - [ ] Lectures : partout où une requête sélectionne `transactions.categoryItemCode`, joindre
        `categoryItems` sur `categoryItems.id = transactions.categoryItemId` et sélectionner
        `categoryItemCode: categoryItems.code`. Même chose pour `groupCode` via `group_id`.
  - [ ] Le moteur (`analysis-engine.ts`), `rule-matcher.ts`, `settlement-status.ts` et le prompt
        continuent de travailler sur des **codes** : **ne pas les modifier** (hors tests).
- [ ] **T7 — Bootstrap** (AC 7)
  - [ ] Extraire le seed de `server/middleware/0.bootstrap.ts` (l.146-180) vers
        `server/utils/seed-referential.ts` : `seedReferential(runner, profileId)` (runner =
        `db` ou transaction). Réutilisé par 27.3.
  - [ ] Bootstrap : semer **chaque profil sans rubrique**, plus « la base » (comportement anti-
        résurrection de 2026-09-05 conservé : un profil qui a déjà des rubriques n'est jamais ré-semé).
  - [ ] `SCHEMA_MARKERS` : remplacer le marqueur `transactions.category_item_code` par
        `transactions.category_item_id` et ajouter `table profiles` ; le marqueur des postes du
        compte joint (migration 0009) devient **par profil** (chaque profil ayant des rubriques doit
        les porter avec leur nature). Garder la garde « base vierge ».
- [ ] **T8 — Tests** (AC 3, 6, 7, 8) — voir « Tests ».

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

### Debug Log References

### Completion Notes List

### File List
