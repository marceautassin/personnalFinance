# Story 5.3: Schéma `revenue_models` + endpoints + UI (ARE, loyer SAS, défraiements)

Status: done

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
   **Then** retourne le singleton (toujours présent grâce au seed). Si la ligne `id=1` est
   malgré tout absente (base réinitialisée à la main, bootstrap non joué), l'endpoint échoue
   explicitement en `500 singleton_missing` — il ne retourne **jamais** un corps vide en 200.
   *(amendé le 2026-08-04 — revue de code : le « pas de 404 possible » n'était pas matérialisé
   dans le code, produisant une page blanche silencieuse.)*

5. **Given** `PUT /api/revenues`,
   **When** un body Zod valide est posté,
   **Then** la ligne `id=1` est mise à jour atomiquement (`UPDATE ... WHERE id = 1`). Sémantique PUT (replace partiel via `RevenueModelPatchSchema` si on autorise les patch ; sinon replace total — cf. note d'implémentation). `updated_at` régénéré.

6. **Given** la page `app/pages/revenus.vue`,
   **When** elle se charge,
   **Then** elle affiche **3 panneaux indépendants** :
   - `ArePanel` : input montant € + input date fin + bouton *Enregistrer*. La date est
     **requise dès que le montant est > 0** (cf. AC#12), et le libellé l'indique.
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
   - PUT partiel `{ sasMonthlyRentCents: 110000 }` → met à jour seulement ce champ, autres inchangés, `updated_at` régénéré *(amendé le 2026-08-04 : le champ nominal était `unemploymentBenefitMonthlyCents`, devenu un cas de rejet avec l'AC#12 — le cas nominal du patch partiel se teste désormais sur un champ non contraint)*
   - PUT avec `unemploymentBenefitMonthlyCents: -1` → 422 `validation_failed`
   - PUT avec `unemploymentBenefitEndDate: '2026-13-01'` → 422 (date inexistante via `DateIsoSchema`)
   - PUT body vide → 422 (au moins un champ requis)
   - Invariant ARE (AC#12) : montant > 0 sans date → 400 ; montant > 0 avec date échue → 400 ; date au mois courant → accepté (bord)
   - Ligne singleton absente → GET et PUT échouent en `500 singleton_missing`

10. **Given** un test E2E `tests/e2e/revenues.spec.ts`,
    **When** il s'exécute,
    **Then** il couvre : ouvrir `/revenus` → **constater les 3 champs à 0** → saisir ARE 1100 € + une date de fin future → cliquer Enregistrer → recharger la page → vérifier la persistance. Un second parcours vérifie le refus d'un montant ARE sans date, avec un message ciblé. Pas de dépendance LLM.

11. **Given** les conventions,
    **When** la story est review,
    **Then** : Cents partout, FR labels, pas de `$fetch` dans composants, pas de duplication de code de validation entre panneaux (helper commun ou pattern shared).

12. **Given** l'invariant ARE *(ajouté le 2026-08-04 — amendement issu de la revue de code)*,
    **When** un `PUT /api/revenues` laisse l'état APRÈS patch avec `unemploymentBenefitMonthlyCents > 0`,
    **Then** `unemploymentBenefitEndDate` doit être non nulle **et** tomber sur le mois courant
    ou plus tard. Sinon : `400` avec `unemployment_end_date_required` ou `unemployment_end_date_past`.

    **Pourquoi.** `forecast-engine.incomeForMonth` ne compte l'ARE que si
    `end && monthOf(end) >= month`. Sans date — ou avec une date échue — le montant est saisi
    puis silencieusement ignoré sur tout l'horizon du forecast : l'utilisateur croit avoir
    déclaré un revenu qui ne sera jamais compté. Ce contrôle **remplace** la position initiale
    des Dev Notes (« validation `endDate` soft, pas de contrainte »), qui n'avait pas anticipé
    cette conséquence côté forecast.

    Erreurs **métier** → `400` + code dédié, pas `422 validation_failed` (réservé à la forme du
    payload, cf. CLAUDE.md §Règle d'or). Le contrôle est croisé sur l'état APRÈS patch : le body
    étant partiel, le schéma Zod seul ne peut pas le porter. `ArePanel` reproduit la règle côté
    client pour un retour immédiat et ciblé.

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

### Validation `endDate` ARE — ~~soft~~ **stricte** (amendé le 2026-08-04)

> **Position initiale, invalidée.** ~~Pas de contrainte "endDate doit être > today" :
> l'utilisateur peut déclarer une fin passée pour acter "mes droits sont épuisés". Le forecast
> l'intègre conformément.~~

Cette note supposait que le forecast « intègre conformément » une fin passée. Ce n'est pas le
cas : `forecast-engine.incomeForMonth` ne compte l'ARE que si `end && monthOf(end) >= month`.
Une date nulle ou échue combinée à un montant > 0 ne produit donc **aucun** effet visible, et
rien ne le signale — l'utilisateur croit avoir déclaré un revenu qui ne sera jamais compté.

Pour acter « mes droits sont épuisés », le geste correct est de remettre le **montant** à 0
(la date peut alors être vidée librement), pas de laisser un montant orphelin.

La règle est donc stricte côté serveur et reproduite côté `ArePanel` — voir AC#12.

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

Agent de développement.

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

- 2026-08-04 — Revue de code (lot 1) : invariant ARE durci (400 + codes dédiés, date échue refusée, garde client, libellé UI) et story amendée (AC#4, #6, #9, #10, nouvel AC#12, Dev Notes). Endpoints singleton en échec explicite. `useDirtyForm` contre la perte de saisie. Status → done.

### Review Findings

**Revue du 2026-08-04 (lot 1 : stories 5.3 + 5.4) — 3 couches : Blind Hunter, Edge Case Hunter, Acceptance Auditor.**

- [x] [Review][Decision] Invariant ARE ajouté hors spec — le patch de la revue epic-7 impose « ARE > 0 ⇒ date de fin obligatoire » (`server/api/revenues.put.ts:22-33`), alors que les Dev Notes §*Validation `endDate` ARE — soft* excluent explicitement toute contrainte et que l'AC#6 étiquette le champ optionnel. Effets : (a) l'AC#9 exige que `PUT {unemploymentBenefitMonthlyCents: 110000}` réussisse — c'est désormais un rejet, et le test correspondant a été réécrit en test d'échec (`server/api/revenues.test.ts`) ; (b) impossible de vider la date sans remettre le montant à 0 dans le même patch, ce qui casse la sémantique « patch partiel indépendant par panneau » (AC#5/AC#6) ; (c) l'erreur sort en `validation_failed`/422 au lieu d'un code métier 400 (CLAUDE.md §Règle d'or) → message générique côté UI ; (d) `ArePanel.vue:137` continue d'afficher « Fin des droits (optionnelle) » ; (e) une date **passée** passe la garde alors qu'elle produit exactement le bug visé — `forecast-engine.ts:66-67` ne compte l'ARE que si `monthOf(end) >= month`. Trancher : conserver l'invariant (⇒ amender la story, corriger AC#9 + test + libellé UI + code d'erreur métier + borne date ≥ mois courant) ou le retirer.
- [x] [Review][Patch] GET/PUT singleton retournent `undefined` → 200 à corps vide et `{ok:true}` mensonger [server/api/revenues.get.ts:9, server/api/revenues.put.ts:37]
- [x] [Review][Patch] `ArePanel` : `watch(() => [props.monthlyCents, props.endDate])` renvoie un tableau neuf à chaque évaluation → `syncFromProps` écrase la saisie en cours dès qu'un autre panneau enregistre [app/components/revenues/ArePanel.vue:23]
- [x] [Review][Patch] **Perte de saisie généralisée** (découvert en rejouant les E2E après correctif) — le problème ne se limitait pas au getter tableau d'`ArePanel` : les 4 formulaires resynchronisaient leurs champs dès que la valeur persistée changeait, ce qui vidait toute saisie en cours divergente. L'E2E SAS échouait sur `dividend-capacity` à `0,00 €`, les champs ayant été effacés avant l'assertion. Correctif : composable `useDirtyForm` (`app/composables/useDirtyForm.ts`) — toute resynchro est ignorée tant que l'utilisateur a une saisie non enregistrée [app/components/revenues/*.vue, app/components/sas/SasConfigForm.vue]
- [x] [Review][Patch] `ArePanel` valide la date par regex au lieu de `DateIsoSchema`, divergence client/serveur que `FiscalYearForm` évite explicitement [app/components/revenues/ArePanel.vue:32]
- [x] [Review][Patch] Aucune borne haute inline dans les 3 panneaux Revenus (schéma `max(1e11)`) → 422 générique là où `SasConfigForm` affiche un message inline [app/components/revenues/ArePanel.vue:26, app/components/revenues/SasRentPanel.vue, app/components/revenues/ReimbursementsPanel.vue]
- [x] [Review][Patch] `parseEurosToCents` supprime **tous** les espaces, y compris internes : `"1 5"` → 15 € accepté silencieusement [app/utils/euros.ts:12]
- [x] [Review][Patch] `savingPanel` / `actionError` mono-slot : deux enregistrements rapprochés écrasent l'erreur du premier et éteignent l'indicateur du second [app/pages/revenus.vue]
- [x] [Review][Patch] E2E : l'AC#10 exige de constater « tous les champs à 0 » à l'ouverture — aucune assertion d'état initial [tests/e2e/revenues.spec.ts]
- [x] [Review][Patch] `RevenueModelSchema` défini (AC#3) mais jamais utilisé ; le contrat de lecture est redéclaré à la main dans le composable [app/composables/useRevenueModel.ts:6-13]
- [x] [Review][Patch] `app/utils/api-mutate.ts` est du code mort : il se déclare « point de contournement unique » mais `useRevenueModel`/`useSasConfig` appellent `$fetch` directement [app/utils/api-mutate.ts]
- [x] [Review][Defer] Prorata ARE en fin de mois non défini (fin de droits au 14/03 ⇒ mois entier compté) [server/services/forecast-engine.ts:66] — deferred, granularité mensuelle assumée dans tout le projet
- [x] [Review][Defer] Lecture-puis-écriture non transactionnelle sur le PUT : deux requêtes entrelacées peuvent produire l'état interdit [server/api/revenues.put.ts:23-40] — deferred, pre-existing (V1 mono-utilisateur local)
- [x] [Review][Defer] `updatedAt` en secondes, aucun contrôle de version optimiste → perte de mise à jour indétectable entre deux onglets [server/api/revenues.put.ts:40] — deferred, pre-existing
- [x] [Review][Defer] DDL des tests recréé à la main au lieu des migrations Drizzle [server/api/revenues.test.ts] — deferred, pre-existing (déjà consigné depuis la story 2.10)
