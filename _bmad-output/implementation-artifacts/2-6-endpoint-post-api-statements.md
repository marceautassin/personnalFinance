# Story 2.6: Endpoint `POST /api/statements` (orchestration du pipeline complet)

Status: ready-for-dev

## Story

As a user,
I want to drop a PDF and get my categorized transactions persisted in a single atomic operation,
so that I can start using the app on real data within seconds.

## Acceptance Criteria

1. **Given** un endpoint `server/api/statements/index.post.ts` qui accepte un `multipart/form-data` avec un champ `file` (PDF, max 10 MB),
   **When** un PDF est uploadé,
   **Then** le pipeline exécute en séquence :
   1. Lecture du buffer + validation (`Content-Type`, taille)
   2. `sha256(buffer)` (Story 2.3)
   3. Vérification dédup hash → `domainError(ApiErrorCode.PdfAlreadyIngested, { hash })` si déjà présent en base
   4. `extractStatement(buffer)` (Story 2.2) → `RawStatement`
   5. Vérification chevauchement de période avec un statement existant → `domainError(ApiErrorCode.PeriodOverlap, { existingHash, ... })` *si pas de header `X-Confirm-Replace: true`*
   6. `savePdfByHash` (Story 2.3) → écrit `_data/raw/{hash}.pdf`
   7. `categorizeStatement` (Story 2.4) → `ExtractedTransaction[]`
   8. Fallback période G3 : si `periodStart`/`periodEnd` étaient `null` après extraction, les déduire des dates min/max des transactions extraites
   9. `reconcile(...)` (Story 2.5) → `{ isBalanced, gapCents }`
   10. Insertion atomique dans une transaction Drizzle (`db.transaction`) : INSERT `bank_statements` + `transactions[]` + (si chevauchement confirmé) DELETE des statements précédents de la période
   11. Retour `{ hash, periodStart, periodEnd, transactionCount, isBalanced, gapCents }`

2. **Given** une réingestion avec `X-Confirm-Replace: true`,
   **When** le hash diffère mais la période chevauche un statement existant,
   **Then** le statement précédent dont la période chevauche est supprimé (CASCADE → ses transactions le sont aussi), et le nouveau est inséré.

3. **Given** une erreur LLM (`LlmExtractionError`, `LlmUnavailableError`),
   **When** elle remonte du service,
   **Then** l'endpoint la wrap avec le code approprié (`ApiErrorCode.LlmExtractionFailed` ou `LlmUnavailable`), retourne 502/503 selon le cas, et **ne persiste rien** (pas de PDF orphelin, pas de statement partiel).

4. **Given** une erreur d'extraction PDF (Story 2.2 jette),
   **When** elle remonte,
   **Then** l'endpoint la wrap en `domainError` avec un code `pdf_parse_failed` (à ajouter dans `ApiErrorCode` — Dev Notes), 400.

5. **Given** un PDF dont l'extraction échoue à mi-pipeline (LLM down, par ex.),
   **When** l'erreur survient,
   **Then** le PDF déjà sauvegardé sur disque (étape 6) est **supprimé** dans le catch (rollback filesystem), pour rester cohérent avec le rollback DB de la transaction Drizzle.

6. **Given** un test E2E Playwright `tests/e2e/ingestion.spec.ts`,
   **When** il drope un PDF de fixture sur l'UI (Story 2.9 fournira l'UI — ce test peut être écrit ici en stub puis activé en 2.9),
   **Then** il vérifie qu'après ingestion la liste des transactions du mois ingéré est consultable et le compteur est correct.

## Tasks / Subtasks

