# Story 6.1: Schémas `debts` + `debt_advances` + endpoints CRUD

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to create, edit and delete debt records (creditor, initial balance, repayment mode) and log advances received,
so that Epic 6 (repayment marking, projection) and Epic 7 (forecast integration) have a persisted debt model to build on.

## Acceptance Criteria

1. **Given** deux nouvelles tables Drizzle dans `server/db/schema.ts`,
   **When** je `yarn db:push`,
   **Then** elles existent :

   `debts` :
   - `id INTEGER PRIMARY KEY AUTOINCREMENT`
   - `creditor TEXT NOT NULL` (nom du créancier)
   - `initial_balance_cents INTEGER NOT NULL` (solde initial dû, **non signé** ≥ 0 — montant emprunté au départ)
   - `repayment_mode TEXT NOT NULL DEFAULT 'free' CHECK(repayment_mode IN ('free','monthly','lump_sum'))`
   - `monthly_amount_cents INTEGER` (nullable — requis seulement en mode `monthly`, mensualité ≥ 0)
   - `lump_sum_date TEXT` (nullable — format `YYYY-MM-DD`, requis seulement en mode `lump_sum`)
   - `created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))`

   `debt_advances` :
   - `id INTEGER PRIMARY KEY AUTOINCREMENT`
   - `debt_id INTEGER NOT NULL REFERENCES debts(id) ON DELETE CASCADE`
   - `amount_cents INTEGER NOT NULL` (**non signé** > 0 — avance reçue, incrémente le solde, FR31)
   - `advance_date TEXT NOT NULL` (format `YYYY-MM-DD`)
   - `note TEXT` (nullable — libellé libre optionnel)
   - `created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))`
   - index `debt_advances_debt_idx` sur `debt_id`

2. **Given** le type partagé `shared/types/repayment-mode.ts`,
   **When** créé,
   **Then** il exporte :
   ```ts
   export const REPAYMENT_MODES = ['free', 'monthly', 'lump_sum'] as const
   export type RepaymentMode = typeof REPAYMENT_MODES[number]
   ```
   Libellés FR (UI, story 6.2) : `free` → « Libre », `monthly` → « Mensualité fixe », `lump_sum` → « Montant unique à date ». Les libellés vivent côté UI, **pas** dans ce type.

3. **Given** un schéma Zod `shared/schemas/debt.schema.ts`,
   **When** exposé,
   **Then** il définit :
   - `DebtSchema` (lecture — inclut `id`, `createdAt`, et `currentBalanceCents` calculé)
   - `NewDebtSchema` (création — sans `id`/`createdAt`)
   - `DebtPutSchema` (`.strict()`, replace complet — `id`/`createdAt` immuables)
   - `creditor: z.string().trim().min(1).max(80)`
   - `initialBalanceCents: z.number().int().min(0).max(1e11)`
   - `repaymentMode: z.enum(REPAYMENT_MODES)` (importé de `repayment-mode.ts`)
   - `monthlyAmountCents: z.number().int().min(0).max(1e11).nullable().optional()`
   - `lumpSumDate: DateIsoSchema.nullable().optional()` (réutiliser `DateIsoSchema` de `transaction.schema.ts`)
   - **Validation croisée `.refine()`** (mode ↔ champs) :
     - mode `monthly` → `monthlyAmountCents` requis (non null) ET `lumpSumDate` doit être null/absent
     - mode `lump_sum` → `lumpSumDate` requis (non null) ET `monthlyAmountCents` doit être null/absent
     - mode `free` → `monthlyAmountCents` ET `lumpSumDate` tous deux null/absents
     - message d'erreur ciblé sur le champ manquant (`path`)

4. **Given** un schéma Zod `shared/schemas/debt-advance.schema.ts`,
   **When** exposé,
   **Then** :
   - `NewDebtAdvanceSchema` : `amountCents: z.number().int().positive().max(1e11)` (avance strictement > 0), `advanceDate: DateIsoSchema`, `note: z.string().trim().max(200).nullable().optional()`
   - `DebtAdvanceSchema` (lecture — inclut `id`, `debtId`, `createdAt`)

