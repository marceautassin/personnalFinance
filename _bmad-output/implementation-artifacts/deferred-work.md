# Deferred Work — personnalFinance

## Deferred from: code review of story 1.1 (2026-04-30)

- `app/app.vue` rend encore `<NuxtWelcome />` placeholder — sera remplacé en Story 1.7 (Home page minimaliste + AppHeader/AppNav + tokens CSS)
- `public/favicon.ico` est un fichier 0 byte — cosmétique, à fournir un vrai icône avant un éventuel déploiement public (non bloquant V1)
- `vue-tsc` et `typescript` pas en `devDependencies` explicites — `nuxt typecheck` les auto-installe à la volée ; à formaliser en Story 1.2 lors du durcissement TS
- `runtimeConfig` Nuxt pas configuré pour `ANTHROPIC_API_KEY` — non bloquant car Story 2.4 lit `process.env.ANTHROPIC_API_KEY` directement (`getClient()` lazy init). À évaluer si on bascule sur `useRuntimeConfig()` pour homogénéiser
- `@types/better-sqlite3 ^7.6.13` vs `better-sqlite3 ^12.9.0` — discordance de majors. Les types DefinitelyTyped ne suivent pas toujours les majors. À vérifier en Story 1.4 que les types couvrent l'API utilisée. Si gap : ajouter un type augmentation dans `server/db/client.ts` ou pin `better-sqlite3` à 11.x
- Peer deps non satisfaites : `@nuxt/devtools 3.2.4` veut `vite>=6.0` mais on a `vite 7.3.2` — fonctionne au runtime, à mettre à jour quand `@nuxt/devtools 3.3+` sortira

## Deferred from: code review of story 1.3 (2026-04-30)

- Overflow `MAX_SAFE_INTEGER` sur `addCents`/`sumCents`/`mulCentsByRatio` (`shared/types/money.ts`) — V1 montants << 10^12 cents, garde ici = YAGNI. Surveiller si forecast multi-décennies se rapproche des bornes.
- Test « MAX_SAFE_INTEGER » trompeur (`shared/types/money.test.ts:131-134`) — le test passe par coïncidence ; à reformuler quand le vrai guard overflow arrive.
- Pas de `divCents` / `splitCents` exposés — besoin futur (split rent, pro-rata fiscal). Ajouter avec le premier consommateur (Story 6.x ou 7.x), avec test exhaustif sur le résidu pour éviter les centimes perdus.

## Deferred from: code review of story 1.4 (2026-04-30)

- Test singleton `server/db/client.test.ts:14-18` ne prouve que le cache ESM, pas l'unicité de `new Database`. La story accepte "un test simple" (AC #2) ; renforcer si une régression future le justifie.
- `createdAt` via `$defaultFn(() => Math.floor(Date.now()/1000))` non déterministe pour snapshots et collisions possibles sur même tick lors de seed bulk (`server/db/schema.ts:29`). Conforme à la convention `_at` epoch s ; revoir si les snapshots forecast l'exigent.
- Paths relatifs CWD-dépendants dans `drizzle.config.ts` et `server/db/client.ts` — OK mono-projet V1, à anchor sur la racine du projet si la commande peut être lancée depuis un sous-dossier.
- `journal_mode = WAL` silencieusement ignoré sur NFS/FAT/readonly FS (`server/db/client.ts:16`). Environnement local de confiance V1 ; guarder en cas de déploiement étendu.
- `as const` annulé par `ReadonlyArray<DefaultCategory>` (`shared/constants/default-categories.ts:16`) — perd les types littéraux pour `code`, aucun consommateur en V1. Soit retirer l'annotation, soit retirer `as const`.
- Aucun garde-fou format sur `code` (`/^[a-z_]+$/`) dans `default-categories.test.ts` — codes actuels conformes ; à ajouter si autres contributeurs.
- Pas de `db.close()` ni de hook process-exit dans `server/db/client.ts`. Nitro single-process le gère ; risque surtout en contexte test (couvert par le patch test cleanup).

## Deferred from: code review of story 1.6 (2026-04-30)

- Vérifier en build prod (`nuxt build && start`) que `data` (notamment Zod `flatten()`) n'est pas strippé par h3 selon `NODE_ENV` — à valider via test E2E quand un endpoint réel utilisera `validation_failed`.
- Compat `ZodError.flatten()` v3 vs v4 — Zod v4 (`^4.4.1`) peut changer la forme `fieldErrors`/`formErrors`. Couvrir par un test de contrat quand le premier endpoint consommateur arrivera.
- Risque PII via `data: Record<string, unknown>` arbitraire dans les helpers d'erreurs (`server/utils/errors.ts`) — un appelant peut véhiculer du libellé bancaire / IBAN. Pas de risque actuel (aucun consumer). À adresser via convention/lint quand l'epic ingestion (2.x) arrivera.

