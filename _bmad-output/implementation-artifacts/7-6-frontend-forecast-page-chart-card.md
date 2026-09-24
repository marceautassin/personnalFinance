# Story 7.6: Page `/forecast` — sélecteur d'horizon, graphe, carte dividende

Status: done

## Story

As a user,
I want a `/forecast` page showing the treasury trajectory over 6/12/24 months and the dividend I need to vote,
so that I can see my forward cash-flow and target dividend at a glance (FR46, FR48-50).

## Acceptance Criteria

1. **Given** le composable `useForecast(horizon)`,
   **Then** il `useFetch('/api/forecast', { query: { horizon }, key: 'forecast-${horizon}' })`, `server: false`, `data` typé `ForecastResponse`. `horizon` est un `Ref` réactif (changer l'horizon refetch).

2. **Given** `HorizonSelector`,
   **Then** trois boutons 6 / 12 / 24 mois ; l'actif est marqué ; le clic émet `update:horizon`.

3. **Given** `ForecastChart` (SVG inline, **aucune lib**),
   **Then** il trace le solde de fin de mois (`endingBalanceCents`) par mois : barres positives/négatives (couleur distincte < 0), ligne de zéro, labels de mois. Le premier mois négatif (`firstNegativeMonth`, FR47) est mis en évidence. Responsive (viewBox, `max-width:100%`).

4. **Given** `DividendTargetCard`,
   **Then** elle affiche : dividende **NET** requis (FR48), **BRUT** correspondant (FR49, ou « — » si null), capacité dividendable, **marge** (FR50) colorée (verte si ≥ 0), et un état « tient dans la capacité » / « dépasse la capacité ». Montants via `formatEuros`.

5. **Given** la page `app/pages/forecast.vue`,
   **Then** elle compose `HorizonSelector` + `ForecastChart` + `DividendTargetCard`, gère `pending`/`error` (mapError FR), et affiche une note de fiabilité réduite si `reducedReliability` (FR45). Le lien `/forecast` est activé dans `AppNav`.

6. **Given** un test E2E,
   **Then** ouvrir `/forecast` → le graphe et la carte s'affichent ; changer d'horizon (6 → 24) → le nombre de mois affichés change. (Sans dépendance LLM ; les singletons seedés au bootstrap suffisent — forecast vide/positif OK.)

7. **Given** CLAUDE.md,
   **Then** : pas de `$fetch` direct en composant (via composable) ; CSS scoped/tokens, pas de Tailwind ; `Cents` via `formatEuros` ; libellés FR.

## Tasks / Subtasks

- [x] **Task 1 — Composable** (AC: #1) — `app/composables/useForecast.ts`
- [x] **Task 2 — Sélecteur** (AC: #2) — `HorizonSelector.vue`
- [x] **Task 3 — Graphe SVG** (AC: #3) — `ForecastChart.vue`
- [x] **Task 4 — Carte dividende** (AC: #4) — `DividendTargetCard.vue`
- [x] **Task 5 — Page + nav** (AC: #5) — `forecast.vue` + lien `AppNav`
- [x] **Task 6 — E2E** (AC: #6) — `tests/e2e/forecast.spec.ts`
- [x] **Task 7 — Sanity** — typecheck/lint/test verts ; E2E chromium

## Dev Notes

### Graphe sans lib
Stack verrouillée (pas de lib de chart). `ForecastChart` = SVG inline calculé : échelle sur
`min/max` des soldes, barres par mois, ligne y=0, mise en évidence du 1er mois négatif. Simple,
responsive (`viewBox` + `preserveAspectRatio`), thème via variables CSS.

### Warnings / leviers / overrides → 7.7
Cette story affiche le **graphe + carte dividende**. L'alerte ARE, le panneau de leviers, la légende
des 4 sources et le dialog d'override sont la story 7.7. `reducedReliability` : simple note ici.

### Réutilisations
- `useFetch` clé par horizon (pattern `useTransactions`). `formatEuros` (`shared/types/money`).
- `ForecastResponse` depuis `~~/server/api/forecast.get` (type exporté 7.5).

### References
- [Source: prd.md#FR46, FR47, FR48-50]
- [Source: architecture.md:475 (forecast.vue), 521-539 (composants forecast/, useForecast)]
- [Source: `server/api/forecast.get.ts` (7.5)]
- [Stories aval : `7-7` warnings/levers/overrides, `7-8` recalcul réactif]

## Dev Agent Record

### Agent Model Used

Agent de développement.

### Completion Notes List

- `useForecast(horizon)` (Ref réactif, clé `forecast-{h}`). `HorizonSelector` 6/12/24. `ForecastChart` SVG inline (barres solde fin de mois, ligne zéro, 1er mois négatif mis en évidence, responsive, aucune lib). `DividendTargetCard` (net/brut/capacité/marge + statut).
- Page `forecast.vue` : pending/error, note fiabilité (FR45), alerte solde négatif (FR47). Lien `/forecast` activé.
- Warnings ARE / leviers / légende sources / dialog override → 7.7.
- E2E chromium : rendu + changement d'horizon (12→24→6 barres). Suite unitaire inchangée verte.

### File List

- `app/composables/useForecast.ts` (nouveau)
- `app/components/forecast/HorizonSelector.vue` (nouveau)
- `app/components/forecast/ForecastChart.vue` (nouveau)
- `app/components/forecast/DividendTargetCard.vue` (nouveau)
- `app/pages/forecast.vue` (nouveau)
- `app/components/shared/AppNav.vue` (modifié — lien `/forecast`)
- `tests/e2e/forecast.spec.ts` (nouveau)

### Change Log

- 2026-07-09 : Implémentation story 7.6 — page forecast (graphe SVG + carte dividende + horizon). Status → review.

### Review Findings

Code review du 2026-07-19 (Blind Hunter + Edge Case Hunter + Acceptance Auditor).

- [x] [Review][Patch] **Marge non colorée en vert quand ≥ 0** — AC4 exige « marge colorée (verte si ≥ 0) » ; seule la classe négative (rouge) était posée, une marge positive restait en couleur par défaut. Classe `div-card__pos` ajoutée. [app/components/forecast/DividendTargetCard.vue]
