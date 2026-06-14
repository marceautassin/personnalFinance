# Story 5.4: Schéma `sas_config` + endpoints + service `dividend-calculator` (capacité) + UI

Status: review

## Story

As a user,
I want to declare my SAS fiscal data and see the dividend capacity,
so that I have all the inputs ready for the inverse forecast (Epic 7).

## Acceptance Criteria

1. **Given** la table `sas_config` (singleton — une seule ligne `id=1`) ajoutée au schéma Drizzle,
   **When** je `yarn db:push`,
   **Then** elle existe avec :
   - `id INTEGER PRIMARY KEY` (toujours = 1)
   - `fiscal_year_end_date TEXT NOT NULL DEFAULT '12-31'` (format `MM-DD` — date de clôture annuelle, sans année car récurrente)
   - `revenue_forecast_cents INTEGER NOT NULL DEFAULT 0` (CA prévisionnel exercice en cours, FR24)
   - `expenses_forecast_cents INTEGER NOT NULL DEFAULT 0` (charges SAS prévisionnelles globales, FR25)
   - `current_treasury_cents INTEGER NOT NULL DEFAULT 0` (trésorerie SAS actuelle, FR26)
   - `is_rate_pct INTEGER NOT NULL DEFAULT 1500` (taux IS en pct × 100 ; 1500 = 15 %, 2500 = 25 %, FR27)
   - `updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))`

2. **Given** le bootstrap (story 1.5 + extension 5.3),
   **When** la DB est ouverte au premier lancement,
   **Then** la ligne `id=1` est seedée avec les valeurs par défaut ci-dessus (`INSERT OR IGNORE`). Étendre `0.bootstrap.ts` à la suite du seed `revenue_models`.

3. **Given** un schéma Zod `shared/schemas/sas-config.schema.ts`,
   **When** exposé,
   **Then** il définit :
   - `SasConfigSchema` (lecture)
   - `SasConfigPatchSchema` (`.strict()`, fields optionnels, au moins un requis)
   - `fiscalYearEndDate: z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Format MM-DD attendu')` + refine sémantique (`02-30` rejeté — réutiliser le pattern de `DateIsoSchema` adapté)
   - `revenueForecastCents`, `expensesForecastCents`, `currentTreasuryCents` : `z.number().int().min(0).max(1e12)` (CA peut atteindre 10 M€ → 1e9 cents ; large marge à 1e12)
   - `isRatePct: z.number().int().min(0).max(10000)` (0 à 100 %)

4. **Given** `GET /api/sas-config` et `PUT /api/sas-config`,
   **When** appelés,
   **Then** GET retourne le singleton ; PUT applique le patch partiel (cohérent revenue_models story 5.3) → 200 avec la nouvelle valeur. Sémantique identique à story 5.3.

5. **Given** un service `server/services/dividend-calculator.ts`,
   **When** il est créé,
   **Then** il exporte une fonction **pure** (aucun appel DB) :
   ```ts
   export interface SasConfigInput {
     revenueForecastCents: Cents
     expensesForecastCents: Cents
     currentTreasuryCents: Cents
     isRatePct: number             // pct × 100 (1500 = 15%)
   }
   export interface DividendCapacity {
     profitBeforeTaxCents: Cents   // revenue - expenses (peut être négatif)
     taxCents: Cents               // profit > 0 ? floor(profit * isRate) : 0
     profitAfterTaxCents: Cents    // profitBeforeTax - taxCents
     dividendableCapacityCents: Cents  // profitAfterTax + currentTreasury (sera capé à 0 minimum)
   }
   export function computeDividendCapacity(input: SasConfigInput): DividendCapacity
   ```