## Deferred from: code review of story 1.7 (2026-04-30)

- Style `.router-link-active` absent sur `AppNav` (`app/components/shared/AppNav.vue`) — la nav ne signale pas la route courante. À ajouter quand une seconde route active existera (Story 2.9).
- `nodeTsConfig` / `sharedTsConfig` non documentés dans Nuxt 4 (`nuxt.config.ts:33-34`) — pré-existant Story 1.2/1.6. Vérifier qu'elles sont bien prises en compte ou les retirer ; sinon strictness silencieusement absente sur `server/` et `shared/`.
- `strict: true` non propagé au `tsConfig` Nitro (`nuxt.config.ts:24-28`) — pré-existant. Le bloc nitro spread seulement `strictCompilerOptions` sans `strict: true`, donc compilation server-side moins stricte que prévu.
- Pas de `@media (prefers-reduced-motion: reduce)` sur les `transition` (`tokens.css`, `AppNav.vue`, `index.vue`) — a11y best-effort hors AC ; à formaliser si l'app est élargie au-delà du single-user.

## Deferred from: code review of story 2.3 (2026-04-30)

- `savePdfByHash` écrit non atomique (pas de pattern temp+rename) dans `server/utils/file-storage.ts:30-35` — un crash mid-write laisse un PDF tronqué sous le nom canonique `{hash}.pdf` et viole l'invariant content-addressable. Mono-user low-risk en V1, à reprendre si déploiement multi-instance ou si une régression survient.
- `savePdfByHash` ne vérifie pas `sha256(buf) === hash` (`server/utils/file-storage.ts:30`) — un caller buggé peut empoisonner le store silencieusement. Défense en profondeur à ajouter si l'API devient publique ou consommée par plusieurs services.
- Pas de branded type `Month` / `DateIso` dans `server/utils/period.ts` malgré la convention documentée — refactor transverse hors scope story 2.3, à grouper avec un futur durcissement type system (Story 7.x forecast probable consommateur).

## Deferred from: code review of story 1.2 (2026-04-30)

- `no-restricted-imports` ne bloque que `../../*` (`eslint.config.mjs:11-15`) — les remontées à 1 ou 3+ niveaux passent. À élargir quand les premiers contournements vers les alias Nuxt apparaîtront.
- Couverture Vitest `include` (`vitest.config.ts:31-34`) limitée à `server/services/**` + `shared/types/**`. NFR18 cible 100% sur tous les calculs financiers — étendre quand `server/utils/**` ou des composables hébergent du calcul (Stories 6.x, 7.x).
- Playwright `webServer.timeout` absent (`playwright.config.ts:31-37`) — défaut 60 s ; à augmenter pour un CI Linux fresh quand le pipeline arrivera.
- `eslint-plugin-unicorn` importé puis enregistré dans 3 blocks séparés (`eslint.config.mjs:23,31,40`) — stylistique, factoriser dans un seul block `plugins` pour DRY.

## Deferred from: code review of story 2.1 (2026-04-30)

