# Story 1.6: Helpers d'erreurs API et validation Zod

Status: done

## Story

As a dev,
I want centralised error helpers, a Zod validation utility, a stable error code enum and a client-side error mapper,
so that all subsequent endpoints follow the same patterns and the UI can display proper French messages without ad-hoc string mappings.

## Acceptance Criteria

1. **Given** la convention d'erreur (D6 : `statusMessage` = code stable snake_case anglais, `data` = détails),
   **When** je crée `server/utils/errors.ts` exposant `badRequest(code, data?)`, `validationError(zodErr)`, `notFound(code, data?)`, `domainError(code, data?, statusCode?)`, `unauthorized(code, data?)`,
   **Then** chaque helper retourne un `createError()` Nitro avec la forme normalisée et le bon `statusCode` HTTP.

2. **Given** le pattern de validation,
   **When** je crée `server/utils/validation.ts` avec `validateBody<T>(event, schema): Promise<T>` et `validateQuery<T>(event, schema): T`,
   **Then** un endpoint peut consommer une payload typée en une ligne et obtenir automatiquement un `validationError` en cas d'échec Zod.

3. **Given** la liste de codes d'erreur stables,
   **When** je crée `shared/schemas/api-errors.ts`,
   **Then** le fichier exporte un objet `ApiErrorCode` (const-as-record) listant les codes initiaux : `validation_failed`, `not_found`, `reconciliation_failed`, `pdf_already_ingested`, `period_overlap`, `llm_extraction_failed`, `llm_unavailable`, `unauthorized`,
   **And** un type TS `ApiErrorCodeValue` qui est l'union des valeurs.

4. **Given** les erreurs typées côté client,
   **When** je crée `app/composables/useApiError.ts` avec `mapError(err): string`,
   **Then** le composable mappe chaque `statusMessage` connu vers un message FR utilisateur, avec un fallback générique pour les codes inconnus.

5. **Given** les helpers exposés,
   **When** un endpoint test (à supprimer après vérification) lève `validationError` ou `domainError`,
   **Then** la réponse HTTP contient bien `{ statusCode, statusMessage, data }` selon le format défini, et `useApiError.mapError` retourne le bon message FR côté client.

## Tasks / Subtasks

- [x] **Task 1 — Liste des codes d'erreur stables** (AC: #3)
  - [x] Créer `shared/schemas/api-errors.ts` selon le snippet Dev Notes
  - [x] Vérifier que le type `ApiErrorCodeValue` est exporté et que `yarn typecheck` passe

- [x] **Task 2 — Helpers d'erreurs serveur** (AC: #1)
  - [x] Créer `server/utils/errors.ts` selon le snippet Dev Notes
  - [x] Chaque helper utilise `ApiErrorCode` typé pour le code (compile-time safety)
  - [x] `validationError` accepte un `z.ZodError` et expose `data: { fieldErrors, formErrors }` via `.flatten()`

