# Story 6.3: Marquage d'une transaction comme remboursement de dette (FR9/FR32)

Status: review

## Story

As a user,
I want to mark an outgoing transaction as a repayment of a specific debt (and unmark it),
so that the debt's current balance is automatically decremented (FR9, FR32).

## Acceptance Criteria

1. **Given** `PATCH /api/transactions/[id]` (existant, supporte déjà `isDebtRepayment`/`debtId`),
   **When** le patch **active** le remboursement (`isDebtRepayment: true`),
   **Then** l'endpoint applique 3 garde-fous :
   - un `debtId` cible est requis (fourni dans le patch ou déjà présent) → sinon 422 `validation_failed`
   - la dette doit exister (`assertDebtExists`) → sinon 422 `validation_failed`
   - la transaction doit être **sortante** (`amount_cents < 0`, FR9 « sortante ») → sinon 422 `validation_failed`
   Aucun nouveau code d'erreur.

2. **Given** le patch **désactive** le remboursement (`isDebtRepayment: false`),
   **When** appliqué,
   **Then** `is_debt_repayment` passe à `false` ET `debt_id` est remis à `null` (délie la dette — pas de lien pendant).

3. **Given** un patch qui ne touche PAS les champs dette (ex: `categoryCode` seul),
   **When** appliqué,
   **Then** `is_debt_repayment`/`debt_id` restent inchangés (pas de validation dette parasite).

4. **Given** FR32 (décrément automatique),
   **When** une transaction est marquée remboursement d'une dette,
   **Then** le solde courant de cette dette (`GET /api/debts`, calcul story 6.1) reflète la soustraction — **déjà branché** (`currentBalanceCents = initial + Σavances − Σ|remboursements|`). Aucun recalcul supplémentaire ici : la mutation suffit.

5. **Given** `assertDebtExists(debtId)` (nouvel util `server/utils/debt-fk.ts`),
   **When** appelé,
   **Then** il lève `validation_failed` (422) si la dette n'existe pas — miroir de `assertCategoryExists`.

6. **Given** le composable `useTransactions`,
   **When** étendu,
   **Then** il expose `mutateDebtRepayment(id, { isDebtRepayment, debtId })` (même wrapper que `mutateCategory` : PATCH + refetch + invalidations). Retour `MutationOutcome`.

7. **Given** le composant `DebtRepaymentMarker` (`app/components/transactions/DebtRepaymentMarker.vue`),
   **When** affiché sur une ligne de transaction **sortante**,
   **Then** :
   - non marquée : un select des dettes (via `useDebts`) + bouton *Marquer remb.* → émet `mark(debtId)`
   - marquée : le créancier lié + bouton *Démarquer* → émet `unmark()`
   Il n'apparaît **pas** sur les transactions entrantes (`amountCents >= 0`).

8. **Given** `TransactionRow` / `TransactionList` / la page `[period].vue`,
   **When** l'utilisateur marque/démarque,
   **Then** l'événement remonte jusqu'à la page qui appelle `mutateDebtRepayment`. Erreur serveur mappée FR.

9. **Given** des tests unitaires (extension de `[id].patch.test.ts`),
   **When** ils s'exécutent,
   **Then** ils couvrent : marquage valide (dette existante + tx sortante) → ok ; dette inexistante → 422 ; transaction **entrante** → 422 ; `isDebtRepayment: true` sans `debtId` → 422 ; démarquage → `debt_id` remis à null ; patch `categoryCode` seul → champs dette intacts.

10. **Given** les conventions CLAUDE.md,
    **When** review,
    **Then** : pas de nouveau code d'erreur ; pas de `$fetch` composant (mutation via composable) ; pas d'état dérivé (le solde reste calculé) ; libellés UI FR.

## Tasks / Subtasks

