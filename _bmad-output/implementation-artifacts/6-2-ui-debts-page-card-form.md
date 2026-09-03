# Story 6.2: UI dettes — page `/dettes`, card, formulaires

Status: review

## Story

As a user,
I want a `/dettes` page to create, edit and delete debts and log advances with a clear view of each debt's current balance,
so that I can manage my debts visually (FR29-FR31) — the backend CRUD (story 6.1) is now exposed to the UI.

## Acceptance Criteria

1. **Given** le composable `app/composables/useDebts.ts`,
   **When** utilisé,
   **Then** il expose `{ data, pending, error, refresh, addDebt, updateDebt, deleteDebt, addAdvance }` — même pattern que `useFixedCharges` (`apiMutate`, `runMutation` → refetch + invalidations forecast/dashboard). Pas de `$fetch` direct dans les composants. `data` = `Debt[]` (clé `debts`).

2. **Given** la page `app/pages/dettes.vue`,
   **When** elle se charge,
   **Then** elle liste les dettes en `DebtCard` (une par dette), plus un bouton *Ajouter une dette* ouvrant `DebtForm`. États `pending`/`error` gérés (mapError FR). Vide → message « Aucune dette ».

3. **Given** `DebtForm` (création + édition),
   **When** affiché,
   **Then** il saisit `creditor` (texte), `initialBalanceCents` (input euros), et le mode via `DebtRepaymentMode`. Soumission → `addDebt`/`updateDebt`. Validation cliente minimale (créancier requis, montant ≥ 0) ; les erreurs serveur (422) sont mappées FR. En édition, préremplissage depuis la dette.

4. **Given** `DebtRepaymentMode` (sous-composant réutilisé par `DebtForm`),
   **When** affiché,
   **Then** un select mode (`free`/`monthly`/`lump_sum`, libellés FR « Libre » / « Mensualité fixe » / « Montant unique à date ») pilote l'affichage conditionnel :
   - `monthly` → input euros `monthlyAmountCents`
   - `lump_sum` → input date `lumpSumDate`
   - `free` → aucun champ additionnel
   Il émet un payload `{ repaymentMode, monthlyAmountCents, lumpSumDate }` cohérent (champs hors mode remis à `null`), pour respecter la validation croisée serveur (story 6.1).

5. **Given** `DebtCard`,
   **When** affichée,
   **Then** elle montre : `creditor`, **solde courant** (`formatEuros(currentBalanceCents)`), badge de mode + détail (mensualité formatée si `monthly`, date si `lump_sum`), et les actions *Modifier*, *Supprimer* (via `ConfirmDialog`), *+ Avance* (ouvre `DebtAdvanceForm`).

6. **Given** `DebtAdvanceForm`,
   **When** validé,
   **Then** il saisit `amountCents` (euros, > 0), `advanceDate` (date), `note` (optionnel) → `addAdvance(debtId, …)`. Succès → la card reflète le **nouveau solde** (refetch). Montant ≤ 0 → message inline (pas de 422 renvoyé brut).

7. **Given** `AppNav.vue`,
   **When** rendu,
   **Then** l'entrée « Dettes » pointe vers `/dettes` (actuellement `href: null`).

8. **Given** un test E2E `tests/e2e/debts.spec.ts` (pas de dépendance LLM),
   **When** il s'exécute,
   **Then** : `/dettes` → ajouter une dette mode `monthly` (créancier, solde, mensualité) → vérifier la card + solde → ajouter une avance → vérifier le solde incrémenté → supprimer → disparition. Idempotent (nettoyage des dettes de test).

9. **Given** les conventions CLAUDE.md,
   **When** review,
   **Then** : monnaie via `parseEurosToCents`/`formatEuros` (aucun `*100`), pas de `$fetch` direct en composant, pas de mutation Pinia, CSS scoped/tokens (pas de Tailwind), libellés UI en français.

## Tasks / Subtasks

