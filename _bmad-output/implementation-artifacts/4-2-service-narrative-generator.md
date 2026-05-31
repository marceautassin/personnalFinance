# Story 4.2: Service `narrative-generator` (top écarts + génération de phrases FR)

Status: descoped

> **Retirée du scope le 2026-05-31 (décision Marceau).** Cette story était un refactor pur :
> déménager `selectTopDeltas`/`phraseDelta` (déjà inlinés et testés dans `server/api/dashboard.get.ts`
> en story 4.1) vers un service dédié. Aucun gain fonctionnel — l'endpoint 4.1 expose déjà
> `phrases: string[]` prêtes à afficher, et la story 4.3 les consomme directement. Les helpers
> restent donc inlinés dans `dashboard.get.ts`. Réactivable plus tard si un autre consommateur
> serveur a besoin de `formatDelta`.

## Story

As a dev,
I want a deterministic algorithm that selects and phrases the most significant deltas,
so that the dashboard tells a clear story without relying on the LLM at runtime.

## Acceptance Criteria

1. **Given** un service `server/services/narrative-generator.ts`,
   **When** il est créé,
   **Then** il exporte deux fonctions pures (aucun appel DB, aucun appel LLM, aucun side-effect) :
   - `pickTopDeltas(current: CategoryTotals, priors: ReadonlyArray<CategoryTotals>): Delta[]`
   - `formatDelta(d: Delta): string`

2. **Given** la signature de `pickTopDeltas`,
   **When** elle est appelée,
   **Then** elle retourne **au plus 3** `Delta`, triés par `|diffCents|` décroissant. Critères de sélection (tous applicables) :
   - calculer `priorAvgCents = sum(priors[*][code]) / max(priors.length, 1)` arrondi à l'entier le plus proche (centime)
   - `diffCents = currentCents - priorAvgCents`
   - éligible si `|diffCents| >= 1000` (10 €) **ET** (`priorAvgCents === 0` OU `|diffCents/priorAvgCents| >= 0.20`)
   - `pct: number | null` ; `null` quand `priorAvgCents === 0` (catégorie nouvelle, pas de ratio défini)

3. **Given** la signature `Delta`,
   **When** elle est exposée,
   **Then** elle est :
   ```ts
   export interface Delta {
     categoryCode: string
     label: string             // libellé FR (passé par l'appelant via priors/current ; cf. AC#7)
     currentCents: Cents
     priorAvgCents: Cents
     diffCents: Cents
     pct: number | null
   }
   export interface CategoryTotals {
     [code: string]: { label: string, amountCents: Cents }
   }
   ```

