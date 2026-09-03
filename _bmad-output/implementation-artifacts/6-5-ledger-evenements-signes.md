# Story 6.5: Ledger d'événements signés (D16) — prérequis de l'epic 10

Status: ready-for-dev

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

- [ ] **Task 1 — Schéma** (AC: #1, #2)
  - [ ] `debt_events` dans `server/db/schema.ts`, suppression de `debt_advances`
  - [ ] `shared/schemas/debt-event.schema.ts` remplace `debt-advance.schema.ts`
  - [ ] `debt.schema.ts` : `initialBalanceCents` signé

- [ ] **Task 2 — Calcul de solde** (AC: #3)
  - [ ] Réécriture de `server/utils/debt-balance.ts` (`toCurrentBalance`, `currentBalanceForDebt`, `balanceSumsByDebt`) avec typage `Cents`

- [ ] **Task 3 — Endpoints** (AC: #4, #5)
  - [ ] `events.post.ts` (remplace `advances.post.ts`), `events.get.ts`, `events/[eventId].delete.ts`
  - [ ] `transactions/[id].patch.ts` : levée de la garde `amountCents >= 0`

- [ ] **Task 4 — UI** (AC: #6, #7)
  - [ ] `DebtCard.vue` : solde signé, libellé Créance/Dette
  - [ ] `DebtAdvanceForm.vue` → formulaire d'événement signé

- [ ] **Task 5 — Tests + sanity** (AC: #8, #9)
  - [ ] Cas listés en AC#9 ; `typecheck`, `lint`, `test:run`, `test:e2e` verts

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