- [ ] **Task 1 — Étendre `ApiErrorCode`** (AC: #4)
  - [ ] Ajouter `PdfParseFailed: 'pdf_parse_failed'` dans `shared/schemas/api-errors.ts`
  - [ ] Ajouter le mapping FR dans `app/composables/useApiError.ts` ("L'analyse du PDF a échoué. Vérifie qu'il s'agit bien d'un relevé Boursorama valide.")

- [ ] **Task 2 — Créer le schéma de réponse + validation** (AC: #1)
  - [ ] Créer `shared/schemas/ingestion-result.schema.ts` avec `IngestionResultSchema`

- [ ] **Task 3 — Implémenter l'endpoint** (AC: #1, #2, #3, #4, #5)
  - [ ] Créer `server/api/statements/index.post.ts` selon le snippet Dev Notes
  - [ ] Utiliser `db.transaction(async (tx) => { ... })` pour l'atomicité DB
  - [ ] Wrap try/catch autour des appels LLM/extraction pour rollback FS si ils ont eu lieu après `savePdfByHash`

- [ ] **Task 4 — Tests d'intégration** (AC: #1, #2, #3)
  - [ ] Créer `server/api/statements/index.post.test.ts` (test d'intégration avec DB en mémoire ou tmpdir)
  - [ ] Mocker `extractStatement` et `categorizeStatement` pour ne pas faire d'appels réels
  - [ ] Cas heureux : réponse 200 avec hash, transactionCount, isBalanced
  - [ ] Cas dédup : 2e POST avec même PDF → `pdf_already_ingested`
  - [ ] Cas chevauchement sans header → `period_overlap`
  - [ ] Cas chevauchement avec `X-Confirm-Replace: true` → ancien supprimé, nouveau inséré
  - [ ] Cas LLM down → 503 + pas de persistance + pas de PDF orphelin sur disque

- [ ] **Task 5 — Test E2E (stub)** (AC: #6)
  - [ ] Créer `tests/e2e/ingestion.spec.ts` comme stub `test.skip(...)` qui sera activé en Story 2.9

- [ ] **Task 6 — Sanity check final**
  - [ ] `yarn typecheck`, `yarn lint`, `yarn test:run` propres
  - [ ] Commit unique

## Dev Notes

### Snippet `shared/schemas/ingestion-result.schema.ts` (Task 2)

```ts
import { z } from 'zod'

export const IngestionResultSchema = z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  transactionCount: z.number().int().nonnegative(),
  isBalanced: z.boolean(),
  gapCents: z.number().int(),
})

export type IngestionResult = z.infer<typeof IngestionResultSchema>
```

### Snippet `server/api/statements/index.post.ts` (Task 3)

```ts
import { defineEventHandler, readMultipartFormData, getHeader } from 'h3'
import { eq, and, lte, gte, or } from 'drizzle-orm'
import { db } from '~/server/db/client'
import { bankStatements, transactions, categoryDefinitions } from '~/server/db/schema'
import { extractStatement } from '~/server/services/pdf-extractor'
import {
  categorizeStatement,
  LlmExtractionError,
  LlmUnavailableError,
} from '~/server/services/llm-categorizer'
import { reconcile } from '~/server/services/reconciler'
import { sha256 } from '~/server/utils/hash'
import { savePdfByHash, deletePdfByHash } from '~/server/utils/file-storage'
import { domainError } from '~/server/utils/errors'
import { ApiErrorCode } from '~/shared/schemas/api-errors'
import { type Cents, cents } from '~/shared/types/money'
import type { ExtractedTransaction } from '~/shared/schemas/transaction.schema'
import { DEFAULT_CATEGORIES } from '~/shared/constants/default-categories'

const MAX_PDF_BYTES = 10 * 1024 * 1024 // 10 MB

export default defineEventHandler(async (event) => {
  // 1. Read multipart
  const form = await readMultipartFormData(event)
  const filePart = form?.find((p) => p.name === 'file')
  if (!filePart || !filePart.data) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'missing file' }, 400)
  }
  if (filePart.data.length > MAX_PDF_BYTES) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'file too large', maxBytes: MAX_PDF_BYTES }, 400)
  }
  const buf = Buffer.from(filePart.data)

  // 2. Hash
  const hash = sha256(buf)

  // 3. Dédup
  const existing = await db.select({ hash: bankStatements.hashSha256 })
    .from(bankStatements)
    .where(eq(bankStatements.hashSha256, hash))
    .limit(1)
  if (existing.length > 0) {
    throw domainError(ApiErrorCode.PdfAlreadyIngested, { hash })
  }

  // 4. Extraction PDF (texte + métadonnées)
  let raw: Awaited<ReturnType<typeof extractStatement>>
  try {
    raw = await extractStatement(buf)
  } catch (err) {
    throw domainError(
      ApiErrorCode.PdfParseFailed,
      { reason: err instanceof Error ? err.message : String(err) },
      400,
    )
  }

  // 5. Catégorisation LLM (avant la dédup période, pour avoir les transactions et fallback période)
  // Note : on accepte de payer un appel LLM avant le check overlap. Justification : sans les transactions
  // on ne peut pas faire le fallback G3 si la période n'est pas dans le texte.
  // Si tu veux optimiser, déplace cette étape APRÈS la résolution de période (mais alors le fallback
  // basé sur dates de transactions devient impossible — accept tradeoff).
  let extracted: ExtractedTransaction[]
  try {
    // Charger la liste à jour des catégories (au cas où l'utilisateur a ajouté des cat. perso plus tard)
    // V1 : on utilise DEFAULT_CATEGORIES (cat. perso = Vision/Growth)
    extracted = await categorizeStatement(raw.rawText, DEFAULT_CATEGORIES)
  } catch (err) {
    if (err instanceof LlmUnavailableError) {
      throw domainError(ApiErrorCode.LlmUnavailable, {}, 503)
    }
    if (err instanceof LlmExtractionError) {
      throw domainError(ApiErrorCode.LlmExtractionFailed, { reason: err.message })
    }
    throw err
  }

  // 6. Résolution période avec fallback G3
  const periodStart = raw.periodStart ?? minDate(extracted.map((t) => t.transactionDate))
  const periodEnd = raw.periodEnd ?? maxDate(extracted.map((t) => t.transactionDate))
  if (!periodStart || !periodEnd) {
    throw domainError(ApiErrorCode.PdfParseFailed, { reason: 'cannot determine period — no period in text and no transactions extracted' }, 400)
  }

  // Soldes : si manquants, on ne peut pas réconcilier. On peut soit refuser, soit accepter avec
  // reliability='unreliable' d'office. V1 : on refuse pour éviter de polluer le forecast.
  if (raw.openingBalanceCents === null || raw.closingBalanceCents === null) {
    throw domainError(ApiErrorCode.PdfParseFailed, { reason: 'opening or closing balance not found in PDF text' }, 400)
  }

  // 7. Détection chevauchement période
  const overlapping = await db.select({ hash: bankStatements.hashSha256, periodStart: bankStatements.periodStart, periodEnd: bankStatements.periodEnd })
    .from(bankStatements)
    .where(
      and(
        // intervals overlap if start1 <= end2 AND start2 <= end1
        lte(bankStatements.periodStart, periodEnd),
        gte(bankStatements.periodEnd, periodStart),
      ),
    )

  if (overlapping.length > 0) {
    const confirmReplace = getHeader(event, 'x-confirm-replace') === 'true'
    if (!confirmReplace) {
      throw domainError(ApiErrorCode.PeriodOverlap, {
        existingHashes: overlapping.map((o) => o.hash),
        existingPeriods: overlapping.map((o) => ({ start: o.periodStart, end: o.periodEnd })),
        newPeriod: { start: periodStart, end: periodEnd },
      }, 409)
    }
  }

  // 8. Sauvegarde PDF sur disque
  await savePdfByHash(buf, hash)

  // 9. Réconciliation
  const txAmounts: Array<{ amountCents: Cents }> = extracted.map((t) => ({ amountCents: cents(t.amountCents) }))
  const reconciliation = reconcile({
    openingCents: cents(raw.openingBalanceCents),
    closingCents: cents(raw.closingBalanceCents),
    transactions: txAmounts,
  })

  // 10. Persistance atomique (DB transaction). Si elle échoue, le PDF disque est rollback dans le catch.
  try {
    await db.transaction(async (tx) => {
      // Si chevauchement confirmé, supprimer les anciens (CASCADE supprime leurs transactions)
      if (overlapping.length > 0) {
        for (const o of overlapping) {
          await tx.delete(bankStatements).where(eq(bankStatements.hashSha256, o.hash))
          await deletePdfByHash(o.hash) // FS — non transactionnel mais on accepte (cf. Note ci-dessous)
        }
      }

      // INSERT statement
      await tx.insert(bankStatements).values({
        hashSha256: hash,
        periodStart,
        periodEnd,
        openingBalanceCents: raw.openingBalanceCents!,
        closingBalanceCents: raw.closingBalanceCents!,
        reliability: 'reliable', // si !isBalanced et que l'utilisateur n'a pas résolu, le passage en 'unreliable' est fait en Story 3.x via accept_gap
      })

      // INSERT transactions
      if (extracted.length > 0) {
        await tx.insert(transactions).values(
          extracted.map((t) => ({
            statementHash: hash,
            transactionDate: t.transactionDate,
            label: t.label,
            amountCents: t.amountCents,
            categoryCode: t.categoryCode,
            isManual: false,
            isDebtRepayment: false,
            debtId: null,
          })),
        )
      }
    })
  } catch (err) {
    // Rollback FS : supprimer le PDF sauvegardé pour ne pas laisser d'orphelin
    await deletePdfByHash(hash).catch(() => { /* swallow rollback errors */ })
    throw err
  }

  // 11. Réponse
  return {
    hash,
    periodStart,
    periodEnd,
    transactionCount: extracted.length,
    isBalanced: reconciliation.isBalanced,
    gapCents: reconciliation.gapCents,
  }
})

function minDate(dates: string[]): string | null {
  if (dates.length === 0) return null
  return dates.reduce((a, b) => (a < b ? a : b))
}

function maxDate(dates: string[]): string | null {
  if (dates.length === 0) return null
  return dates.reduce((a, b) => (a > b ? a : b))
}
```

### Note sur l'atomicité FS + DB

Dans cette V1, on accepte que le rollback FS (suppression du PDF) ne soit pas dans la même transaction que la DB. Le risque : si le `db.transaction()` échoue après que les anciens PDFs aient été supprimés du disque (lignes `deletePdfByHash(o.hash)` dans le bloc remplacement), on perd des données. Mitigation : la DB est rollback donc les anciens statements sont restaurés en base, mais leurs PDFs sont perdus. La base étant reconstructible depuis les PDFs (NFR11) — sauf que justement, les PDFs sont partis...

**Décision V1** : on accepte ce risque (très faible : il faudrait que la transaction Drizzle échoue après les inserts). Si tu veux être plus robuste, soit (a) supprimer les PDFs APRÈS le commit DB (mais alors on a une période où le PDF existe sans son statement DB), soit (b) déplacer les anciens vers un dossier de quarantaine pour suppression différée. **À documenter dans Completion Notes** et à reprendre en Growth si besoin.

### Compléments d'erreurs

Codes à ajouter dans `shared/schemas/api-errors.ts` (Story 1.6) :
```ts
PdfParseFailed: 'pdf_parse_failed',
```

Et dans `useApiError.ts` :
```ts
[ApiErrorCode.PdfParseFailed]: 'L\'analyse du PDF a échoué. Vérifie qu\'il s\'agit bien d\'un relevé Boursorama valide.',
```

### Tests d'intégration (Task 4)

Pour tester l'endpoint sans dépendre de Nuxt en runtime, deux options :
- **Option A** (recommandée) : tester via `nuxt test` ou `@nuxt/test-utils` avec un Nitro server en test.
- **Option B** : extraire la logique dans une fonction `processStatement(buf, headers, db, fs)` testable en pur, et garder l'endpoint comme un thin wrapper. Plus simple à tester mais ajoute une couche.

Recommandation V1 : **Option B**. Refactor mineur : extraire la logique de `index.post.ts` dans `server/services/statement-ingestion-orchestrator.ts` (testable), garder l'endpoint comme handler HTTP fin. Si tu choisis cette voie, ajuste les paths dans Tasks 3-4.

### Anti-patterns à éviter

- ❌ Sauvegarder le PDF AVANT de catégoriser → si LLM échoue, on a un PDF orphelin. Ordre : extraction → catégorisation → sauvegarde → DB transaction. Ce snippet le respecte.
- ❌ Ignorer `X-Confirm-Replace: true` et toujours throw `period_overlap` → l'utilisateur doit pouvoir confirmer.
- ❌ Faire des INSERT individuels dans une boucle non-transactionnelle — toujours `db.transaction()`.
- ❌ Logger le contenu du PDF ou le rawText complet — logger uniquement hash, transactionCount, durée.
- ❌ Retourner les transactions complètes dans la réponse — V1 retourne juste les méta (hash, count, balance). Le client refetch via `GET /api/transactions?month=...` (Story 2.7).

### Project Structure Notes

Cette story crée :
- `server/api/statements/index.post.ts`
- `server/api/statements/index.post.test.ts` (intégration)
- `shared/schemas/ingestion-result.schema.ts`
- `tests/e2e/ingestion.spec.ts` (stub)
- Modification `shared/schemas/api-errors.ts` (ajout `PdfParseFailed`)
- Modification `app/composables/useApiError.ts` (mapping FR)

Si Option B retenue : ajouter aussi `server/services/statement-ingestion-orchestrator.ts` + son test.

### Definition of Done

- [ ] Endpoint POST /api/statements opérationnel sur les 5 cas d'AC
- [ ] Atomicité DB via `db.transaction`
- [ ] Rollback FS si erreur après `savePdfByHash`
- [ ] Code `pdf_parse_failed` ajouté + mapping FR
- [ ] Tests d'intégration (mockés sur extract/categorize) passent
- [ ] Stub E2E créé pour activation en Story 2.9
- [ ] `yarn typecheck`, `yarn lint`, `yarn test:run` propres
- [ ] Commit unique

### References

- [Source: `CLAUDE.md`#Format API normalisé] — forme erreur
- [Source: `CLAUDE.md`#Règle d'or sur les erreurs] — pas de catch silencieux
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Data Flow d'une ingestion PDF] — pipeline complet
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Core Architectural Decisions §D5] — REST + multipart
- [Source: `_bmad-output/planning-artifacts/prd.md`#FR1-FR12] — exigences fonctionnelles
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 2.6] — story originale
- [Previous stories: `1-3` Cents, `1-4` DB client, `1-6` errors/validation, `2-1` schemas, `2-2` pdf-extractor, `2-3` hash/period/file-storage, `2-4` llm-categorizer, `2-5` reconciler]

## Dev Agent Record

### Agent Model Used

_(à remplir)_

### Debug Log References

_(à remplir — choix Option A vs B testing, comportement Drizzle transaction sur SQLite)_

### Completion Notes List

_(à remplir — décisions architecturales prises, observations sur la durée totale du pipeline (vs NFR1 < 30s))_

### File List

_(à remplir)_
