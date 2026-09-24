# Story 6.5: Ledger d'événements signés (D16) — prérequis de l'epic 10

Status: review

## Story

As a user,
I want a debt to carry signed events so its balance can go either way,
so that a spouse current account — a créance as much as a dette — is expressible (FR66-FR68).

## Contexte de cadrage (à lire avant)

La revue de l'epic 6 (2026-09-04) a établi que **le modèle livré ne supporte pas FR66-FR68**,
alors que FR66 prescrit « s'appuie sur le modèle Dettes ». Trois verrous :

1. `debts.initial_balance_cents` contraint ≥ 0 par `NonNegativeCentsSchema` → une **créance**
   (de l'argent qu'on me doit) est inexprimable.
2. `debt_advances.amount_cents` en `positive()` → aucun événement ne peut **diminuer** le solde
   hors transaction marquée.
3. `server/api/transactions/[id].patch.ts:51` refuse tout `amountCents >= 0` → un règlement
   **entrant** du conjoint ne peut pas être rattaché.

**Décision D16** (architecture, 2026-09-04) : pas de table `shared_ledger` dédiée — la règle de
trois tient, un seul cas d'usage. Mais `debt_advances` est remplacée par un ledger d'événements
**signés**.

⚠️ **Pourquoi maintenant et pas dans l'epic 10** : `debt_advances` contient **0 ligne** à ce
jour et `debts` aussi. C'est une migration de schéma sans données. Reportée à l'epic 10, elle
devient la réécriture de `debt-balance.ts`, du PATCH transactions et de trois endpoints, sur du
code entre-temps consommé par le forecast. **Le coût est asymétrique et croissant** — même
logique que D15. La fenêtre se referme dès la première dette saisie.

Rayon de souffle mesuré : `debt_advances` n'est consommée que par **7 fichiers**
(`debt-balance.ts`, `schema.ts`, `advances.post.ts`, `[id].delete.ts`, et 3 fichiers de tests).

## Acceptance Criteria

1. **Given** la table `debt_events` remplaçant `debt_advances`,
   **When** définie,
   **Then** elle porte `id`, `debt_id` FK (cascade), `event_date` (`YYYY-MM-DD`), `amount_cents`
   **signé** (positif = augmente le solde dû, négatif = le diminue), `kind`
   (`advance` | `settlement` | `adjustment`), `source_transaction_id` nullable, `note` nullable,
   `created_at`. Index sur `debt_id`.

2. **Given** `debts.initial_balance_cents`,
   **When** validé,
   **Then** il accepte une valeur **négative** (créance initiale). `NonNegativeCentsSchema` est
   remplacé par un schéma signé dans `debt.schema.ts`.

