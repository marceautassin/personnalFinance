# Story 5.3: Schéma `revenue_models` + endpoints + UI (ARE, loyer SAS, défraiements)

Status: review

## Story

As a user,
I want to declare my recurring income sources (ARE, SAS rent, expense reimbursements),
so that the forecast (Epic 7) knows my recurring incomes alongside my fixed charges.

## Acceptance Criteria

1. **Given** la table `revenue_models` (singleton mono-utilisateur — une seule ligne) ajoutée au schéma Drizzle,
   **When** je `yarn db:push`,
   **Then** elle existe avec :
   - `id INTEGER PRIMARY KEY` (toujours = 1, contrainte par CHECK ou par insertion-au-bootstrap)
   - `unemployment_benefit_monthly_cents INTEGER NOT NULL DEFAULT 0` (ARE — montant mensuel net)
   - `unemployment_benefit_end_date TEXT` (nullable, `YYYY-MM-DD` — fin estimée des droits)
   - `sas_monthly_rent_cents INTEGER NOT NULL DEFAULT 0`
   - `expense_reimbursements_monthly_cents INTEGER NOT NULL DEFAULT 0`
   - `updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))`

2. **Given** le bootstrap (`server/middleware/0.bootstrap.ts`),
   **When** la DB est ouverte au premier lancement,
   **Then** une ligne `id=1` avec valeurs zéro est seedée (idempotent — `INSERT OR IGNORE`). Étendre le bootstrap existant (story 1.5) sans casser le seed catégories.

3. **Given** un schéma Zod `shared/schemas/revenue-model.schema.ts`,
   **When** il est exposé,
   **Then** il définit :
   - `RevenueModelSchema` (lecture, tous les `*Cents` en `Cents`)
   - `RevenueModelPatchSchema` (`.strict()`, tous les champs optionnels mais au moins un requis)
   - Contrainte : `unemploymentBenefitMonthlyCents >= 0` (ARE est un revenu, pas une dette), `sasMonthlyRentCents >= 0`, `expenseReimbursementsMonthlyCents >= 0`
   - `unemploymentBenefitEndDate: DateIsoSchema.nullable().optional()`
   - Plafond de cohérence : chaque montant `<= 1e11` cents (cohérent fixed-charge, story 5.1)

4. **Given** `GET /api/revenues`,
   **When** appelé,
   **Then** retourne le singleton (toujours présent grâce au seed). Pas de 404 possible.

