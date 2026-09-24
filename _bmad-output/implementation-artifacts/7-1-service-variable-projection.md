# Story 7.1: Service `variable-projection` — moyenne mobile par catégorie variable (FR41/FR45)

Status: done

## Story

As the forecast engine,
I want each variable-spending category projected as a moving average over the last N ingested months, with a reliability flag when history is insufficient,
so that Epic 7's forecast can extrapolate future variable expenses (FR41, FR42, FR45).

## Acceptance Criteria

1. **Given** `server/services/variable-projection.ts`,
   **When** exposé,
   **Then** il exporte une fonction **PURE** `projectVariableCategories(inputs, windowMonths)` :
   - `inputs: { categoryCode: string, monthlyTotalsCents: Cents[] }[]` — `monthlyTotalsCents` chronologique (ancien → récent), une entrée par mois ingéré (0 autorisé pour un mois sans dépense)
   - `windowMonths: number` (défaut `DEFAULT_PROJECTION_WINDOW_MONTHS = 3`, FR41)
   - retourne `{ categoryCode, projectedMonthlyCents, monthsUsed, sufficientHistory }[]`

2. **Given** une catégorie avec ≥ N mois d'historique,
   **When** projetée,
   **Then** `projectedMonthlyCents = round(moyenne des N derniers mois)`, `monthsUsed = N`, `sufficientHistory = true`.

3. **Given** une catégorie avec `k < N` mois d'historique,
   **When** projetée,
   **Then** la moyenne porte sur les `k` mois disponibles, `monthsUsed = k`, `sufficientHistory = false` (**FR45** — fiabilité réduite).

4. **Given** un historique vide (`monthlyTotalsCents = []`),
   **When** projeté,
   **Then** `projectedMonthlyCents = 0`, `monthsUsed = 0`, `sufficientHistory = false`. Pas de division par zéro.

5. **Given** l'arrondi monétaire,
   **When** la moyenne n'est pas entière,
   **Then** `projectedMonthlyCents` est arrondi au centime le plus proche (`Math.round`), jamais de float propagé (invariant `Cents`).