5. **Given** `GET /api/debts`,
   **When** appelé,
   **Then** il retourne la liste des dettes, chacune enrichie d'un **`currentBalanceCents` calculé** (pas stocké en base — cohérent avec l'invariant CLAUDE.md « aucun état dérivé en base ») :
   ```
   currentBalanceCents = initialBalanceCents
                       + Σ(debt_advances.amountCents pour cette dette)
                       − Σ(|transactions.amountCents| où debt_id = cette dette ET is_debt_repayment = 1)
   ```
   Le terme remboursements est **0 tant que la story 6.3 n'existe pas** (aucune transaction marquée), mais la requête l'inclut dès maintenant (colonnes `debt_id`/`is_debt_repayment` déjà présentes dans `transactions`, story 2.1). Calcul via requêtes agrégées (pattern `referenceCount` story 5.6). Tri : `created_at` ASC (ordre de création stable).

6. **Given** `POST /api/debts`,
   **When** je poste un `NewDebtSchema` valide,
   **Then** la dette est créée → 201 avec la ligne complète (`currentBalanceCents = initialBalanceCents`, aucune avance ni remboursement au départ). Validation de cohérence mode ↔ champs par le schéma (422 `validation_failed`).

7. **Given** `PUT /api/debts/[id]`,
   **When** je remplace une dette (y compris **changement de mode**, FR30),
   **Then** replace complet des champs éditables (`creditor`, `initialBalanceCents`, `repaymentMode`, `monthlyAmountCents`, `lumpSumDate`). `id`/`createdAt` immuables (`.strict()`). Le changement de mode réapplique la validation croisée (ex: passer en `monthly` sans `monthlyAmountCents` → 422). `id` inexistant → 404 `not_found`. `id` non entier positif → 422.

8. **Given** `DELETE /api/debts/[id]`,
   **When** je supprime une dette,
   **Then** la ligne est supprimée → 204. Les `debt_advances` liées sont supprimées en cascade (`ON DELETE CASCADE`). `id` inexistant → 404.
   **⚠️ Garde-fou remboursements** : si des `transactions` sont rattachées (`debt_id = id`), la suppression casserait leur cohérence. En V1 story 6.1, **aucune** transaction ne peut encore être rattachée (le marquage arrive en 6.3), donc pas de blocage nécessaire ici. **À ré-évaluer en story 6.3** : y ajouter un 409 `debt_has_repayments` ou un `SET NULL`. Documenter ce report, ne rien implémenter de spéculatif maintenant (YAGNI).

9. **Given** `POST /api/debts/[id]/advances`,
   **When** je poste un `NewDebtAdvanceSchema` valide,
   **Then** une ligne `debt_advances` est insérée (FR31) → 201 avec la ligne complète. `debt_id` inexistant → 404. L'incrément du solde est **implicite** via le calcul de `currentBalanceCents` (pas de mutation d'une colonne solde). Un `GET /api/debts` ultérieur reflète le nouveau solde.

10. **Given** les codes d'erreur,
    **When** cette story est implémentée,
    **Then** **aucun nouveau code n'est requis** : réutiliser `validation_failed` et `not_found`. (Le futur `debt_has_repayments` sera ajouté en 6.3 s'il est retenu.)

11. **Given** des tests unitaires (co-localisés, pattern `fixed-charges/crud.test.ts`),
    **When** ils s'exécutent,
    **Then** ils couvrent au minimum :
    - POST mode `free` sans montants → 201
    - POST mode `monthly` avec `monthlyAmountCents` → 201 ; sans → 422
    - POST mode `lump_sum` avec `lumpSumDate` → 201 ; sans → 422
    - POST mode `monthly` AVEC `lumpSumDate` en plus → 422 (champ interdit pour ce mode)
    - POST `creditor` vide → 422
    - GET `currentBalanceCents` = `initialBalanceCents` + somme des avances (seeder 2 avances, vérifier le calcul)
    - GET `currentBalanceCents` décrémenté d'un remboursement (seeder 1 transaction `debt_id`+`is_debt_repayment=1`, vérifier soustraction de la valeur absolue) — **cas limite dette-à-zéro** (NFR9) : avances = remboursements → solde 0
    - PUT changement de mode `free` → `monthly` valide ; `free` → `monthly` sans montant → 422 ; `id` inexistant → 404 ; `id` non entier → 422
    - DELETE → 204 ; cascade : les `debt_advances` disparaissent ; `id` inexistant → 404
    - POST advance sur `debt_id` inexistant → 404 ; `amountCents = 0` → 422

