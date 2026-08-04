# Story 7.5: Endpoint `GET /api/forecast` (assemblage + alerte ARE + leviers)

Status: done

## Story

As the frontend,
I want a single `GET /api/forecast?horizon=` endpoint that returns the treasury projection, the required dividend, the ARE-overlap warning and the adjustment levers,
so that the forecast page (7.6/7.7) can render everything from one reactive fetch (FR46-53).

## Acceptance Criteria

1. **Given** `GET /api/forecast?horizon=12`,
   **Then** `horizon` ∈ {6, 12, 24} (Zod ; défaut 12 ; valeur hors liste → 422). Calculé à la demande, **non stocké** (D9).

2. **Given** l'assemblage,
   **Then** la réponse contient :
   - `horizonMonths`, `startMonth`
   - `forecast` : le `ForecastResult` (7.3) — mois + `firstNegativeMonth`
   - `dividend` : le `RequiredDividend` (7.4) — net/brut requis, capacité, marge, `fitsCapacity`
   - `capacity` : le détail `DividendCapacity` (5.4)
   - `agMonth` : mois de la prochaine AG (`YYYY-MM`) résolu depuis `sas_config.fiscal_year_end_date`
   - `warnings.areOverlap` : booléen (FR52)
   - `warnings.areEndMonth` : `YYYY-MM | null`
   - `levers` : `string[]` (codes, FR51) — non vide seulement si `!fitsCapacity`
   - `reducedReliability` : booléen (FR45 — historique variable insuffisant)

3. **Given** le mois courant (serveur) comme ancre,
   **Then** `startMonth = YYYY-MM` courant ; `buildForecastInput` + `computeForecast` produisent le forecast ; la capacité vient de `computeDividendCapacity(sas_config)` ; le taux de `tax_settings`.

4. **Given** la prochaine AG (FR52),
   **Then** `agMonth` = prochaine occurrence de `fiscal_year_end_date` (MM-DD) depuis `startMonth` (année courante si le mois d'AG ≥ mois courant, sinon +1 an).

5. **Given** l'alerte ARE (FR52),
   **Then** `warnings.areOverlap = true` ssi un dividende est requis (`requiredNetCents > 0`) ET l'ARE est encore active au mois d'AG (`areEndMonth != null && agMonth <= areEndMonth`).

6. **Given** les leviers (FR51),
   **Then** si `!fitsCapacity` : `levers = ['reduce_expenses','increase_revenue','defer_objectives']` (codes, libellés FR en UI 7.7) ; sinon `levers = []`.

7. **Given** la fiabilité (FR45),
   **Then** `reducedReliability = true` si le nombre de mois ingérés (distinct `YYYY-MM` de `transactions`) `< DEFAULT_PROJECTION_WINDOW_MONTHS`.

8. **Given** un test d'endpoint (DB seedée),
   **Then** : scénario nominal (forecast + dividende + capacité cohérents) ; `horizon` invalide → 422 ; AG résolue correctement (mois d'AG passé → année +1) ; `areOverlap` true quand AG pendant ARE + dividende requis ; `levers` non vide quand dépassement capacité ; `reducedReliability` vrai avec < 3 mois ingérés.

9. **Given** CLAUDE.md,
   **Then** : payload typé exporté (pour le composable 7.6) ; erreurs via helpers ; pas d'état dérivé stocké ; aucune constante fiscale en dur.

## Tasks / Subtasks

- [x] **Task 1 — Résolution AG** — helper `resolveNextAgMonth(startMonth, fiscalYearEndMMDD)` (dans `period.ts` ou l'endpoint)
- [x] **Task 2 — Endpoint** (AC: #1-#7) — `server/api/forecast.get.ts` (+ type `ForecastResponse` exporté)
- [x] **Task 3 — Tests** (AC: #8) — `forecast.get.test.ts` (DB seedée)
- [x] **Task 4 — Sanity** — typecheck/lint/test verts

## Dev Notes

### Assemblage (pas de nouvelle logique de calcul)
7.5 n'ajoute pas de calcul financier : il orchestre 7.3 (forecast) + 7.4 (dividende) + 5.4 (capacité)
+ 5.5 (taux) + résolution AG. Les fonctions pures restent la source de vérité testée à 100%.

### Résolution AG
`fiscal_year_end_date` est `MM-DD`. Mois d'AG = ce MM sur l'année courante si `MM >= mois courant`,
sinon année +1. (Le jour ne change pas le mois d'AG en granularité mensuelle.)

### Fiabilité (FR45)
Signal simple : mois ingérés `< N` (défaut 3) → `reducedReliability`. L'affichage par catégorie
(fiabilité réduite d'une catégorie précise) est raffiné en UI 7.6/7.7 si besoin.

### Hors scope
- Rendu graphique / cartes → 7.6. Dialog override + panneau leviers (libellés) → 7.7.
- Recalcul réactif (invalidation `useFetch`) → 7.8.

### References
- [Source: prd.md#FR46-53]
- [Source: architecture.md:220 (GET /api/forecast à la demande), 254-258 (D9), 587 (forecast.get)]
- [Source: `forecast-engine.ts` (7.3), `dividend-calculator.ts` (7.4), `dividend-capacity.ts` (5.4)]
- [Stories aval : `7-6` UI, `7-7` warnings/levers/overrides, `7-8` recalcul réactif]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (dev-story workflow)

### Completion Notes List

- `GET /api/forecast?horizon={6,12,24}` (défaut 12, hors liste → 422), calculé à la demande (D9).
- Assemble forecast-engine (7.3) + dividend-calculator (7.4) + `computeDividendCapacity` (5.4) + taux tax_settings (5.5). Aucune nouvelle logique de calcul.
- AG (FR52) : `resolveNextAgMonth` ajouté à `period.ts`. `areOverlap` = dividende requis > 0 ET ARE active au mois d'AG. Leviers (FR51) non vides si `!fitsCapacity`. `reducedReliability` (FR45) si mois ingérés < 3.
- Type `ForecastResponse` exporté (pour composable 7.6).
- 7 tests (structure, défaut, 422, reducedReliability, leviers, areOverlap + unité resolveNextAgMonth). Suite 371 verte.

### File List

- `server/api/forecast.get.ts` (nouveau — + type `ForecastResponse`)
- `server/api/forecast.get.test.ts` (nouveau)
- `server/utils/period.ts` (modifié — `resolveNextAgMonth`)

### Change Log

- 2026-07-09 : Implémentation story 7.5 — endpoint `GET /api/forecast` (assemblage + AG/ARE + leviers). Status → review.

### Review Findings

Code review du 2026-07-19 (Blind Hunter + Edge Case Hunter + Acceptance Auditor).

- [x] [Review][Defer] `resolveNextAgMonth` ignore le jour de clôture [server/utils/period.ts:73-82] — comparaison purement mensuelle (`mm >= parsed.month`) : au 15/12 avec clôture `12-31`, l'AG est résolue à `2026-12` alors que l'exercice n'est pas clos. **Deferred** — la granularité mensuelle est une simplification assumée dans tout le projet ; changer ici seul créerait une incohérence.
- [x] [Review][Defer] `reducedReliability` et `sufficientHistory` mesurent des choses différentes [server/api/forecast.get.ts] — `reducedReliability` compte les mois distincts de **toutes** les transactions, `sufficientHistory` se calcule par catégorie variable. 3 mois de relevés sans aucune dépense variable ⇒ « fiabilité OK » affichée alors que les projections variables sont à 0. **Deferred** — réconcilier les deux signaux demande un arbitrage produit, pas un correctif mécanique.
