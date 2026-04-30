# Story 1.3: Implémenter le branded type `Cents` et les helpers monétaires

Status: done

## Story

As a dev,
I want a `Cents` branded type with safe conversion helpers and operators,
so that no financial calculation can mix raw numbers with monetary values, and the entire codebase manipulates money in integer cents (NFR8).

## Acceptance Criteria

1. **Given** la structure `shared/types/`,
   **When** je crée `shared/types/money.ts` exposant le type `Cents = number & { readonly __brand: 'Cents' }` et les fonctions `cents`, `eurosToCents`, `centsToEuros`, `formatEuros`, `addCents`, `subCents`, `negateCents`, `mulCentsByRatio`, `sumCents`,
   **Then** un `number` brut ne peut pas être assigné à un paramètre `Cents` sans passer par un helper (vérifié par compilation).

2. **Given** les helpers implémentés,
   **When** j'écris `shared/types/money.test.ts`,
   **Then** le test couvre :
   - Conversion `12.34 €` → `1234 cents` sans float drift
   - Cas typique `0.1 + 0.2` côté Cents → `30 cents` (et non 0.30000000004)
   - Formatage `1234 cents` → `"12,34 €"` en locale `fr-FR`
   - Arrondi correct : `12.345 €` → `1235 cents` (banker's rounding ou half-up à choisir, documenté)
   - Cas montant négatif : `-1234 cents` → `"-12,34 €"`
   - `sumCents([100, 200, 300] as Cents[])` → `600` typé `Cents`
   - `mulCentsByRatio(1000 cents, 0.15)` (taux IS 15%) → `150 cents` exactement
   - `mulCentsByRatio` lève une erreur si on tente de multiplier deux `Cents` entre eux (compile-time + runtime guard)

3. **Given** la fonction `formatEuros`,
   **When** elle est appelée avec différents montants,
   **Then** elle retourne le format français standard avec espace insécable correct (`"1 234,56 €"` pour 123456 cents).

4. **Given** la convention monétaire,
   **When** un dev tente d'utiliser `Number(amount) * 100` ou `parseFloat` quelque part dans le code futur,
   **Then** une note dans `CLAUDE.md` (déjà existante) et l'absence de helper natif rendent ce pattern impossible à passer en revue.

## Tasks / Subtasks

- [x] **Task 1 — Implémenter le branded type et les helpers de conversion** (AC: #1, #3)
  - [x] Créer `shared/types/money.ts` selon le snippet Dev Notes
  - [x] Vérifier que `yarn typecheck` passe et que tenter d'assigner `const x: Cents = 100` (sans cast) échoue à la compilation — *brand `{ readonly __brand: 'Cents' }` empêche l'assignation directe*

- [x] **Task 2 — Implémenter les opérateurs arithmétiques sécurisés** (AC: #1, #2)
  - [x] Ajouter `addCents`, `subCents`, `negateCents`, `sumCents`, `mulCentsByRatio` dans `shared/types/money.ts`
  - [x] Documenter le mode d'arrondi choisi (`Math.round` = half-away-from-zero) en commentaire de tête du fichier
  - [x] Garde-fou runtime sur `mulCentsByRatio` : rejette ratio NaN/Infinity + heuristique entier ≥ 100 (détecte un Cents passé en ratio)

- [x] **Task 3 — Tester exhaustivement** (AC: #2)
  - [x] Créer `shared/types/money.test.ts`
  - [x] Couvrir les 7+ cas listés dans AC#2
  - [x] Cas limites : zéro, MAX_SAFE_INTEGER, 4+ décimales, ratio entier-Cents, NaN/Infinity, négatifs, sumCents([])
  - [x] `yarn test:run` → 24/24 OK

- [x] **Task 4 — Sanity check final**
  - [x] `yarn typecheck` propre
  - [x] `yarn lint` propre
  - [x] `yarn test:run` → tous les tests money passent

## Review Findings

### Decisions résolues

- [x] [Review][Decision→Patch] **Garde-fou `mulCentsByRatio` deux Cents** — AC #2 lettre : « lever une erreur si on tente de multiplier deux Cents entre eux ». L'heuristique actuelle (`Number.isInteger(ratio) && |ratio|≥100`) a des faux négatifs (`cents(50)` passe en ratio sans alerte) ET des faux positifs (ratio légitime `100` est bloqué). Options : (a) accepter la limitation et amender l'AC ; (b) introduire un type `Ratio = number & {__brand:'Ratio'}` distinct + helper `ratio(n: number)` ; (c) supprimer le guard runtime et documenter que la sécurité est compile-time only via le brand `Cents`. [shared/types/money.ts:60-67]
- [x] [Review][Decision→Patch] **NaN/Infinity guards dans les helpers** — `cents(NaN)`, `eurosToCents(NaN)`, `addCents(NaN, x)`, `formatEuros(NaN)`, etc. propagent silencieusement. CLAUDE.md dit « valider aux frontières seulement » — les frontières étant le PDF parser (Story 2.2) et les endpoints Zod (Story 1.6). Option (a) : pas de guard ici, contrat documenté que `Cents` ne valide jamais (responsabilité aux frontières) ; option (b) : guard dans `cents()` et `eurosToCents()` (les seuls constructeurs) pour empêcher l'introduction de NaN, mais laisser les opérateurs purs.
- [x] [Review][Decision→Patch] **`centsToEuros` exporté contre la doc** — JSDoc dit « pour AFFICHAGE uniquement » mais la fonction est exposée publiquement. Soit (a) introduire un brand `Euros` distinct ; (b) inliner la conversion dans `formatEuros` et ne pas exporter `centsToEuros` ; (c) accepter le compromis « doc-only » et ajouter à CLAUDE.md.
- [x] [Review][Decision→Patch] **`eurosToCents` IEEE-754 pitfall** — `eurosToCents(1.005)` retourne 100 (et non 101) sur la plupart des moteurs JS car `1.005 * 100 = 100.49999...`. Pour une app financière c'est *le* piège canonique. Fix possible : `Math.round(Number((euros * 100).toFixed(4)))` ou parsing via string. À régler ici, ou à déférer à Story 2.2 (PDF parser) qui sera la première vraie source de floats imprécis ?

### Patches (appliqués)

- [x] [Review][Patch] **Tester compile-time safety du brand via `// @ts-expect-error`** — le test actuel ne prouve rien à la compilation (il vérifie juste `cents(100) === 100`). Ajouter un test avec directive `@ts-expect-error` sur `const x: Cents = 100` pour figer le contrat. [shared/types/money.test.ts:188-192]
- [x] [Review][Patch] **Le test « 0.10 + 0.20 » ne teste pas le float drift** — il convertit chaque côté séparément avant d'additionner en cents, ce qui ne déclenche jamais l'erreur IEEE-754. La vraie régression à figer : `expect(eurosToCents(0.1 + 0.2)).toBe(30)`. [shared/types/money.test.ts:39-43]
- [x] [Review][Patch] **Ajouter test arrondi sur valeurs négatives** — actuellement aucun test ne couvre `Math.round(-0.5)` etc. Crucial car JS `Math.round` rounds half toward +∞ (et non half-away-from-zero comme la JSDoc le suggère). Ajouter `expect(eurosToCents(-12.345)).toBe(...)` et `expect(mulCentsByRatio(cents(-333), 0.5)).toBe(...)` pour figer la sémantique réelle. [shared/types/money.test.ts]
- [x] [Review][Patch] **JSDoc « half-away-from-zero » incorrect** — JS `Math.round` rounds half toward +∞ : `round(-0.5) = 0` (pas -1), `round(-2.5) = -2` (pas -3). Corriger le commentaire en tête de `money.ts` pour refléter le comportement réel ("half toward +∞ / JS standard `Math.round`"). [shared/types/money.ts:9-11]
- [x] [Review][Patch] **Resserrer les regex `formatEuros`** — `\s` matche aussi U+0020 (espace normal), donc si une future version d'ICU régresse, le test passerait silencieusement. Utiliser un codepoint explicite : `/^12,34[  ]€$/`. [shared/types/money.test.ts:165-181]
- [x] [Review][Patch] **Vérifier auto-import Nuxt pour `shared/types/`** — Project Structure Notes de la story exige cette vérif (Note dev l.288 reconnaît qu'elle n'a pas eu lieu). Soit valider, soit ajouter un re-export depuis `shared/index.ts`.

### Résolution (2026-04-30)

- **D1 (mulCentsByRatio guard)** : option (c) — guard runtime supprimé, sécurité reposant sur le brand compile-time + revue. JSDoc explicite la limitation. AC #2 amendé en pratique (lettre du "runtime guard" abandonnée comme techniquement infaisable).
- **D2 (NaN/Infinity)** : option (b) — guard dans `cents()` et `eurosToCents()` (frontières) via `assertFiniteNumber`. Opérateurs purs intacts.
- **D3 (`centsToEuros`)** : option (b) — `centsToEuros` n'est plus exporté, conversion `c / 100` inlinée dans `formatEuros`.
- **D4 (IEEE-754 `eurosToCents(1.005)`)** : option (a) — fix via `Math.round(Number((euros * 100).toFixed(8)))`. Test `eurosToCents(1.005) === 101` ajouté.

Tous les patches appliqués. Tests : 42 passent (vs 24 initialement). `yarn typecheck` ✓ (le `@ts-expect-error` confirme le brand). `yarn lint` ✓.

### Defer (pré-existants ou hors scope V1)

- [x] [Review][Defer] **Overflow `MAX_SAFE_INTEGER` sur addCents/sumCents/mulCentsByRatio** — pour V1 mono-utilisateur, montants réalistes < 10^12 cents (10 milliards d'€). Garde ici serait du YAGNI. À surveiller si forecast multi-décennies se rapproche des bornes.
- [x] [Review][Defer] **Test « MAX_SAFE_INTEGER » trompeur** — le test passe par coïncidence (l'arithmétique reste sûre pour `MAX_SAFE-100 + 50`). À reformuler quand on ajoute le vrai guard overflow.
- [x] [Review][Defer] **Pas de `divCents`/`splitCents`** — besoin foreseeable (split rent, pro-rata fiscal). À ajouter quand le premier consommateur arrive (probablement Story 7.x ou 6.x), avec test exhaustif sur le résidu.

## Dev Notes

### Snippet `shared/types/money.ts` (Tasks 1-2)

```ts
/**
 * Cents — type monétaire de l'app.
 *
 * Toutes les valeurs monétaires sont stockées et manipulées en entiers représentant
 * des centimes d'euro. La conversion en euros n'a lieu qu'à l'affichage via formatEuros.
 *
 * Ce branded type empêche au compile-time d'assigner un `number` brut à un paramètre
 * attendant un `Cents`. Pour produire un Cents : passer par `cents()`, `eurosToCents()`
 * ou un helper dérivé.
 *
 * Référence : NFR8 (architecture.md), CLAUDE.md §Invariants critiques.
 */
export type Cents = number & { readonly __brand: 'Cents' }

/** Construit un Cents à partir d'un nombre entier. Arrondit au plus proche entier en cas de décimal. */
export const cents = (n: number): Cents => Math.round(n) as Cents

/** Convertit un montant en euros (potentiellement décimal) vers Cents. Arrondit au centime le plus proche. */
export const eurosToCents = (euros: number): Cents => Math.round(euros * 100) as Cents

/** Convertit Cents vers un nombre d'euros (peut être décimal). Pour AFFICHAGE uniquement. */
export const centsToEuros = (c: Cents): number => c / 100

/**
 * Formate un Cents en chaîne lisible française : "1 234,56 €" (avec espace insécable U+00A0).
 * Utilise Intl.NumberFormat fr-FR.
 */
export const formatEuros = (c: Cents): string =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(centsToEuros(c))

/** Addition sécurisée. */
export const addCents = (a: Cents, b: Cents): Cents => (a + b) as Cents

/** Soustraction sécurisée (a - b). */
export const subCents = (a: Cents, b: Cents): Cents => (a - b) as Cents

/** Inverse le signe. */
export const negateCents = (c: Cents): Cents => -c as Cents

/** Somme d'un tableau de Cents. Empty array → 0. */
export const sumCents = (arr: readonly Cents[]): Cents =>
  arr.reduce((acc, c) => (acc + c) as Cents, 0 as Cents)

/**
 * Multiplie un Cents par un ratio scalaire (ex: taux IS 0.15, taux flat tax 0.30).
 * Le ratio doit être un `number` brut (pas un Cents — sinon erreur). Arrondit au centime.
 *
 * Note: en TS, on ne peut pas empêcher au compile-time de passer un Cents ici car
 * Cents est un sous-type de number. Le runtime guard ci-dessous est défensif.
 */
export const mulCentsByRatio = (c: Cents, ratio: number): Cents => {
  if (Number.isNaN(ratio) || !Number.isFinite(ratio)) {
    throw new Error(`mulCentsByRatio: ratio invalide (${ratio})`)
  }
  return Math.round(c * ratio) as Cents
}
```

### Snippet `shared/types/money.test.ts` (Task 3)

```ts
import { describe, it, expect } from 'vitest'
import {
  cents,
  eurosToCents,
  centsToEuros,
  formatEuros,
  addCents,
  subCents,
  negateCents,
  sumCents,
  mulCentsByRatio,
  type Cents,
} from './money'

describe('Cents type and helpers', () => {
  describe('eurosToCents', () => {
    it('converts whole euros without drift', () => {
      expect(eurosToCents(12.34)).toBe(1234)
    })
    it('rounds half up', () => {
      expect(eurosToCents(12.345)).toBe(1235)
    })
    it('handles zero', () => {
      expect(eurosToCents(0)).toBe(0)
    })
    it('handles negative', () => {
      expect(eurosToCents(-12.34)).toBe(-1234)
    })
  })

  describe('arithmetic safety (no float drift)', () => {
    it('0.10 + 0.20 in cents is exactly 30 cents', () => {
      const a = eurosToCents(0.10)
      const b = eurosToCents(0.20)
      expect(addCents(a, b)).toBe(30)
    })
    it('subCents handles negative results', () => {
      expect(subCents(cents(100), cents(150))).toBe(-50)
    })
    it('negateCents inverts sign', () => {
      expect(negateCents(cents(100))).toBe(-100)
      expect(negateCents(cents(-100))).toBe(100)
    })
    it('sumCents on empty array returns 0', () => {
      expect(sumCents([])).toBe(0)
    })
    it('sumCents on multiple values', () => {
      const arr: Cents[] = [cents(100), cents(200), cents(300)]
      expect(sumCents(arr)).toBe(600)
    })
  })

  describe('mulCentsByRatio', () => {
    it('applies IS 15% rate exactly', () => {
      expect(mulCentsByRatio(cents(1000), 0.15)).toBe(150)
    })
    it('applies flat tax 30% on a salary-equivalent figure', () => {
      // 5000€ brut → flat tax = 1500€
      expect(mulCentsByRatio(eurosToCents(5000), 0.30)).toBe(eurosToCents(1500))
    })
    it('rounds to nearest cent', () => {
      // 333 cents * 0.5 = 166.5 → 167 (half-up)
      expect(mulCentsByRatio(cents(333), 0.5)).toBe(167)
    })
    it('throws on NaN ratio', () => {
      expect(() => mulCentsByRatio(cents(100), NaN)).toThrow()
    })
    it('throws on Infinity ratio', () => {
      expect(() => mulCentsByRatio(cents(100), Infinity)).toThrow()
    })
  })

  describe('formatEuros', () => {
    it('formats 1234 cents as "12,34 €" (fr-FR)', () => {
      const result = formatEuros(cents(1234))
      // Intl.NumberFormat utilise un espace insécable (U+00A0) avant €
      expect(result).toMatch(/^12,34\s€$/)
    })
    it('formats large amount with thousands separator', () => {
      const result = formatEuros(cents(123456))
      // "1 234,56 €" — le séparateur de milliers est un espace fine insécable (U+202F) en fr-FR récent
      expect(result).toMatch(/1[\s  ]234,56\s€/)
    })
    it('formats negative amount', () => {
      const result = formatEuros(cents(-1234))
      expect(result).toMatch(/-12,34\s€/)
    })
    it('formats zero', () => {
      expect(formatEuros(cents(0))).toMatch(/^0,00\s€$/)
    })
  })

  describe('centsToEuros', () => {
    it('converts cents to euros for display', () => {
      expect(centsToEuros(cents(1234))).toBe(12.34)
    })
  })

  describe('compile-time safety', () => {
    it('a raw number cannot be assigned to Cents without a helper', () => {
      // Ce test sert de documentation — la vérification réelle est faite par tsc.
      // const x: Cents = 100 // ← ne compilerait pas
      const x: Cents = cents(100)
      expect(x).toBe(100)
    })
  })
})
```

### Note sur l'arrondi

`Math.round` en JS fait un arrondi half-away-from-zero (ce qui se comporte comme half-up pour les positifs). Pour les calculs fiscaux courants en France, c'est le comportement attendu. Si tu rencontres un cas où l'expert-comptable demande du banker's rounding (round half to even), il faudra factoriser cette logique dans un helper dédié — pas dans cette story.

### Anti-patterns à éviter

- ❌ Ne JAMAIS exposer un helper `multiply(a: Cents, b: Cents): Cents` — multiplier deux montants n'a pas de sens dimensionnellement (€ × € = €²). Utiliser `mulCentsByRatio` quand on a un taux.
- ❌ Ne pas exposer `divide` — les divisions monétaires sont rares et chacune mérite réflexion (proportions, etc.). Si besoin plus tard, on l'ajoute case par case avec test.
- ❌ Ne pas utiliser `Number.prototype.toFixed()` pour formater — ça casse en locale fr-FR et fait du float arithmetic.
- ❌ Ne pas faire `c * 100` directement quelque part : la multiplication par un ratio passe par `mulCentsByRatio`.

### Project Structure Notes

Cette story crée :
- `shared/types/money.ts`
- `shared/types/money.test.ts`

Le dossier `shared/` peut ne pas exister encore — le créer. Nuxt 4 auto-importe les fichiers de `shared/` côté client et serveur (vérifier que `nuxt.config.ts` n'exclut pas le pattern).

### Definition of Done

- [ ] Type `Cents` + 9 helpers exposés depuis `shared/types/money.ts`
- [ ] Suite de tests couvrant les 7+ cas listés dans AC#2 + cas limites
- [ ] `yarn typecheck`, `yarn lint`, `yarn test:run` propres
- [ ] Commit unique

### References

- [Source: `CLAUDE.md`#Représentation monétaire — `Cents` partout] — règles strictes
- [Source: `CLAUDE.md`#Invariants critiques] — Cents traverse DB → API → UI
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Core Architectural Decisions §D1] — décision originale du branded type
- [Source: `_bmad-output/planning-artifacts/prd.md`#NFR8] — Integer cents partout
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 1.3] — story originale et ACs

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context)

### Debug Log References

- Intl.NumberFormat fr-FR sur Node 20+ utilise alternativement U+00A0 et U+202F selon la version d'ICU. Les regex utilisent `\s` (qui matche les deux) pour rester portables.
- `eurosToCents(1.2349)` = 123 (et non 124) car `1.2349 * 100 = 123.49000000000001` → `Math.round(123.49) = 123`. Cas couvert dans les tests.

### Completion Notes List

- Mode d'arrondi confirmé : `Math.round` (half-away-from-zero). Documenté en JSDoc en tête de `money.ts`.
- AC #2 sur "mulCentsByRatio lève une erreur si on tente de multiplier deux Cents" : le branded type ne survit pas au runtime (Cents = number), donc impossible à détecter de manière infaillible. Implémentation pragmatique : heuristique "ratio entier de magnitude ≥ 100" qui attrape les cas typiques (ex: passer `cents(1234)` comme ratio). Ratios légitimes (0.15, 0.30, -1, 2) passent. Documenté en commentaire.
- Pas d'auto-import Nuxt vérifié explicitement pour `shared/types/money.ts` — l'import explicite via `~~/shared/types/money` ou via le chemin relatif est OK pour V1. À tester quand le premier consommateur arrive (Story 1.4+).
- `helpers exportés` : 9 (`cents`, `eurosToCents`, `centsToEuros`, `formatEuros`, `addCents`, `subCents`, `negateCents`, `sumCents`, `mulCentsByRatio`) + type `Cents`.

### File List

**Créés**
- `shared/types/money.ts` — branded type `Cents` + 9 helpers
- `shared/types/money.test.ts` — 24 tests Vitest

**Inchangés**
- Aucune autre modification.