- [x] **Task 1 — Util FK dette** (AC: #5)
  - [x] `server/utils/debt-fk.ts` → `assertDebtExists(debtId)`

- [x] **Task 2 — Durcir l'endpoint PATCH** (AC: #1, #2, #3)
  - [x] `[id].patch.ts` : gate `touchesDebt`, requis/existence/sortante, clear au démarquage
  - [x] `[id].patch.test.ts` réécrit/étendu → 11 cas (AC#9)

- [x] **Task 3 — Composable** (AC: #6)
  - [x] `useTransactions.mutateDebtRepayment` (via `patchTransaction` mutualisé + `apiMutate`)

- [x] **Task 4 — UI marker** (AC: #7, #8)
  - [x] `DebtRepaymentMarker.vue` (sortantes uniquement) + câblage row → list → page

- [x] **Task 5 — Sanity** (AC: #10)
  - [x] `typecheck`, `lint`, `test:run` (308) verts
  - [x] Aucun nouveau code d'erreur ; mutations via composable (`apiMutate`)

## Dev Notes

### FR32 déjà branché
Le décrément du solde n'est PAS recalculé ici : `GET /api/debts` (story 6.1) calcule `currentBalanceCents = initial + Σavances − Σ|remboursements|` où les remboursements = transactions `is_debt_repayment = 1 AND debt_id = …`. Marquer une transaction suffit ; la card 6.2 reflète le solde au refetch.

### Contrat modifié (breaking pour un test)
`[id].patch.test.ts` acte actuellement que `{ isDebtRepayment: true, debtId: 42 }` (dette inexistante) est persisté. Cette story **rend ce cas invalide** (422). Le test est réécrit : seeder une table `debts` + une dette, marquer une transaction sortante existante.

### Sortante uniquement (FR9)
FR9 parle de transaction « sortante ». `amount_cents < 0` = sortie. Marquer une entrée (positif) → 422. Le marker UI n'apparaît pas sur les entrées.

### Réutilisations
- `assertCategoryExists` (`server/utils/category-fk.ts`) → modèle exact pour `assertDebtExists`.
- `mutateCategory` (`useTransactions`) → modèle pour `mutateDebtRepayment`.
- `useDebts` (story 6.2) pour la liste des dettes dans le marker (dédup par `key: 'debts'`).
- Badge « remb. dette » déjà présent dans `TransactionRow`.

### Hors scope
- Table `debt_repayments` dédiée : non (les remboursements sont des `transactions` marquées — décision 6.1).
- Impact sur le dividende → story 6.4.

### References
- [Source: prd.md#FR9, FR32]
- [Source: `server/api/transactions/[id].patch.ts`] — endpoint à durcir
- [Source: `server/utils/category-fk.ts`] — patron `assert*Exists`
- [Source: `app/composables/useTransactions.ts`, `app/components/transactions/TransactionRow.vue`]
- [Stories : `6-1` (calcul solde), `6-2` (`useDebts`)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (dev-story workflow)

### Completion Notes List

- Endpoint PATCH durci : gate `touchesDebt` (ne touche les colonnes dette que si visées), `debtId` requis + `assertDebtExists` + transaction sortante (`amountCents < 0`) au marquage ; démarquage → `debt_id` null.
- FR32 : aucun recalcul — le solde de la dette reste calculé (6.1), la mutation suffit.
- `mutateDebtRepayment` ajouté ; `mutateCategory` refactoré via `patchTransaction` mutualisé (`apiMutate`).
- `DebtRepaymentMarker` rendu uniquement sur les transactions sortantes ; select des dettes via `useDebts` (dédup `key: 'debts'`), démarquage inline.
- Aucun nouveau code d'erreur (réutilise `validation_failed`).
- Tests : `[id].patch.test.ts` étendu à 11 cas (marquage valide, dette inexistante, entrée refusée, sans debtId, démarquage, patch catégorie seul). Suite globale 308 verte.

### File List

- `server/utils/debt-fk.ts` (nouveau)
- `server/api/transactions/[id].patch.ts` (modifié — logique marquage)
- `server/api/transactions/[id].patch.test.ts` (modifié — table debts + 5 cas)
- `app/composables/useTransactions.ts` (modifié — `mutateDebtRepayment` + `patchTransaction`)
- `app/components/transactions/DebtRepaymentMarker.vue` (nouveau)
- `app/components/transactions/TransactionRow.vue` (modifié — marker sortantes)
- `app/components/transactions/TransactionList.vue` (modifié — forward event)
- `app/pages/transactions/[period].vue` (modifié — `onDebtRepaymentChange`)

### Change Log

- 2026-07-08 : Implémentation story 6.3 — marquage transaction remboursement (FR9/FR32), validation FK dette + sortante, UI marker. Status → review.

### Review Findings