6. **Given** un helper de lecture `buildVariableHistory(windowMonths?)` dans le même fichier,
   **When** appelé,
   **Then** il lit la DB et retourne les `inputs` pour les **catégories variables uniquement** (`category_definitions.is_variable = 1`), alignés sur les mois ingérés (distinct `YYYY-MM` de `transactions.transaction_date`, triés) :
   - total mensuel d'une catégorie = `max(0, −Σ amount_cents)` sur le mois (nette les remboursements/avoirs, plancher 0)
   - mois sans dépense pour la catégorie → `0` (le mois compte quand même dans l'historique)
   - ne garde que les `windowMonths` derniers mois ingérés (au plus) — l'alignement + la fenêtre vivent ici, la moyenne dans la fonction pure

7. **Given** la constante `DEFAULT_PROJECTION_WINDOW_MONTHS`,
   **When** définie,
   **Then** elle vaut `3` (FR41 défaut). Exposée depuis `variable-projection.ts` (ou `shared/constants`), réutilisable. La persistance d'un N paramétrable côté UI est **hors scope 7.1** (aucune table prévue en architecture) — param avec défaut 3.

8. **Given** des tests unitaires (NFR9, 100% des fonctions de calcul),
   **When** exécutés,
   **Then** ils couvrent : nominal N=3 (moyenne exacte) ; `k < N` (fiabilité réduite) ; historique vide (0, pas de /0) ; plus de N mois (ne garde que les N derniers) ; arrondi (moyenne non entière → centime le plus proche) ; N=1 ; multi-catégories indépendantes. Plus un test de `buildVariableHistory` (DB seedée : 2 catégories variables + 1 fixe ignorée, mois alignés + 0-fill, net d'un avoir).

9. **Given** les conventions CLAUDE.md,
   **When** review,
   **Then** : `projectVariableCategories` PURE (aucun accès DB, aucun `Date.now()`) ; `Cents` partout, aucun `parseFloat`/`* 100` ; NFR18 100% couverture des fonctions de calcul.

## Tasks / Subtasks

- [x] **Task 1 — Fonction pure + constante** (AC: #1-#5, #7)
  - [x] `DEFAULT_PROJECTION_WINDOW_MONTHS = 3`, `projectVariableCategories` (pure)
- [x] **Task 2 — Helper DB** (AC: #6)
  - [x] `buildVariableHistory(windowMonths?)` — agrégation mois × catégorie variable, 0-fill, net
- [x] **Task 3 — Tests** (AC: #8)
  - [x] 12 tests (9 purs NFR9 + 3 `buildVariableHistory` seedés)
- [x] **Task 4 — Sanity**
  - [x] `typecheck`, `lint`, `test:run` (334) verts ; audit `Cents` OK

## Dev Notes

### Pureté et testabilité
`projectVariableCategories` est la fonction de calcul (NFR18 → 100% couverture, cas limites NFR9).
Le helper `buildVariableHistory` isole l'accès DB (aligné mois ingérés + 0-fill + fenêtre) pour que
la moyenne reste pure et reproductible. `forecast-engine` (7.3) appellera `buildVariableHistory` puis
`projectVariableCategories`.

### Total mensuel = `max(0, −Σ amount_cents)`
`amount_cents` est signé (négatif = dépense). Le total de dépense nette d'une catégorie-mois =
`max(0, −somme)` : un avoir (montant positif) réduit la dépense, un mois net positif (plus d'avoirs
que de dépenses) plancher à 0. Les catégories **fixes** sont exclues (déclarées en `fixed_charges`,
projetées ailleurs). Les remboursements de dette portent une catégorie fixe (`remboursement_dette`)
→ naturellement hors projection variable.

### Mois ingérés
Source = `DISTINCT strftime('%Y-%m', transaction_date)` triés. Un mois ingéré sans dépense dans une
catégorie donnée compte comme `0` (donnée réelle : rien dépensé). `sufficientHistory` dépend du nombre
de mois disponibles vs `windowMonths` (FR45).

### Arrondi
`Math.round(sum / count)` → centime le plus proche. Pas de propagation de float (les montants restent
des entiers `Cents`).

### Hors scope
- Intégration au forecast (`forecast-engine`, story 7.3).
- Overrides mois × catégorie (FR44 → story 7.2/7.7).
- Persistance d'un N paramétrable (aucune table prévue ; défaut 3).

### References
- [Source: prd.md#FR41, FR42, FR45, NFR9]
- [Source: architecture.md:593, 687, 801] — `variable-projection.ts`, mapping FR41-45
- [Source: `CLAUDE.md`#Forecast = fonction pure, #Représentation monétaire, #Tests]
- [Source: `server/db/schema.ts`] — `transactions` (amount signé, categoryCode), `category_definitions.is_variable`
- [Stories aval : `7-2` (overrides), `7-3` (forecast-engine consomme cette projection)]

## Dev Agent Record

### Agent Model Used

Agent de développement.

### Debug Log References

- Le test importait statiquement `variable-projection` (qui charge `db/client`) AVANT de fixer `DATABASE_URL` → il tapait la vraie DB dev (« table already exists »). Corrigé : import dynamique du module dans `beforeAll`, après le `process.env.DATABASE_URL` (pattern des autres tests DB).

### Completion Notes List

- `projectVariableCategories` PURE : moyenne mobile des `windowMonths` derniers mois, arrondi `Math.round`, `sufficientHistory` = (mois dispo ≥ N) pour FR45. Historique vide → 0 sans /0.
- `buildVariableHistory` : agrège la DB (catégories variables uniquement), aligne sur les mois ingérés (distinct `YYYY-MM`), 0-fill, total = `max(0, −Σ amount_cents)` (nette les avoirs), borné aux N derniers mois.
- `DEFAULT_PROJECTION_WINDOW_MONTHS = 3` (FR41). N paramétrable côté UI reporté (aucune table prévue).
- 12 tests (NFR18 100% de la fonction pure) : nominal, k<N, vide, >N, arrondi, N=1, multi-cat, mois 0 ; +3 DB.
- Consommé par `forecast-engine` (7.3).

### File List

- `server/services/variable-projection.ts` (nouveau)
- `server/services/variable-projection.test.ts` (nouveau)

### Change Log

- 2026-07-09 : Implémentation story 7.1 — service `variable-projection` (moyenne mobile FR41 + fiabilité FR45). Status → review.

### Review Findings

Code review du 2026-07-19 (Blind Hunter + Edge Case Hunter + Acceptance Auditor). **Aucun finding.**
Toutes les AC satisfaites : fonction pure, `buildVariableHistory` (variables uniquement, alignement
sur les mois ingérés, 0-fill, `max(0, −Σ)`), fenêtre par défaut à 3 mois, arrondi `Math.round`,
`sufficientHistory`. Les 12 tests exigés par AC8 sont présents. Garde division par zéro vérifiée.
