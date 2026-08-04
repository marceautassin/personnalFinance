# Story 7.3: `forecast-engine` v1 (trésorerie mensuelle) + snapshots

Status: done

## Story

As the forecast API,
I want a pure engine that projects personal monthly cash-flow over a horizon by combining revenues, fixed charges, variable projections, overrides and debts,
so that the app can show the treasury trajectory and detect when it goes negative (FR46, FR47, FR43) — the dividend calculation (FR48+) builds on this.

## Périmètre

7.3 = le moteur de **trésorerie** (solde mensuel projeté, avant dividende). Le calcul du **dividende
requis** (FR48-50) est la story 7.4 (`dividend-calculator`). L'endpoint `GET /api/forecast` est 7.5.

## Acceptance Criteria

1. **Given** `server/services/forecast-engine.ts`,
   **Then** il exporte une fonction **PURE** `computeForecast(input: ForecastInput, horizonMonths): ForecastResult` (aucun accès DB, aucun `Date.now()` — mois de départ injecté).

2. **Given** `ForecastResult`,
   **Then** il contient `months: ForecastMonth[]` (longueur `horizonMonths`, à partir de `input.startMonth` inclus) et `firstNegativeMonth: string | null`. Chaque `ForecastMonth` = `{ month, incomeCents, fixedChargesCents, variableCents, punctualCents, netCents, endingBalanceCents }` (FR43 : 4 sources distinctes + net + solde).

3. **Given** les revenus (FR),
   **Then** chaque mois : `incomeCents = ARE + loyer SAS + défraiements`. **ARE** incluse pour le mois M si `monthOf(endDate) >= M` (règle v1 : mois entier si les droits couvrent une partie du mois — pas de proration ; **FR52/ARE fin de mois** = cas limite testé). `endDate` null ou passée → ARE = 0.

4. **Given** les charges fixes (`fixed_charges`, montant signé),
   **Then** `fixedChargesCents` (mois M) = Σ charges applicables **non ponctuelles** :
   - `monthly` : chaque mois de `[startMonth, endMonth]`
   - `quarterly` : `monthOffset(startMonth, M) % 3 === 0` dans la plage
   - `annual` : `monthOffset(startMonth, M) % 12 === 0` dans la plage (**charge annuelle à cheval sur 2 exercices** = cas limite testé)
   - une charge dont `endDate` est dépassée n'est plus appliquée
   Les montants sont signés (dépense négative) et sommés tels quels.

5. **Given** les projections variables (7.1) et overrides (7.2),
   **Then** `variableCents` (mois M) = −Σ sur les catégories variables de `override(M, cat) ?? projectionMensuelle(cat)`. Un **override** remplace la projection pour ce mois × catégorie (cas limite testé).

6. **Given** les charges ponctuelles + dettes,
   **Then** `punctualCents` (mois M) = −(charges `punctual` du mois `M` + remboursements de dette **lump_sum** du mois `M`). Les remboursements de dette **monthly** vont dans `fixedChargesCents`. Les dettes `free` sont hors forecast. (Projection dette = service 6.4 `projectDebt`.)

7. **Given** le calcul du solde,
   **Then** `netCents = incomeCents + fixedChargesCents + variableCents + punctualCents` (buckets signés, dépenses négatives) ; `endingBalanceCents` = `startingTreasuryCents` + Σ des `netCents` jusqu'au mois inclus. `firstNegativeMonth` = premier mois où `endingBalanceCents < 0`, sinon `null` (**FR47**).

8. **Given** un builder `buildForecastInput(startMonth)` (accès DB),
   **Then** il assemble `ForecastInput` depuis la base : `startingTreasuryCents` = `closing_balance_cents` du **dernier** relevé ingéré (par `period_end`), 0 si aucun ; revenus (`revenue_models` singleton) ; `fixed_charges` ; projections via `buildVariableHistory` + `projectVariableCategories` (7.1) ; overrides (`monthly_overrides`) ; dettes → `projectDebt` (6.4) réparties monthly/lump_sum par mode. Fonction non pure (isolée), testée avec DB seedée.

9. **Given** des snapshots reproductibles (G5),
   **Then** au moins un scénario complet (revenus + charges mixtes + projection + override + dette) est figé dans `tests/fixtures/snapshots/` et comparé par `toMatchSnapshot` / égalité, pour verrouiller le calcul.

10. **Given** NFR9 / NFR18 (100% des fonctions de calcul),
    **Then** tests couvrant : nominal multi-source ; solde qui passe négatif (FR47) ; ARE se terminant en milieu de mois ; charge annuelle sur l'anniversaire (2 exercices) ; override mois × catégorie ; dette monthly vs lump_sum ; historique vide (tout à 0 sauf revenus) ; horizon 6/12/24.

11. **Given** CLAUDE.md,
    **Then** : `computeForecast` PURE ; `Cents` partout ; aucun état dérivé stocké ; aucune constante fiscale ici (fiscalité = 7.4).

## Tasks / Subtasks

