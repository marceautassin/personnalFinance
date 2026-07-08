# Story 6.4: `debt-projection` (FR33) + impact d'une dette (FR34)

Status: review

## Story

As a user,
I want each debt projected into future monthly outflows per its repayment mode and to see its marginal impact on my future expenses,
so that the forecast (Epic 7) can integrate debts (FR33) and I can gauge a debt's weight on the dividend to vote (FR34).

## Contexte de cadrage (à lire avant)

FR34 parle d'« impact marginal sur le **dividende cible** ». Le dividende cible est produit par le
moteur de forecast + `dividend-calculator` (**Epic 7**, non implémenté). Le delta de dividende exact
(gross-up fiscal inclus) ne peut donc PAS être calculé ici. Cette story livre :

1. **`debt-projection.ts`** — la fonction PURE (FR33) que l'Epic 7 consommera : projette une dette en
   série de sorties mensuelles selon son mode.
2. **Impact = dépenses projetées** sur horizons 6/12/24 mois (la contribution de la dette aux dépenses
   futures — l'**entrée** du calcul de dividende). Exprimé en euros de dépense, **pas** en dividende net.
3. Le chiffre « dividende net » exact de FR34 est **reporté à l'Epic 7** (story 7.x, quand
   `dividend-calculator` existe). Documenté ici, non inventé.

## Acceptance Criteria

1. **Given** `server/services/debt-projection.ts`,
   **When** exposé,
   **Then** il exporte une fonction PURE `projectDebt(input, startMonth, horizonMonths)` où :
   - `input = { currentBalanceCents, repaymentMode, monthlyAmountCents, lumpSumDate }`
   - `startMonth = 'YYYY-MM'`, `horizonMonths` ∈ entier > 0
   - retourne `{ month: 'YYYY-MM', amountCents }[]` de longueur `horizonMonths` (une entrée par mois, `amountCents ≥ 0` = sortie de trésorerie ce mois)

2. **Given** le mode `free`,
   **When** projeté,
   **Then** toutes les entrées sont à `0` (remboursement libre = hors forecast, FR33).

3. **Given** le mode `monthly` (mensualité `M`, solde `B`),
   **When** projeté,
   **Then** chaque mois sort `min(M, solde restant)` jusqu'à épuisement de `B`, puis `0`. La somme des sorties ne dépasse jamais `B`. **Cas limite** : `B < M` → un seul mois à `B`.

4. **Given** le mode `lump_sum` (date `D`, solde `B`),
   **When** projeté,
   **Then** le mois correspondant à `YYYY-MM(D)` sort `B` s'il tombe dans `[startMonth, startMonth+horizon)`, sinon toutes les entrées sont à `0` (échéance hors horizon).

5. **Given** `GET /api/debts/[id]/impact`,
   **When** appelé,
   **Then** il retourne `{ debtId, horizons: { 6: totalCents, 12: totalCents, 24: totalCents } }` où chaque total = somme de `projectDebt(debt, moisCourant, horizon)` (dépense projetée cumulée). `id` non entier → 422 ; dette inexistante → 404.

6. **Given** le mois courant comme ancre,
   **When** l'endpoint projette,
   **Then** il utilise le mois courant serveur (`YYYY-MM`) comme `startMonth`. La logique de série reste pure (mois injecté), l'endpoint ne fait que fournir l'ancre.

7. **Given** `DebtImpactOnDividend.vue` (`app/components/debts/`),
   **When** affiché dans `DebtCard`,
   **Then** il montre les dépenses projetées 6/12/24 mois (`formatEuros`), avec une note FR : *« Impact sur les dépenses futures. Le calcul du dividende net correspondant arrive avec le forecast (à venir). »* (FR34, cadrage Epic 7). Chargé à la demande via `useDebtImpact(id)`.

8. **Given** un composable `useDebtImpact(debtId)`,
   **When** utilisé,
   **Then** il `useFetch` `/api/debts/[id]/impact` (clé `debt-impact-${id}`, `server: false`).

9. **Given** des tests unitaires de `debt-projection.ts` (NFR9),
   **When** exécutés,
   **Then** ils couvrent : nominal `monthly` (série + somme = solde) ; `monthly` avec `B < M` (1 mois partiel) ; `monthly` solde 0 ; `lump_sum` dans l'horizon ; `lump_sum` hors horizon (tout à 0) ; `free` (tout à 0) ; longueur = `horizonMonths` ; passage d'année (`startMonth` déc → janv). Plus un test de l'endpoint impact (totaux 6/12/24, 404 dette inconnue).

10. **Given** les conventions CLAUDE.md,
    **When** review,
    **Then** : `debt-projection` est une fonction PURE (mois injecté, aucun `Date.now()` interne, aucun accès DB) ; `Cents` partout ; aucun état dérivé stocké ; pas de constante fiscale en dur (aucune ici) ; libellés UI FR.