- FK `transactions.debt_id` absente — explicitement reportée à Story 6.1 (table `debts` n'existe pas en Epic 2).
- `categoryCode` FK pointe sur `categoryDefinitions.code` (text humain) plutôt que `id` numérique — renommer un code casserait l'historique (`server/db/schema.ts:82-84`). Décision architecturale, à reconsidérer si la liste des catégories devient mutable.
- `NewStatementSchema` accepte `hashSha256` fourni par le client (`shared/schemas/statement.schema.ts:10`) — devrait être server-computed. À enforcer côté endpoint POST `/api/statements` (Story 2.6).
- `ExtractedTransactionSchema` inclut `categoryCode` requis (`shared/schemas/transaction.schema.ts:32`) — confond extraction PDF et catégorisation LLM. À revisiter en Story 2.4/2.6 quand le pipeline d'ingestion sera assemblé.
- `amountCents === 0` autorisé (pas de `.refine(v => v !== 0)`) — décision domaine à clarifier (placeholder vs rejet). Reporter au moment où un cas réel se présente.
- `transactionDate` hors `[periodStart, periodEnd]` non contrôlé — pas de check possible côté schéma SQLite, à valider côté service d'ingestion (Story 2.2/2.6) ou réconciliation (Epic 3).
- `ON DELETE CASCADE` du statement supprime aussi les transactions manuelles de réconciliation — décision UX/data-loss à clarifier en Epic 3 (soft-delete ? confirmation user ?).
- Pas d'index sur `categoryCode` ni `debtId` — optimisation prématurée (volume mono-utilisateur), à reconsidérer si Forecast/Debt scanne lentement.
- Pas de CHECK constraint 0/1 sur les booleans (`is_manual`, `is_debt_repayment`, `is_variable`) — risque uniquement via raw SQL/migrations, faible en pratique (Drizzle interdit le SQL brut).
- Pas de `updatedAt` sur `transactions` — gap d'audit trail pour les éditions manuelles. À considérer si NFR audit émerge.
- Pas d'unique constraint sur `(statementHash, transactionDate, label, amountCents)` — duplication possible si re-ingestion partielle. PK hash devrait suffire mais à monitorer en Story 2.6.
- Validation real-date dans `pdf-extractor.frDateToIso` (jour > 31, leap year) — hors scope 2.1, à traiter en Story 2.2 (review en cours).

## Deferred from: code review of story 2.2 (2026-05-01)

- Fixtures PDF gitignored → CI aveugle aux régressions parsing (`tests/fixtures/pdfs/`) — sans fixtures, seul `parseFrAmount` + rejet non-PDF/empty sont testés. Préoccupation process > code, hors scope story.
- AC #3 (texte valide sans patterns → null) non explicitement testé unitairement (`server/services/pdf-extractor.test.ts`) — couvert par contrat de type uniquement. À ajouter via mock `unpdf` dans une story future.
- Trailing `\s` requis dans regexes ouverture/clôture-fallback (`server/services/pdf-extractor.ts:99-105`) — montant en fin de fichier sans whitespace suiveur capturerait `null`. Cas théorique non observé.
- Fenêtre `[^\d-]{0,30}` peut être trop étroite pour libellés legacy avec annotations longues (`server/services/pdf-extractor.ts:100-101`) — à ajuster si nouveau format observé.
- Tests manquants sur entrées limites de `parseFrAmount` (`'-'`, `'.'`, `','`, `'1,2,3'`, `'1e3'`, leading zeros, montants > MAX_SAFE_INTEGER) — comportement actuel correct par inspection mais non verrouillé.

## Deferred from: code review of story 2.6 (2026-05-01)

- Race TOCTOU dédup hash + uploads concurrents (`server/services/statement-ingestion-orchestrator.ts:54-61`) — deux POST simultanés du même PDF passent tous deux la dédup ; l'INSERT perdant déclenche `deletePdfByHash(hash)` et supprime le PDF du gagnant. V1 mono-utilisateur local (CLAUDE.md §Sécurité) — concurrence improbable. À reprendre si déploiement multi-client.
- Race condition overlap-replace concurrent (`statement-ingestion-orchestrator.ts:111-167`) — deux ingest simultanés `confirmReplace=true` sur des périodes qui se chevauchent peuvent stomp l'un l'autre (pas de unique constraint sur `(period_start, period_end)`, pas de row-lock). Même raison V1 mono-utilisateur.
- `ON DELETE CASCADE` lors d'un replace supprime aussi les transactions `isManual=true` — duplicate de la déférence Story 2.1 ; à acter en Epic 3 quand les transactions manuelles existent vraiment dans le schéma.
- Orphelin PDF si SIGKILL entre `savePdfByHash` et commit DB (`statement-ingestion-orchestrator.ts:133-167`) — pas de réconciliation startup `_data/raw` ↔ DB. NFR11 (reconstructabilité) tient si on accepte d'avoir des PDFs sans statement, mais surface zéro alerte. Hors scope V1.

## Deferred from: code review of story 2.7 (2026-05-01)

- DDL des tests d'intégration redéfini à la main au lieu de réutiliser drizzle/migrations (`server/api/transactions/index.get.test.ts:30-61`) — risque de faux positifs si le schéma drizzle évolue (nouvelle colonne NOT NULL sans default). Refactor global futur via `migrate()` sur DB temp pour tous les tests d'intégration.
- `process.env.DATABASE_URL` capturé au timing d'import — fragile sous Vitest parallèle (`server/api/transactions/index.get.test.ts:11-12`). À durcir globalement (`vi.resetModules()` ou config `--isolate`).
- Accès à `db.$client` (API privée Drizzle) dans les tests (`server/api/transactions/index.get.test.ts:28`) — bumps mineurs Drizzle peuvent casser. Lié au point précédent.
- `H3Event` mocké à la main dans les tests bypasse la pipeline h3 réelle (`server/api/transactions/index.get.test.ts:147`) — choix KISS explicitement documenté ; reconsidérer si un middleware Nitro est ajouté.
- Flag `reliability` du `bank_statements` non remonté par l'endpoint `GET /api/transactions` — hors scope 2.7 (AC #1 ne le liste pas). À couvrir dans la story d'affichage du badge "mois non fiable" (probablement 2.10+).
- `default: () => []` ne corrige pas le typage `T | null` de `data` retourné par `useFetch` (`app/composables/useTransactions.ts:25`) — footgun TS pattern global de l'app, à traiter de manière transversale (wrapper composable ou `transform`).

## Deferred from: code review of story 2.8 (2026-05-01)

- Cross-field invariant `isDebtRepayment ↔ debtId` non vérifié sur PATCH partiel (`server/api/transactions/[id].patch.ts:43-46`) — la spec V1 stipule "persiste juste les flags" ; finaliser en Story 6.3 avec validation complète qui prend en compte l'état existant de la transaction (PATCH `{ debtId: null }` sur une row `isDebtRepayment=true` doit échouer ou cascader).
- Pas de pré-check FK sur `debtId` analogue à `categoryCode` (`server/api/transactions/[id].patch.ts:46`) — table `debts` créée en Story 6.1. Ajouter le pré-check à ce moment-là pour avoir un message d'erreur FR clair.
- Parsing `id` permissif via `Number(idParam)` (`server/api/transactions/[id].patch.ts:12-15`) — accepte `"1e2"`, floats truncatés, valeurs hors `MAX_SAFE_INTEGER`. Mono-user V1, impact très faible. Durcir si on expose l'API à d'autres consommateurs (regex `/^[1-9]\d*$/` ou `z.coerce.number().int().positive().safe()`).
- Erreurs `$fetch` PATCH non normalisées via `useApiError` dans `useTransactions.mutateCategory` / `markAsDebtRepayment` (`app/composables/useTransactions.ts:30-49`) — la `FetchError` brute remonte au composant. Normalisation à plugger côté consommateur (Story 2.10 — UI category editor).

## Deferred from: code review of story 2.9 (2026-05-01)

- Multi-file drop silencieusement réduit à `files[0]` (`app/components/ingestion/PdfDropZone.vue:11`) — pas de message utilisateur. UX mineure, hors scope AC.
- `$fetch` sans `AbortController` ni timeout dans `useStatements` (`app/composables/useStatements.ts:18-23`) — refactor lié à l'AC #6 (bouton *Annuler* manquant). À traiter avec ce patch.
- Test E2E auto-skip sur `ANTHROPIC_API_KEY` absent (`tests/e2e/ingestion.spec.ts:17`) — coverage hole en CI sans secret. Choix assumé dans la story ; à formaliser quand un secret CI est dispo (mock LLM ou clé restreinte).

## Deferred from: code review of story 2.10 (2026-05-01)

- Tests bootstrappent SQLite via `sqlite.exec(\`CREATE TABLE …\`)` au lieu d'exécuter les migrations Drizzle (`server/api/categories.get.test.ts:27-35`, `server/api/transactions/index.get.test.ts:806-837`). Pattern présent dans 4 fichiers de tests (incl. `[id].patch.test.ts`, `statement-ingestion-orchestrator.test.ts`) — drift de schéma vs Drizzle source de vérité. Refactor global : helper `tests/fixtures/setup-test-db.ts` qui exécute `migrate()` ou `db push` programmatique.
- Accès aux internals Drizzle via `@ts-expect-error db.$client ?? db.session?.client` (`server/api/categories.get.test.ts:25-26` et autres) — fragile sur upgrade Drizzle. À encapsuler dans le helper de setup ci-dessus.
- `AppNav.currentPeriod` figé à l'init du composant (`app/components/shared/AppNav.vue:8-9`) — si la SPA reste ouverte par-dessus minuit le 31, le lien Transactions pointe sur l'ancien mois. Low impact (app local-first, refresh fréquent) ; envelopper dans un `computed` qui réévalue (mais `Date()` hors composable réactif ne le fera pas auto — vrai fix : composable `useCurrentPeriod()` avec `useState` + heartbeat horaire, sur-engineering pour V1).
- `CategoryEditor` attache un listener `document.click` par instance (`app/components/transactions/CategoryEditor.vue:40-43`) — N transactions = N handlers. Optimisation perf à 200+ lignes : centraliser via un singleton store ou `vueuse/onClickOutside`. Pas un blocker tant que les listes restent < 500 transactions.
- Mock h3 `event.path` brittle (`server/api/transactions/index.get.test.ts:858`) — pre-existing pattern, à revisiter avec le helper de setup tests.