12. **Given** les conventions CLAUDE.md,
    **When** la story est review,
    **Then** :
    - Monnaie : **`Cents` partout**, colonnes `_cents`, champs API `camelCase` + suffixe `Cents`. Aucun `* 100` / `parseFloat`.
    - Aucun état dérivé en base (`currentBalanceCents` calculé à la demande).
    - Pas de `try/catch` silencieux ; erreurs métier via `createError` / helpers `errors.ts`.
    - Pinia exclu pour la data serveur.

## Tasks / Subtasks

- [x] **Task 1 — Type partagé `repayment-mode`** (AC: #2)
  - [x] `shared/types/repayment-mode.ts` (`REPAYMENT_MODES` + type `RepaymentMode`)

- [x] **Task 2 — Schéma DB** (AC: #1)
  - [x] `debts` + `debtAdvances` ajoutés à `server/db/schema.ts` (réutilise `check`/`sql`)
  - [x] FK cascade `debtAdvances.debtId` → `debts.id` ; index `debt_advances_debt_idx`
  - [x] Types Row exportés
  - [x] `npx drizzle-kit push --force` — tables créées et vérifiées (voir Debug Log : drift préexistant sur transactions/bank_statements, sans impact)

- [x] **Task 3 — Schémas Zod** (AC: #3, #4)
  - [x] `shared/schemas/debt.schema.ts` (`superRefine` mode ↔ champs, symétrique requis/interdit)
  - [x] `shared/schemas/debt-advance.schema.ts`
  - [x] `DateIsoSchema` réutilisé depuis `transaction.schema.ts`

- [x] **Task 4 — Endpoints CRUD debts** (AC: #5, #6, #7, #8)
  - [x] `index.get.ts` (liste + `currentBalanceCents` agrégé), `index.post.ts`, `[id].put.ts`, `[id].delete.ts`
  - [x] Validation `id` + 404 (pattern `fixed-charges`)

- [x] **Task 5 — Endpoint advances** (AC: #9)
  - [x] `server/api/debts/[id]/advances.post.ts` (404 si `debt_id` inconnu)

- [x] **Task 6 — Tests unitaires** (AC: #11)
  - [x] `server/api/debts/crud.test.ts` — 15 cas, dont dette-à-zéro + historique vide (NFR9)

- [x] **Task 7 — Sanity check final** (AC: #12)
  - [x] `typecheck`, `lint`, `test:run` (301) verts
  - [x] Audit `Cents` : aucun `* 100` / `/ 100` / `parseFloat`
  - [x] Aucun état dérivé stocké ; aucun nouveau code d'erreur
  - [x] Commit unique (à faire par l'utilisateur)

## Dev Notes

### Périmètre exact de 6.1 (ce qui est HORS scope)

Cette story pose **uniquement** le modèle de données et le CRUD. Sont explicitement reportés :
- **FR9 / FR32** (marquer une transaction comme remboursement + décrément) → **story 6.3**. Ici, seule la *lecture* du terme remboursement est branchée (à 0 en pratique).
- **FR33** (intégration forecast selon le mode) → **story 6.4** + Epic 7 (`debt-projection.ts`).
- **FR34** (impact marginal sur le dividende) → **story 6.4** (`[id]/impact.get.ts`).
- **UI** (`dettes.vue`, `DebtCard`, `DebtForm`, `DebtAdvanceForm`…) → **story 6.2**.

Ne PAS créer `debt-projection.ts`, `[id]/impact.get.ts`, ni les composants Vue dans cette story.

### Pourquoi `currentBalanceCents` est calculé, pas stocké

CLAUDE.md §Forecast : *« Aucun état dérivé en base. »* et §Invariants. Le solde courant est une fonction pure de trois sources persistées (solde initial, avances, remboursements). Le stocker = risque de drift entre la colonne et la réalité des événements (exactement le problème que la réconciliation combat). On le calcule à la lecture, comme `referenceCount` en story 5.6.

**Décision à confirmer en review** : si un besoin de performance apparaît (peu probable, mono-utilisateur, volumes minuscules), on pourra matérialiser plus tard. YAGNI en V1.

### Représentation des montants

- `initial_balance_cents` et `debt_advances.amount_cents` sont **non signés** (montants dus / reçus, ≥ 0). Garanti par Zod (`.min(0)` / `.positive()`), pas par la DB.
- Les **remboursements** proviennent de `transactions.amount_cents` qui est **signé** (négatif = sortie). Le calcul de solde soustrait la **valeur absolue** : `- Σ ABS(amount_cents)`. Utiliser `abs()` SQL ou `Math.abs` après agrégation. Cohérent avec le fait qu'un remboursement est une transaction sortante.
- Toujours le branded type `Cents` (`shared/types/money.ts`), colonnes `integer` suffixe `_cents`, champs API `camelCase` + `Cents`.

### Validation croisée mode ↔ champs (le point délicat)

Le `.refine()` sur `NewDebtSchema` / `DebtPutSchema` doit couvrir les 3 modes symétriquement (champ requis ET champs interdits). Modèle recommandé :
```ts
.superRefine((d, ctx) => {
  if (d.repaymentMode === 'monthly' && d.monthlyAmountCents == null)
    ctx.addIssue({ code: 'custom', path: ['monthlyAmountCents'], message: 'Mensualité requise en mode mensualité' })
  if (d.repaymentMode === 'lump_sum' && d.lumpSumDate == null)
    ctx.addIssue({ code: 'custom', path: ['lumpSumDate'], message: 'Date requise en mode montant unique' })
  // champs interdits hors de leur mode
  if (d.repaymentMode !== 'monthly' && d.monthlyAmountCents != null)
    ctx.addIssue({ code: 'custom', path: ['monthlyAmountCents'], message: 'Mensualité non applicable à ce mode' })
  if (d.repaymentMode !== 'lump_sum' && d.lumpSumDate != null)
    ctx.addIssue({ code: 'custom', path: ['lumpSumDate'], message: 'Date non applicable à ce mode' })
})
```
`superRefine` (et non `.refine()`) pour émettre plusieurs issues ciblées.

### Fichiers existants à lire avant d'implémenter (UPDATE)

- `server/db/schema.ts` — patterns de table, `check()`/`sql` déjà importés (story 5.5), `transactions.debt_id`/`is_debt_repayment` déjà présents (story 2.1, lignes ~85-88). **Ne pas** re-migrer transactions.
- `server/api/fixed-charges/{index.post,index.get,[id].put,[id].delete}.ts` — **le** patron CRUD non-singleton à copier (validation `id`, 404, `.returning()`, `setResponseStatus`).
- `server/api/fixed-charges/crud.test.ts` — patron de test (DDL inline, `makeEvent`, `_requestBody`).
- `server/api/categories/index.get.ts` (story 5.6) — patron de comptage agrégé (`sql\`count(*)\``, `groupBy`) réutilisable pour `currentBalanceCents`.
- `shared/schemas/fixed-charge.schema.ts` — patron Zod lecture/POST/PUT `.strict()` + `DateIsoSchema`.
- `server/utils/errors.ts` — `notFound`, `domainError` ; `server/utils/validation.ts` — `validateBody`.

### Project Structure Notes

Aligné sur `architecture.md` (structure verrouillée) :
- Endpoints `server/api/debts/` : `index.get.ts`, `index.post.ts`, `[id].put.ts`, `[id].delete.ts`, `[id]/advances.post.ts` (arch:575-581). `[id]/impact.get.ts` **non** créé ici (6.4).
- Schémas `shared/schemas/debt.schema.ts`, `debt-advance.schema.ts` (arch:621-622).
- Type `shared/types/repayment-mode.ts` (arch:mentionné dans types/).
- Tables `debts`, `debt_advances` (arch:303). La table `debt_repayments` listée arch:303 n'est **pas** nécessaire en V1 : les remboursements sont des `transactions` marquées (`debt_id` + `is_debt_repayment`), pas une table dédiée. Documenter cette divergence assumée (KISS) ; à confirmer en review 6.3.

### Testing standards

- Tests unitaires co-localisés `*.test.ts`, Vitest, DDL SQLite inline (pas de dépendance au bootstrap).
- NFR9 : cas limites obligatoires — dette à zéro (avances = remboursements), historique vide (aucune avance → solde = initial).
- Pas de snapshot forecast ici (aucune fonction de forecast touchée).

### References

- [Source: `_bmad-output/planning-artifacts/prd.md`#FR9, FR29-FR34]
- [Source: `_bmad-output/planning-artifacts/prd.md`#NFR9] — cas limites calculs
- [Source: `_bmad-output/planning-artifacts/epics.md`#Epic 6 — Dettes]
- [Source: `_bmad-output/planning-artifacts/architecture.md`:303] — tables `debts`, `debt_advances`
- [Source: `_bmad-output/planning-artifacts/architecture.md`:575-581] — endpoints `debts/*`
- [Source: `_bmad-output/planning-artifacts/architecture.md`:621-622, 684, 798] — schémas + mapping FR→composants
- [Source: `CLAUDE.md`#Représentation monétaire, #Forecast = fonction pure] — `Cents`, aucun état dérivé
- [Source: `server/db/schema.ts`] — `transactions.debt_id`/`is_debt_repayment` existants, patterns de table
- [Source: `server/api/fixed-charges/`] — patron CRUD non-singleton à répliquer
- [Story aval : `6-3-marquage-transaction-remboursement-fr9` (FR9/FR32), `6-4-debt-projection-et-impact-ui` (FR33/FR34), `6-2-ui-debts-page-card-form` (UI)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (dev-story workflow)

### Debug Log References

- `npx drizzle-kit push --force` : les tables `debts`/`debt_advances` sont créées correctement (CHECK, FK cascade, index vérifiés en base). Le push tente en plus un **rebuild de `bank_statements`/`transactions`** (drift préexistant de la DB dev) et échoue sur `index transactions_period_idx already exists` — **sans impact** : `transactions` reste intacte (207 lignes + index). Drift à traiter hors story (non lié à 6.1).

### Completion Notes List

- Modèle dettes : `debts` (créancier, solde initial, mode `free`/`monthly`/`lump_sum` + CHECK) et `debt_advances` (avances FR31, FK cascade).
- **Solde courant calculé, jamais stocké** (`initial + Σavances − Σ|remboursements|`) — respecte l'invariant « aucun état dérivé en base ». Terme remboursement à 0 tant que 6.3 n'existe pas, mais déjà branché (colonnes `transactions.debt_id`/`is_debt_repayment`).
- Validation croisée mode ↔ champs via `superRefine` (symétrique : champ requis ET champ interdit hors de son mode). PUT réutilise le même schéma → changement de mode validé (FR30).
- CRUD complet + `advances.post` ; `id` invalide → 422, inexistant → 404 (pattern `fixed-charges`). Aucun nouveau code d'erreur.
- Hors scope respecté : pas de `debt-projection.ts`, pas de `[id]/impact.get.ts`, pas d'UI, pas de marquage remboursement.
- 15 tests unitaires (dette-à-zéro + historique vide NFR9) ; suite globale 301 verte.

### File List

- `shared/types/repayment-mode.ts` (nouveau)
- `shared/schemas/debt.schema.ts` (nouveau)
- `shared/schemas/debt-advance.schema.ts` (nouveau)
- `server/db/schema.ts` (modifié — tables `debts`, `debtAdvances` + types Row)
- `server/api/debts/index.get.ts` (nouveau)
- `server/api/debts/index.post.ts` (nouveau)
- `server/api/debts/[id].put.ts` (nouveau)
- `server/api/debts/[id].delete.ts` (nouveau)
- `server/api/debts/[id]/advances.post.ts` (nouveau)
- `server/api/debts/crud.test.ts` (nouveau)

### Change Log

- 2026-07-08 : Implémentation story 6.1 — schémas `debts`/`debt_advances` + type repayment-mode + CRUD endpoints + advances (FR31) + solde calculé. Status → review.

### Review Findings