## Tasks / Subtasks

- [x] **Task 1 — Service pur `debt-projection`** (AC: #1-#4, #9)
  - [x] `server/services/debt-projection.ts` (`projectDebt` + `projectedTotalCents` + arithmétique de mois)
  - [x] `server/services/debt-projection.test.ts` — 9 cas NFR9

- [x] **Task 2 — Endpoint impact** (AC: #5, #6)
  - [x] `server/api/debts/[id]/impact.get.ts` (ancre = mois courant, 404/422)
  - [x] Tests dans `debts/crud.test.ts` (monthly déterministe, free, 404)

- [x] **Task 3 — Composable + UI** (AC: #7, #8)
  - [x] `useDebtImpact.ts` + `DebtImpactOnDividend.vue` (toggle « Impact » dans `DebtCard` → chargé à la demande)

- [x] **Task 4 — Sanity** (AC: #10)
  - [x] `typecheck`, `lint`, `test:run` (320) verts
  - [x] `debt-projection` pure (mois injecté, pas de `Date.now()` interne) ; `Cents` ; pas d'état dérivé

## Dev Notes

### `debt-projection` = fonction pure (comme forecast-engine)
Mois injecté en paramètre (`startMonth`), jamais `Date.now()` interne → testable et reproductible
(cf. CLAUDE.md « Forecast = fonction pure »). L'endpoint fournit l'ancre temporelle.

### Arithmétique de mois
Besoin d'un helper `addMonths('YYYY-MM', n) → 'YYYY-MM'` et `monthOffset(a, b)`. Purement sur
`year*12 + (month-1)`. Gère le passage d'année (déc → janv). Pas de dépendance date lib.

### Impact = dépense, pas dividende (FR34 partiel)
Le delta de dividende net exige `dividend-calculator` (Epic 7). Ici l'impact = **somme des sorties
projetées** sur l'horizon = la dépense marginale que la dette ajoute au forecast. C'est l'entrée
directe du dividende requis. La conversion en dividende brut/net est **story Epic 7** — marquée
« à venir » dans l'UI. Ne PAS coder de calcul fiscal ici (hors scope, YAGNI).

### `currentBalanceCents`
L'endpoint lit la dette + son solde courant (calcul story 6.1 : initial + avances − remboursements)
et le passe à `projectDebt`. La projection part donc du solde RÉEL restant, pas du solde initial.

### Hors scope
- Intégration effective au `forecast-engine` (Epic 7).
- Delta de dividende net (Epic 7).

### References
- [Source: prd.md#FR33, FR34]
- [Source: architecture.md:596] — `debt-projection.ts` (+ .test.ts)
- [Source: architecture.md:579-580, 507] — `[id]/impact.get.ts`, `DebtImpactOnDividend.vue`
- [Source: `CLAUDE.md`#Forecast = fonction pure]
- [Stories : `6-1` (`currentBalanceCents`, `RepaymentMode`), `6-2` (`DebtCard`)]
- [Story aval : Epic 7 (`forecast-engine`, `dividend-calculator`) — consomme `projectDebt`, calcule le delta de dividende net]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (dev-story workflow)

### Completion Notes List

- `debt-projection.ts` : `projectDebt(input, startMonth, horizon)` PUR (mois injecté) — free → 0, monthly → `min(mensualité, solde restant)`/mois (somme ≤ solde), lump_sum → solde au mois d'échéance si dans l'horizon. `projectedTotalCents` pour l'impact.
- `[id]/impact.get.ts` : dépense projetée cumulée 6/12/24 mois à partir du **solde courant** (6.1) et du **mois courant** serveur (seule impureté, hors du calcul).
- **FR34 partiel assumé** : l'impact est exprimé en dépenses futures (entrée du dividende requis), pas en dividende net — ce dernier dépend de `dividend-calculator` (Epic 7). Note explicite dans l'UI.
- `useDebtImpact` + `DebtImpactOnDividend.vue` (toggle « Impact » dans la card → fetch à la demande).
- 12 tests ajoutés (9 projection NFR9 : monthly partiel, solde<mensualité, solde 0, lump dans/hors horizon, free, passage d'année ; 3 endpoint). Suite globale 320 verte.

### File List

- `server/services/debt-projection.ts` (nouveau)
- `server/services/debt-projection.test.ts` (nouveau)
- `server/api/debts/[id]/impact.get.ts` (nouveau)
- `server/api/debts/crud.test.ts` (modifié — 3 tests impact)
- `app/composables/useDebtImpact.ts` (nouveau)
- `app/components/debts/DebtImpactOnDividend.vue` (nouveau)
- `app/components/debts/DebtCard.vue` (modifié — toggle Impact)

### Change Log

- 2026-07-08 : Implémentation story 6.4 — `debt-projection` (FR33) + impact dépenses projetées (FR34 partiel, dividende net reporté Epic 7). Status → review.

### Review Findings
