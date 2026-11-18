# Story 7.4: `dividend-calculator` — dividende NET/BRUT requis + marge (FR48-50)

Status: done

## Story

As the forecast API,
I want to compute the NET dividend required to keep the projected treasury positive, its GROSS equivalent from the tax rate, and the margin vs the SAS dividendable capacity,
so that the user knows how much to vote at the AG and whether it fits (FR48, FR49, FR50).

## Acceptance Criteria

1. **Given** `server/services/dividend-calculator.ts`,
   **Then** il exporte une fonction **PURE** `computeRequiredDividend(forecast, opts)` — aucun accès DB, aucun `Date.now()`.

2. **Given** le forecast (7.3) et `opts = { dividendTaxRatePct, capacityGrossCents }`,
   **Then** le résultat est `{ requiredNetCents, requiredGrossCents, capacityGrossCents, marginCents, fitsCapacity }`.

3. **Given** FR48 (dividende NET requis),
   **Then** `requiredNetCents = max(0, −min(endingBalanceCents sur l'horizon))` : l'injection nette qui garde chaque mois ≥ 0 (modèle v1 : dividende disponible dès le départ). Forecast entièrement positif → `0`.

4. **Given** FR49 (BRUT depuis la fiscalité),
   **Then** `requiredGrossCents = ceil(net × 10000 / (10000 − dividendTaxRatePct))` (arrondi au centime supérieur pour que le NET après impôt couvre le besoin). `net = 0` → `0`. Si `dividendTaxRatePct >= 10000` (100 %, dégénéré) et `net > 0` → `requiredGrossCents = null` (dividende net impossible).

5. **Given** FR50 (comparaison capacité + marge),
   **Then** `marginCents = capacityGrossCents − requiredGrossCents` (null si gross null) ; `fitsCapacity = requiredGrossCents !== null && requiredGrossCents <= capacityGrossCents`.

6. **Given** l'exactitude au centime (arithmétique entière),
   **Then** le calcul BRUT évite le dépassement de `MAX_SAFE_INTEGER` (net ≤ 1e12 × 10000 = 1e16 > 9e15) via la même décomposition `q·rate + floor(r·rate/…)` que `dividend-capacity`, ou un calcul sûr documenté.

7. **Given** des tests unitaires (NFR9/NFR18 100%),
   **Then** : forecast tout positif → net 0, gross 0, fits true ; trough négatif → net = |trough| ; taux 0 → gross = net ; taux 30 % → gross = ceil(net/0.7) ; taux 100 % + net>0 → gross null, fits false ; capacité < gross → fits false, marge négative ; capacité ≥ gross → fits true ; arrondi (net non divisible) ; exactitude au plafond (gros montants, pas de perte de centime).

8. **Given** CLAUDE.md,
   **Then** : fonction PURE ; `Cents` ; **aucun taux fiscal en dur** (le taux vient de `tax_settings` via l'appelant) ; aucun état dérivé.

## Tasks / Subtasks

- [x] **Task 1 — Service pur** (AC: #1-#6) — `computeRequiredDividend` + types
- [x] **Task 2 — Tests** (AC: #7) — `dividend-calculator.test.ts` (100% + plafond)
- [x] **Task 3 — Sanity** — typecheck/lint/test verts ; audit `Cents`/pureté/pas de taux en dur

## Dev Notes

### Modèle v1 : injection au départ
`requiredNetCents` = comblement du creux = `max(0, −min(soldes))`. On raisonne « combien de cash
manque-t-il sur l'horizon », comme si le dividende était disponible dès maintenant (conservateur,
simple). L'injection datée à l'AG (mois de `fiscal_year_end`) et le cas « creux avant la prochaine
AG » sont une **raffinement V2** — documenté, non implémenté ici.

### NET → BRUT
`net = gross × (1 − taux)`. Donc `gross = net / (1 − taux)`, arrondi **au supérieur** (`ceil`) pour
que le net après impôt couvre au moins le besoin. Taux = `dividendTaxRatePct / 10000`.

### Capacité
`capacityGrossCents` est fourni par l'appelant (endpoint 7.5 via `computeDividendCapacity` 5.4 +
`sas_config`). Le calculateur reste découplé et pur.

### FR52 (ARE overlap) & FR51 (leviers)
Hors scope 7.4 : l'alerte ARE (FR52) et les leviers (FR51) sont assemblés par l'endpoint 7.5 /
l'UI 7.7 (ils ont besoin de la date d'AG et des libellés). Ici, uniquement le calcul du dividende.

### References
- [Source: prd.md#FR48, FR49, FR50 ; NFR9, NFR18]
- [Source: architecture.md:595 (dividend-calculator)]
- [Source: `shared/services/dividend-capacity.ts` (5.4) — capacité + décomposition entière sûre]
- [Source: `tax_settings.dividend_tax_rate_pct` (5.5) — taux, jamais en dur]
- [Stories : `7-3` (forecast consommé), `7-5` (endpoint assemble calc + capacité + warnings)]

## Dev Agent Record

### Agent Model Used

Agent de développement.

### Completion Notes List

- `computeRequiredDividend` PURE (imports type-only → aucun runtime, aucune DB) : net = comblement du creux (`max(0, −min(soldes, startingTreasury))`), brut = `ceil(net·10000/(10000−taux))` en arithmétique entière décomposée (exact au plafond 1e12), marge + `fitsCapacity` vs capacité.
- Taux = `dividendTaxRatePct` fourni par l'appelant (tax_settings 5.5) — aucun taux en dur.
- Taux 100 % + net>0 → brut/marge `null`, `fitsCapacity` false (dégénéré géré proprement).
- FR51 (leviers) / FR52 (alerte ARE) laissés à 7.5/7.7 (besoin AG + libellés).
- 9 tests (tout positif, creux, taux 0/30/100 %, capacité </≥, startingTreasury, exactitude 1e12). Suite 364 verte.

### File List

- `server/services/dividend-calculator.ts` (nouveau)
- `server/services/dividend-calculator.test.ts` (nouveau)

### Change Log

- 2026-07-09 : Implémentation story 7.4 — `dividend-calculator` (NET/BRUT requis + marge, FR48-50). Status → review.

### Review Findings

Code review du 2026-07-19 (Blind Hunter + Edge Case Hunter + Acceptance Auditor).

Aucun correctif. Un finding levé puis **écarté** : `requiredNetCents` initialise le `reduce` avec
`startingTreasuryCents`, ce qui diverge du texte littéral d'AC3 (`max(0, −min(endingBalanceCents))`).
Comportement **intentionnel, documenté dans les Dev Notes et couvert par un test dédié** — il capture
le cas d'un déficit de départ qu'aucun mois ultérieur ne minore. Plus prudent que la lettre de l'AC.

Vérifié et jugé correct par les trois couches : arithmétique entière de `grossFromNet`
(décomposition `net = denom·q + r`, aucun dépassement au plafond 1e12), garde `denom <= 0`
(taux ≥ 100 % → `null`), plafonnement `max(0, …)` de la capacité, aucun taux fiscal en dur.