- [x] **Task 1 — Composable `useDebts`** (AC: #1)
  - [x] `app/composables/useDebts.ts` (+ `REPAYMENT_MODE_LABELS`)

- [x] **Task 2 — Sous-composants formulaire** (AC: #3, #4)
  - [x] `DebtRepaymentMode.vue` (v-model mode + champ conditionnel), `DebtForm.vue`

- [x] **Task 3 — Card + avance** (AC: #5, #6)
  - [x] `DebtCard.vue`, `DebtAdvanceForm.vue`

- [x] **Task 4 — Page + nav** (AC: #2, #7)
  - [x] `app/pages/dettes.vue` + lien `/dettes` dans `AppNav.vue`

- [x] **Task 5 — E2E** (AC: #8)
  - [x] `tests/e2e/debts.spec.ts` (idempotent)

- [x] **Task 6 — Sanity** (AC: #9)
  - [x] `typecheck`, `lint`, `test:run` (303) verts ; `test:e2e debts` OK chromium
  - [x] Euros via `parseEurosToCents`/`formatEuros` ; caste `as Cents` à la frontière (champs Zod `number`) ; aucun `$fetch` composant

## Dev Notes

### Réutilisations
- Composable : cloner la structure `useFixedCharges` (runMutation + `apiMutate` + invalidations). Type `Debt` depuis `shared/schemas/debt.schema.ts`.
- Euros : `parseEurosToCents` (`~/utils/euros`), `formatEuros`/`centsToEuros` (`shared/types/money`) — cf. `SasConfigForm.vue`.
- Dialog : `ConfirmDialog` (`app/components/shared/`), même usage que `categories.vue`.
- CSS : classes globales `rev-panel*` (`app/assets/styles/revenue-panel.css`) pour les formulaires.

### Endpoints consommés (story 6.1)
- `GET /api/debts`, `POST /api/debts`, `PUT /api/debts/:id`, `DELETE /api/debts/:id`, `POST /api/debts/:id/advances`.
- Mutations via `apiMutate` (URL `string` — évite l'explosion d'inférence du `$fetch` typé).

### Hors scope
- `DebtImpactOnDividend.vue` et l'impact sur le dividende → **story 6.4**.
- Le marquage d'une transaction comme remboursement → **story 6.3**.

### References
- [Source: architecture.md:503-508] — composants `debts/*`
- [Source: architecture.md:474, 535] — `dettes.vue`, `useDebts.ts`
- [Source: `app/pages/charges.vue`, `app/composables/useFixedCharges.ts`] — patrons list+form+CRUD
- [Source: `app/components/sas/SasConfigForm.vue`] — patron saisie euros
- [Story amont : `6-1` (endpoints + `Debt`/`currentBalanceCents`)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (dev-story workflow)

### Debug Log References

- Champs monétaires de `Debt` typés `number` (inférence Zod) → cast `as Cents` au point d'usage `formatEuros`/`centsToEuros` (frontière branded type, pattern existant).
- E2E : collision de nom accessible « Supprimer » entre bouton card et bouton dialog → aria-label distinct `Supprimer la dette {creditor}` sur la card (comme catégories). `cleanup` attend la décrémentation du compteur (anti-flake « element detached »).

### Completion Notes List

- `useDebts` (CRUD + `addAdvance`) sur le pattern `useFixedCharges` (`apiMutate` + `runMutation` + invalidations).
- `DebtRepaymentMode` : select mode + champ conditionnel (mensualité € / date), vide les champs hors mode → cohérent avec la validation croisée serveur (6.1).
- `DebtCard` : solde courant `formatEuros`, badge + détail mode, actions Modifier/Supprimer/+Avance ; `DebtAdvanceForm` inline.
- Page `dettes.vue` : liste, formulaire add/edit, `ConfirmDialog` suppression, état vide.
- Lien `/dettes` activé dans `AppNav`. E2E vert (add → avance → solde 1 250 → delete).
- 303 tests unitaires inchangés (UI, aucune régression).

### File List

- `app/composables/useDebts.ts` (nouveau)
- `app/components/debts/DebtRepaymentMode.vue` (nouveau)
- `app/components/debts/DebtForm.vue` (nouveau)
- `app/components/debts/DebtCard.vue` (nouveau)
- `app/components/debts/DebtAdvanceForm.vue` (nouveau)
- `app/pages/dettes.vue` (nouveau)
- `app/components/shared/AppNav.vue` (modifié — lien `/dettes`)
- `tests/e2e/debts.spec.ts` (nouveau)

### Change Log

- 2026-07-08 : Implémentation story 6.2 — UI dettes (page, card, formulaires, composable) sur les endpoints 6.1. Status → review.

### Review Findings

**Revue `pr-reviewer` du 2026-09-04 (contexte neuf, première revue de l'epic 6) — verdict CHANGEMENTS REQUIS.**

L'implémentation est propre et conforme aux invariants monétaires du projet (aucun `*100`/`parseFloat`
sur de l'argent, aucun `try/catch` silencieux, aucun `$fetch` en composant, `projectDebt` réellement
pure, solde jamais stocké). Ce qui bloque la clôture n'est pas la qualité du code mais **la
modélisation** et **deux biais qui faussent le dividende**.

Les remarques ne sont pas traitées dans ce fichier : elles sont découpées en 4 stories de remédiation
— **6.5** (ledger d'événements signés, D16), **6.6** (biais sur le dividende), **6.7** (sûreté des
données), **6.8** (couverture NFR18 et specs). Cette story reste en `review` jusqu'à leur clôture.

⚠️ Validation visuelle **NON FAITE** (MCP Playwright indisponible dans le contexte du reviewer,
deuxième occurrence). Responsive 375/1440, contrastes, débordements et console restent à vérifier.