- [x] **Task 3 — Helpers de validation Zod** (AC: #2)
  - [x] Créer `server/utils/validation.ts` selon le snippet Dev Notes
  - [x] `validateBody` est async (lit le body), `validateQuery` est sync
  - [x] Les deux lèvent `validationError` en cas d'échec Zod

- [x] **Task 4 — Composable client de mapping erreurs** (AC: #4)
  - [x] Créer `app/composables/useApiError.ts` selon le snippet Dev Notes
  - [x] Couvrir tous les codes définis dans `ApiErrorCode` avec un message FR
  - [x] Fallback "Une erreur est survenue. Réessaie ou recharge la page." pour code inconnu

- [x] **Task 5 — Validation end-to-end via endpoint éphémère** (AC: #5)
  - [x] Créer temporairement `server/api/_dev-error-test.get.ts` qui retourne tour à tour `validationError`, `domainError`, `notFound` selon un query param
  - [x] Tester via `curl` → vérifier la forme JSON retournée (4 cas validés)
  - [x] Tester `useApiError.mapError` côté client via test Vitest
  - [x] **Supprimer l'endpoint éphémère** une fois validé

- [x] **Task 6 — Sanity check final**
  - [x] `yarn typecheck`, `yarn lint` (pour fichiers de la story), `yarn test:run` propres
  - [ ] Commit unique (à effectuer par l'utilisateur)

## Dev Notes

### Snippet `shared/schemas/api-errors.ts` (Task 1)

```ts
/**
 * Codes d'erreur API stables (snake_case anglais).
 * Source de vérité pour le mapping côté client (useApiError.mapError).
 *
 * Convention : ajouter un nouveau code ici AVANT de l'utiliser dans un endpoint.
 * Le composable useApiError.ts DOIT être tenu à jour en parallèle (mapping FR).
 */
export const ApiErrorCode = {
  ValidationFailed: 'validation_failed',
  NotFound: 'not_found',
  Unauthorized: 'unauthorized',

  // Domaine — Statements / Ingestion
  PdfAlreadyIngested: 'pdf_already_ingested',
  PeriodOverlap: 'period_overlap',
  LlmExtractionFailed: 'llm_extraction_failed',
  LlmUnavailable: 'llm_unavailable',

  // Domaine — Réconciliation
  ReconciliationFailed: 'reconciliation_failed',
} as const

export type ApiErrorCodeValue = (typeof ApiErrorCode)[keyof typeof ApiErrorCode]
```

### Snippet `server/utils/errors.ts` (Task 2)

```ts
import { createError } from 'h3'
import type { ZodError } from 'zod'
import type { ApiErrorCodeValue } from '~/shared/schemas/api-errors'
import { ApiErrorCode } from '~/shared/schemas/api-errors'

/**
 * Erreur 400 — domaine ou validation simple.
 * Pour les erreurs de schéma Zod, préférer validationError().
 */
export function badRequest(code: ApiErrorCodeValue, data?: Record<string, unknown>) {
  return createError({
    statusCode: 400,
    statusMessage: code,
    data,
  })
}

/**
 * Erreur 422 — validation de payload échouée (forme).
 */
export function validationError(err: ZodError) {
  return createError({
    statusCode: 422,
    statusMessage: ApiErrorCode.ValidationFailed,
    data: err.flatten(),
  })
}

/**
 * Erreur 404 — ressource introuvable.
 */
export function notFound(code: ApiErrorCodeValue = ApiErrorCode.NotFound, data?: Record<string, unknown>) {
  return createError({
    statusCode: 404,
    statusMessage: code,
    data,
  })
}

/**
 * Erreur 401 — non authentifié (placeholder V1, pas d'auth — utile pour le futur).
 */
export function unauthorized(code: ApiErrorCodeValue = ApiErrorCode.Unauthorized, data?: Record<string, unknown>) {
  return createError({
    statusCode: 401,
    statusMessage: code,
    data,
  })
}

/**
 * Erreur métier générique. Par défaut 400, peut être surchargée (502/503 pour intégrations).
 */
export function domainError(
  code: ApiErrorCodeValue,
  data?: Record<string, unknown>,
  statusCode = 400,
) {
  return createError({
    statusCode,
    statusMessage: code,
    data,
  })
}
```

### Snippet `server/utils/validation.ts` (Task 3)

```ts
import { readBody, getQuery, type H3Event } from 'h3'
import type { z } from 'zod'
import { validationError } from './errors'

/**
 * Lit et valide le body JSON d'une requête.
 * Lève validationError() si le schéma échoue.
 */
export async function validateBody<T>(event: H3Event, schema: z.ZodType<T>): Promise<T> {
  const body = await readBody(event)
  const result = schema.safeParse(body)
  if (!result.success) {
    throw validationError(result.error)
  }
  return result.data
}

/**
 * Lit et valide la query string d'une requête.
 * Lève validationError() si le schéma échoue.
 */
export function validateQuery<T>(event: H3Event, schema: z.ZodType<T>): T {
  const query = getQuery(event)
  const result = schema.safeParse(query)
  if (!result.success) {
    throw validationError(result.error)
  }
  return result.data
}
```

### Snippet `app/composables/useApiError.ts` (Task 4)

```ts
import { ApiErrorCode, type ApiErrorCodeValue } from '~/shared/schemas/api-errors'

/**
 * Mapping code stable → message FR utilisateur.
 * Source de vérité côté client. Maintenir en cohérence avec ApiErrorCode.
 */
const FR_MESSAGES: Record<ApiErrorCodeValue, string> = {
  [ApiErrorCode.ValidationFailed]: 'Les données saisies sont invalides. Vérifie les champs en erreur.',
  [ApiErrorCode.NotFound]: 'Ressource introuvable.',
  [ApiErrorCode.Unauthorized]: 'Tu n\'es pas autorisé à effectuer cette action.',
  [ApiErrorCode.PdfAlreadyIngested]: 'Ce relevé a déjà été ingéré. Si c\'est une mise à jour, supprime l\'ancien d\'abord.',
  [ApiErrorCode.PeriodOverlap]: 'La période de ce relevé chevauche un relevé déjà ingéré. Confirme le remplacement pour continuer.',
  [ApiErrorCode.LlmExtractionFailed]: 'L\'analyse automatique du relevé a échoué. Réessaie ou ajoute les transactions manuellement.',
  [ApiErrorCode.LlmUnavailable]: 'Le service de catégorisation est indisponible. Réessaie dans quelques instants.',
  [ApiErrorCode.ReconciliationFailed]: 'Les transactions extraites ne correspondent pas au solde du relevé. Une vérification manuelle est nécessaire.',
}

const FALLBACK_MESSAGE = 'Une erreur est survenue. Réessaie ou recharge la page.'

/**
 * Composable de mapping erreur API → message utilisateur FR.
 * Accepte n'importe quelle erreur Nuxt/Fetch, extrait `statusMessage`, retourne FR.
 */
export function useApiError() {
  function mapError(err: unknown): string {
    if (!err || typeof err !== 'object') return FALLBACK_MESSAGE

    // Nuxt/h3 expose statusMessage sur les FetchError
    const e = err as { statusMessage?: string; data?: { statusMessage?: string } }
    const code = e.statusMessage ?? e.data?.statusMessage
    if (!code) return FALLBACK_MESSAGE

    return FR_MESSAGES[code as ApiErrorCodeValue] ?? FALLBACK_MESSAGE
  }

  return { mapError }
}
```

### Endpoint éphémère pour validation (Task 5)

```ts
// server/api/_dev-error-test.get.ts — À SUPPRIMER après validation
import { z } from 'zod'
import { badRequest, domainError, notFound, validationError } from '~/server/utils/errors'
import { validateQuery } from '~/server/utils/validation'
import { ApiErrorCode } from '~/shared/schemas/api-errors'

const querySchema = z.object({
  type: z.enum(['validation', 'not_found', 'domain', 'success']),
})

export default defineEventHandler((event) => {
  const { type } = validateQuery(event, querySchema)

  if (type === 'validation') {
    // Force une erreur Zod en validant un sous-payload bogué
    const sub = z.object({ x: z.number() }).safeParse({ x: 'not a number' })
    if (!sub.success) throw validationError(sub.error)
  }
  if (type === 'not_found') throw notFound(ApiErrorCode.NotFound, { resource: 'demo' })
  if (type === 'domain') throw domainError(ApiErrorCode.ReconciliationFailed, { gapCents: 4700 })

  return { ok: true }
})
```

Test manuel (Task 5) :
```bash
curl -i 'http://localhost:3000/api/_dev-error-test?type=validation'
# Attendu: HTTP 422, statusMessage: "validation_failed", data: { fieldErrors, formErrors }

curl -i 'http://localhost:3000/api/_dev-error-test?type=domain'
# Attendu: HTTP 400, statusMessage: "reconciliation_failed", data: { gapCents: 4700 }

curl -i 'http://localhost:3000/api/_dev-error-test?type=not_found'
# Attendu: HTTP 404, statusMessage: "not_found"

curl -i 'http://localhost:3000/api/_dev-error-test?type=invalid'
# Attendu: HTTP 422, statusMessage: "validation_failed" (la query n'est pas dans l'enum)
```

⚠️ **Une fois ces 4 cas validés, supprime le fichier `_dev-error-test.get.ts`**.

### Anti-patterns à éviter

- ❌ Hardcoder un code d'erreur en string littéral dans un endpoint (`throw createError({ statusMessage: 'reconciliation_failed' })`) — passer par le helper et `ApiErrorCode.ReconciliationFailed`.
- ❌ Mapper les erreurs côté UI dans chaque composant — toujours via `useApiError.mapError`.
- ❌ Catch + retourner `null` pour cacher une erreur — laisser remonter (cf. CLAUDE.md règle d'or sur les erreurs).
- ❌ Ajouter du i18n complet (vue-i18n) à ce stade — overkill mono-user FR. Les messages sont en FR en dur dans `useApiError`. Si Vision = international plus tard, on injecte vue-i18n.

### Tests

Tu peux ajouter un test minimal pour `useApiError.mapError` (cas connus + fallback) dans `app/composables/useApiError.test.ts` — bonus rapide qui sécurise le mapping. Pas obligatoire mais recommandé.

### Project Structure Notes

Cette story crée :
- `shared/schemas/api-errors.ts`
- `server/utils/errors.ts`
- `server/utils/validation.ts`
- `app/composables/useApiError.ts`
- (éphémère) `server/api/_dev-error-test.get.ts` → supprimé en fin de story
- (optionnel) `app/composables/useApiError.test.ts`

### Definition of Done

- [ ] Codes d'erreur stables exposés et typés
- [ ] 5 helpers serveur (`badRequest`, `validationError`, `notFound`, `unauthorized`, `domainError`) opérationnels
- [ ] `validateBody` et `validateQuery` opérationnels
- [ ] `useApiError.mapError` couvre tous les codes définis + fallback
- [ ] Validation end-to-end via endpoint éphémère réussie sur les 4 cas
- [ ] Endpoint éphémère supprimé
- [ ] `yarn typecheck`, `yarn lint`, `yarn test:run` propres
- [ ] Commit unique

### References

- [Source: `CLAUDE.md`#Format API normalisé] — forme d'erreur
- [Source: `CLAUDE.md`#Règle d'or sur les erreurs] — pas de catch silencieux
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Core Architectural Decisions §D6, §D7] — décisions originales
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Implementation Patterns §Format Patterns] — format normalisé
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 1.6] — story originale et ACs

### Review Findings

- [x] [Review][Decision→Patch] **`validateBody` — comportement sur JSON malformé** (résolu : option a) — `readBody` lève une erreur h3 native (500 par défaut) avant `safeParse`. Choix : (a) wrapper `readBody` et convertir le parse error en `validationError` (422 `validation_failed`) pour homogénéiser ; (b) laisser remonter (les 4xx h3 par défaut sont acceptables) ; (c) renvoyer un nouveau code `invalid_json`. Touche `server/utils/validation.ts:10`.

- [x] [Review][Patch] **Bug priorité `statusMessage` dans `mapError`** [`app/composables/useApiError.ts:29`] — pour les `FetchError` Nuxt/ofetch, `err.statusMessage` contient le HTTP reason ("Bad Request") tandis que le code domaine est dans `err.data.statusMessage`. L'ordre actuel `e.statusMessage ?? e.data?.statusMessage` retourne donc "Bad Request" → fallback générique en prod. Inverser la priorité ET ajouter un test couvrant `{ statusMessage: 'Bad Request', data: { statusMessage: 'reconciliation_failed' } }`.
- [x] [Review][Patch] **Garde prototype-pollution dans `mapError`** [`app/composables/useApiError.ts:32`] — `FR_MESSAGES[code as ApiErrorCodeValue]` permet à `code = "__proto__"` ou `"constructor"` de retourner une méthode héritée d'`Object` au lieu du fallback. Utiliser `Object.hasOwn(FR_MESSAGES, code)` avant le lookup.
- [x] [Review][Patch] **Garde `typeof code === 'string'`** [`app/composables/useApiError.ts:29`] — si `statusMessage` est un `Symbol`, nombre ou objet (JSON anormal), le cast `as ApiErrorCodeValue` masque le bug. Ajouter `if (typeof code !== 'string') return FALLBACK_MESSAGE`.

- [x] [Review][Defer] **Vérifier en build prod que `data` n'est pas strippé par h3** [`server/utils/errors.ts`] — deferred, pre-existing — h3 peut redacter `data` selon `NODE_ENV` et version. À valider via test E2E quand un endpoint réel utilisera `validation_failed`.
- [x] [Review][Defer] **Compat `ZodError.flatten()` v3 vs v4** [`server/utils/errors.ts:24`] — deferred, pre-existing — Zod v4 (locked à `^4.4.1`) peut changer la forme `fieldErrors`/`formErrors`. À couvrir par un test de contrat quand le premier endpoint consommateur arrivera.
- [x] [Review][Defer] **Risque PII via `data` arbitraire** [`server/utils/errors.ts:9,31,53`] — deferred, pre-existing — `data: Record<string, unknown>` peut véhiculer du libellé bancaire / IBAN si un appelant l'oublie. Pas de risque actuel (aucun consumer). À adresser via convention/lint quand l'epic ingestion (2.x) arrivera.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context)

### Debug Log References

- Curl manuel des 4 cas de l'endpoint éphémère :
  - `?type=validation` → `HTTP 422 validation_failed` (data = `flatten()` du ZodError)
  - `?type=domain` → `HTTP 400 reconciliation_failed` (data = `{ gapCents: 4700 }`)
  - `?type=not_found` → `HTTP 404 not_found` (data = `{ resource: "demo" }`)
  - `?type=invalid` → `HTTP 422 validation_failed` (query enum hors valeurs autorisées)
- `yarn test:run` : 42 tests passent (dont 6 nouveaux pour `useApiError`).
- `yarn typecheck` : OK, pas d'erreur.

### Completion Notes List

- Helpers serveur (`badRequest`, `validationError`, `notFound`, `unauthorized`, `domainError`) implémentés selon snippets Dev Notes, chacun typé sur `ApiErrorCodeValue` pour empêcher les codes hors-liste à la compilation.
- `validateBody` / `validateQuery` lèvent `validationError(zodErr)` en cas d'échec Zod ; consommables en une ligne dans un endpoint.
- `useApiError.mapError` couvre les 8 codes définis dans `ApiErrorCode` + fallback FR ; extrait `statusMessage` depuis `err.statusMessage` ou `err.data.statusMessage` pour gérer la forme `FetchError`.
- Imports : utilisation de l'alias `~~/` (project root) plutôt que `~/` (résout vers `app/`) car `shared/` est à la racine. Le snippet d'origine utilisait `~/shared/...` ce qui n'aurait pas résolu correctement en Nuxt 4.
- Ajout des alias `~~`, `~`, `@@`, `@` à `vitest.config.ts` pour permettre aux tests co-localisés d'importer via les alias Nuxt sans dépendre de chemins relatifs.
- Ajout d'un override ESLint pour `**/composables/**/*.ts` autorisant `camelCase` (cf. CLAUDE.md §Conventions de nommage : `useCamelCase.ts` pour les composables) — l'override par défaut imposait `kebabCase` pour tous les `.ts`, ce qui contredisait la convention Nuxt et CLAUDE.md.
- Endpoint éphémère `server/api/_dev-error-test.get.ts` créé, validé, puis supprimé. Dossier `server/api/` également retiré (vide).
- Les erreurs de lint pré-existantes (`nuxt.config.ts` ordre des clés, fichiers de la story 1.7) ne sont pas dans le périmètre de cette story.

### File List

**Créés :**
- `shared/schemas/api-errors.ts`
- `server/utils/errors.ts`
- `server/utils/validation.ts`
- `app/composables/useApiError.ts`
- `app/composables/useApiError.test.ts`

**Modifiés :**
- `eslint.config.mjs` — override `unicorn/filename-case` à `camelCase` pour `**/composables/**/*.ts`
- `vitest.config.ts` — ajout des alias `~~`, `~`, `@@`, `@` pour la résolution des imports en tests

**Créés puis supprimés (éphémères, conformes au plan de la story) :**
- `server/api/_dev-error-test.get.ts`