5. **Given** `PUT /api/revenues`,
   **When** un body Zod valide est posté,
   **Then** la ligne `id=1` est mise à jour atomiquement (`UPDATE ... WHERE id = 1`). Sémantique PUT (replace partiel via `RevenueModelPatchSchema` si on autorise les patch ; sinon replace total — cf. note d'implémentation). `updated_at` régénéré.

6. **Given** la page `app/pages/revenus.vue`,
   **When** elle se charge,
   **Then** elle affiche **3 panneaux indépendants** :
   - `ArePanel` : input montant € + input date fin (optionnel) + bouton *Enregistrer*
   - `SasRentPanel` : input montant € + bouton *Enregistrer*
   - `ReimbursementsPanel` : input montant € + bouton *Enregistrer* + **info badge** *« Non imposable »* (FR22)

   Chaque panneau soumet **uniquement ses champs** via PUT (le serveur applique le patch — cf. AC#5).

7. **Given** la note FR22 (défraiements non-imposables),
   **When** je consulte `ReimbursementsPanel`,
   **Then** un indicateur visuel (`<small class="...">Non imposable</small>` ou icône avec aria-label) est affiché. **Aucun calcul fiscal V1** — c'est purement informatif. Le forecast (story 7.x) lira ce flag implicite (catégorie `defraiements`) pour exclure ces revenus de l'assiette IR.

8. **Given** le composable `useRevenueModel()`,
   **When** utilisé,
   **Then** il expose `{ data, pending, error, refresh, update(patch) }`. `update` envoie un PATCH/PUT, refresh, et appelle `invalidate.invalidateForecast()` + `invalidate.invalidateDashboard()`.

9. **Given** un test unitaire,
   **When** il s'exécute,
   **Then** il couvre :
   - GET sur DB fraîche (post-seed) → singleton zéro
   - PUT partiel `{ unemploymentBenefitMonthlyCents: 110000 }` → met à jour seulement ce champ, autres inchangés, `updated_at` régénéré
   - PUT avec `unemploymentBenefitMonthlyCents: -1` → 422 `validation_failed`
   - PUT avec `unemploymentBenefitEndDate: '2026-13-01'` → 422 (date inexistante via `DateIsoSchema`)
   - PUT body vide → 422 (au moins un champ requis)

10. **Given** un test E2E `tests/e2e/revenues.spec.ts`,
    **When** il s'exécute,
    **Then** il couvre : ouvrir `/revenus` → tous les champs à 0 → saisir ARE 1100 € + date fin `2026-12-31` → cliquer Enregistrer → recharger la page → vérifier la persistance. Pas de dépendance LLM.

11. **Given** les conventions,
    **When** la story est review,
    **Then** : Cents partout, FR labels, pas de `$fetch` dans composants, pas de duplication de code de validation entre panneaux (helper commun ou pattern shared).

## Tasks / Subtasks

- [x] **Task 1 — Schéma DB + bootstrap seed** (AC: #1, #2)
  - [x] Ajouter `revenueModels` à `server/db/schema.ts`
  - [x] Étendre `server/middleware/0.bootstrap.ts` pour seed `INSERT OR IGNORE INTO revenue_models (id, ...) VALUES (1, 0, NULL, 0, 0, ...)` après le seed catégories
  - [x] `yarn db:push`
  - [x] Test bootstrap : appeler le middleware 2× → 1 seule ligne, valeurs zéro

- [x] **Task 2 — Schéma Zod** (AC: #3)
  - [x] `shared/schemas/revenue-model.schema.ts`

- [x] **Task 3 — Endpoints** (AC: #4, #5)
  - [x] `server/api/revenues.get.ts`
  - [x] `server/api/revenues.put.ts`
  - [x] Tests unitaires (AC#9)

- [x] **Task 4 — Composable** (AC: #8)
  - [x] `app/composables/useRevenueModel.ts`

- [x] **Task 5 — UI** (AC: #6, #7)
  - [x] `app/components/revenues/ArePanel.vue`
  - [x] `app/components/revenues/SasRentPanel.vue`
  - [x] `app/components/revenues/ReimbursementsPanel.vue`
  - [x] `app/pages/revenus.vue`
  - [x] Lien `/revenus` dans `AppNav.vue`

- [x] **Task 6 — E2E** (AC: #10)
  - [x] `tests/e2e/revenues.spec.ts`

- [x] **Task 7 — Sanity check final**
  - [x] `yarn typecheck`, `yarn lint`, `yarn test:run` verts ; `yarn test:e2e` vert sur chromium (firefox non supporté sur cet OS — limitation env, idem story 5.1)
  - [x] Aucun nouveau code d'erreur
  - [ ] Commit unique (en attente d'instruction utilisateur — CLAUDE.md : pas de commit sans demande explicite)

## Dev Notes

### Pourquoi singleton vs multi-row

Le PRD parle d'**un** ARE, **un** loyer SAS, **un** montant moyen de défraiements pour CET utilisateur. Pas besoin d'un modèle table-par-utilisateur (V1 mono-user, pas d'auth). Singleton = simple, pas de logique de "current row".

Si V2 multi-user : étendre avec `user_id` FK + index unique `(user_id)` — refactor mineur.

### Pourquoi PUT plutôt que PATCH

REST puriste : PUT remplace, PATCH modifie partiellement. Ici les 3 panneaux UI sont indépendants (chacun envoie son champ), donc sémantiquement c'est du PATCH. **Convention V1** : on appelle l'endpoint `PUT /api/revenues` pour cohérence avec `sas-config` et `tax-settings` (autres singletons), MAIS le body est un patch partiel (`RevenueModelPatchSchema`). Ce n'est pas REST orthodoxe — assumé pour simplicité.

Alternative : exposer `PATCH` à la place. Décision : **PUT avec patch partiel** pour aligner avec architecture (`architecture.md:682` mentionne `revenues.{get,put}.ts`).

### FR22 — défraiements non-imposables

C'est un flag **informatif V1** (badge UI). Le calcul fiscal qui exclut les défraiements de l'assiette IR vit dans `dividend-calculator.ts` (story 5.4) ou `forecast-engine.ts` (story 7.x). Pas de logique ici autre que l'affichage.

Pas de colonne `is_taxable` dans `revenue_models` car la sémantique est figée par champ : `unemployment_benefit` est imposable IR, `sas_monthly_rent` aussi, `expense_reimbursements` non. C'est implicite, pas paramétrable. Si besoin de paramétrage en V2, ajouter une colonne dédiée.

### Validation `endDate` ARE — soft

Pas de contrainte "endDate doit être > today" : l'utilisateur peut déclarer une fin passée pour acter "mes droits sont épuisés". Le forecast l'intègre conformément.

### Anti-patterns à éviter

- ❌ Multi-row "history" des revenus (V1 = état courant uniquement)
- ❌ Calcul de l'assiette IR ici (responsabilité forecast/dividend-calculator)
- ❌ Réinventer un mécanisme de seed (étendre `bootstrap.ts` existant)
- ❌ Composants qui font `$fetch` direct
- ❌ Hardcoder le label "Non imposable" en EN

### Project Structure Notes

Cette story crée :
- Mutation schema DB (`revenue_models`) + seed bootstrap
- `shared/schemas/revenue-model.schema.ts`
- 2 endpoints (`revenues.get.ts`, `revenues.put.ts`)
- 1 composable
- 3 panneaux + 1 page
- Tests unit + E2E

### Definition of Done

- [ ] Singleton seedé au bootstrap
- [ ] GET/PUT opérationnels
- [ ] 3 panneaux indépendants fonctionnels
- [ ] Badge "Non imposable" sur défraiements
- [ ] Tests verts
- [ ] Lien navigation `/revenus`
- [ ] Commit unique

### References

- [Source: `_bmad-output/planning-artifacts/prd.md`#FR19-FR22]
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 5.3]
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Project Structure (lignes ~570 ; 682)]
- [Source: `server/middleware/0.bootstrap.ts`] — pattern seed à étendre
- [Source: `shared/schemas/transaction.schema.ts:6-26`] — `DateIsoSchema` réutilisable
- [Story précédente : `5-1` (pattern Zod fixed-charge), `5-2`]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia / bmad-dev-story)

### Debug Log References

- `defineEventHandler` n'est pas auto-importé en env vitest → import explicite depuis `h3`
  ajouté dans `0.bootstrap.ts` (aligné sur la convention des endpoints du projet) pour rendre
  le middleware testable.
- `yarn db:push` exige un TTY ; appliqué via `yarn drizzle-kit push --force` (statement
  `CREATE TABLE revenue_models` purement additif).

### Completion Notes List

- Table `revenue_models` en **singleton** (`id` PK = 1, sans autoIncrement), seedée
  idempotemment au bootstrap (`onConflictDoNothing` sur `id`).
- Endpoint `PUT /api/revenues` en **patch partiel** sous verbe PUT (cf. Dev Notes) :
  `RevenueModelPatchSchema.strict()`, au moins un champ requis, `updated_at` régénéré.
- Validation euros UI factorisée dans `app/utils/euros.ts` (`parseEurosToCents`) — zéro
  duplication entre les 3 panneaux (AC#11).
- Styles des panneaux factorisés dans `app/assets/styles/revenue-panel.css` (chargé
  globalement via `nuxt.config`), les 3 panneaux n'ont pas de bloc `<style>` dupliqué.
- Badge FR22 « Non imposable » : `<small>` avec `aria-label`, purement informatif (aucun
  calcul fiscal V1).
- `useInvalidate.invalidateForecast/Dashboard` appelés post-mutation (stubs jusqu'à 7.8).
- Tests : 8 unitaires (7 endpoints + 1 bootstrap idempotence), tous verts. Suite complète
  247/247. E2E chromium vert ; firefox non installable sur ubuntu26.04-x64 (limitation
  d'environnement Playwright, déjà constatée sur les specs antérieurs ex. 5.1).
- Aucun nouveau code d'erreur API (réutilise `validation_failed`).

### File List

**Créés**
- `shared/schemas/revenue-model.schema.ts`
- `server/api/revenues.get.ts`
- `server/api/revenues.put.ts`
- `server/api/revenues.test.ts`
- `server/middleware/bootstrap.test.ts`
- `app/composables/useRevenueModel.ts`
- `app/utils/euros.ts`
- `app/assets/styles/revenue-panel.css`
- `app/components/revenues/ArePanel.vue`
- `app/components/revenues/SasRentPanel.vue`
- `app/components/revenues/ReimbursementsPanel.vue`
- `app/pages/revenus.vue`
- `tests/e2e/revenues.spec.ts`

**Modifiés**
- `server/db/schema.ts` (table `revenueModels` + types)
- `server/middleware/0.bootstrap.ts` (seed singleton + import explicite `defineEventHandler`)
- `app/components/shared/AppNav.vue` (lien `/revenus` activé)
- `nuxt.config.ts` (ajout `revenue-panel.css` aux CSS globaux)

### Change Log

- 2026-06-14 — Implémentation story 5.3 : schéma `revenue_models` singleton + seed bootstrap,
  endpoints GET/PUT (patch partiel), composable `useRevenueModel`, page `/revenus` à 3 panneaux
  (ARE, loyer SAS, défraiements) + badge FR22, tests unit + E2E. Status → review.

### Review Findings