3. **Given** `server/utils/debt-balance.ts`,
   **When** réécrit,
   **Then** `toCurrentBalance` devient `initial + Σ(events.amount_cents signés) − Σ|remboursements|`,
   le résultat peut être **négatif**, et **toutes les signatures sont typées `Cents`** (elles sont
   en `number` nu aujourd'hui, au point le plus sensible du modèle — écart CLAUDE.md relevé en revue).
   `DebtSchema.currentBalanceCents` est typé `Cents` de la même façon.

4. **Given** `GET /api/debts/[id]/events` et `DELETE /api/debts/[id]/events/[eventId]`,
   **When** exposés,
   **Then** l'historique est listable et un événement erroné est supprimable. Aujourd'hui une
   avance est **insérable mais ni listable ni supprimable** : une saisie erronée (250 000 au lieu
   de 25 000) fausse le solde définitivement, le seul contournement étant de tordre
   `initialBalanceCents` via le PUT — ce qui détruit la traçabilité (trou de FR31).

5. **Given** `PATCH /api/transactions/[id]`,
   **When** une transaction **entrante** (`amountCents > 0`) est rattachée à une dette,
   **Then** elle est acceptée — la garde `amountCents >= 0` est levée. Le signe de la transaction
   détermine le sens de l'événement. **La règle FR9 « seule une sortie est un remboursement »
   reste vraie pour le `kind: 'settlement'`** ; c'est l'entrée qui devient possible, pas la
   sémantique qui disparaît.

6. **Given** un solde négatif (créance) affiché dans `DebtCard.vue`,
   **When** rendu,
   **Then** il est distingué visuellement et libellé en français (*« Créance »* vs *« Dette »*).
   Aujourd'hui un solde négatif (sur-remboursement) s'affiche tel quel, sans rien indiquer.

7. **Given** `DebtAdvanceForm.vue`,
   **When** adapté,
   **Then** il permet de saisir un événement signé (ou un montant + un sens explicite), et le
   composant est renommé en cohérence.

8. **Given** les conventions CLAUDE.md,
   **When** review,
   **Then** : `Cents` partout (y compris `debt-balance.ts`, cf. AC#3), aucun état dérivé stocké
   (le solde reste calculé), erreurs métier via `createError` avec code stable, aucun `$fetch`
   en composant.

9. **Given** des tests,
   **When** exécutés,
   **Then** ils couvrent : événement positif, événement négatif, solde résultant négatif
   (créance), suppression d'un événement et recalcul, transaction entrante rattachée,
   `initialBalanceCents` négatif accepté, et le refus d'un `eventId` inexistant (404).

## Tasks / Subtasks

- [x] **Task 1 — Schéma** (AC: #1, #2)
  - [x] `debt_events` dans `server/db/schema.ts`, suppression de `debt_advances`
  - [x] `shared/schemas/debt-event.schema.ts` remplace `debt-advance.schema.ts`
  - [x] `debt.schema.ts` : `initialBalanceCents` signé

- [x] **Task 2 — Calcul de solde** (AC: #3)
  - [x] Réécriture de `server/utils/debt-balance.ts` (`toCurrentBalance`, `currentBalanceForDebt`, `balanceSumsByDebt`) avec typage `Cents`

- [x] **Task 3 — Endpoints** (AC: #4, #5)
  - [x] `events.post.ts` (remplace `advances.post.ts`), `events.get.ts`, `events/[eventId].delete.ts`
  - [x] `transactions/[id].patch.ts` : levée de la garde `amountCents >= 0`

- [x] **Task 4 — UI** (AC: #6, #7)
  - [x] `DebtCard.vue` : solde signé, libellé Créance/Dette
  - [x] `DebtAdvanceForm.vue` → formulaire d'événement signé

- [x] **Task 5 — Tests + sanity** (AC: #8, #9)
  - [x] Cas listés en AC#9 ; `typecheck`, `lint`, `test:run`, `test:e2e` verts

## Dev Notes

### Pourquoi un ledger et pas une colonne `direction`
Un `direction` sur `debt_advances` réglerait le signe mais pas le reste : il resterait impossible
de représenter un règlement entrant, et `repayment_mode` (libre / mensualité / lump sum) n'a
toujours aucun sens pour un compte-courant continu. Le ledger d'événements rend les deux cas
exprimables avec une seule table et un seul calcul.

### Ce que la story ne fait PAS
- Elle n'implémente **pas** l'epic 10 (flag « commune », split conjoint, `shared-expense`).
  Elle rend l'epic 10 possible.
- Elle ne touche pas `repayment_mode` ni `debt-projection.ts`. La question « quel sens a une
  mensualité sur un compte-courant » se posera dans l'epic 10, pas ici.

### Migration
`debt_advances` et `debts` sont vides (mesuré le 2026-09-04). Pas de back-fill nécessaire —
`yarn db:push` suffit. Si des lignes existent au moment de l'implémentation, les reprendre en
`kind: 'advance'` avec `amount_cents` positif.

## References
- [Source: architecture.md#D16] — décision, critère de résolution, fenêtre de coût
- [Source: prd.md#FR31, FR66, FR67, FR68]
- [Source: `CLAUDE.md`#Cents partout, #Invariants critiques]
- [Revue epic 6 du 2026-09-04 — MAJEUR modélisation, MAJEUR avances non listables, MINEUR typage `number` nu, MINEUR solde négatif non distingué]
- [Story aval : epic 10 (`shared-expense`, FR65-FR68) — consomme ce ledger]

## Dev Agent Record

### Agent Model Used
Agent de développement.

### Completion Notes

- `debt_advances` → `debt_events` (signé, `kind`, `source_transaction_id`). Migration appliquée
  à la base de dev à la main : `yarn db:push` est interactif sur ce projet (drift connu) et
  `debt_advances` contenait **0 ligne** — vérifié avant le `DROP`, avec abandon si non vide.
- `debt-balance.ts` réécrit et **typé `Cents`**. Le typage a immédiatement révélé 4 sites
  d'appel qui passaient des `number` nus (`index.get`, `[id].put`, `impact.get`,
  `forecast-engine`) — ils sont désormais explicites.
- Garde `amountCents >= 0` remplacée par un refus du **montant nul** seulement. Le test qui
  asseyait l'ancien contrat (`rejects marking an incoming (positive) transaction`) a été
  réécrit : il encodait le comportement que l'AC#5 supprime.
- Le nom de fichier `[eventId].delete.ts` violait `unicorn/filename-case` → route
  `[event-id].delete.ts`, paramètre `event-id`.

### Vérification hors tests unitaires

Les tests unitaires injectent les params de route directement et ne prouvent **rien** sur le
routage. Parcours HTTP réel exécuté contre le serveur de dev :

```
POST /api/debts                    → 50 000 (dette)
POST /api/debts/10/events {-80000} → kind déduit "settlement"
GET  /api/debts                    → currentBalanceCents = -30000   ← créance, cœur de D16
DELETE /api/debts/10/events/1      → 204
GET  /api/debts                    → currentBalanceCents = 50000    ← solde restauré
```

### Validation
`test:run` → 433 passed / 38 fichiers · `lint` OK · `typecheck` OK

⚠️ **Validation visuelle NON FAITE** — `DebtCard` (Créance/Dette) et `DebtEventForm` (sélecteur
de sens) n'ont pas été regardés. À couvrir en recette visuelle.

---

## Revue `pr-reviewer` du 2026-09-04 (contexte neuf) — verdict initial BLOQUER

### 🔴 BLOQUANT — corrigé

**Le solde comptait une transaction ENTRANTE rattachée comme une sortie.** La story 6.5 avait
levé la garde `amountCents >= 0` à l'**écriture** sans corriger l'**arithmétique** :
`debt-balance.ts` sommait toujours `abs(amount)` et le soustrayait.

```
créance -50 000, encaissement +20 000 rattaché  →  -70 000   (attendu -30 000)
```

C'est le cas d'usage même que D16 déclare débloquer : FR66-FR68 restaient faux, en silence, et
le résultat remontait au forecast puis au dividende via `currentDebtBalance`.

**Pourquoi aucun test ne l'a vu** : le test réécrit en 6.5 n'assertait que les deux booléens
écrits, et aucun cas ne seedait de transaction rattachée à montant positif. 468 tests au vert
sur un solde faux.

Correction : somme **signée** (`initial + Σevents + Σ montants rattachés`). Le comportement
pour les sorties est strictement identique — aucune régression sur l'existant. Idem dans
`repaidInMonthCents`, qui filtre désormais `amount_cents < 0` : un encaissement n'est pas un
remboursement et ne doit pas neutraliser la mensualité projetée.

Vérifié en HTTP réel après correction : `currentBalanceCents = -30000`. Et couvert par 4 cas
nouveaux (unitaire + endpoint), dont celui reproduisant les chiffres exacts du reviewer.

### 🟠 MAJEURS — corrigés

- **Aucun artefact de migration dans le dépôt.** `server/db/migrations/` n'existait pas : le
  rebuild SQLite fait à la main n'était reproductible nulle part, et une base antérieure
  tournait sans `debt_events` ni contrainte, sans aucun signal. → `yarn db:generate` exécuté et
  la baseline `0000_charming_starbolt.sql` est commitée, **et** le bootstrap porte désormais
  `assertSchemaUpToDate()` qui refuse de démarrer sur un schéma périmé. Sonde vérifiée sur une
  copie de base réelle amputée de `debt_events`, puis couverte par 2 tests.
- **La nouvelle capacité financière de 6.5 n'avait aucun cas nominal** (NFR18). → couverte, cf.
  bloquant.
- **Glissement sémantique de `is_debt_repayment`** : depuis 6.5 le flag ne signifie plus
  « remboursement » mais « rattachée à une dette », entrées comprises — la `CHECK` l'y oblige.
  C'est la racine du bloquant. Documenté dans `debt-balance.ts` avec un ⚠️ explicite contre un
  retour à `abs()`.

### 🟡 MINEURS — corrigés

- `adjustment` figé à la baisse dans `DebtEventForm` → les deux sens sont proposés.
- `currentMonth()` dupliqué dans `forecast.get.ts` alors que `debt-anchor.ts` prétendait être la
  source unique → dédupliqué.
- `[id].put.ts` faisait un `GROUP BY` sur toute la table pour un compteur → requête ciblée.
- Libellé UI périmé dans `DebtProjectedExpense` (« arrive avec le forecast (à venir) », or
  l'epic 7 est livré) → corrigé.

### Reste ouvert, assumé

- `useDebts.deleteDebt` utilise `refreshNuxtData()` sans clé. Le reviewer le juge « un marteau » :
  c'est exact, mais les clés `transactions-<mois>` sont dynamiques et non énumérables depuis le
  composable. Conservé, motif documenté dans le code.
- DDL des tests réécrite à la main, divergente du schéma réel — **dette pré-existante** du dépôt,
  consignée depuis la story 2.10. C'est elle qui rend les tests aveugles aux contraintes.

### ⚠️ Validation visuelle : NON FAITE

Troisième occurrence consécutive — MCP Playwright indisponible dans le contexte du reviewer.
`/dettes` (carte Créance/Dette, formulaire de mouvement signé, message de suppression chiffré)
et `/transactions/[period]` n'ont été regardés par personne. **Recette visuelle à faire avec
Marceau avant clôture.**

### Validation finale
`test:run` → **476 passed / 40 fichiers** · `lint` OK · `typecheck` OK · `test:e2e` → 9 passed, 0 failed
