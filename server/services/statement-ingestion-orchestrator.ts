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
 *   3bis. validation soldes obligatoires (AVANT l'appel payant — story 17.5)
 *   4. categorizeStatement() → ExtractedTransaction[]
 *   5. fallback période G3 si non détectée
 *   6. bornage des dates à la période (story 17.4)
 *   7. détection chevauchement période
 *   8. savePdfByHash (avant la tx DB pour avoir un point de rollback explicite)
 *   9. reconcile()
 *  10. tx Drizzle synchrone : DELETE chevauchements + INSERT statement + INSERT transactions
 *  11. cleanup FS post-commit (PDFs des statements remplacés)
 *
 * Sur erreur après l'étape 8 : `deletePdfByHash(hash)` rollback FS.
 * Sur erreur avant l'étape 8 : rien à rollback (pas de side-effect persistant encore).
 */
import { ne, eq, and, lte, gte, asc } from 'drizzle-orm'
import { JOINT_REIMBURSEMENT_ITEM_CODE } from '~~/shared/constants/default-referential'
import { db } from '~~/server/db/client'
import { bankStatements, transactions, categoryItems, categoryGroups, classificationRules } from '~~/server/db/schema'
import { applyRules } from '~~/server/services/rule-matcher'
import { extractStatement } from '~~/server/services/pdf-extractor'
import { BankMismatchError } from '~~/server/services/bank-formats/types'
import {
  categorizeStatement,
  LlmExtractionError,
  LlmUnavailableError,
  LlmConfigError,
} from '~~/server/services/llm-categorizer'
import { reconcile } from '~~/server/services/reconciler'
import { sha256 } from '~~/server/utils/hash'
import { savePdfByHash, deletePdfByHash } from '~~/server/utils/file-storage'
import { domainError } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { cents } from '~~/shared/types/money'
import type { Bank } from '~~/shared/types/bank'
import type { IngestionResult } from '~~/shared/schemas/ingestion-result.schema'

export interface IngestStatementArgs {
  pdfBuffer: Buffer
  confirmReplace: boolean
  /**
   * Banque du relevé (D41). Sans persistance à ce stade — `bank_statements.bank` arrive avec
   * la story 27.1 — et sans préremplissage depuis le profil (27.3, hors périmètre 28.1) :
   * défaut fixe à `'boursorama'` tant que l'appelant ne le précise pas.
   */
  bank?: Bank
}

export async function ingestStatement(args: IngestStatementArgs): Promise<IngestionResult> {
  const { pdfBuffer, confirmReplace, bank = 'boursorama' } = args
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
    raw = await extractStatement(pdfBuffer, bank)
  }
  catch (err) {
    // Refus croisé (FR78, AR38) : code stable dédié, distinct d'un simple échec de parsing.
    // Doit être vérifié AVANT le catch générique — `BankMismatchError` est une `Error`.
    if (err instanceof BankMismatchError) {
      throw domainError(
        ApiErrorCode.BankMismatch,
        { expected: err.expected, detected: err.detected },
        400,
      )
    }
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

  // 3bis. Soldes obligatoires — vérifiés AVANT l'appel au fournisseur (story 17.5).
  //
  // Ils étaient contrôlés après l'extraction LLM : un relevé sans solde lisible faisait donc
  // payer un appel voué au rejet. Ce contrôle ne dépend que du texte, il n'a rien à faire
  // derrière l'appel. Sans solde, pas de réconciliation possible — refus V1.
  if (raw.openingBalanceCents === null || raw.closingBalanceCents === null) {
    throw domainError(
      ApiErrorCode.PdfParseFailed,
      { reason: 'opening or closing balance not found in PDF text' },
      400,
    )
  }

  // 4. Catégorisation LLM (avant résolution période, pour permettre fallback G3)
  // Story 5.6 : la taxonomie est lue depuis la DB (catégories utilisateur incluses), plus
  // depuis DEFAULT_REFERENTIAL (réservé au seed bootstrap).
  //
  // `ORDER BY code` : sans tri, l'ordre des catégories dans le prompt dépend du rowid, donc
  // de l'historique de création/suppression — la catégorisation n'était pas reproductible
  // d'une base à l'autre (revue 2026-08-04).
  // Les postes portent leur rubrique et leur nature : sans la rubrique, le modèle ne peut pas
  // trancher entre `alimentation-restaurant` et `voyages-restaurant` ; sans la nature, rien ne
  // lui dit qu'un virement vers un livret n'est pas une dépense (D17).
  //
  // `ORDER BY code` : le code étant préfixé par sa rubrique (AR4), ce tri groupe naturellement
  // les postes par rubrique ET rend l'ordre du prompt indépendant de l'historique de création
  // en base — sans quoi la catégorisation n'était pas reproductible (revue 2026-08-04).
  const availableCategories = (await db
    .select({
      code: categoryItems.code,
      label: categoryItems.label,
      nature: categoryItems.nature,
      groupCode: categoryGroups.code,
      groupLabel: categoryGroups.label,
    })
    .from(categoryItems)
    .innerJoin(categoryGroups, eq(categoryItems.groupCode, categoryGroups.code))
    // Le poste « Part remboursée » du compte joint est CALCULÉ : il n'est alimenté que par la
    // coupe du moteur, jamais par une ligne de relevé. Le proposer au modèle l'inviterait à y
    // ranger de vraies transactions, qui compteraient alors en plus de la moitié coupée
    // (story 21.1, revue du 2026-09-08).
    .where(ne(categoryItems.code, JOINT_REIMBURSEMENT_ITEM_CODE))
    .orderBy(categoryItems.code))
    // Les libellés sont du texte libre saisi par l'utilisateur et sont concaténés dans le
    // message envoyé au LLM : on neutralise sauts de ligne et caractères de contrôle, qui
    // pourraient disloquer la structure du prompt.
    // Repli sur le `code` si le nettoyage ne laisse rien : `CategoryLabelSchema` accepte
    // `"\u0001"` (`.trim().min(1)` ne voit pas les caractères de contrôle), qui se réduirait
    // ici à une chaîne vide envoyée telle quelle au LLM (revue 2026-09-04).
    .map((c) => {
      const clean = (value: string) => {
        const cleaned = value.replace(/[\p{Cc}\p{Cf}]+/gu, ' ').trim()
        return cleaned.length > 0 ? cleaned : null
      }
      return {
        ...c,
        label: clean(c.label) ?? c.code,
        groupLabel: clean(c.groupLabel) ?? c.groupCode,
      }
    })

  // `DEFAULT_REFERENTIAL` garantit une liste non vide ; la lecture DB, non. Sans garde,
  // une base non initialisée partait avec une taxonomie vide et remontait un
  // `llm_extraction_failed` (« réessaie »), alors que le retry est vain.
  if (availableCategories.length === 0) {
    throw domainError(ApiErrorCode.CategoriesNotSeeded, { table: 'category_items' }, 500)
  }

  let extracted: Awaited<ReturnType<typeof categorizeStatement>>
  try {
    extracted = await categorizeStatement(raw.rawText, availableCategories, bank)
  }
  catch (err) {
    // `LlmConfigError` étend `LlmUnavailableError` : le test le plus spécifique d'abord.
    // Sans cet ordre, une clé invalide sortait en « fournisseur indisponible » et l'UI
    // proposait un bouton « Réessayer » sur un problème que retenter ne résout pas.
    if (err instanceof LlmConfigError) {
      throw domainError(ApiErrorCode.LlmConfigError, {}, 503)
    }
    if (err instanceof LlmUnavailableError) {
      throw domainError(ApiErrorCode.LlmUnavailable, {}, 503)
    }
    if (err instanceof LlmExtractionError) {
      throw domainError(ApiErrorCode.LlmExtractionFailed, { reason: err.message }, 502)
    }
    throw err
  }
  const uncategorizedCount = extracted.filter(t => !t.categoryItemCode).length
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

  // 6. Dates bornées à la période du relevé (story 17.4).
  //
  // Rien ne contraignait les dates renvoyées par le modèle. Une ligne du relevé de mars 2026
  // datée `2025-03-05` serait insérée telle quelle : la réconciliation du relevé resterait
  // juste, mais la ligne polluerait l'analyse de mars 2025 — et la fiabilité, calculée par
  // période de relevé, ne signalerait rien. On refuse plutôt que de corriger : rectifier une
  // date serait inventer une donnée, ce que NFR15 interdit.
  //
  // Quand la période vient du repli G3, elle est l'enveloppe des dates extraites : la garde
  // ne peut alors rien rejeter, par construction.
  const outOfPeriod = extracted.filter(t => t.transactionDate < periodStart || t.transactionDate > periodEnd)
  if (outOfPeriod.length > 0) {
    throw domainError(ApiErrorCode.LlmExtractionFailed, {
      reason: 'transaction dates outside the statement period',
      periodStart,
      periodEnd,
      offending: outOfPeriod.slice(0, 5).map(t => ({
        date: t.transactionDate,
        label: t.label.slice(0, 40),
      })),
      offendingCount: outOfPeriod.length,
    }, 502)
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

  // 8bis. Règles de classement déterministes, appliquées APRÈS le modèle et par-dessus lui.
  //
  // Les libellés bancaires étant très répétitifs, une règle écrite une fois vaut pour toutes
  // les occurrences futures — là où le modèle, lui, redécide à chaque relevé et peut classer
  // deux libellés identiques de deux façons différentes (constaté le 2026-09-05 sur `VIR INST
  // SOCIETEX`). L'écrasement est inconditionnel : une règle est une connaissance que l'utilisateur
  // possède et que le modèle n'a pas.
  //
  // Tri par `id` : à motifs de longueur égale, c'est la règle la plus ancienne qui l'emporte,
  // et ce départage doit être stable d'une ingestion à l'autre.
  const rules = await db
    .select({ pattern: classificationRules.pattern, categoryItemCode: classificationRules.categoryItemCode })
    .from(classificationRules)
    .orderBy(asc(classificationRules.id))
  const ruled = applyRules(extracted, rules)
  extracted = ruled.transactions
  step('rules_applied', { overriddenCount: ruled.overriddenCount })

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
        // Aucune décision n'est prise à l'ingestion : `gap_accepted` reste faux. Si la
        // réconciliation laisse un écart, le relevé sort donc « écart non examiné » — et non
        // « fiable », comme le faisait l'ancien champ écrit en dur (constaté le 2026-09-05 :
        // deux relevés à 2 187 € et 1 764 € d'écart s'affichaient sains).
        gapAccepted: false,
      }).run()
      if (extracted.length > 0) {
        tx.insert(transactions).values(extracted.map(t => ({
          statementHash: hash,
          transactionDate: t.transactionDate,
          label: t.label,
          amountCents: t.amountCents,
          categoryItemCode: t.categoryItemCode,
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
