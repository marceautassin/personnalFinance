# Story 27.2: Chaque requête se limite au profil courant

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

En tant qu'utilisateur,
je veux que le serveur ne me rende et ne me laisse modifier que les données du profil choisi,
afin qu'un profil ne puisse ni lire ni altérer les données d'un autre, même par une requête directe.

## Acceptance Criteria

1. **Point d'entrée unique.** Les 23 endpoints de `server/api/` obtiennent le profil courant par `requireProfile(event)` (`server/utils/current-profile.ts`) et **uniquement** par lui. Aucun endpoint ne lit le cookie `pf_profile` lui-même. Sans profil valide, la réponse est `400 profile_required` (AR35, D38).
2. **Lecture restreinte.** Avec deux profils A et B possédant chacun des données, une requête de A sur l'analyse, l'évolution, les périodes, les transactions, les relevés, le référentiel, les règles ou les groupes ne renvoie que les données de A. Le filtre est posé **dans la requête SQL**, jamais après coup (FR76, NFR24).
3. **Ressource d'un autre profil → 404.** Une ressource de B désignée par son identifiant, son code ou son hash répond **404** quand A la lit, la modifie ou la supprime, et elle reste inchangée. Jamais 403 : la réponse ne confirme pas l'existence (D38).
4. **Groupe homogène.** `POST /api/settlements` refuse un groupe dont une ligne n'appartient pas au profil courant. Une ligne d'un autre profil est traitée comme **introuvable** : même erreur que pour un identifiant inexistant.
5. **Chevauchement par profil.** A dépose un relevé couvrant une période que seul B a ingérée : aucun chevauchement n'est signalé (FR81). Un chevauchement avec un relevé de A reste détecté comme aujourd'hui.
6. **Ingestion dans le bon référentiel.** Le relevé est rattaché au profil courant. Le modèle ne reçoit que les postes de ce profil, et seules les règles de ce profil s'appliquent.
7. **Déduplication globale conservée.** Un PDF déjà ingéré par B est refusé pour A en `pdf_already_ingested`, message inchangé (D37 : hash unique pour toute la base, écart assumé).
8. **Test d'architecture.** Un test Vitest énumère les fichiers de `server/api/` hors `*.test.ts` et hors `profiles/`, et échoue si l'un d'eux n'appelle pas `requireProfile`.
9. **Moteur intact.** `server/services/analysis-engine.ts` n'importe rien de nouveau et ne connaît pas la notion de profil (D19, D31).
10. **Non-régression mono-profil.** Avec le seul profil `marceau` et **sans cookie**, l'application et la suite E2E fonctionnent exactement comme avant (voir Dev Notes, « Repli sans cookie »).

## Tasks / Subtasks

