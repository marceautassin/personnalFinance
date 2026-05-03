/**
 * statement-ingestion-orchestrator — pipeline POST /api/statements (Story 2.6).
 *
 * Orchestration pure (logique extraite du handler HTTP pour testabilité).
 * Le handler `server/api/statements/index.post.ts` reste un thin wrapper qui parse
 * le multipart et délègue ici.
 *
 * Ordre des étapes (cf. AC#1) :
 *   1. sha256(pdfBuffer)
 *   2. dédup hash en base
 *   3. extractStatement() → texte + métadonnées
 *   4. categorizeStatement() → ExtractedTransaction[]
 *   5. fallback période G3 si non détectée
 *   6. validation soldes obligatoires
 *   7. détection chevauchement période
 *   8. savePdfByHash (avant la tx DB pour avoir un point de rollback explicite)
 *   9. reconcile()
 *  10. tx Drizzle synchrone : DELETE chevauchements + INSERT statement + INSERT transactions
 *  11. cleanup FS post-commit (PDFs des statements remplacés)
 *
 * Sur erreur après l'étape 8 : `deletePdfByHash(hash)` rollback FS.
 * Sur erreur avant l'étape 8 : rien à rollback (pas de side-effect persistant encore).
 */
import { eq, and, lte, gte } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { bankStatements, transactions } from '~~/server/db/schema'
import { extractStatement } from '~~/server/services/pdf-extractor'
import {
  categorizeStatement,
  LlmExtractionError,
  LlmUnavailableError,
} from '~~/server/services/llm-categorizer'
import { reconcile } from '~~/server/services/reconciler'
import { sha256 } from '~~/server/utils/hash'
import { savePdfByHash, deletePdfByHash } from '~~/server/utils/file-storage'
import { domainError } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { cents } from '~~/shared/types/money'
import { DEFAULT_CATEGORIES } from '~~/shared/constants/default-categories'
import type { IngestionResult } from '~~/shared/schemas/ingestion-result.schema'

export interface IngestStatementArgs {
  pdfBuffer: Buffer
  confirmReplace: boolean
}

