# Story 4.1: Endpoint `GET /api/dashboard?month=YYYY-MM` (agrégats + comparaison vs mois précédents)

Status: done

## Story

As a dev,
I want a single endpoint that returns all dashboard data for a month,
so that the UI page is simple to render and the deltas vs prior months are computed once server-side.

## Acceptance Criteria

1. **Given** un endpoint `server/api/dashboard.get.ts` validé par Zod (réutiliser `TransactionListQuerySchema` ou exposer un `DashboardQuerySchema` équivalent),
   **When** je GET `/api/dashboard?month=2026-04`,
   **Then** il retourne un objet JSON typé :
   ```ts
   {
     month: 'YYYY-MM',
     balanceCents: Cents,                  // solde de fin de mois (closing du statement couvrant le mois)
     totals: {
       incomeCents: Cents,                  // somme des transactions amountCents > 0
       expenseCents: Cents,                 // somme des transactions amountCents < 0 (signe préservé : NÉGATIF)
       byCategory: { [code: string]: Cents } // somme par categoryCode (signe préservé)
     },
     deltasVsPriorMonths: Array<{
       categoryCode: string,
       label: string,                       // libellé FR depuis category_definitions
       currentCents: Cents,
       priorAvgCents: Cents,                // moyenne des N mois précédents disponibles
       diffCents: Cents,                    // currentCents - priorAvgCents (signe préservé)
       pct: number | null                   // ratio diff/priorAvg ; null si priorAvg = 0 (catégorie nouvelle)
     }>,
     phrases: string[],                     // 0..3 phrases FR pré-formatées (1 par delta), prêtes à afficher
     reliability: 'reliable' | 'unreliable' | null
   }
   ```

   `phrases[i]` correspond à `deltasVsPriorMonths[i]` (même index, même ordre). `phrases[0]` inclut le suffixe « principal facteur du delta de solde » ; les suivantes non. Le formatage est fait par `formatDelta` (cf. story 4.2).

2. **Given** un mois sans transactions ni statement,
   **When** appelé,
   **Then** il retourne `{ month, balanceCents: 0, totals: { incomeCents: 0, expenseCents: 0, byCategory: {} }, deltasVsPriorMonths: [], phrases: [], reliability: null }`. Pas de 404.

3. **Given** un mois flagué `unreliable` (au moins un statement chevauchant la période a `reliability='unreliable'`),
   **When** appelé,
   **Then** `reliability: 'unreliable'` est inclus dans la réponse. Suit la même règle d'agrégation que `GET /api/transactions` : agrégation des statements **chevauchant** la période, indépendamment du nombre de transactions parsées.

4. **Given** un `month` invalide (ex: `2026-13`, `not-a-month`, vide),
   **When** validé par Zod,
   **Then** la requête est rejetée avec **422 `validation_failed`** + `data: zodErr.flatten()`.

5. **Given** un mois pour lequel il y a < 2 mois précédents disponibles dans la base,
   **When** la moyenne des "prior months" est calculée,
   **Then** elle utilise les mois disponibles (ex: 1 seul mois → moyenne sur 1) ; si **0 mois précédent**, `deltasVsPriorMonths` est `[]`.

6. **Given** la sélection des "top deltas",
   **When** elle est calculée,
   **Then** elle retourne **au maximum 3 catégories** triées par `|diffCents|` décroissant. Une catégorie est éligible si `|diffCents| >= 1000` (10 €) **ET** (`priorAvgCents === 0` ⇒ catégorie nouvelle, toujours incluse, OU `|pct| >= 0.20`). Cette sélection est faite **ici** (l'endpoint), `narrative-generator` (story 4.2) la consomme côté UI ; le service exposera une fonction `pickTopDeltas` réutilisable que cet endpoint **peut** importer pour DRY (cf. note d'implémentation).

