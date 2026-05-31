# Story 5.1: Schéma `fixed_charges` + CRUD endpoints + UI

Status: ready-for-dev

## Story

As a user,
I want to declare my fixed monthly/quarterly/annual/punctual charges,
so that the forecast (Epic 7) can include them as recurring outflows.

## Acceptance Criteria

1. **Given** la table `fixed_charges` ajoutée au schéma Drizzle (`server/db/schema.ts`),
   **When** je `yarn db:push`,
   **Then** elle existe avec les colonnes :
   - `id INTEGER PRIMARY KEY AUTOINCREMENT`
   - `label TEXT NOT NULL`
   - `amount_cents INTEGER NOT NULL` (SIGNÉ : négatif pour une dépense, positif pour un revenu récurrent — on accepte les 2 pour ne pas se brider)
   - `category_code TEXT NOT NULL REFERENCES category_definitions(code) ON DELETE RESTRICT`
   - `frequency TEXT NOT NULL CHECK(frequency IN ('monthly','quarterly','annual','punctual'))`
   - `start_date TEXT NOT NULL` (`YYYY-MM-DD`)
   - `end_date TEXT` (nullable, `YYYY-MM-DD`)
   - `created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))`
   - Index `fixed_charges_category_idx` sur `category_code`

2. **Given** un schéma Zod `shared/schemas/fixed-charge.schema.ts`,
   **When** il est exporté,
   **Then** il définit :
   - `FrequencyEnum = z.enum(['monthly','quarterly','annual','punctual'])`
   - `FixedChargeSchema` (lecture, avec `id`, `createdAt`, dates `DateIsoSchema`)
   - `NewFixedChargeSchema` (création, sans `id`/`createdAt`, avec `endDate: DateIsoSchema.nullable().optional()` et refine : si `endDate` présent, alors `endDate >= startDate`)
   - `FixedChargePatchSchema` (`.strict()`, tous les champs optionnels sauf au moins un)
   - `amountCents: z.number().int().min(-1e11).max(1e11).refine(n => n !== 0, '...')` (cohérent avec story 3.1)
   - `label: LabelSchema` (déjà existant, `.max(200)`)

3. **Given** `GET /api/fixed-charges`,
   **When** appelé,
   **Then** retourne `{ charges: FixedCharge[] }` triées par `frequency` puis `label` ASC. Pas de pagination V1 (singulier user, < 50 charges typiques).

4. **Given** `POST /api/fixed-charges`,
   **When** un body valide est posté,
   **Then** la charge est insérée et retournée (full row + `id` + `createdAt`). FK pre-check sur `categoryCode` (pattern `transactions/[id].patch.ts:28-41`) → 422 si inconnue. Refine endDate < startDate → 422 `validation_failed`.

5. **Given** `PUT /api/fixed-charges/[id]`,
   **When** un body valide est posté,
   **Then** la ligne est mise à jour (replace complet — sémantique PUT — sauf `id`/`createdAt` immuables). 404 si `id` inexistant. FK + refine identiques à POST.

6. **Given** `DELETE /api/fixed-charges/[id]`,
   **When** appelé,
   **Then** la ligne est supprimée → 204. 404 si `id` inexistant. Pas de soft-delete en V1.