export async function ingestStatement(args: IngestStatementArgs): Promise<IngestionResult> {
  const { pdfBuffer, confirmReplace } = args
  const t0 = Date.now()
  const step = (name: string, payload: Record<string, unknown> = {}) => {
    console.warn(`[ingest] ${name}`, { elapsedMs: Date.now() - t0, ...payload })
  }

  step('start', { pdfBytes: pdfBuffer.length, confirmReplace })

  // 1. Hash
  const hash = sha256(pdfBuffer)
  step('hash', { hash })

  // 2. Dédup par hash
  const existing = await db
    .select({ hash: bankStatements.hashSha256 })
    .from(bankStatements)
    .where(eq(bankStatements.hashSha256, hash))
    .limit(1)
  if (existing.length > 0) {
    throw domainError(ApiErrorCode.PdfAlreadyIngested, { hash })
  }
  step('dedup-check', { duplicate: false })

  // 3. Extraction PDF
  let raw: Awaited<ReturnType<typeof extractStatement>>
  try {
    raw = await extractStatement(pdfBuffer)
  }
  catch (err) {
    throw domainError(
      ApiErrorCode.PdfParseFailed,
      { reason: err instanceof Error ? err.message : String(err) },
      400,
    )
  }
  step('pdf-extracted', {
    rawTextChars: raw.rawText.length,
    periodStart: raw.periodStart,
    periodEnd: raw.periodEnd,
    openingBalanceCents: raw.openingBalanceCents,
    closingBalanceCents: raw.closingBalanceCents,
  })

  // 4. Catégorisation LLM (avant résolution période, pour permettre fallback G3)
  let extracted: Awaited<ReturnType<typeof categorizeStatement>>
  try {
    extracted = await categorizeStatement(raw.rawText, DEFAULT_CATEGORIES)
  }
  catch (err) {
    if (err instanceof LlmUnavailableError) {
      throw domainError(ApiErrorCode.LlmUnavailable, {}, 503)
    }
    if (err instanceof LlmExtractionError) {
      throw domainError(ApiErrorCode.LlmExtractionFailed, { reason: err.message }, 502)
    }
    throw err
  }
  const uncategorizedCount = extracted.filter(t => !t.categoryCode).length
  step('llm-categorized', {
    transactionCount: extracted.length,
    categorizedCount: extracted.length - uncategorizedCount,
    uncategorizedCount,
  })

  // 5. Résolution période avec fallback G3 (dates min/max des transactions)
  const periodStart = raw.periodStart ?? minDate(extracted.map(t => t.transactionDate))
  const periodEnd = raw.periodEnd ?? maxDate(extracted.map(t => t.transactionDate))
  if (!periodStart || !periodEnd) {
    throw domainError(
      ApiErrorCode.PdfParseFailed,
      { reason: 'cannot determine period (no period in text and no transactions)' },
      400,
    )
  }
  if (periodStart > periodEnd) {
    throw domainError(
      ApiErrorCode.PdfParseFailed,
      { reason: 'inverted period (start > end)', periodStart, periodEnd },
      400,
    )
  }

  // 6. Soldes obligatoires (sans eux, pas de réconciliation possible — refus V1)
  if (raw.openingBalanceCents === null || raw.closingBalanceCents === null) {
    throw domainError(
      ApiErrorCode.PdfParseFailed,
      { reason: 'opening or closing balance not found in PDF text' },
      400,
    )
  }

  // 7. Détection chevauchement période
  const overlapping = await db
    .select({
      hash: bankStatements.hashSha256,
      periodStart: bankStatements.periodStart,
      periodEnd: bankStatements.periodEnd,
    })
    .from(bankStatements)
    .where(and(
      lte(bankStatements.periodStart, periodEnd),
      gte(bankStatements.periodEnd, periodStart),
    ))

  step('period-resolved', {
    periodStart,
    periodEnd,
    fallbackUsed: raw.periodStart === null || raw.periodEnd === null,
    overlappingCount: overlapping.length,
  })

  if (overlapping.length > 0 && !confirmReplace) {
    throw domainError(ApiErrorCode.PeriodOverlap, {
      existingHashes: overlapping.map(o => o.hash),
      existingPeriods: overlapping.map(o => ({ start: o.periodStart, end: o.periodEnd })),
      newPeriod: { start: periodStart, end: periodEnd },
    }, 409)
  }

  // 8. Sauvegarde PDF sur disque (point de rollback FS si la suite échoue)
  await savePdfByHash(pdfBuffer, hash)
  step('pdf-saved', { hash })

  // 9. Réconciliation (les amountCents extraits sont déjà en integer cents — cast brand-only)
  const reconciliation = reconcile({
    openingCents: raw.openingBalanceCents,
    closingCents: raw.closingBalanceCents,
    transactions: extracted.map(t => ({ amountCents: cents(t.amountCents) })),
  })
  step('reconciled', {
    isBalanced: reconciliation.isBalanced,
    gapCents: reconciliation.gapCents,
  })

  // 10. Persistance atomique. better-sqlite3 = transactions SYNCHRONES : ne pas rendre
  // le callback async (sinon le COMMIT se ferait avant la résolution des promesses).
  const replacedHashes = overlapping.map(o => o.hash)
  try {
    db.transaction((tx) => {
      for (const oldHash of replacedHashes) {
        tx.delete(bankStatements).where(eq(bankStatements.hashSha256, oldHash)).run()
      }
      tx.insert(bankStatements).values({
        hashSha256: hash,
        periodStart,
        periodEnd,
        openingBalanceCents: raw.openingBalanceCents!,
        closingBalanceCents: raw.closingBalanceCents!,
        reliability: 'reliable',
      }).run()
      if (extracted.length > 0) {
        tx.insert(transactions).values(extracted.map(t => ({
          statementHash: hash,
          transactionDate: t.transactionDate,
          label: t.label,
          amountCents: t.amountCents,
          categoryCode: t.categoryCode,
        }))).run()
      }
    })
  }
  catch (err) {
    // Rollback FS : la tx DB a échoué, on supprime le PDF sauvegardé pour éviter
    // un orphelin filesystem.
    await deletePdfByHash(hash).catch((cleanupErr) => {
      console.warn('[ingestStatement] FS rollback failed — orphan PDF possible', { hash, cleanupErr })
    })
    throw err
  }
  step('db-committed', {
    insertedTransactions: extracted.length,
    replacedStatements: replacedHashes.length,
  })

  // 11. Cleanup FS post-commit : suppression des PDFs des statements remplacés.
  // Effectué APRÈS le commit DB (et pas dans la transaction) car la suppression FS
  // n'est pas transactionnelle ; si elle échoue, l'état DB reste cohérent et on
  // accepte un PDF orphelin reconstructible à la main (NFR11 vs simplicité V1).
  for (const oldHash of replacedHashes) {
    await deletePdfByHash(oldHash).catch((cleanupErr) => {
      console.warn('[ingestStatement] post-commit cleanup failed — orphan PDF', { oldHash, cleanupErr })
    })
  }

  step('done', {
    hash,
    transactionCount: extracted.length,
    gapCents: reconciliation.gapCents,
  })

  return {
    hash,
    periodStart,
    periodEnd,
    transactionCount: extracted.length,
    isBalanced: reconciliation.isBalanced,
    gapCents: reconciliation.gapCents,
  }
}

function minDate(dates: string[]): string | null {
  if (dates.length === 0) return null
  return dates.reduce((a, b) => (a < b ? a : b))
}

function maxDate(dates: string[]): string | null {
  if (dates.length === 0) return null
  return dates.reduce((a, b) => (a > b ? a : b))
}