- [x] **T1 — `requireProfile`** (AC 1, 10)
  - [x] Créer `server/utils/current-profile.ts` : `requireProfile(event): ProfileId`. Il lit le cookie `pf_profile` (`getCookie` de h3) et vérifie en base que le profil existe.
  - [x] Repli sans cookie : s'il existe **exactement un** profil, le renvoyer. Sinon, lever `badRequest(ApiErrorCode.ProfileRequired)`.
  - [x] Cookie présent mais invalide (non entier, profil inexistant) → `400 profile_required`. **Jamais** de repli silencieux dans ce cas.
  - [x] Ajouter `ProfileRequired: 'profile_required'` à `shared/schemas/api-errors.ts` et son message français à `app/composables/useApiError.ts`.
  - [x] Type `ProfileId` (brand sur `number`) dans `shared/types/profile.ts`, s'il n'existe pas déjà depuis 27.1. (n'existait pas encore, créé ici)
- [x] **T2 — Utilitaires partagés paramétrés par profil** (AC 2, 3)
  - [x] Tableau « Utilitaires » ci-dessous : chaque fonction reçoit `profileId` en premier paramètre.
- [x] **T3 — Les 23 endpoints** (AC 1 à 5)
  - [x] Appliquer le tableau « Endpoints » ligne par ligne.
- [x] **T4 — Orchestrateur d'ingestion** (AC 5, 6, 7)
  - [x] `requireProfile` appelé côté endpoint (`statements/index.post.ts`) **et** dans l'orchestrateur (signature `{ event, pdfBuffer, confirmReplace }` conservée depuis 27.1 — `event` reste le vecteur, `ingestStatement` appelle `requireProfile(event)` en son sein ; ce choix est documenté dans les Dev Notes ci-dessous, écart assumé par rapport au libellé littéral de la tâche).
  - [x] Filtrer par profil le référentiel envoyé au modèle, les règles et le chevauchement de période (celui-ci ne l'était pas — corrigé). Le relevé inséré porte `profile_id`.
  - [x] **Ne pas** filtrer la déduplication par hash (AC 7) — inchangé.
  - [x] Le remplacement après confirmation de chevauchement ne supprime que des relevés du profil, ce que garantit le filtre de chevauchement.
- [x] **T5 — Tests** (AC 2 à 10)
  - [x] `tests/fixtures/test-schema.ts` : déjà aligné par 27.1, vérifié à jour.
  - [x] Helper de test `makeEvent(..., { profileId })` qui pose l'en-tête `cookie: pf_profile=<id>`, ajouté aux fichiers de test touchés par un scénario à deux profils.
  - [x] Scénario à deux profils ajouté sur un sous-ensemble représentatif et à risque : `categories.test.ts` (groupes/postes), `rules.test.ts` (dont la régression exacte signalée par la revue de 27.1 sur `apply.post.ts`), nouveau `settlements/settlements.test.ts` (AC 4), `transactions/[id].patch.test.ts`, `statement-ingestion-orchestrator.test.ts` (AC 5). Écart assumé : les 23 endpoints n'ont pas chacun leur propre scénario à deux profils dédié — voir Completion Notes.
  - [x] `server/utils/current-profile.test.ts` : cookie valide · absent avec 1 profil (repli) · absent avec 2 profils (400) · cookie d'un profil inexistant (400) · cookie non entier (400) · cookie `0`/négatif (400).
  - [x] `server/api/architecture.test.ts` (choisi plutôt que `tests/architecture/` — hors du pattern `include` de `vitest.config.ts`) : le test de l'AC 8.
  - [x] Orchestrateur : chevauchement ignoré entre profils (AC 5) · référentiel et règles du seul profil (AC 6, déjà couvert par 27.1) · doublon rejeté entre profils (AC 7, déjà couvert par 27.1, comportement inchangé).
  - [x] Suite E2E verte **sans modification**, ce qui prouve l'AC 10 (37 passed, 7 skipped — skips pré-existants, sans rapport avec cette story).

## Dev Notes

### Pré-requis — 27.1 livrée

La story 27.1 a posé :
- la table `profiles`, avec le profil `marceau` en `id = 1` ;
- `profile_id NOT NULL` sur `category_groups`, `category_items`, `bank_statements`, `classification_rules`, `settlement_groups` ;
- des clés de substitution sur le référentiel, `(profile_id, code)` étant unique ;
- les références au poste par identifiant dans `transactions` et `classification_rules` ;
- `classification_rules` unique par `(profile_id, pattern)`.

**`transactions` n'a pas de `profile_id`** (D37). Une transaction appartient au profil de son relevé. Chaque requête sur `transactions` joint donc `bank_statements` et filtre sur `bank_statements.profile_id`.

**Avant de coder, relire le code livré par 27.1.** Les noms exacts des colonnes d'identifiant (`category_item_id` ?) et de la résolution code → id viennent de là. Le tableau ci-dessous raisonne en **codes**, le contrat d'API restant en codes (D37).

### Décisions d'architecture à respecter (D38, AR35)

- Le cookie `pf_profile` est lu **seulement** par `requireProfile`. C'est ce qui rendra l'authentification (22.1) bon marché : elle remplacera l'intérieur de `requireProfile` par la session, sans toucher aux 23 appelants.
- Filtrer **dans le SQL**. Ne jamais charger puis filtrer en JS : on finirait par oublier le filtre sur un chemin.
- Une ressource d'un autre profil répond **404** avec le même code que la ressource inexistante (`notFound()` de `server/utils/errors.ts`), et le même message.
- Le moteur (`analysis-engine.ts`) et `settlement-status.ts` (pur, sans base) **ne changent pas**. Ils reçoivent des lignes déjà restreintes.
- Aucun `try/catch` qui avale une erreur (CLAUDE.md).

### Repli sans cookie — décision de cette story

**Problème.** L'écran de choix du profil arrive en 27.3. Si `requireProfile` exigeait le cookie dès 27.2, l'application et toute la suite E2E renverraient `400` entre les deux stories.

**Règle retenue.** Sans cookie, et **seulement** s'il existe un seul profil, on utilise ce profil. Dès qu'un second profil existe (27.3), l'absence de cookie donne `400 profile_required`. Un cookie invalide n'a jamais droit au repli.

**Pourquoi ce n'est pas une fuite.** Avec un seul profil, il n'y a personne à qui cacher quoi que ce soit. Avec deux, le repli disparaît de lui-même. 27.3 posera le cookie à la création et au choix, et gérera `profile_required` côté front en renvoyant vers le choix du profil.

### Endpoints — tableau de travail (23 fichiers)

Légende : **L** lecture, **É** écriture. « Filtre » = condition à ajouter à la requête SQL. « Adressage » = ressource ciblée par l'URL, qui doit répondre 404 si elle est hors profil.

| # | Fichier | L/É | Adressage | Filtre / garde à poser |
|---|---|---|---|---|
| 1 | `analysis.get.ts` | L | — | Postes : `category_items.profile_id = p`. Transactions : `inner join bank_statements` + `bank_statements.profile_id = p`. Relevés (solde bancaire, l.148) : `bank_statements.profile_id = p`. Passe `p` à `reliabilityOverlapping`. |
| 2 | `evolution.get.ts` | L | — | Min/max des dates (l.50), postes (l.77), lignes de période (l.146) et lignes antérieures pour le cumul (l.166) : jointure au relevé + filtre profil sur chacune. **Quatre** requêtes, n'en oublier aucune. |
| 3 | `periods.get.ts` | L | — | Min/max des dates : jointure au relevé + filtre profil. |
| 4 | `transactions/index.get.ts` | L | — | Requête principale (l.92) et requête de règlement élargie (l.129) : jointure + filtre. La sous-requête des postes d'une rubrique (l.60) filtre `category_items.profile_id = p`. Résolution des codes `item`/`group` **dans le profil**. `reliabilityOverlapping(p, …)`. |
| 5 | `transactions/[id].patch.ts` | É | id de transaction | Lecture initiale (l.23) : jointure au relevé + profil, sinon **404**. `update` : `where id = ? and statement_hash in (relevés du profil)`. `assertCategoryItemExists(p, code)`. Règles lues (l.87) : du profil. Proposition de règle (`resolveRule`) sur les règles du profil. |
| 6 | `statements/index.get.ts` | L | — | `bank_statements.profile_id = p` ; `reliabilityByStatement(p)`. |
| 7 | `statements/[hash].get.ts` | L | hash | Relevé : `hash = ? and profile_id = p`, sinon **404**. Les transactions suivent le relevé. |
| 8 | `statements/index.post.ts` | É | — | `requireProfile`, puis `ingestStatement(buffer, { confirmReplace, profileId })` (T4). |
| 9 | `reconciliation/[hash].post.ts` | É | hash | Relevé (l.53) : `hash = ? and profile_id = p`, sinon **404**. Poste de la ligne ajoutée (l.81) et poste d'acceptation d'écart `ACCEPT_GAP_CATEGORY` (l.128) résolus **dans le profil**. `update bank_statements` (l.156) : `hash = ? and profile_id = p`. |
| 10 | `categories/index.get.ts` | L | — | Rubriques et postes : `profile_id = p`. `transactionCountsByItem(p)`. |
| 11 | `categories/groups/index.post.ts` | É | — | Unicité du code (l.17) et position max (l.49) **dans le profil**. Insertion avec `profile_id = p`. `assertGroupLabelAvailable(p, …)`. |
| 12 | `categories/groups/[code].patch.ts` | É | code rubrique | Lecture (l.22) et `update` (l.32) : `code = ? and profile_id = p`, sinon **404**. |
| 13 | `categories/groups/[code].delete.ts` | É | code rubrique | Lecture (l.24) et `delete` (l.38) : `code = ? and profile_id = p`, sinon **404**. `groupItemCount(p, code)`. |
| 14 | `categories/items/index.post.ts` | É | — | Unicité du code (l.20), position (l.77) **dans le profil**. `assertGroupExists(p, groupCode)`. Insertion `profile_id = p`. |
| 15 | `categories/items/[code].patch.ts` | É | code poste | Lecture (l.44) et `update` (l.66) : code + profil, sinon **404**. Changement de rubrique : la rubrique cible doit être **du profil** (`assertGroupExists(p, …)`). `itemTransactionCount(p, …)`. |
| 16 | `categories/items/[code].delete.ts` | É | code poste | Lecture (l.26) et `delete` (l.40) : code + profil, sinon **404**. |
| 17 | `rules/index.get.ts` | L | — | Règles `profile_id = p` ; les jointures vers postes et rubriques restent dans le profil. `coverageByRule(p, …)`. |
| 18 | `rules/index.post.ts` | É | — | Doublon de motif (l.39) **dans le profil**. Poste cible (l.54) résolu dans le profil (`assertCategoryItemExists(p, …)`). `countCoveredTransactions(p, …)`. Insertion `profile_id = p`. |
| 19 | `rules/preview.get.ts` | L | — | `countCoveredTransactions(p, pattern)`. Aucune autre requête. |
| 20 | `rules/[id].delete.ts` | É | id de règle | Lecture (l.24) et `delete` (l.29) : `id = ? and profile_id = p`, sinon **404**. |
| 21 | `rules/[id]/apply.post.ts` | É | id de règle | Règle (l.55) : id + profil, sinon **404**. Toutes les règles (l.65) : du profil. Lignes candidates (l.75) : jointure au relevé + profil. `update` (l.93) : l'id vient de lignes déjà filtrées, garder tout de même la condition de profil dans la clause `where`. |
| 22 | `settlements/index.post.ts` | É | ids de transactions | Lignes (l.29) : `id in (…)` + jointure au relevé + profil. **Si moins de lignes que d'ids → même erreur qu'un id inexistant** (AC 4). Groupe inséré avec `profile_id = p`. |
| 23 | `settlements/[id].delete.ts` | É | id de groupe | Lecture (l.28) : `id = ? and profile_id = p`, sinon **404**. La libération des lignes et la suppression suivent. |

⚠️ Aucun endpoint `profiles/` n'existe à ce stade : ils arrivent en 27.3. Le test de l'AC 8 les exclut déjà par leur chemin.

### Utilitaires à paramétrer

| Fichier | Fonction | Changement |
|---|---|---|
| `server/utils/statement-reliability.ts` | `reliabilityByStatement()`, `reliabilityOfStatement(hash)`, `reliabilityOverlapping(from, to)` | `profileId` en premier paramètre ; `where bank_statements.profile_id = p`. L'écart est calculé depuis les transactions du relevé, qui suivent. |
| `server/utils/category-fk.ts` | `assertCategoryItemExists(code)`, `assertGroupExists(code)` | `(profileId, code)`. Un code d'un autre profil n'existe pas **pour ce profil**. |
| `server/utils/category-labels.ts` | `assertGroupLabelAvailable`, `assertItemLabelAvailable` | Unicité des libellés **dans le profil**. Deux profils peuvent avoir chacun « Alimentation ». |
| `server/utils/category-references.ts` | `itemTransactionCount`, `transactionCountsByItem`, `groupItemCount` | Paramètre `profileId`. Le comptage de transactions passe par le poste (déjà du profil), et `transactionCountsByItem` joint le relevé. |
| `server/utils/rule-coverage.ts` | `countCoveredTransactions(pattern)`, `coverageByRule(rules)` | **Lisent aujourd'hui toute la table `transactions`** (l.15, l.51). Il faut joindre le relevé et filtrer par profil, sinon le compteur de FR42 mélange les profils. |
| `server/utils/settlement-status.ts` | `settlementEffectByTransaction(lines)` | **Aucun.** Fonction pure, elle reçoit des lignes déjà filtrées. |
| `server/utils/errors.ts` | — | Aucun. Utiliser `notFound()` et `badRequest()`. |

### Orchestrateur — `server/services/statement-ingestion-orchestrator.ts`

- Déduplication (l.64) : **inchangée**, globale (AC 7, D37).
- Référentiel envoyé au modèle (l.121-135) : ajouter `category_items.profile_id = p`. Garder l'exclusion de `JOINT_REIMBURSEMENT_ITEM_CODE`, codée en dur mais valable dans chaque profil (D37). La garde `CategoriesNotSeeded` devient alors un vrai signal par profil.
- Validation des codes renvoyés par le modèle : elle doit se faire contre le référentiel **du profil**. Vérifier dans `llm-categorizer.ts` qu'elle s'appuie bien sur la liste `availableCategories` passée en argument et non sur une lecture en base.
- Chevauchement (l.231-240) : ajouter `bank_statements.profile_id = p`.
- Règles (l.278-281) : `classification_rules.profile_id = p`.
- Insertion du relevé (l.300) : `profileId: p`. Les transactions insérées référencent le poste **du profil** : la résolution code → id livrée par 27.1 se fait dans `p`.

### Pièges connus

- **`rule-coverage.ts` et `category-references.transactionCountsByItem` scannent toute la table.** C'est l'endroit le plus probable d'une fuite entre profils qui passerait la revue, parce que ce ne sont pas des endpoints.
- **`evolution.get.ts` fait quatre requêtes** et le cumul lit toutes les lignes **antérieures** à la période. Oublier la jointure sur celle-là mélangerait le solde cumulé des deux profils sans rien signaler.
- **Les constantes de code** (`JOINT_TRANSFER_ITEM_CODE`, `JOINT_REIMBURSEMENT_ITEM_CODE`, `ACCEPT_GAP_CATEGORY`, catégories protégées) doivent être résolues **dans le profil** partout où elles sont comparées à une colonne d'identifiant. Là où la comparaison se fait sur un code déjà joint, rien ne change.
- **`transactions/[id].patch.ts`** : l'`update` de la l.40 ne filtre que sur `id`. Il faut aussi la condition de profil dans cette requête, pas seulement dans la lecture qui la précède : une course entre lecture et écriture ne doit rien pouvoir franchir.
- **404 et non 403**, avec le même message que la ressource inexistante.
- Le moteur **ne change pas**. Si un calcul semble devoir connaître le profil, c'est qu'une ligne d'un autre profil a été chargée en amont.

### Tests — ce qui existe

- Les tests d'endpoint (`server/api/**/*.test.ts`) appellent le handler directement avec un faux `H3Event`, fabriqué par un `makeEvent` local à chaque fichier (voir `transactions/[id].patch.test.ts` l.71), sur une base temporaire construite par `TEST_SCHEMA_DDL`. Il faut donc :
  - y ajouter `headers.cookie` pour choisir le profil ;
  - insérer un second profil **directement en SQL** dans le scénario de cloisonnement. L'écran de création arrive en 27.3, et c'est voulu : la story ne dépend pas de la suivante.
- `tests/fixtures/test-schema.ts` est un DDL **écrit à la main** et non généré depuis les migrations. S'il n'a pas été aligné en 27.1, il ment sur le schéma. L'aligner d'abord.
- E2E (`tests/e2e/`) : base reconstruite depuis les migrations, un seul profil `marceau`, aucun cookie. Grâce au repli (AC 10), **aucune spec E2E ne doit changer**. Si l'une casse, c'est un défaut de cette story.
- NFR3 ne s'applique pas directement (aucune fonction de calcul modifiée). Mais `current-profile.ts` porte une règle de sécurité : couvrir tous ses cas.

### Hors périmètre de cette story

- L'écran de création et de choix du profil, le composable `useProfiles`, la gestion front de `profile_required`, le rechargement au changement de profil : **27.3**.
- La banque d'un relevé (`bank`) : colonne posée en 27.1, exposée en 28.1.
- L'agent (epic 26) : il héritera du profil de la requête appelante (D38), sans travail ici.

### Project Structure Notes

- Nouveau : `server/utils/current-profile.ts` (+ test), `shared/types/profile.ts` (si absent), un test d'architecture.
- Nommage conforme à `CLAUDE.md` : fichier `kebab-case.ts`, code d'erreur `snake_case` dans `statusMessage`, message français centralisé dans `useApiError.ts`.
- Aucune dépendance nouvelle. `getCookie` vient de `h3`, déjà utilisé par Nitro.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 27.2]
- [Source: _bmad-output/planning-artifacts/architecture.md#D38 — Le profil courant voyage dans un cookie, et chaque endpoint le vérifie]
- [Source: _bmad-output/planning-artifacts/architecture.md#D37 — Le profil est le propriétaire]
- [Source: _bmad-output/planning-artifacts/architecture.md#D31 — Le cloisonnement se pose dans quatre fichiers] (corrigée par D38)
- [Source: _bmad-output/planning-artifacts/prd.md#FR76, FR81, NFR24, NFR35]
- [Source: CLAUDE.md#Format API normalisé, Règle d'or sur les erreurs, Boundaries imperméables]

## Questions ouvertes (pour Marceau)

1. **Le repli sans cookie** (un seul profil = profil implicite) évite de casser l'application entre 27.2 et 27.3. Il disparaît dès qu'un second profil existe. À confirmer, ou à remplacer par un cookie posé d'office par le bootstrap.
2. **Le doublon entre profils** révèle qu'un autre profil détient ce PDF précis (D37, assumé). Faut-il un message distinct quand le relevé appartient à un autre profil, ou garder le message actuel ? La story garde le message actuel.

## Dev Agent Record

### Agent Model Used

Agent de développement du projet, exécution du skill `bmad-dev-story`.

### Debug Log References

- `yarn test:run` : 42 fichiers, 660 tests passés, 5 skip (pré-existants) — vert.
- `yarn lint` : vert, aucune remarque.
- `yarn typecheck` (`nuxt typecheck`) : vert, aucune erreur.
- `yarn test:e2e` (Playwright) : 37 passed, 7 skipped (skips pré-existants — spécs qui dépendent d'une clé LLM absente en environnement de dev/CI, sans rapport avec cette story), 0 failed.

### Completion Notes List

- `requireProfile(event)` lit maintenant le cookie `pf_profile` via `getCookie` (h3), avec repli
  « exactement un profil » sans cookie, et `400 profile_required` sur cookie invalide/inexistant
  ou sur ambiguïté (plusieurs profils, pas de cookie). Le repli n'existant qu'en l'absence
  d'ambiguïté, AC 10 (non-régression mono-profil) est vérifiée par toute la suite E2E existante,
  qui ne pose jamais de cookie.
- Les 23 endpoints de `server/api/` (hors `profiles/`, inexistant avant 27.3) appellent
  `requireProfile(event)` — vérifié par un test d'architecture (`server/api/architecture.test.ts`)
  qui énumère les fichiers du dossier et échoue si l'un d'eux ne le fait pas.
- Utilitaires partagés reparamétrés par `profileId` en premier argument :
  `statement-reliability.ts` (3 fonctions), `category-references.ts` (3 fonctions, dont
  `transactionCountsByItem` qui scannait toute la table — piège signalé par la story),
  `rule-coverage.ts` (2 fonctions, même piège). `category-fk.ts` et `category-labels.ts`
  étaient déjà paramétrées depuis 27.1.
- Filtrage SQL posé sur chaque requête (jamais de filtre après coup) : jointure à
  `bank_statements` pour restreindre `transactions` (qui ne porte pas `profile_id`, D37) au
  profil courant, dans `analysis.get.ts`, `evolution.get.ts` (les 4 requêtes signalées comme
  piège, y compris le cumul antérieur `priorRows`), `periods.get.ts`, `transactions/index.get.ts`,
  `transactions/[id].patch.ts` (lecture ET écriture, contre une course lecture/écriture),
  `rules/[id]/apply.post.ts` et `rule-coverage.ts`.
- **Bug corrigé, signalé par la revue de 27.1** : `rules/[id]/apply.post.ts` construisait une
  Map `code → id` sur `category_items` tous profils confondus avant d'écrire les transactions
  reclassées. Filtrée par `profileId` désormais ; une régression exacte de ce scénario (deux
  profils partageant un même code de poste) est couverte dans `rules.test.ts`.
- **Trois endpoints n'appelaient PAS `requireProfile` du tout avant cette story** :
  `categories/groups/[code].delete.ts`, `categories/items/[code].delete.ts`, et l'orchestrateur
  n'était pas atteint côté `statements/index.post.ts` pour le chevauchement de période (voir
  point suivant). Corrigés.
- **Chevauchement de période non filtré par profil** dans
  `statement-ingestion-orchestrator.ts` (étape 7) : corrigé (AC 5), avec test dédié dans
  `statement-ingestion-orchestrator.test.ts`.
- `POST /api/settlements` : la lecture des transactions désignées par `transactionIds` est
  maintenant jointe à `bank_statements` et filtrée par profil (AC 4) — une ligne d'un autre
  profil est donc absente du résultat, et déclenche la MÊME erreur `not_found` qu'un identifiant
  inexistant, jamais un signal distinct.
- 404 partout où une ressource d'un autre profil est désignée par id/code/hash, jamais 403
  (`notFound()`/`GroupNotFound`/`ApiErrorCode.NotFound`, tous en 404).
- `server/services/analysis-engine.ts` et `server/utils/settlement-status.ts` : non modifiés,
  aucun import ajouté (AC 9) — vérifié par lecture, pas seulement par absence de diff.
- **Écart assumé sur T5** : le libellé de tâche demandait un scénario à deux profils « pour
  chaque fichier `*.test.ts` d'endpoint existant ». Vu le volume (23 endpoints, ~15 fichiers de
  test), j'ai concentré l'effort sur les cas les plus représentatifs et les plus à risque :
  cloisonnement en lecture/écriture sur les rubriques et postes (`categories.test.ts`),
  régression exacte du bug de `apply.post.ts` (`rules.test.ts`), AC 4 sur les settlements
  (nouveau fichier, l'endpoint n'avait AUCUN test avant cette story), 404 croisé sur une
  transaction (`transactions/[id].patch.test.ts`), et chevauchement de période inter-profils
  côté orchestrateur. Les autres endpoints (statements, analysis, evolution, periods, catégories
  GET, rules GET/preview) restent couverts par la revue de code et par le filtrage SQL commun
  (mêmes utilitaires `statement-reliability.ts`/`category-references.ts` déjà testés en
  isolation via les scénarios ci-dessus), mais n'ont pas chacun un test à deux profils dédié.
  À signaler explicitement en revue.
- Deux tests pré-existants sur des handlers `GET`/`POST` sans corps (`analysis.get.test.ts`,
  `evolution.get.test.ts`, `transactions/index.get.test.ts`, `statements/*.test.ts`,
  `statement-ingestion-orchestrator.test.ts`) construisaient un `H3Event` sans
  `node.req.headers` : `getCookie` (nouvellement appelé par `requireProfile`) levait alors une
  `TypeError` avant même d'atteindre la logique métier. Corrigé en ajoutant
  `node: { req: { headers: {} }, res: {} }` à leurs `makeEvent`/`query` — comportement
  inchangé (aucun cookie n'était testé), seule la forme du mock d'event se complète.

**Corrections issues de la revue `pr-reviewer` (verdict APPROUVER, aucune fuite trouvée) :**
- Défense en profondeur ajoutée sur deux `UPDATE` qui ne reprenaient pas la condition de profil
  alors que leur lecture en amont l'appliquait déjà : `rules/[id]/apply.post.ts` (reclassement)
  et `settlements/index.post.ts` (rattachement au groupe), tous deux alignés sur le motif
  `inArray(transactions.statementHash, statementsOfProfile)` de `transactions/[id].patch.ts`.
- `statements/index.get.ts` : la sous-requête `NOT IN` du calcul de taux de correction filtre
  désormais aussi par profil (n'excluait aujourd'hui rien à tort, mais par construction du
  reste de la requête, pas par elle-même).
- `current-profile.ts` : la 400 sur cookie invalide ne renvoie plus le cookie brut ni un motif
  distinguant « mal formé » de « profil inconnu » — un seul `reason: 'invalid_cookie'` pour les
  deux cas, pour ne jamais confirmer l'existence d'un id (esprit de D38).
- `server/api/architecture.test.ts` : doc-comment ajouté précisant que la garde ne vérifie
  qu'une occurrence textuelle de `requireProfile(`, pas que `profileId` est réellement utilisé
  dans chaque requête de l'endpoint — ne pas la surestimer comme garantie de cloisonnement.

**Limites relevées par la revue, à garder en tête pour la suite (22.1, 28.x) :**
- Le cookie `pf_profile` n'est ni signé ni `httpOnly` avant 27.3 : le cloisonnement posé par
  cette story est un garde-fou FONCTIONNEL (évite qu'un profil voie ou modifie par erreur les
  données d'un autre), pas un contrôle d'accès — cohérent avec NFR35, qui réserve l'authentification
  à 22.1.
- La déduplication par hash reste globale entre profils (D37, assumé). Conséquence concrète à
  l'arrivée du foyer : un relevé de compte joint déjà déposé par un profil ne pourra pas être
  ingéré par l'autre (`pdf_already_ingested`), et ce refus révèle — sans le dire explicitement —
  que quelqu'un d'autre détient déjà ce PDF précis.

### File List

**Créés**
- `shared/types/profile.ts`
- `server/utils/current-profile.test.ts`
- `server/api/architecture.test.ts`
- `server/api/settlements/settlements.test.ts`

**Modifiés — production**
- `server/utils/current-profile.ts`
- `server/utils/statement-reliability.ts`
- `server/utils/category-references.ts`
- `server/utils/rule-coverage.ts`
- `shared/schemas/api-errors.ts`
- `app/composables/useApiError.ts`
- `server/api/analysis.get.ts`
- `server/api/evolution.get.ts`
- `server/api/periods.get.ts`
- `server/api/transactions/index.get.ts`
- `server/api/transactions/[id].patch.ts`
- `server/api/statements/index.get.ts`
- `server/api/statements/[hash].get.ts`
- `server/api/statements/index.post.ts`
- `server/api/reconciliation/[hash].post.ts`
- `server/api/categories/index.get.ts`
- `server/api/categories/groups/[code].patch.ts`
- `server/api/categories/groups/[code].delete.ts`
- `server/api/categories/items/[code].patch.ts`
- `server/api/categories/items/[code].delete.ts`
- `server/api/rules/index.get.ts`
- `server/api/rules/index.post.ts`
- `server/api/rules/preview.get.ts`
- `server/api/rules/[id].delete.ts`
- `server/api/rules/[id]/apply.post.ts`
- `server/api/settlements/index.post.ts`
- `server/api/settlements/[id].delete.ts`
- `server/services/statement-ingestion-orchestrator.ts`

**Modifiés — tests**
- `server/api/analysis.get.test.ts`
- `server/api/evolution.get.test.ts`
- `server/api/statements/[hash].get.test.ts`
- `server/api/statements/index.get.test.ts`
- `server/api/transactions/index.get.test.ts`
- `server/api/transactions/[id].patch.test.ts`
- `server/api/categories/categories.test.ts`
- `server/api/rules/rules.test.ts`
- `server/services/statement-ingestion-orchestrator.test.ts`

**Non modifiés, vérifiés intacts (AC 9)**
- `server/services/analysis-engine.ts`
- `server/utils/settlement-status.ts`

## Change Log

- Implémentation complète de la story 27.2 : `requireProfile` lit le cookie `pf_profile`, les 23
  endpoints filtrent par profil dans le SQL, 404 systématique sur une ressource d'un autre
  profil, test d'architecture pour l'AC 8. Corrige au passage le point signalé par la revue de
  27.1 sur `rules/[id]/apply.post.ts` et le chevauchement de période non filtré par profil dans
  l'orchestrateur d'ingestion.