6. **Given** la formule V1 (simplifiée),
   **When** elle est implémentée,
   **Then** elle suit ces règles **explicitement documentées comme V1 simplifié** :
   - `profitBeforeTaxCents = revenueForecastCents - expensesForecastCents` (signed, peut être négatif)
   - `taxCents = profitBeforeTaxCents > 0 ? Math.floor(profitBeforeTaxCents * isRatePct / 10000) : 0` (pas de récupération de pertes V1 — KISS)
   - `profitAfterTaxCents = profitBeforeTaxCents - taxCents`
   - `dividendableCapacityCents = Math.max(0, profitAfterTaxCents + currentTreasuryCents)` (floor à 0 — pas de "dividende négatif")
   - **NB** : pas de gestion du taux réduit IS (15 % jusqu'à 42 500 € puis 25 %) en V1 — l'utilisateur saisit son `isRatePct` effectif. À enrichir en V2 si besoin (cf. defer + `IS_REDUCED_THRESHOLD_CENTS` dans story 5.5).

7. **Given** la page `app/pages/sas.vue`,
   **When** elle se charge,
   **Then** elle affiche :
   - `SasConfigForm` : 4 inputs (CA prévi, charges prévi, trésorerie, taux IS) avec save explicite
   - `FiscalYearForm` : input `MM-DD` (avec helper "Avez-vous une clôture standard 31/12 ?")
   - `DividendCapacityCard` : card affichant `profitBeforeTaxCents`, `taxCents`, `dividendableCapacityCents`, **recalculée live** côté client à chaque modification du form (pas d'aller-retour serveur — la fonction `computeDividendCapacity` est pure et exposable côté client)

8. **Given** la fonction pure `computeDividendCapacity`,
   **When** elle est utilisée côté UI,
   **Then** elle est **importable côté client** (le service ne touche ni `db` ni `fs`). Même si fichier dans `server/services/`, l'import direct depuis un composant n'est pas autorisé (cf. story 4.3 anti-pattern). Solution : **déplacer dans `shared/services/dividend-capacity.ts`** OU exposer via un composable `useDividendCapacity({ revenue, expenses, treasury, isRate })` côté client qui ré-implémente la formule (duplication risk). Décision : **placer dans `shared/services/dividend-capacity.ts`** (fonction 100 % pure, pas de boundary serveur), importer depuis `dividend-calculator.ts` (story 7.4) qui ajoutera la logique métier supplémentaire (calcul du dividende NET requis). Cohérent avec le découpage architecture.

9. **Given** des tests unitaires sur `computeDividendCapacity`,
   **When** ils s'exécutent,
   **Then** ils couvrent :
   - taux 15 % : revenue 100 000 €, expenses 60 000 €, treasury 20 000 € → profitBeforeTax 40 000 € (`4_000_000` cents), tax 6 000 €, profitAfterTax 34 000 €, capacity 54 000 €
   - taux 25 % : mêmes valeurs → tax 10 000 €, capacity 50 000 €
   - expenses > revenue : revenue 50 000, expenses 80 000, treasury 10 000 → profitBeforeTax = -30 000 €, tax = 0, profitAfterTax = -30 000 €, capacity = max(0, -30 000 + 10 000) = max(0, -20 000) = **0**
   - treasury négative interdite par schéma (min 0) → pas de cas
   - taux 0 % : tax = 0
   - rounding floor : revenue 33, expenses 0, isRatePct 33 → profit 33, tax floor(33 * 33 / 10000) = floor(0.1089) = 0 ; revenue 1_000_000, isRate 33 → tax floor(1_000_000 * 33 / 10000) = 3300

10. **Given** un test unitaire endpoints,
    **When** il s'exécute,
    **Then** il couvre GET singleton + PUT patch + cas d'erreur (`fiscalYearEndDate: '13-01'` → 422 ; `isRatePct: -1` → 422).

11. **Given** un test E2E,
    **When** il s'exécute,
    **Then** ouvrir `/sas` → saisir CA 100 000 €, charges 60 000 €, treasury 20 000 €, taux 15 % → vérifier `DividendCapacityCard` affiche 54 000 € live (avant save) → cliquer Enregistrer → reload page → vérifier persistance des champs et de la card.

## Tasks / Subtasks

- [x] **Task 1 — Schéma DB + bootstrap seed** (AC: #1, #2)
  - [x] Ajouter `sasConfig` à `server/db/schema.ts`
  - [x] Étendre `0.bootstrap.ts` (insert idempotent)
  - [x] `yarn db:push`

- [x] **Task 2 — Schéma Zod** (AC: #3)
  - [x] `shared/schemas/sas-config.schema.ts`

- [x] **Task 3 — Service pur `dividend-capacity`** (AC: #5, #6, #8, #9)
  - [x] **Décision archi** : placé dans `shared/services/dividend-capacity.ts` (réimportable côté UI)
  - [x] Tests unitaires (cas AC#9) — co-localisés (6 cas)
  - [ ] Mise à jour `architecture.md` non bloquante — laissée à la passe doc (cf. note)

- [x] **Task 4 — Endpoints** (AC: #4)
  - [x] `server/api/sas-config.get.ts`
  - [x] `server/api/sas-config.put.ts`
  - [x] Tests unitaires (AC#10)

- [x] **Task 5 — Composable** (AC: #7)
  - [x] `app/composables/useSasConfig.ts` (pattern story 5.3)

- [x] **Task 6 — UI** (AC: #7)
  - [x] `app/components/sas/SasConfigForm.vue`
  - [x] `app/components/sas/FiscalYearForm.vue`
  - [x] `app/components/sas/DividendCapacityCard.vue` — `computeDividendCapacity` via `computed`, recalcul live
  - [x] `app/pages/sas.vue`
  - [x] Lien `/sas` dans `AppNav.vue`

- [x] **Task 7 — E2E** (AC: #11)
  - [x] `tests/e2e/sas.spec.ts`

- [x] **Task 8 — Sanity check final**
  - [x] `yarn typecheck`, `yarn lint`, `yarn test:run` verts ; `yarn test:e2e` vert sur chromium (firefox non supporté sur l'OS — idem 5.3)
  - [x] Aucun nouveau code d'erreur
  - [ ] Commit unique (en attente d'instruction utilisateur)

## Dev Notes

### Pourquoi `is_rate_pct` en pct × 100 (entier)

Éviter les floats en DB. `1500` = 15 %. La fonction divise par 10 000 dans le calcul. Idem `tax_settings.dividend_tax_rate_pct` (story 5.5) — convention cohérente.

### Pourquoi formule simplifiée V1

Le PRD §FR28 demande "capacité dividendable estimée". Pas de simulation comptable détaillée (réserves légales, IS récupérable sur pertes antérieures, distribution antérieure). KISS V1 : `profit - tax + treasury`. À documenter en code via JSDoc :

```ts
/**
 * V1 simplifiée — pas de gestion :
 *  - reports déficitaires antérieurs
 *  - taux IS réduit 15% jusqu'à 42 500 € puis 25% (l'utilisateur saisit son taux effectif)
 *  - réserves légales obligatoires (5% jusqu'à 10% du capital)
 *  - dividendes antérieurs déjà distribués
 * Voir defer-work si besoin V2.
 */
```

### `fiscal_year_end_date` au format MM-DD

Sans année car récurrente (chaque année). `12-31` par défaut (clôture standard). Le forecast (story 7.x) résout en `YYYY-MM-DD` selon l'année courante. Validation : exclure `02-30`, `04-31`, etc.

### Live recalc UI

Le PRD §SAS demande "live recalcul à chaque modification". `DividendCapacityCard` reçoit en prop les 4 valeurs courantes (depuis le state local du form, AVANT save). Affiche la capacité projetée. Le calcul est instantané (fonction pure, < 1 ms).

Pas de debounce, pas de loading state.

### Anti-patterns à éviter

- ❌ Cacher la capacité côté serveur (recompute live UI suffit, pure function)
- ❌ Hardcoder taux IS dans une fonction (lire depuis `sas_config.is_rate_pct`)
- ❌ Calculer la capacité dividendable depuis le composant directement avec `*100` / `/100` (utiliser `computeDividendCapacity`)
- ❌ Ajouter logique de "dividende NET requis" ici — c'est `dividend-calculator.ts` story 7.4
- ❌ Gérer le seuil 42 500 € IS automatiquement V1 (assumé)

### Project Structure Notes

Cette story crée :
- Mutation schema (`sas_config`) + seed bootstrap
- `shared/schemas/sas-config.schema.ts`
- `shared/services/dividend-capacity.ts` (+ `.test.ts`) — **précision archi : on le place dans `shared/` pas `server/services/`** pour permettre l'import client (cf. AC#8). À documenter dans `architecture.md` lors d'une mise à jour ultérieure.
- 2 endpoints (`sas-config.get.ts`, `sas-config.put.ts`)
- 1 composable
- 3 composants + 1 page

### Definition of Done

- [ ] Schéma DB + seed
- [ ] Service pur testé (6 cas)
- [ ] Endpoints opérationnels
- [ ] UI live recalc
- [ ] Tests verts
- [ ] Lien navigation `/sas`
- [ ] Commit unique

### References

- [Source: `_bmad-output/planning-artifacts/prd.md`#FR23-FR28]
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 5.4]
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Project Structure (595, 683)]
- [Source: `CLAUDE.md`#Invariants critiques] — Cents, fonctions pures, taux fiscaux paramétrables
- [Source: `server/services/reconciler.ts`] — modèle de service pur (cohérent)
- [Story précédente : `5-3-revenue-models-endpoints-et-ui` — pattern singleton + bootstrap seed]
- [Story aval : `5-5-tax-settings-endpoints-et-ui` — `IS_RATE_REDUCED`/`IS_RATE_NORMAL` constants ; `7-4-dividend-calculator-required-dividend` — étend ce service]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia / bmad-dev-story)

### Debug Log References

- Bootstrap test (5.3) cassé après ajout du seed `sas_config` → table ajoutée au DDL de
  setup + assertion d'idempotence du singleton `sas_config` ajoutée.
- `yarn db:push` via `yarn drizzle-kit push --force` (TTY absent ; statement additif).

### Completion Notes List

- Table `sas_config` **singleton** (`id=1`), seedée idempotemment au bootstrap (défauts du
  schéma : `fiscal_year_end_date='12-31'`, `is_rate_pct=1500`).
- `fiscalYearEndDate` au format `MM-DD` avec validation sémantique via année bissextile de
  référence (2000) → `02-29` autorisé, `02-30`/`04-31` rejetés.
- **Service pur** `shared/services/dividend-capacity.ts` (`computeDividendCapacity`) : aucune
  dépendance `db`/`fs`, importable côté serveur ET client → la card recalcule live sans
  aller-retour serveur. Formule V1 simplifiée documentée en JSDoc (pas de reports
  déficitaires, taux IS réduit, réserves légales). `tax = floor(profit × isRatePct / 10000)`
  uniquement si profit > 0 ; `capacity = max(0, profitAfterTax + treasury)`.
- Endpoints GET/PUT identiques au pattern singleton 5.3 (patch partiel `.strict()`).
- UI : `SasConfigForm` émet `change` (cents live) → la page alimente `DividendCapacityCard`
  via `computed`. Recalcul instantané AVANT save (vérifié E2E : 54 000 €). Styles réutilisés
  depuis `revenue-panel.css` (DRY). Parsing euros mutualisé via `app/utils/euros.ts` (5.3).
- Tests : **14 nouveaux** (6 service pur + 8 endpoints) + 1 assertion bootstrap. Suite
  complète **262/262**. E2E sas chromium vert. Firefox non supporté sur ubuntu26.04-x64.
- Aucun nouveau code d'erreur API.
- Note doc : mise à jour `architecture.md` (placement `shared/services/`) non faite —
  non bloquante, à grouper dans une passe doc dédiée.

### File List

**Créés**
- `shared/schemas/sas-config.schema.ts`
- `shared/services/dividend-capacity.ts`
- `shared/services/dividend-capacity.test.ts`
- `server/api/sas-config.get.ts`
- `server/api/sas-config.put.ts`
- `server/api/sas-config.test.ts`
- `app/composables/useSasConfig.ts`
- `app/components/sas/SasConfigForm.vue`
- `app/components/sas/FiscalYearForm.vue`
- `app/components/sas/DividendCapacityCard.vue`
- `app/pages/sas.vue`
- `tests/e2e/sas.spec.ts`

**Modifiés**
- `server/db/schema.ts` (table `sasConfig` + types)
- `server/middleware/0.bootstrap.ts` (seed singleton `sas_config`)
- `server/middleware/bootstrap.test.ts` (table + assertion sas_config)
- `app/components/shared/AppNav.vue` (lien `/sas` activé)

### Change Log

- 2026-06-14 — Implémentation story 5.4 : schéma `sas_config` singleton + seed bootstrap,
  service pur `computeDividendCapacity` (capacité dividendable V1), endpoints GET/PUT,
  composable `useSasConfig`, page `/sas` (config + clôture + card live recalc). Tests unit +
  E2E. Status → review.

### Review Findings