- [x] **Task 1 — Util mois** — `monthOffset` dans `server/utils/period.ts` (fait)
- [x] **Task 2 — Engine pur** (AC: #1-#7) — `computeForecast` + types
- [x] **Task 3 — Builder DB** (AC: #8) — `buildForecastInput`
- [x] **Task 4 — Tests + snapshot** (AC: #9, #10) — `forecast-engine.test.ts` + fixture snapshot
- [x] **Task 5 — Sanity** — typecheck/lint/test verts ; audit `Cents`, pureté

## Dev Notes

### Pureté
`computeForecast` prend `startMonth` en entrée (jamais `Date.now()`). Le builder fournit le mois
courant. Réutilise `nextMonths`, `monthOf`, `monthOffset` (`server/utils/period.ts`).

### 4 sources (FR43) + dettes
- `income` : revenus. `fixedCharges` : charges fixes récurrentes **+ dette monthly**. `variable` :
  projection/override. `punctual` : charges ponctuelles **+ dette lump_sum**.
- Choix : la dette monthly se comporte comme une charge fixe, la lump_sum comme une ponctuelle →
  reste cohérent avec la légende à 4 sources. Documenté.

### ARE fin de mois (v1, pas de proration)
Mois entier si `monthOf(endDate) >= M`. Simplification assumée (le PRD cible une projection ROUGH).
La proration au jour près est hors scope V1.

### Solde de départ
`closing_balance_cents` du dernier relevé (le solde réel du compte perso « maintenant »). Pas de
champ « trésorerie perso » déclaré ; on prend la dernière vérité bancaire. 0 si aucun relevé.

### Hors scope
- Dividende requis (FR48-50) → 7.4. Endpoint (FR46 exposé) → 7.5. UI → 7.6/7.7.

### References
- [Source: prd.md#FR43, FR46, FR47 ; NFR9, NFR18]
- [Source: architecture.md:594 (forecast-engine), 254-258 (D9 forecast pur), 638 (snapshots)]
- [Source: `server/services/variable-projection.ts` (7.1), `server/services/debt-projection.ts` (6.4)]
- [Source: `server/utils/period.ts`] — helpers mois
- [Stories aval : `7-4` dividend-calculator, `7-5` endpoint forecast]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (dev-story workflow)

### Completion Notes List

- `computeForecast` PURE : buckets signés income/fixed/variable/punctual, net + solde cumulé, `firstNegativeMonth` (FR47). Dette monthly→fixe, lump_sum→ponctuelle, free hors forecast. ARE mois entier si droits couvrent une partie (v1, pas de proration).
- `buildForecastInput` (DB) : solde de départ = dernier relevé, revenus singleton, charges, projections (7.1), overrides (7.2), dettes→projectDebt (6.4) réparties par mode.
- `monthOffset` ajouté à `server/utils/period.ts`.
- Snapshot G5 d'un scénario complet (6 mois, revenus+charges+annuelle+override+dette) figé et vérifié à la main.
- 12 tests (nominal, FR47, ARE fin de mois, annuelle/trimestrielle, dette monthly/lump, ponctuelle, vide, horizons 6/12/24, snapshot ; +2 builder DB). Suite 355 verte.

### File List

- `server/services/forecast-engine.ts` (nouveau)
- `server/services/forecast-engine.test.ts` (nouveau)
- `server/services/__snapshots__/forecast-engine.test.ts.snap` (nouveau — snapshot G5)
- `server/utils/period.ts` (modifié — `monthOffset`)

### Change Log

- 2026-07-09 : Implémentation story 7.3 — `forecast-engine` v1 (trésorerie mensuelle FR46/FR47/FR43) + snapshot. Status → review.

### Review Findings

Code review du 2026-07-19 (Blind Hunter + Edge Case Hunter + Acceptance Auditor).

- [x] [Review][Decision→Patch] **Override orphelin silencieusement ignoré** — `computeForecast` n'appliquait les overrides qu'en bouclant sur `variableProjections`. Historique vide (`buildVariableHistory` → `[]`) ⇒ override accepté par l'API (POST 200, listé en UI) mais **sans aucun effet** sur le forecast. Trouvé indépendamment par 2 couches aveugles. Décision **1a** : l'override est un levier manuel indépendant (FR44) → boucle sur les overrides orphelins ajoutée. [server/services/forecast-engine.ts:94-118]
- [x] [Review][Patch] Tests NFR18 « override × historique vide » + « override sur catégorie non projetée » ajoutés (régression du point ci-dessus). [server/services/forecast-engine.test.ts]
- [x] [Review][Decision→Patch] **ARE = 0 sur tout l'horizon si `end_date` null** — `incomeForMonth` n'ajoute l'ARE que si `unemploymentBenefitEndDate` existe ; un montant saisi sans date était silencieusement ignoré (trésorerie sous-estimée, dividende requis gonflé). Décision **2a** : `end_date` rendue obligatoire dès qu'un montant ARE > 0, contrôle croisé sur l'état après patch. ⚠️ Le fix touche la story 5.3 (`revenues.put.ts` + tests) — débordement de périmètre assumé. [server/api/revenues.put.ts]
- [x] [Review][Patch] Test NFR18 « dette à zéro » : extinction assertée jusqu'au bout (aucune sortie après le mois de solde, total = solde initial). [server/services/forecast-engine.test.ts]