7. **Given** la convention monétaire,
   **When** je consomme la réponse,
   **Then** tous les champs monétaires sont en `Cents` (suffixe `Cents` côté API JSON, integer côté DB) ; aucune division `/100` côté serveur. `pct` est un `number` ratio (pas un pourcentage texte).

8. **Given** des tests unitaires,
   **When** ils s'exécutent,
   **Then** ils couvrent : (a) mois nominal avec 2 mois précédents et 3 catégories en delta ; (b) mois sans transactions ni statement → tous zéros + deltas vide + `phrases: []` ; (c) mois unreliable propagé ; (d) mois avec une catégorie qui apparaît pour la 1ʳᵉ fois (priorAvg = 0) ; (e) mois avec deltas inférieurs au seuil → array vide ; (f) `month` Zod-invalid → 422 ; (g) `phrases` : `phrases[0]` contient « principal facteur » (delta #1), `phrases[1]` non.

9. **Given** les fonctions `pickTopDeltas` et `formatDelta` (qui seront extraites en story 4.2 dans `server/services/narrative-generator.ts`),
   **When** cette story 4.1 est livrée AVANT 4.2,
   **Then** les deux helpers sont **inlinés en privé dans `dashboard.get.ts`** (fonctions locales `selectTopDeltas` et `phraseDelta`). Story 4.2 les **déplacera** vers le service et l'endpoint les **importera**. **Aucune duplication** ne doit subsister après 4.2. Le serveur formate les `phrases` parce que (a) le service narratif n'est pas exportable côté client (boundary `server/` Nitro), (b) le contenu FR est du domaine serveur.

10. **Given** aucun nouveau code d'erreur n'est introduit,
    **When** la story est review,
    **Then** seuls `ValidationFailed` (422) sont utilisés ; **pas** de 404, **pas** de 500 custom.

## Tasks / Subtasks

- [x] **Task 1 — Zod schema query** (AC: #4)
  - [x] Réutiliser `TransactionListQuerySchema` (`shared/schemas/transaction.schema.ts:80`) qui valide déjà `^\d{4}-(0[1-9]|1[0-2])$` ; OU créer `DashboardQuerySchema` aliasé si on veut découpler les contrats. KISS : réutiliser tant qu'il n'y a qu'un seul champ `month`.

- [x] **Task 2 — Endpoint `server/api/dashboard.get.ts`** (AC: #1, #2, #3, #5, #6, #7)
  - [x] Lire `month` via `validateQuery(event, ...)` (cf. pattern `transactions/index.get.ts:9`)
  - [x] Calculer `monthStart`/`monthEnd` (`${month}-01` / `${month}-31`) ; idem story 2.7
  - [x] Charger le **statement le plus récent couvrant le mois** (LIMIT 1, ORDER BY `period_end DESC`) pour `closingBalanceCents` → `balanceCents`. Si aucun → `0`.
  - [x] Agréger transactions du mois en une seule requête : `SELECT SUM(CASE WHEN amount_cents > 0 THEN amount_cents END) AS income, SUM(CASE WHEN amount_cents < 0 THEN amount_cents END) AS expense, category_code, SUM(amount_cents) AS cat_sum FROM transactions WHERE transaction_date LIKE 'YYYY-MM-%' GROUP BY category_code` — KISS : 2 passes Drizzle (une totals, une byCategory) si le `CASE` complique la lecture
  - [x] Charger les libellés `category_definitions` (déjà seedé) pour mapper `code → label` dans deltas
  - [x] Agrégation reliability : reproduire le pattern de `transactions/index.get.ts:31-41` (statements chevauchant la période)
  - [x] Pour les `priorMonths` : itérer sur **les 2 mois précédents disponibles** (méthode simple : `month-1` et `month-2` en string arithmetic, ou helper `period.ts` si dispo) ; pour chacun, recalculer les totaux par catégorie (réutiliser la fonction interne) — `previousMonth()` ajouté à `period.ts`
  - [x] Calculer `deltasVsPriorMonths` via helper privé `selectTopDeltas(current, priors)` (cf. AC#9)
  - [x] Calculer `phrases` via helper privé `phraseDelta(delta, { isPrimary: i === 0 })` mappé sur les deltas (cf. AC#9)

- [x] **Task 3 — Tests unitaires** (AC: #8)
  - [x] Créer `server/api/dashboard.get.test.ts` sur le pattern `transactions/index.get.test.ts` (tmpdir SQLite, schema bootstrap inline)
  - [x] Cas (a) — 3 mois ingérés, calcul des deltas top 3
  - [x] Cas (b) — mois vide → tous zéros, `deltasVsPriorMonths: []`, `reliability: null`
  - [x] Cas (c) — statement unreliable couvrant le mois → `reliability: 'unreliable'`
  - [x] Cas (d) — nouvelle catégorie (priorAvg = 0) → incluse dans deltas, `pct: null`
  - [x] Cas (e) — deltas tous sous le seuil → `[]`
  - [x] Cas (f) — `month: '2026-13'` → 422 `validation_failed`
  - [x] Cas (g) — un seul mois précédent disponible → moyenne sur 1 mois (couvre AC#5)
  - [x] Cas bonus — `phrases[0]` contient « principal facteur », `phrases[1]` non (AC#8 (g))

- [x] **Task 4 — Sanity check final**
  - [x] `yarn typecheck`, `yarn lint`, `yarn test:run` propres (209/209 tests, typecheck clean, lint clean)
  - [x] Aucun nouveau code d'erreur (réutilise `validation_failed`)
  - [ ] Commit unique (à la fin de l'epic 4 ou par story selon préférence user)

## Dev Notes

### Pourquoi un seul endpoint vs multiples requêtes UI

Le PRD (FR37-39) attend une **vue narrative cohérente** d'un mois. Si le frontend faisait 4 fetch (totals, byCategory, deltas, reliability), il y aurait un risque d'affichage incohérent (rendering partiel, états désynchronisés). Un seul endpoint = un seul snapshot.

Conforme à D5 (`architecture.md:213-221`) qui liste explicitement `GET /api/dashboard?month=YYYY-MM`.

### Convention monétaire (CLAUDE.md §Cents)

- `expenseCents` reste **NÉGATIF** dans la réponse (ne pas inverser le signe). La UI fera `Math.abs(expenseCents)` ou utilisera `formatEuros(expenseCents)` qui gère le signe. Inverser le signe ici introduirait deux conventions et casserait l'invariant "amount signé".
- `byCategory[code]` préserve le signe de la somme : si une catégorie est exclusivement de la dépense, sa valeur est négative.
- `pct` est un `number` brut (`0.62` pour +62 %), pas une string. Le formatting en `+62%` est UI.

### Calcul des "mois précédents" — KISS

Pour la V1, on prend les **2 mois calendaires précédents** (`month-1` et `month-2`). Pas de gestion fine "les 2 derniers mois ingérés non-contigus" — si le mois `2026-02` n'a pas de données, son `priorAvgCents` pour cette catégorie est 0 et la catégorie devient "nouvelle" pour le calcul (cf. AC#5/AC#6).

Helper utilitaire potentiel dans `server/utils/period.ts` (déjà créé en story 2.3) :
```ts
export function previousMonth(month: string): string { /* '2026-04' → '2026-03' */ }
```

Si pas encore présent, l'ajouter dans cette story (test inclus).

### `selectTopDeltas` + `phraseDelta` — anticipation story 4.2

Story 4.2 créera `server/services/narrative-generator.ts` avec `pickTopDeltas(current, priors): Delta[]` et `formatDelta(d, { isPrimary }?): string`. Pour éviter la duplication :

- Cette story inline les deux dans `dashboard.get.ts` (fonctions locales `selectTopDeltas` + `phraseDelta`).
- Story 4.2 les **déplace** dans `narrative-generator.ts` (export) et `dashboard.get.ts` les **importe** + supprime les helpers locaux.
- Coût : un commit de refactor pur en 4.2 (les tests endpoint restent verts).

Pourquoi formater côté serveur et exposer `phrases: string[]` plutôt que `Delta[]` brut côté client :
- `narrative-generator.ts` vit dans `server/services/` (boundary Nitro). Côté client on ne peut pas l'importer (le bundler exclut `server/`). On *pourrait* déplacer `formatDelta` dans `shared/`, mais le contenu FR est conceptuellement du domaine serveur (comme les libellés mappés depuis la DB).
- En envoyant les phrases déjà composées, le composant `MonthlyNarrative.vue` (story 4.3) reste un afficheur trivial, sans logique de formatting. Plus testable côté serveur.

### Reliability : pattern existant à dupliquer

`server/api/transactions/index.get.ts:31-41` agrège déjà la reliability sur les statements chevauchant la période. **Ne pas réinventer** : importer/copier ce pattern. Si la duplication apparaît à un 3ᵉ endroit, factoriser dans `server/utils/period.ts` ou un service dédié.

### Performance — KISS V1

Pour 3 mois × 2-3 requêtes Drizzle, on est à ~10 requêtes par appel. Acceptable pour V1 single-user (NFR8 : "Affichage dashboard / changement de mois ressenti instantané quand possible"). Si le profiling montre un goulot, factoriser en une seule requête CTE plus tard. **Pas d'optimisation prématurée**.

### Anti-patterns à éviter

- ❌ Inverser le signe d'`expenseCents` à l'export (breaks Cents convention).
- ❌ Renvoyer `pct` en string formatée (`"62%"`) — number brut, formatting UI.
- ❌ Cache Pinia côté client de cette réponse (cf. CLAUDE.md anti-patterns) — `useFetch` avec `key` réactive.
- ❌ Lever 404 si le mois n'a pas de données (AC#2 — réponse vide légitime).
- ❌ Dupliquer la regex `^\d{4}-(0[1-9]|1[0-2])$` — réutiliser `TransactionListQuerySchema`.
- ❌ Recompute reliability dans cette story d'une manière différente de `transactions/index.get.ts` — divergence garantie de bugs.

### Project Structure Notes

Cette story crée :
- `server/api/dashboard.get.ts` (+ `.test.ts`) — listé en architecture (`architecture.md:586`)
- (optionnel) `server/utils/period.ts::previousMonth` si pas déjà présent

Aucun changement de schéma DB. Pas de nouveau composable côté UI (story 4.3 le créera).

### Definition of Done

- [ ] `GET /api/dashboard?month=YYYY-MM` opérationnel
- [ ] Tests : 7 cas (a-g) passent
- [ ] Reliability propagée comme dans `transactions/index.get.ts`
- [ ] Aucun nouveau code d'erreur
- [ ] `yarn typecheck`, `yarn lint`, `yarn test:run` verts
- [ ] Commit unique

### References

- [Source: `_bmad-output/planning-artifacts/prd.md`#FR37-FR40] — règles métier dashboard
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 4.1] — story originale
- [Source: `_bmad-output/planning-artifacts/architecture.md`#D5 (lignes 213-221), Project Structure (586), Domain → Touchpoints (686)]
- [Source: `CLAUDE.md`#Invariants critiques] — Cents partout, KISS, boundaries
- [Source: `server/api/transactions/index.get.ts:1-44`] — pattern endpoint + agrégation reliability
- [Source: `shared/schemas/transaction.schema.ts:80-82`] — `TransactionListQuerySchema` réutilisable
- [Source: `server/utils/validation.ts`] — `validateQuery` helper
- [Story précédente : aucune dans Epic 4 — épic dépend uniquement d'Epics 2-3 (transactions + reliability)]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context)

### Debug Log References

- AC#5 ambiguïté résolue par interprétation "mois précédents disponibles" = mois ayant des transactions effectives. Un mois sans aucune transaction est ignoré du calcul de moyenne (ne tire pas vers 0). Si aucun mois précédent n'a de données, toutes les catégories courantes sont traitées comme "nouvelles" (priorAvg = 0) et éligibles si `|currentCents| >= 10 €`.

### Completion Notes List

- Endpoint implémenté avec 8 cas de test (a-g + bonus phrases primary).
- Helpers `selectTopDeltas` et `phraseDelta` inlinés en privé dans `dashboard.get.ts` ; déménagement vers `narrative-generator.ts` prévu en story 4.2 (refactor pur, contrat de réponse stable).
- `previousMonth()` ajouté à `server/utils/period.ts` (4 cas de test couverts).
- Aucun nouveau code d'erreur.
- 209 tests verts, typecheck OK, lint OK.

### File List

- `server/api/dashboard.get.ts` (NEW)
- `server/api/dashboard.get.test.ts` (NEW)
- `server/utils/period.ts` (MODIFIED — ajout `previousMonth`)
- `server/utils/period.test.ts` (MODIFIED — 4 cas pour `previousMonth`)

### Change Log

- 2026-05-08 : implémentation story 4.1 — endpoint `GET /api/dashboard?month=YYYY-MM` avec agrégats, deltas top 3 vs 2 mois précédents, phrases FR pré-formatées, propagation reliability. Helpers `selectTopDeltas`/`phraseDelta` inlinés en attendant story 4.2. Status → review.

### Review Findings

Code review adversariale (Blind Hunter + Edge Case Hunter + Acceptance Auditor) — 2026-05-31. Verdict Auditor : 10/10 AC PASS. Findings transverses :

- [x] [Review][Decision→Patch] Diviseur de la moyenne `priorAvg` — **résolu : moyenne PAR CATÉGORIE** (Marceau, 2026-05-31). Pour chaque catégorie, on ne divise que par le nombre de mois précédents où ELLE apparaît (`monthsWithCategory = priorMaps.filter(m => code in m)`). Une catégorie présente dans 1 seul des 2 mois non-vides est divisée par 1, pas par 2. Test ajouté. [`server/api/dashboard.get.ts:172-177`]
- [x] [Review][Patch] `monthEnd` helper au lieu du `-31` littéral — **durcissement** (borne exacte, plus de date calendaire impossible). NB : le « bug de balance » signalé par les hunters était un **faux positif** (erreur de comparaison lexicographique : un `periodStart` de mois suivant `'2026-03-01'` n'est jamais `<= '2026-02-31'`). Fix conservé pour la clarté + helper réutilisable. [`server/utils/period.ts:monthEnd`, `dashboard.get.ts:57-60`]
- [x] [Review][Patch] Commentaire trompeur "disparitions exclues" corrigé + `?? 0` mort supprimé (`if (pct !== null && ...)`). [`server/api/dashboard.get.ts:166-179`]
- [x] [Review][Defer] DDL du harness de test maintenu à la main — drift potentiel vs schema Drizzle, pattern pré-existant. [`server/api/dashboard.get.test.ts`] — deferred, pre-existing
- [x] [Review][Defer] Statement réellement à cheval sur 2 mois (`02-15 → 03-15`) : le `balanceCents` reflète le closing de fin de straddle (mars-ish) pour février. Réel mais rare (relevés Boursorama calendaires) — à traiter si l'ingestion produit un jour des relevés non-calendaires. [`server/api/dashboard.get.ts`] — deferred, pre-existing

Écartés comme bruit/conformes spec (6) : `balanceCents=0` (conforme AC#2), asymétrie signe income/expense (intentionnel AC#7), arrondi cent sur moyenne (entier légitime), `localeCompare` (codes ASCII), overflow MAX_SAFE_INTEGER (irréaliste), accès `$client` en test (test-only fonctionnel).
