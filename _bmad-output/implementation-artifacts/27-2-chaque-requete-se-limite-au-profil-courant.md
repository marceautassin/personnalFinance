# Story 27.2: Chaque requête se limite au profil courant

Status: ready-for-dev

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

- [ ] **T1 — `requireProfile`** (AC 1, 10)
  - [ ] Créer `server/utils/current-profile.ts` : `requireProfile(event): ProfileId`. Il lit le cookie `pf_profile` (`getCookie` de h3) et vérifie en base que le profil existe.
  - [ ] Repli sans cookie : s'il existe **exactement un** profil, le renvoyer. Sinon, lever `badRequest(ApiErrorCode.ProfileRequired)`.
  - [ ] Cookie présent mais invalide (non entier, profil inexistant) → `400 profile_required`. **Jamais** de repli silencieux dans ce cas.
  - [ ] Ajouter `ProfileRequired: 'profile_required'` à `shared/schemas/api-errors.ts` et son message français à `app/composables/useApiError.ts`.
  - [ ] Type `ProfileId` (brand sur `number`) dans `shared/types/profile.ts`, s'il n'existe pas déjà depuis 27.1.
- [ ] **T2 — Utilitaires partagés paramétrés par profil** (AC 2, 3)
  - [ ] Tableau « Utilitaires » ci-dessous : chaque fonction reçoit `profileId` en premier paramètre.
- [ ] **T3 — Les 23 endpoints** (AC 1 à 5)
  - [ ] Appliquer le tableau « Endpoints » ligne par ligne.
- [ ] **T4 — Orchestrateur d'ingestion** (AC 5, 6, 7)
  - [ ] `ingestStatement(pdfBuffer, { confirmReplace, profileId })`, avec `profileId` obtenu dans `statements/index.post.ts`.
  - [ ] Filtrer par profil le référentiel envoyé au modèle, les règles et le chevauchement de période. Le relevé inséré porte `profile_id`.
  - [ ] **Ne pas** filtrer la déduplication par hash (AC 7).
  - [ ] Le remplacement après confirmation de chevauchement ne supprime que des relevés du profil, ce que garantit le filtre de chevauchement.
- [ ] **T5 — Tests** (AC 2 à 10)
  - [ ] `tests/fixtures/test-schema.ts` : aligner `TEST_SCHEMA_DDL` et `TEST_REFERENTIAL_DDL` sur le schéma de 27.1 (table `profiles`, `profile_id`, clés de substitution), s'il ne l'a pas déjà été.
  - [ ] Helper de test `makeEvent(..., { profileId })` qui pose l'en-tête `cookie: pf_profile=<id>`, puisque `getCookie` lit `event.node.req.headers.cookie`.
  - [ ] Pour chaque fichier `*.test.ts` d'endpoint existant : un scénario à deux profils. A ne voit pas B ; A reçoit 404 sur une ressource de B.
  - [ ] `server/utils/current-profile.test.ts` : cookie valide · absent avec 1 profil (repli) · absent avec 2 profils (400) · cookie d'un profil inexistant (400) · cookie non entier (400).
  - [ ] `server/api/architecture.test.ts`, ou `tests/architecture/require-profile.test.ts` : le test de l'AC 8.
  - [ ] Orchestrateur : chevauchement ignoré entre profils (AC 5) · référentiel et règles du seul profil (AC 6) · doublon rejeté entre profils (AC 7).
  - [ ] Suite E2E verte **sans modification**, ce qui prouve l'AC 10.

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

### Debug Log References

### Completion Notes List

### File List