4. **Given** la fonction `formatDelta`,
   **When** appelée sur un Delta de hausse de dépense (catégorie déjà connue, `diffCents < 0` car expense plus négative),
   **Then** elle retourne une phrase FR du type : *« Tes courses ont augmenté de 280 € (+62 %) ce mois, principal facteur du delta de solde. »* (l'adverbe "principal facteur" n'apparaît que sur le delta #1 ; voir AC#5).

5. **Given** la fonction `formatDelta`,
   **When** elle est appelée,
   **Then** elle se base uniquement sur les champs du `Delta` ; **elle ne sait pas si le Delta est #1 ou pas**. La hiérarchisation "principal facteur" est laissée à l'appelant qui décore : `pickTopDeltas(...).map((d, i) => ({...d, isPrimary: i === 0}))` puis `formatDelta` accepte un second param optionnel `{ isPrimary?: boolean }`. Garde la fonction pure et composable.

6. **Given** les nuances de phrasing,
   **When** je formule un Delta,
   **Then** la grammaire suit ces règles :
   - **Hausse de dépense** (catégorie variable, `diffCents < 0`, ex. courses +280 €) : *« Tes [label] ont augmenté de [|diff| €] (+[pct]%) ce mois[, principal facteur du delta de solde]. »*
   - **Baisse de dépense** (`diffCents > 0` sur catégorie de dépense usuelle) : *« Tes [label] ont baissé de [|diff| €] ([pct]%) ce mois. »*
   - **Hausse de revenu** (`diffCents > 0` ET `currentCents > 0`) : *« Tes revenus [label] ont augmenté de [diff €] (+[pct]%) ce mois. »*
   - **Nouvelle catégorie** (`pct === null`) : *« Une nouvelle dépense « [label] » apparaît ce mois pour [|currentCents| €]. »* (ou "un nouveau revenu" si current > 0)
   - **Disparition** (current = 0, prior > 0) : pas de Delta émis (le filtre AC#2 exclut `|diffCents| >= 1000` mais sans seuil pct si current = 0 ; à ne pas générer de phrase de disparition en V1 — KISS).

7. **Given** les libellés FR des catégories,
   **When** je formate,
   **Then** ils proviennent de `category_definitions.label` (passés par l'appelant dans `CategoryTotals[code].label`). **Le service ne lit pas la DB**.

8. **Given** le formatage des montants,
   **When** la phrase est générée,
   **Then** elle utilise `formatEuros(cents)` de `shared/types/money.ts` (déjà existant). Le `pct` est formaté `Math.round(Math.abs(pct) * 100)`% avec un signe `+` quand `diffCents < 0` sur dépense ou `diffCents > 0` sur revenu (cf. règles AC#6).

9. **Given** des tests unitaires `server/services/narrative-generator.test.ts`,
   **When** ils s'exécutent,
   **Then** ils couvrent :
   - **Hausse marquée** : 1 catégorie courses passe de -200 € moyen à -480 € → top 1 + phrase "augmenté de 280 € (+62 %)".
   - **Mois quasi identique** : tous les diffs < 10 € → `pickTopDeltas` retourne `[]`.
   - **Charge ponctuelle** : nouvelle catégorie `vacances` avec -350 € (priorAvg = 0) → Delta avec `pct: null`, phrase "nouvelle dépense".
   - **Top 3 limité** : 5 catégories en delta → seuls les 3 plus gros par `|diffCents|` retournés, dans l'ordre.
   - **Limite éligibilité** : delta de 9 €, exactement à la limite → exclu (`< 1000` cents).
   - **Pct sous le seuil** : delta de 12 € sur priorAvg de 200 € → 6 % < 20 %, exclu.
   - **`isPrimary`** : `formatDelta(delta, { isPrimary: true })` ajoute "principal facteur du delta de solde" ; sans flag, pas de mention.
   - **Revenu** : catégorie `salaire` passe de +2000 € à +2500 € → phrase "tes revenus salaire ont augmenté de 500 € (+25 %)".

10. **Given** la convention monétaire (CLAUDE.md),
    **When** je manipule des montants,
    **Then** j'utilise les helpers `subCents`, `addCents`, `mulCentsByRatio` de `shared/types/money.ts` ; **jamais** de `*100` ou `/100` à la main. La division pour `priorAvgCents` se fait via `Math.round(sum / count)` (entier cents) — ajouter `divCentsByInt(total: Cents, n: number): Cents` dans `money.ts` si pertinent (cf. defer `1.3 — Pas de divCents`).

11. **Given** l'endpoint `dashboard.get.ts` (story 4.1),
    **When** cette story est livrée APRÈS 4.1,
    **Then** elle déplace les helpers privés `selectTopDeltas` ET `phraseDelta` d'`dashboard.get.ts` vers `narrative-generator.ts` (renommés `pickTopDeltas` et `formatDelta`) et l'endpoint les **importe**. Vérifier qu'il n'y a plus aucune duplication. La réponse de l'endpoint conserve le champ `phrases: string[]` (pas de changement de contrat — c'est un refactor interne uniquement). Tests `dashboard.get.test.ts` et `narrative-generator.test.ts` restent verts indépendamment.

## Tasks / Subtasks

- [ ] **Task 1 — Helper `divCentsByInt`** (AC: #10, optionnel)
  - [ ] Si non présent : ajouter à `shared/types/money.ts` avec garde `n > 0` + test d'arrondi (résidu central — cf. defer 1.3 deferred-work)
  - [ ] Si jugé over-engineering : utiliser `Math.round(sum / count) as Cents` localement avec `cents()` cast

- [ ] **Task 2 — Service `server/services/narrative-generator.ts`** (AC: #1-3, #5, #11)
  - [ ] Définir `Delta`, `CategoryTotals` (exporter)
  - [ ] Implémenter `pickTopDeltas(current, priors)` — pure, déterministe, tri stable (par `|diff|` desc puis `categoryCode` alphabétique pour stabiliser les ex æquo)
  - [ ] Implémenter `formatDelta(delta, { isPrimary }?)` — switch-like sur les 4 cas (hausse dépense, baisse dépense, hausse revenu, nouvelle catégorie)
  - [ ] Imports stricts : `Cents`, `formatEuros`, `subCents` depuis `shared/types/money.ts` ; aucun import DB

- [ ] **Task 3 — Tests `narrative-generator.test.ts`** (AC: #9)
  - [ ] 8 cas listés en AC#9, tous nominaux + edge

- [ ] **Task 4 — Refactor `dashboard.get.ts`** (AC: #11)
  - [ ] Remplacer les helpers privés `selectTopDeltas` et `phraseDelta` par les imports `pickTopDeltas` et `formatDelta`
  - [ ] Adapter le shape `current`/`priors` si nécessaire (cohérence des types `CategoryTotals`)
  - [ ] Le contrat de réponse (`phrases: string[]`) **ne change pas** — refactor interne uniquement
  - [ ] Vérifier `dashboard.get.test.ts` toujours vert (les snapshots des deltas peuvent changer si la logique tri ex-æquo a divergé — réaligner)

- [ ] **Task 5 — Sanity check final**
  - [ ] `yarn typecheck`, `yarn lint`, `yarn test:run` propres
  - [ ] Aucun import DB / fs / network dans `narrative-generator.ts` (vérifier visuellement + lint si possible)
  - [ ] Commit unique

## Dev Notes

### Pourquoi un service pur déterministe et pas de LLM

Le PRD (FR39) demande des phrases explicatives. Tentation : appeler Claude pour phraser. **Refus assumé en V1** :
- Coût + latence à chaque dashboard render ;
- Non déterministe (diffère entre deux ouvertures du même mois → confusion utilisateur) ;
- Pas testable proprement.

Les phrases sont **gabarits français** avec interpolation. C'est suffisamment naturel pour < 30 sec de lecture (objectif PRD §"Quick win 30 sec").

### Convention de signe — attention en phrasing

`amountCents` reste signé : dépenses = négatif, revenus = positif.
- **Hausse de dépense** = `current` plus négatif que `priorAvg` = `diffCents < 0`. La phrase dit "ont augmenté de |diff|".
- **Baisse de dépense** = `diffCents > 0` (current moins négatif).
- **Hausse de revenu** = `diffCents > 0` ET catégorie de revenu (`current > 0`).

⚠️ Le sens "augmenté/baissé" en FR ne dépend PAS du signe de `diffCents`, il dépend du **type de la catégorie** (dépense vs revenu). Heuristique simple V1 :
- Si `currentCents < 0` OU `priorAvgCents < 0` → catégorie de dépense
- Sinon → catégorie de revenu

Ne pas s'appuyer sur `is_variable` ou un mapping de codes — la sémantique signe est suffisante.

### Calcul du `pct`

```ts
pct = priorAvgCents === 0 ? null : diffCents / priorAvgCents
```

Le ratio est signé. Le formatting fait `Math.abs` puis ajoute le signe selon la règle FR (cf. AC#6). Arrondi à l'entier (un % entier suffit en V1).

### Stabilité du tri

JS `sort()` est stable depuis ES2019. Pour garantir reproductibilité des tests :
```ts
deltas.sort((a, b) => Math.abs(b.diffCents) - Math.abs(a.diffCents) || a.categoryCode.localeCompare(b.categoryCode))
```

### Anti-patterns à éviter

- ❌ Lire `category_definitions` dans le service — il reçoit déjà les `label` via les `CategoryTotals`.
- ❌ Appeler Claude API depuis ce service (cf. invariant CLAUDE.md `Boundaries imperméables` — `@anthropic-ai/sdk` consommé exclusivement depuis `llm-categorizer.ts`).
- ❌ Utiliser `*100` / `/100` ; passer par les helpers `money.ts`.
- ❌ Hardcoder les libellés FR (le `label` vient des `CategoryTotals`, donc de la DB seedée).
- ❌ Émettre des phrases de "disparition" (V1 simple — pas de cas).
- ❌ Returner `string | null` ou throw quand le Delta est mal formé — typer strictement et préconditionner.
- ❌ Dupliquer la sélection top deltas dans l'endpoint et le service (cf. AC#11).

### Project Structure Notes

Cette story crée :
- `server/services/narrative-generator.ts` (+ `.test.ts`) — listé en architecture (`architecture.md:592`)

Mettre à jour `server/api/dashboard.get.ts` (story 4.1 livrée avant) pour importer `pickTopDeltas`. Aucun changement de schéma DB.

### Definition of Done

- [ ] `narrative-generator.ts` exporte `pickTopDeltas` + `formatDelta` + types
- [ ] 8 cas de tests passent
- [ ] `dashboard.get.ts` utilise `pickTopDeltas` (refactor effectif, plus de duplication)
- [ ] Aucun import DB / fs / LLM dans le service
- [ ] `yarn typecheck`, `yarn lint`, `yarn test:run` verts
- [ ] Commit unique

### References

- [Source: `_bmad-output/planning-artifacts/prd.md`#FR38-FR39] — règles métier narratif
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 4.2] — story originale
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Project Structure (592), Domain → Touchpoints (686)]
- [Source: `CLAUDE.md`#Boundaries imperméables] — pas d'appel LLM hors `llm-categorizer.ts`
- [Source: `CLAUDE.md`#Invariants critiques] — Cents, fonctions pures testables
- [Source: `shared/types/money.ts`] — `Cents`, `formatEuros`, `subCents`, `addCents`
- [Source: `server/services/reconciler.ts`] — modèle de service pur (pattern à suivre)
- [Story précédente : `4-1-endpoint-get-api-dashboard` — fournit les `CategoryTotals` et consomme `pickTopDeltas`]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Change Log

### Review Findings