7. **Given** la page `app/pages/charges.vue`,
   **When** elle se charge,
   **Then** elle affiche :
   - `FixedChargeList` (tableau : libellé, montant formaté, fréquence FR, période start→end, catégorie, bouton Modifier, bouton Supprimer avec confirm)
   - `FixedChargeForm` (formulaire d'ajout) — réutilise `ConfirmDialog` (story 3.2) pour la suppression

8. **Given** le composable `useFixedCharges()`,
   **When** il est utilisé,
   **Then** il expose `{ data, pending, error, refresh, addCharge, updateCharge, deleteCharge }` selon le pattern `useReconciliation`/`useTransactions` (composable owns toutes les mutations + invalidations). Toute mutation appelle `await refresh()` puis `invalidate.invalidateForecast()` (stub story 7.8) + `invalidate.invalidateDashboard()` (stub).

9. **Given** un test unitaire round-trip,
   **When** il s'exécute,
   **Then** il couvre POST → GET (vérif présence) → PUT (vérif update) → DELETE (vérif 404 ensuite). Plus : POST avec `endDate < startDate` → 422 ; POST avec `categoryCode` inconnu → 422 ; PUT/DELETE sur `id` inexistant → 404.

10. **Given** un test E2E `tests/e2e/fixed-charges.spec.ts`,
    **When** il s'exécute,
    **Then** il couvre : ouvrir `/charges` → ajouter une charge mensuelle (Loyer 1200 € `logement`) → vérifier qu'elle apparaît dans la liste → la supprimer via le confirm dialog → vérifier qu'elle disparaît. **Pas de dépendance LLM** → pas de skip conditionnel sur `ANTHROPIC_API_KEY`.

11. **Given** les conventions monétaires,
    **When** je manipule des montants,
    **Then** UI utilise `eurosToCents`/`formatEuros` ; la saisie utilisateur se fait toujours en valeur **absolue + sens** (réutiliser le pattern `buildAmountCents` de `app/components/reconciliation/amount.ts` — déplacer dans `app/composables/useAmountInput.ts` ou `shared/types/money.ts` si on factorise).

## Tasks / Subtasks

- [ ] **Task 1 — Schéma DB** (AC: #1)
  - [ ] Ajouter `fixedCharges` à `server/db/schema.ts` (avec index + types `FixedChargeRow`/`NewFixedChargeRow`)
  - [ ] `yarn db:push`

- [ ] **Task 2 — Schéma Zod** (AC: #2)
  - [ ] Créer `shared/schemas/fixed-charge.schema.ts`
  - [ ] Réutiliser `DateIsoSchema`, `LabelSchema` de `transaction.schema.ts`

- [ ] **Task 3 — Endpoints CRUD** (AC: #3, #4, #5, #6)
  - [ ] `server/api/fixed-charges/index.get.ts`
  - [ ] `server/api/fixed-charges/index.post.ts`
  - [ ] `server/api/fixed-charges/[id].put.ts`
  - [ ] `server/api/fixed-charges/[id].delete.ts`
  - [ ] FK pre-check sur `categoryCode` extrait dans un helper si dupliqué entre POST et PUT

- [ ] **Task 4 — Tests unitaires endpoints** (AC: #9)
  - [ ] `*.test.ts` côte à côte, pattern existing (`reconciliation/[hash].post.test.ts`)
  - [ ] Round-trip + cas d'erreur

- [ ] **Task 5 — Composable** (AC: #8)
  - [ ] `app/composables/useFixedCharges.ts`
  - [ ] Pattern `useTransactions.ts:51-66`

- [ ] **Task 6 — UI** (AC: #7)
  - [ ] `app/components/charges/FixedChargeList.vue`
  - [ ] `app/components/charges/FixedChargeForm.vue`
  - [ ] `app/pages/charges.vue`
  - [ ] Réutiliser `ConfirmDialog` pour la suppression
  - [ ] Sortie pour AppNav : ajouter le lien `/charges` dans `app/components/shared/AppNav.vue`

- [ ] **Task 7 — E2E** (AC: #10)
  - [ ] `tests/e2e/fixed-charges.spec.ts`

- [ ] **Task 8 — Sanity check final**
  - [ ] `yarn typecheck`, `yarn lint`, `yarn test:run`, `yarn test:e2e` verts
  - [ ] Aucun nouveau code d'erreur (réutiliser `validation_failed`, `not_found`)
  - [ ] Commit unique

## Dev Notes

### `amount_cents` signé — pourquoi pas un type "expense"/"income" + abs

Pour rester cohérent avec `transactions.amount_cents` (signé), on garde la même convention. La UI saisit en valeur abs + sens (`-` par défaut sur charges) puis convertit. Avantage : le forecast peut sommer les charges directement avec les transactions sans inverser un signe.

Cas typique : abonnements = négatif. Mais on ne bride pas : si l'utilisateur veut déclarer un revenu récurrent (rare car `revenue_models` couvre ARE/SAS rent/défraiements), il peut.

### `frequency` enum — projection en story 7.x

Sémantique forecast :
- `monthly` : intégrée chaque mois entre `start_date` et `end_date` (si non null)
- `quarterly` : tous les 3 mois à partir de `start_date`, jusqu'à `end_date`
- `annual` : 1× par an à la même date `MM-DD` que `start_date`, jusqu'à `end_date`
- `punctual` : 1× au mois de `start_date` uniquement (`end_date` ignoré)

Cette logique vit dans `forecast-engine.ts` (story 7.3) — **pas ici**. Story 5.1 ne projette pas, elle déclare.

### `endDate` peut être passé/nul → forecast l'intègre conditionnellement

Une charge avec `end_date` < aujourd'hui reste valide en base (historique). Le forecast l'ignorera. Pas de cleanup automatique. KISS.

### Anti-patterns à éviter

- ❌ Faire calculer la projection ici (responsabilité forecast-engine, story 7.3)
- ❌ Soft-delete (`deleted_at`) — pas de besoin V1, complique les jointures
- ❌ Cache Pinia
- ❌ Composant qui appelle `$fetch` direct
- ❌ Inférer le sens du montant depuis le `category_code` (`is_variable=false` → forcément négatif) — règle implicite fragile

### Project Structure Notes

Architecture `architecture.md:681` mappe : `fixed-charges/*` + `charge-suggester` (story 5.2) + composants `FixedChargeList`, `FixedChargeForm`, `SuggestedChargesPanel`.

Cette story crée :
- Mutation schema DB
- `shared/schemas/fixed-charge.schema.ts`
- 4 endpoints sous `server/api/fixed-charges/`
- 1 composable, 2 composants, 1 page
- Tests unit + E2E

### Definition of Done

- [ ] CRUD complet opérationnel
- [ ] Schéma DB pushé
- [ ] Tests unit + E2E verts
- [ ] Lien navigation `/charges` ajouté
- [ ] Aucun nouveau code d'erreur
- [ ] Commit unique

### References

- [Source: `_bmad-output/planning-artifacts/prd.md`#FR16] — règles métier charges fixes
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 5.1]
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Project Structure (574-578, 681)]
- [Source: `CLAUDE.md`#Conventions de nommage] — kebab-case URL, snake_case DB, camelCase JSON
- [Source: `server/api/transactions/[id].patch.ts:28-41`] — pattern FK pre-check
- [Source: `app/composables/useTransactions.ts:38-72`] — pattern composable read+mutate+invalidate
- [Source: `app/components/shared/ConfirmDialog.vue`] — réutilisable pour la suppression
- [Source: `app/components/reconciliation/amount.ts`] — pattern saisie abs + sens

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Change Log

### Review Findings
