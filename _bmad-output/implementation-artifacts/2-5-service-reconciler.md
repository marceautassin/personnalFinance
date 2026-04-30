# Story 2.5: Service `reconciler` (vérification somme transactions vs solde PDF)

Status: ready-for-dev

## Story

As a dev,
I want a deterministic reconciliation function that verifies extracted transactions sum to the PDF's closing balance,
so that any divergence ≥ 1 cent is caught and exposed (NFR10), and the ingestion pipeline can flag the month as "unreliable" if the user accepts a residual gap (Epic 3).

## Acceptance Criteria

1. **Given** `server/services/reconciler.ts`,
   **When** j'expose `reconcile({ openingCents, closingCents, transactions }): { isBalanced: boolean, gapCents: Cents }`,
   **Then** la fonction calcule `expected = closingCents - openingCents`, `found = sum(amountCents)`, et retourne `gapCents = expected - found`. `isBalanced = (gapCents === 0)`.

2. **Given** des cas connus,
   **When** j'écris `server/services/reconciler.test.ts`,
   **Then** le test couvre :
   - Cas équilibré exact : `expected === found` → `isBalanced: true, gapCents: 0`
   - Écart de 1 centime → `isBalanced: false, gapCents: 1` (ou -1 selon le sens)
   - Cas sans transactions (`expected === 0` et `found === 0`) → balanced
   - Cas mixte entrées + sorties (vérifier que les signes s'additionnent correctement)
   - Cas écart négatif (transactions extraites en surplus)

3. **Given** la convention NFR8 (integer cents partout),
   **When** je vérifie le code,
   **Then** la fonction n'utilise que des opérations sur `Cents` (via les helpers de Story 1.3) — aucun `+` ou `-` brut entre `number` non-typés.

4. **Given** la fonction est pure (pas de side-effect, pas de DB, pas de filesystem),
   **When** elle est appelée,
   **Then** elle retourne le résultat sans rien logger, sans rien persister.

## Tasks / Subtasks

- [ ] **Task 1 — Implémenter `reconcile`** (AC: #1, #3, #4)
  - [ ] Créer `server/services/reconciler.ts` selon le snippet Dev Notes
  - [ ] Utiliser `subCents` et `sumCents` de `~/shared/types/money` (Story 1.3)

- [ ] **Task 2 — Tests exhaustifs** (AC: #2)
  - [ ] Créer `server/services/reconciler.test.ts`
  - [ ] Couvrir les 5+ cas listés dans AC#2

- [ ] **Task 3 — Sanity check final**
  - [ ] `yarn typecheck`, `yarn lint`, `yarn test:run` propres
  - [ ] Commit unique

## Dev Notes

### Snippet `server/services/reconciler.ts` (Task 1)

```ts
/**
 * reconciler — vérifie que la somme des transactions d'un relevé correspond
 * à l'écart entre solde d'ouverture et solde de clôture (FR11, FR12, NFR10).
 *
 * Fonction PURE : pas de DB, pas de log, pas de side-effect. Réutilisable côté serveur
 * (ingestion) et côté tests (snapshots forecast).
 */
import { type Cents, sumCents, subCents, cents } from '~/shared/types/money'

export interface ReconcileInput {
  openingCents: Cents
  closingCents: Cents
  transactions: ReadonlyArray<{ amountCents: Cents }>
}

export interface ReconcileResult {
  isBalanced: boolean
  /**
   * Écart = (closingCents - openingCents) - sum(transactions.amountCents)
   * - 0       : équilibré
   * - positif : il manque des transactions extraites (le solde réel a plus bougé)
   * - négatif : transactions extraites en surplus
   */
  gapCents: Cents
}

export function reconcile(input: ReconcileInput): ReconcileResult {
  const expectedDelta = subCents(input.closingCents, input.openingCents)
  const foundDelta = sumCents(input.transactions.map((t) => t.amountCents))
  const gapCents = subCents(expectedDelta, foundDelta)
  return {
    isBalanced: gapCents === cents(0),
    gapCents,
  }
}
```

### Snippet `server/services/reconciler.test.ts` (Task 2)

```ts
import { describe, it, expect } from 'vitest'
import { reconcile } from './reconciler'
import { cents, eurosToCents, type Cents } from '~/shared/types/money'

describe('reconcile', () => {
  it('balanced: opening 1000, closing 800, one outflow of -200', () => {
    const result = reconcile({
      openingCents: eurosToCents(1000),
      closingCents: eurosToCents(800),
      transactions: [{ amountCents: eurosToCents(-200) }],
    })
    expect(result.isBalanced).toBe(true)
    expect(result.gapCents).toBe(0)
  })

  it('balanced: empty transactions and equal balances', () => {
    const result = reconcile({
      openingCents: eurosToCents(500),
      closingCents: eurosToCents(500),
      transactions: [],
    })
    expect(result.isBalanced).toBe(true)
    expect(result.gapCents).toBe(0)
  })

  it('1 cent gap: opening 1000, closing 800, outflows -199.99', () => {
    const result = reconcile({
      openingCents: eurosToCents(1000),
      closingCents: eurosToCents(800),
      transactions: [{ amountCents: eurosToCents(-199.99) }],
    })
    expect(result.isBalanced).toBe(false)
    // expected = 800 - 1000 = -200_00 cents = -20000
    // found = -19999
    // gap = -20000 - (-19999) = -1
    expect(result.gapCents).toBe(-1)
  })

  it('mixed: incomes + outflows summing exactly', () => {
    const result = reconcile({
      openingCents: eurosToCents(0),
      closingCents: eurosToCents(150),
      transactions: [
        { amountCents: eurosToCents(1000) },   // ARE entrée
        { amountCents: eurosToCents(-500) },   // courses
        { amountCents: eurosToCents(-350) },   // resto
      ],
    })
    expect(result.isBalanced).toBe(true)
    expect(result.gapCents).toBe(0)
  })

  it('positive gap: missing extracted transactions (real balance moved more)', () => {
    const result = reconcile({
      openingCents: eurosToCents(1000),
      closingCents: eurosToCents(700),
      transactions: [{ amountCents: eurosToCents(-200) }],
    })
    // expected = -300, found = -200, gap = -300 - (-200) = -100
    expect(result.isBalanced).toBe(false)
    expect(result.gapCents).toBe(-10000)
  })

  it('negative gap: surplus transactions extracted', () => {
    const result = reconcile({
      openingCents: eurosToCents(1000),
      closingCents: eurosToCents(900),
      transactions: [{ amountCents: eurosToCents(-200) }],
    })
    // expected = -100, found = -200, gap = -100 - (-200) = +100
    expect(result.isBalanced).toBe(false)
    expect(result.gapCents).toBe(10000)
  })

  it('handles negative balances (overdraft scenario)', () => {
    const result = reconcile({
      openingCents: eurosToCents(-100),
      closingCents: eurosToCents(-300),
      transactions: [{ amountCents: eurosToCents(-200) }],
    })
    expect(result.isBalanced).toBe(true)
    expect(result.gapCents).toBe(0)
  })

  it('does not mutate the input', () => {
    const transactions = [{ amountCents: eurosToCents(-100) }]
    const before = JSON.stringify(transactions)
    reconcile({
      openingCents: eurosToCents(1000),
      closingCents: eurosToCents(900),
      transactions,
    })
    expect(JSON.stringify(transactions)).toBe(before)
  })
})
```

### Anti-patterns à éviter

- ❌ Faire de la persistance ou du logging dans cette fonction — pure function uniquement.
- ❌ Utiliser `+`/`-` bruts sur des `Cents` — toujours via `addCents`/`subCents`/`sumCents` (le branded type ne l'empêche pas au niveau de l'opération arithmétique JS, mais la convention est sacrée).
- ❌ Appeler `reconcile` avec des montants déjà convertis depuis du float (ex: directement après `parseFloat`) — utiliser `eurosToCents` pour passer du float au Cents.

### Note sur la signification du gap

Le signe du `gapCents` indique la nature de l'écart :
- **Positif** : il manque des transactions (le solde réel a plus bougé que ce qu'on a extrait → des opérations n'ont pas été détectées par le LLM ou existent dans le PDF mais ont été manquées). C'est le cas le plus courant.
- **Négatif** : on a extrait plus que ce qui a réellement bougé (LLM a inventé/dupliqué — improbable avec structured outputs mais possible).

Cette information sera utile en Story 3.x pour guider l'utilisateur dans la résolution manuelle.

### Project Structure Notes

Cette story crée :
- `server/services/reconciler.ts`
- `server/services/reconciler.test.ts`

### Definition of Done

- [ ] `reconcile` exposée comme fonction pure
- [ ] 8+ tests couvrant les cas listés (balanced, gaps positifs/négatifs, mixte, vide, découvert, immutability)
- [ ] `yarn typecheck`, `yarn lint`, `yarn test:run` propres
- [ ] Commit unique

### References

- [Source: `CLAUDE.md`#Invariants critiques §Réconciliation comme invariant] — règle d'or
- [Source: `CLAUDE.md`#Représentation monétaire — Cents partout] — pas de +/- bruts
- [Source: `_bmad-output/planning-artifacts/prd.md`#FR11, §FR12] — exigences fonctionnelles
- [Source: `_bmad-output/planning-artifacts/prd.md`#NFR8, §NFR10] — integer cents, réconciliation systématique
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 2.5] — story originale
- [Previous story: `1-3` (Cents helpers)]

## Dev Agent Record

### Agent Model Used

_(à remplir)_

### Debug Log References

_(à remplir)_

### Completion Notes List

_(à remplir)_

### File List

_(à remplir)_
