# Story 7.7: Forecast — alerte ARE, leviers, légende sources, dialog override

Status: done

## Story

As a user,
I want the forecast page to warn me about ARE/dividend overlap, list adjustment levers when the dividend exceeds capacity, explain the source legend, and let me override a variable category for a month,
so that I can understand and steer the projection (FR51, FR52, FR43, FR44).

## Acceptance Criteria

1. **Given** `AreCompatibilityWarning` (FR52),
   **Then** affiché seulement si `warnings.areOverlap` : alerte FR expliquant que le versement de dividende à l'AG (`agMonth`) tombe pendant que l'ARE est active (jusqu'à `areEndMonth`).

2. **Given** `LeversPanel` (FR51),
   **Then** affiché seulement si `levers.length > 0` : liste des leviers avec libellés FR mappés depuis les codes (`reduce_expenses` → « Réduire les dépenses », `increase_revenue` → « Augmenter le CA / facturer plus », `defer_objectives` → « Décaler les objectifs »).

3. **Given** `ForecastSourceLegend` (FR43),
   **Then** légende des 4 sources (revenu, charge fixe, variable extrapolée, ponctuelle planifiée) avec pastilles de couleur cohérentes ; sert de clé de lecture du forecast.

4. **Given** `useOverrides()`,
   **Then** expose `{ data, addOverride(input), removeOverride(id) }` sur `/api/overrides` (7.2) ; chaque mutation refetch la liste + invalide le forecast (via `useInvalidate`, réel en 7.8).

5. **Given** `VariableOverrideDialog` (FR44),
   **Then** permet de : choisir un mois (parmi les mois du forecast) × une catégorie **variable** (via `useCategories`, filtrées `isVariable`) + un montant (€) → enregistrer (upsert) ; lister les overrides existants avec suppression. Montant via `parseEurosToCents`.

6. **Given** la page `forecast.vue`,
   **Then** intègre `AreCompatibilityWarning`, `LeversPanel`, `ForecastSourceLegend`, et un bouton « Ajuster une catégorie » ouvrant `VariableOverrideDialog`.

7. **Given** un test E2E,
   **Then** ouvrir `/forecast` → ouvrir le dialog d'override → créer un override (mois + catégorie variable + montant) → il apparaît dans la liste → le supprimer → il disparaît. (Effet sur le forecast = 7.8 ; ici on teste le CRUD override via l'UI.)

8. **Given** CLAUDE.md,
   **Then** : pas de `$fetch` direct en composant ; `Cents` via `parseEurosToCents`/`formatEuros` ; CSS scoped/tokens ; libellés FR ; codes leviers mappés côté UI (pas de libellé serveur).

## Tasks / Subtasks

- [x] **Task 1 — Composable overrides** (AC: #4) — `app/composables/useOverrides.ts`
- [x] **Task 2 — Warning + leviers + légende** (AC: #1-#3) — `AreCompatibilityWarning.vue`, `LeversPanel.vue`, `ForecastSourceLegend.vue`
- [x] **Task 3 — Dialog override** (AC: #5) — `VariableOverrideDialog.vue`
- [x] **Task 4 — Intégration page** (AC: #6) — `forecast.vue`
- [x] **Task 5 — E2E** (AC: #7) — étendre `tests/e2e/forecast.spec.ts` (ou nouveau)
- [x] **Task 6 — Sanity** — typecheck/lint/test verts ; E2E chromium

## Dev Notes

### Codes → libellés (FR51)
Les leviers et sources sont des **codes** côté serveur ; les libellés FR vivent en UI (CLAUDE.md :
mapping FR centralisé côté client). Idem `ForecastSourceLegend`.

### Override → forecast
`useOverrides` invalide le forecast après mutation. L'implémentation réelle de l'invalidation
(`useInvalidate.invalidateForecast`) est la story 7.8 ; ici on branche l'appel + un refetch local
de la liste d'overrides. L'effet numérique de l'override est déjà testé unitairement (7.3).

### Réutilisations
- `useCategories` (filtrées `isVariable`) pour le select catégorie. `ConfirmDialog` non requis.
- `parseEurosToCents` (`~/utils/euros`), `formatEuros`. `MonthlyOverride` (schéma 7.2).

### References
- [Source: prd.md#FR43, FR44, FR51, FR52]
- [Source: architecture.md:499/507/525-528 (AreCompatibilityWarning, LeversPanel, ForecastSourceLegend, VariableOverrideDialog)]
- [Source: `server/api/overrides/*` (7.2), `server/api/forecast.get.ts` (7.5)]
- [Stories : `7-6` (page/graphe), `7-8` (invalidation réelle)]

## Dev Agent Record

### Agent Model Used

Agent de développement.

### Completion Notes List

- `useOverrides` (list + upsert + delete + invalidate forecast). `AreCompatibilityWarning` (FR52), `LeversPanel` (FR51, codes→libellés FR), `ForecastSourceLegend` (FR43, 4 sources), `VariableOverrideDialog` (FR44 : mois × catégorie variable + montant, upsert + suppression).
- Intégrés à `forecast.vue` (warning conditionnel, légende, bouton « Ajuster une catégorie », leviers si dépassement).
- Effet numérique de l'override déjà testé en 7.3 ; invalidation réelle du forecast = 7.8.
- E2E chromium : override créé puis retiré via le dialog. Suite unitaire inchangée.

### File List

- `app/composables/useOverrides.ts` (nouveau)
- `app/components/forecast/AreCompatibilityWarning.vue` (nouveau)
- `app/components/forecast/LeversPanel.vue` (nouveau)
- `app/components/forecast/ForecastSourceLegend.vue` (nouveau)
- `app/components/forecast/VariableOverrideDialog.vue` (nouveau)
- `app/pages/forecast.vue` (modifié — intégration)
- `tests/e2e/forecast.spec.ts` (modifié — E2E override)

### Change Log

- 2026-07-09 : Implémentation story 7.7 — alerte ARE, leviers, légende sources, dialog override. Status → review.

### Review Findings

Code review du 2026-07-19 (Blind Hunter + Edge Case Hunter + Acceptance Auditor).

- [x] [Review][Patch] **`invalidateForecast()` non awaité** dans `runMutation` — la mutation résolvait `{ ok: true }` avant que le refetch forecast ne soit settled ; les appelants ne pouvaient pas savoir si le forecast était réellement rafraîchi. [app/composables/useOverrides.ts:28]
- [x] [Review][Patch] **Libellés leviers divergents d'AC2** — `increase_revenue` affichait « …facturer plus **de jours** » et `defer_objectives` « …objectifs **de trésorerie** ». Alignés sur le texte d'AC2. [app/components/forecast/LeversPanel.vue]
