/**
 * statement-ingestion-orchestrator — pipelines POST /api/statements (Story 2.6, 28.4).
 *
 * Orchestration pure (logique extraite du handler HTTP pour testabilité).
 * Le handler `server/api/statements/index.post.ts` reste un thin wrapper qui parse
 * le multipart, détecte le format par octets magiques, et délègue à `ingestStatement`
 * (PDF) ou `ingestExport` (Excel, story 28.4, D44).
 *
 * `ingestStatement` (PDF) — ordre des étapes (cf. AC#1) :
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
 *  11. cleanup FS post-commit (fichiers des statements remplacés)
 *
 * `ingestExport` (Excel) — voir Dev Notes de la story 28.4 pour le pipeline détaillé.
 *
 * Sur erreur après la sauvegarde du fichier : `deletePdfByHash(hash)` rollback FS.
 * Sur erreur avant : rien à rollback (pas de side-effect persistant encore).
 */
import { eq, and, lte, lt, gte, asc, desc, notInArray } from 'drizzle-orm'
import { JOINT_REIMBURSEMENT_ITEM_CODE, CARD_UNDETAILED_ITEM_CODE } from '~~/shared/constants/default-referential'
import { db } from '~~/server/db/client'
import { bankStatements, transactions, categoryItems, categoryGroups, classificationRules } from '~~/server/db/schema'
import { applyRules, type MatchableRule } from '~~/server/services/rule-matcher'
import { extractStatement } from '~~/server/services/pdf-extractor'
import { extractExport } from '~~/server/services/spreadsheet-extractor'
import { maskAccountNumbers } from '~~/server/services/bank-formats/identity'
import { BankMismatchError, ExportFormatError, StatementFormatError } from '~~/server/services/bank-formats/types'
import {
  categorizeStatement,
  categorizeLabels,
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
import type { H3Event } from 'h3'
import { requireCurrentProfile } from '~~/server/utils/current-profile'
import { profileId as toProfileId, type ProfileId } from '~~/shared/types/profile'
import type { LlmCategoryItem } from '~~/shared/constants/bank-statement-llm-prompt'

export interface IngestStatementArgs {
  /**
   * Obligatoire (revue de la story 27.1) : `requireCurrentProfile` ne le lisait pas encore à
   * l'origine, mais un paramètre optionnel qu'on ignore aujourd'hui inviterait un appelant futur
   * à l'omettre, avec un retour silencieux au profil par défaut au lieu d'une erreur. Les tests
   * construisent un `H3Event` minimal.
   */
  event: H3Event
  pdfBuffer: Buffer
  confirmReplace: boolean
  /**
   * Banque du relevé (D41, AR37). Absente → banque par défaut du profil courant
   * (`profile.defaultBank`, story 28.1) plutôt qu'une valeur fixe.
   */
  bank?: Bank
}

export interface IngestExportArgs {
  event: H3Event
  fileBuffer: Buffer
  confirmReplace: boolean
  bank?: Bank
}

// ---------------------------------------------------------------------------------------------
// Helpers PARTAGÉS entre `ingestStatement` (PDF) et `ingestExport` (Excel), story 28.4.
// ---------------------------------------------------------------------------------------------

/** Dédup globale par hash (D37) — AVANT tout appel au fournisseur, quel que soit le format. */
async function guardAgainstDuplicate(hash: string): Promise<void> {
  const existing = await db
    .select({ hash: bankStatements.hashSha256 })
    .from(bankStatements)
    .where(eq(bankStatements.hashSha256, hash))
    .limit(1)
  if (existing.length > 0) {
    throw domainError(ApiErrorCode.PdfAlreadyIngested, { hash })
  }
}

/**
 * Postes proposés au modèle, lus en base (story 5.6) — jamais le référentiel constant.
 *
 * `excludeCodes` retire les postes CALCULÉS que le modèle ne doit jamais recevoir : le poste
 * du compte joint (story 21.1, toujours exclu) et, à l'ingestion d'un export, l'agrégat carte
 * (story 28.4, FR84 — rangé PAR LE CODE, jamais soumis au modèle).
 *
 * `ORDER BY code` : sans tri, l'ordre des catégories dans le prompt dépend du rowid, donc de
 * l'historique de création/suppression — la catégorisation n'était pas reproductible d'une
 * base à l'autre (revue 2026-08-04). Les postes portent leur rubrique et leur nature : sans la
 * rubrique, le modèle ne peut pas trancher entre `alimentation-restaurant` et
 * `voyages-restaurant` ; sans la nature, rien ne lui dit qu'un virement vers un livret n'est
 * pas une dépense (D17).
 */
async function loadAvailableCategories(
  profileId: ProfileId,
  excludeCodes: readonly string[],
): Promise<LlmCategoryItem[]> {
  const rows = await db
    .select({
      id: categoryItems.id,
      code: categoryItems.code,
      label: categoryItems.label,
      nature: categoryItems.nature,
      groupCode: categoryGroups.code,
      groupLabel: categoryGroups.label,
    })
    .from(categoryItems)
    .innerJoin(categoryGroups, eq(categoryItems.groupId, categoryGroups.id))
    .where(and(
      eq(categoryItems.profileId, profileId),
      excludeCodes.length > 0 ? notInArray(categoryItems.code, [...excludeCodes]) : undefined,
    ))
    .orderBy(categoryItems.code)

  // Les libellés sont du texte libre saisi par l'utilisateur et sont concaténés dans le
  // message envoyé au LLM : on neutralise sauts de ligne et caractères de contrôle, qui
  // pourraient disloquer la structure du prompt.
  // Repli sur le `code` si le nettoyage ne laisse rien : `CategoryLabelSchema` accepte
  // `"\u0001"` (`.trim().min(1)` ne voit pas les caractères de contrôle), qui se réduirait
  // ici à une chaîne vide envoyée telle quelle au LLM (revue 2026-09-04).
  return rows.map((c) => {
    const clean = (value: string) => {
      const cleaned = value.replace(/[\p{Cc}\p{Cf}]+/gu, ' ').trim()
      return cleaned.length > 0 ? cleaned : null
    }
    return {
      code: c.code,
      nature: c.nature,
      label: clean(c.label) ?? c.code,
      groupCode: c.groupCode,
      groupLabel: clean(c.groupLabel) ?? c.groupCode,
    }
  })
}

/**
 * `DEFAULT_REFERENTIAL` garantit une liste non vide ; la lecture DB, non. Sans garde, une base
 * non initialisée partait avec une taxonomie vide et remontait un `llm_extraction_failed`
 * (« réessaie »), alors que le retry est vain.
 */
function guardNonEmptyCategories(categories: readonly LlmCategoryItem[]): void {
  if (categories.length === 0) {
    throw domainError(ApiErrorCode.CategoriesNotSeeded, { table: 'category_items' }, 500)
  }
}

/**
 * Traduit une erreur du `llm-categorizer` en `createError()` — IDENTIQUE pour les deux chemins
 * (Dev Notes de la story 28.4 : « c'est précisément le helper à extraire, pas à recopier »).
 *
 * `LlmConfigError` étend `LlmUnavailableError` : le test le plus spécifique d'abord. Sans cet
 * ordre, une clé invalide sortait en « fournisseur indisponible » et l'UI proposait un bouton
 * « Réessayer » sur un problème que retenter ne résout pas.
 */
function translateLlmError(err: unknown): never {
  // Sans cette trace, un échec du fournisseur n'était visible que dans la réponse HTTP :
  // impossible de savoir, côté serveur, pourquoi un import avait échoué (constaté le
  // 2026-09-26 sur le premier import d'export réel). Le message ne porte ni clé ni montant.
  if (err instanceof Error) {
    console.warn(`[ingest] llm-failed`, { kind: err.name, reason: err.message.slice(0, 500) })
  }
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

/** Règles de classement déterministes du profil, triées pour un départage stable (cf. `applyRules`). */
async function loadRules(profileId: ProfileId): Promise<MatchableRule[]> {
  return db
    .select({ pattern: classificationRules.pattern, categoryItemCode: categoryItems.code })
    .from(classificationRules)
    .innerJoin(categoryItems, eq(categoryItems.id, classificationRules.categoryItemId))
    .where(eq(classificationRules.profileId, profileId))
    .orderBy(asc(classificationRules.id))
}

interface OverlappingStatement {
  hash: string
  periodStart: string
  periodEnd: string
}

/** Relevés du PROFIL dont la période chevauche `[periodStart, periodEnd]` (AC 5, story 27.2). */
async function findOverlapping(profileId: ProfileId, periodStart: string, periodEnd: string): Promise<OverlappingStatement[]> {
  return db
    .select({
      hash: bankStatements.hashSha256,
      periodStart: bankStatements.periodStart,
      periodEnd: bankStatements.periodEnd,
    })
    .from(bankStatements)
    .where(and(
      eq(bankStatements.profileId, profileId),
      lte(bankStatements.periodStart, periodEnd),
      gte(bankStatements.periodEnd, periodStart),
    ))
}

function guardOverlap(overlapping: readonly OverlappingStatement[], periodStart: string, periodEnd: string, confirmReplace: boolean): void {
  if (overlapping.length > 0 && !confirmReplace) {
    throw domainError(ApiErrorCode.PeriodOverlap, {
      existingHashes: overlapping.map(o => o.hash),
      existingPeriods: overlapping.map(o => ({ start: o.periodStart, end: o.periodEnd })),
      newPeriod: { start: periodStart, end: periodEnd },
    }, 409)
  }
}

/** Table code → id du référentiel COMPLET du profil (D37) — une règle peut cibler n'importe quel poste. */
async function loadItemIdByCode(profileId: ProfileId): Promise<Map<string, number>> {
  const rows = await db
    .select({ id: categoryItems.id, code: categoryItems.code })
    .from(categoryItems)
    .where(eq(categoryItems.profileId, profileId))
  return new Map(rows.map(i => [i.code, i.id]))
}

interface ExportToJoin {
  hash: string
  periodEnd: string
  closingBalanceCents: number
}

/**
 * L'export du même profil et de la même banque dont la date de solde tombe DANS la période du
 * relevé (AC 12, FR83) — strictement avant sa fin : un export qui couvre tout le relevé n'est pas
 * un raccord mais un chevauchement complet, traité par la garde de chevauchement habituelle.
 * Plusieurs candidats (non observé) : le plus récent.
 */
async function findExportToJoin(profileId: ProfileId, bank: Bank, periodStart: string, periodEnd: string): Promise<ExportToJoin | null> {
  const [row] = await db
    .select({
      hash: bankStatements.hashSha256,
      periodEnd: bankStatements.periodEnd,
      closingBalanceCents: bankStatements.closingBalanceCents,
    })
    .from(bankStatements)
    .where(and(
      eq(bankStatements.profileId, profileId),
      eq(bankStatements.bank, bank),
      eq(bankStatements.source, 'export'),
      // L'export couvre le DÉBUT du relevé et s'arrête avant sa fin : sinon des lignes antérieures
      // au début de l'export seraient écartées sans qu'aucun écart ne le signale (revue du 2026-10-20).
      lte(bankStatements.periodStart, periodStart),
      gte(bankStatements.periodEnd, periodStart),
      lt(bankStatements.periodEnd, periodEnd),
    ))
    .orderBy(desc(bankStatements.periodEnd))
    .limit(1)
  return row ?? null
}

/** Date civile + n jours, sans fuseau. */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------------------------
// ingestStatement — PDF (Story 2.6 et suivantes)
// ---------------------------------------------------------------------------------------------

export async function ingestStatement(args: IngestStatementArgs): Promise<IngestionResult> {
  const { event, pdfBuffer, confirmReplace, bank: requestedBank } = args
  const currentProfile = requireCurrentProfile(event)
  const profileId = toProfileId(currentProfile.id)
  const bank = requestedBank ?? currentProfile.defaultBank
  const t0 = Date.now()
  const step = (name: string, payload: Record<string, unknown> = {}) => {
    console.warn(`[ingest] ${name}`, { elapsedMs: Date.now() - t0, ...payload })
  }

  step('start', { pdfBytes: pdfBuffer.length, confirmReplace })

  // 1. Hash
  const hash = sha256(pdfBuffer)
  step('hash', { hash })

  // 2. Dédup par hash
  await guardAgainstDuplicate(hash)
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
    // Structure de relevé jamais observée (story 28.2, AR41) : refusée ici, AVANT le fournisseur.
    if (err instanceof StatementFormatError) {
      throw domainError(ApiErrorCode.StatementFormatUnrecognized, { reason: err.reason, ...err.data }, 400)
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

  // 3ter. Raccord avec un export (FR83, story 28.2) : cherché AVANT l'appel au fournisseur, car
  // il ne dépend que de la période lue. S'il existe, les lignes déjà couvertes par l'export seront
  // écartées après la catégorisation (étape 6bis).
  const joinedExport = raw.periodStart && raw.periodEnd
    ? await findExportToJoin(profileId, bank, raw.periodStart, raw.periodEnd)
    : null

  // 4. Catégorisation LLM (avant résolution période, pour permettre fallback G3)
  //
  // `CARD_UNDETAILED_ITEM_CODE` est exclu ICI AUSSI (AC 5, story 28.4) : c'est un poste
  // CALCULÉ, alimenté uniquement par l'agrégat carte d'un export (FR84). Le proposer au modèle
  // sur un relevé PDF Boursorama l'inviterait à y ranger de vrais achats `CARTE … SUPERMARCHE`,
  // indiscernables ensuite d'un authentique agrégat mensuel d'export.
  const availableCategories = await loadAvailableCategories(profileId, [
    JOINT_REIMBURSEMENT_ITEM_CODE,
    CARD_UNDETAILED_ITEM_CODE,
  ])
  guardNonEmptyCategories(availableCategories)

  let extracted: Awaited<ReturnType<typeof categorizeStatement>>
  try {
    extracted = await categorizeStatement(raw.rawText, availableCategories, bank)
  }
  catch (err) {
    translateLlmError(err)
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

  // 6bis. Raccord avec l'export (AC 12, FR83). Les opérations datées jusqu'à la date de solde de
  // l'export incluse y figurent déjà : on ne les réimporte pas. Le solde d'ouverture effectif est
  // l'ouverture lue AUGMENTÉE de ces opérations — c'est le solde du compte à la date de l'export —,
  // et son écart avec la clôture de l'export est le FAIT de continuité écrit sur l'export. Le
  // relevé se réconcilie ensuite au centime sur les lignes qu'il porte réellement.
  let openingBalanceCents = raw.openingBalanceCents
  let continuityGapCents: number | null = null
  let periodStartToStore = periodStart
  if (joinedExport) {
    const covered = extracted.filter(t => t.transactionDate <= joinedExport.periodEnd)
    extracted = extracted.filter(t => t.transactionDate > joinedExport.periodEnd)
    openingBalanceCents = cents(raw.openingBalanceCents + covered.reduce((sum, t) => sum + t.amountCents, 0))
    continuityGapCents = openingBalanceCents - joinedExport.closingBalanceCents
    periodStartToStore = addDays(joinedExport.periodEnd, 1)
    step('export-joined', { exportEnd: joinedExport.periodEnd, coveredCount: covered.length, continuityGapCents })
  }

  // 7. Détection chevauchement période — restreinte AU PROFIL (AC 5, story 27.2) : A dépose un
  // relevé couvrant une période que seul B a ingérée, aucun chevauchement n'est signalé.
  const overlapping = await findOverlapping(profileId, periodStartToStore, periodEnd)

  step('period-resolved', {
    periodStart: periodStartToStore,
    periodEnd,
    fallbackUsed: raw.periodStart === null || raw.periodEnd === null,
    overlappingCount: overlapping.length,
  })

  guardOverlap(overlapping, periodStartToStore, periodEnd, confirmReplace)

  // 8. Sauvegarde PDF sur disque (point de rollback FS si la suite échoue)
  await savePdfByHash(pdfBuffer, hash, 'pdf')
  step('pdf-saved', { hash })

  // 8bis. Règles de classement déterministes, appliquées APRÈS le modèle et par-dessus lui.
  //
  // Les libellés bancaires étant très répétitifs, une règle écrite une fois vaut pour toutes
  // les occurrences futures — là où le modèle, lui, redécide à chaque relevé et peut classer
  // deux libellés identiques de deux façons différentes (constaté le 2026-09-05 sur `VIR INST
  // SOCIETEX`). L'écrasement est inconditionnel : une règle est une connaissance que l'utilisateur
  // possède et que le modèle n'a pas.
  const rules = await loadRules(profileId)
  const ruled = applyRules(extracted, rules)
  extracted = ruled.transactions
  step('rules_applied', { overriddenCount: ruled.overriddenCount })

  // 9. Réconciliation (les amountCents extraits sont déjà en integer cents — cast brand-only)
  const reconciliation = reconcile({
    openingCents: openingBalanceCents,
    closingCents: raw.closingBalanceCents,
    transactions: extracted.map(t => ({ amountCents: cents(t.amountCents) })),
  })
  step('reconciled', {
    isBalanced: reconciliation.isBalanced,
    gapCents: reconciliation.gapCents,
  })

  // Résolution code → id, TOUJOURS dans le profil (D37).
  const itemIdByCode = await loadItemIdByCode(profileId)

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
        profileId,
        bank,
        periodStart: periodStartToStore,
        periodEnd,
        openingBalanceCents,
        closingBalanceCents: raw.closingBalanceCents!,
        // Aucune décision n'est prise à l'ingestion : `gap_accepted` reste faux. Si la
        // réconciliation laisse un écart, le relevé sort donc « écart non examiné » — et non
        // « fiable », comme le faisait l'ancien champ écrit en dur (constaté le 2026-09-05 :
        // deux relevés à 2 187 € et 1 764 € d'écart s'affichaient sains).
        gapAccepted: false,
        source: 'pdf',
      }).run()
      // Le fait de continuité s'écrit sur l'EXPORT, dans la même transaction que le relevé (AC 12).
      if (joinedExport) {
        tx.update(bankStatements)
          .set({ continuityGapCents })
          .where(eq(bankStatements.hashSha256, joinedExport.hash))
          .run()
      }
      if (extracted.length > 0) {
        tx.insert(transactions).values(extracted.map((t) => {
          const categoryItemId = itemIdByCode.get(t.categoryItemCode)
          if (categoryItemId === undefined) {
            throw domainError(
              ApiErrorCode.LlmExtractionFailed,
              { reason: 'unknown categoryItemCode', value: t.categoryItemCode },
              502,
            )
          }
          return {
            statementHash: hash,
            transactionDate: t.transactionDate,
            label: t.label,
            amountCents: t.amountCents,
            categoryItemId,
          }
        })).run()
      }
    })
  }
  catch (err) {
    // Rollback FS : la tx DB a échoué, on supprime le fichier sauvegardé pour éviter
    // un orphelin filesystem.
    await deletePdfByHash(hash).catch((cleanupErr) => {
      console.warn('[ingestStatement] FS rollback failed — orphan file possible', { hash, cleanupErr })
    })
    throw err
  }
  step('db-committed', {
    insertedTransactions: extracted.length,
    replacedStatements: replacedHashes.length,
  })

  // 11. Cleanup FS post-commit : suppression des fichiers des statements remplacés.
  for (const oldHash of replacedHashes) {
    await deletePdfByHash(oldHash).catch((cleanupErr) => {
      console.warn('[ingestStatement] post-commit cleanup failed — orphan file', { oldHash, cleanupErr })
    })
  }

  step('done', {
    hash,
    transactionCount: extracted.length,
    gapCents: reconciliation.gapCents,
  })

  return {
    hash,
    periodStart: periodStartToStore,
    periodEnd,
    transactionCount: extracted.length,
    isBalanced: reconciliation.isBalanced,
    gapCents: reconciliation.gapCents,
    source: 'pdf',
    ignoredSections: raw.ignoredSections,
  }
}

// ---------------------------------------------------------------------------------------------
// ingestExport — Excel (story 28.4, D44)
// ---------------------------------------------------------------------------------------------

const CARD_LABEL_PATTERN = /^RELEV[EÉ] CARTE\b/iu

export async function ingestExport(args: IngestExportArgs): Promise<IngestionResult> {
  const { event, fileBuffer, confirmReplace, bank: requestedBank } = args
  const currentProfile = requireCurrentProfile(event)
  const profileId = toProfileId(currentProfile.id)
  const bank = requestedBank ?? currentProfile.defaultBank
  const t0 = Date.now()
  const step = (name: string, payload: Record<string, unknown> = {}) => {
    console.warn(`[ingest-export] ${name}`, { elapsedMs: Date.now() - t0, ...payload })
  }

  step('start', { fileBytes: fileBuffer.length, confirmReplace })

  // 1. Hash + 2. Dédup — AVANT tout appel au fournisseur, comme le chemin PDF.
  const hash = sha256(fileBuffer)
  await guardAgainstDuplicate(hash)
  step('dedup-check', { duplicate: false })

  // 2bis. Lecture + reconnaissance du format (AC 1, 2, 8).
  let raw: Awaited<ReturnType<typeof extractExport>>
  try {
    raw = await extractExport(fileBuffer, bank)
  }
  catch (err) {
    if (err instanceof BankMismatchError) {
      throw domainError(ApiErrorCode.BankMismatch, { expected: err.expected, detected: err.detected }, 400)
    }
    if (err instanceof ExportFormatError) {
      throw domainError(ApiErrorCode.StatementFormatUnrecognized, { reason: err.reason }, 400)
    }
    throw err
  }
  step('export-extracted', {
    operationCount: raw.operations.length,
    periodStart: raw.periodStart,
    periodEnd: raw.periodEnd,
    ignoredSheetCount: raw.ignoredSheets.length,
  })

  // 3. Chevauchement de période DANS LE PROFIL — AVANT l'appel au modèle : la période est
  // connue sans lui, un utilisateur qui annule ne paie rien (FR6).
  const overlapping = await findOverlapping(profileId, raw.periodStart, raw.periodEnd)
  guardOverlap(overlapping, raw.periodStart, raw.periodEnd, confirmReplace)
  step('overlap-checked', { overlappingCount: overlapping.length })

  // 4. Postes proposés au modèle (sans JOINT_REIMBURSEMENT ni CARD_UNDETAILED, FR84) + id de
  // CARD_UNDETAILED dans le profil.
  const availableCategories = await loadAvailableCategories(profileId, [
    JOINT_REIMBURSEMENT_ITEM_CODE,
    CARD_UNDETAILED_ITEM_CODE,
  ])
  guardNonEmptyCategories(availableCategories)
  const itemIdByCode = await loadItemIdByCode(profileId)
  const cardItemId = itemIdByCode.get(CARD_UNDETAILED_ITEM_CODE)
  if (cardItemId === undefined) {
    throw domainError(ApiErrorCode.CategoriesNotSeeded, { code: CARD_UNDETAILED_ITEM_CODE }, 500)
  }

  // 5. Partition : agrégats carte (rangés PAR LE CODE, FR84) | autres lignes (soumises au modèle).
  const cardOps = raw.operations.filter(op => CARD_LABEL_PATTERN.test(op.label.trim()))
  const otherOps = raw.operations.filter(op => !CARD_LABEL_PATTERN.test(op.label.trim()))

  // 6. Autres lignes : libellés masqués (D42), DÉDOUBLONNÉS par (sens, libellé brut) →
  // categorizeLabels → codes remappés vers chaque transaction. Aucune ligne « autres » →
  // aucun appel au fournisseur.
  const keyOf = (label: string, amountCents: Cents) => `${amountCents < 0 ? 'debit' : 'credit'}\u0000${label}`
  const uniqueByKey = new Map<string, { label: string, direction: 'debit' | 'credit' }>()
  for (const op of otherOps) {
    const key = keyOf(op.label, op.amountCents)
    if (!uniqueByKey.has(key)) {
      uniqueByKey.set(key, {
        label: maskAccountNumbers(op.label, raw.knownNumbers),
        direction: op.amountCents < 0 ? 'debit' : 'credit',
      })
    }
  }
  const uniqueKeys = [...uniqueByKey.keys()]
  let codes: string[]
  try {
    codes = await categorizeLabels(uniqueKeys.map(k => uniqueByKey.get(k)!), availableCategories)
  }
  catch (err) {
    translateLlmError(err)
  }
  const codeByKey = new Map(uniqueKeys.map((key, i) => [key, codes[i]!]))
  step('labels-categorized', { uniqueLabelCount: uniqueKeys.length, cardLineCount: cardOps.length })

  interface WithCategory { transactionDate: string, label: string, amountCents: Cents, categoryItemCode: string }
  const otherTransactions: WithCategory[] = otherOps.map(op => ({
    ...op,
    amountCents: cents(op.amountCents),
    categoryItemCode: codeByKey.get(keyOf(op.label, op.amountCents))!,
  }))

  // 8bis. Règles de classement — SEULEMENT sur les lignes passées par le modèle (FR84 : les
  // lignes carte sont rangées par le code, hors modèle ET hors règles).
  const rules = await loadRules(profileId)
  const ruled = applyRules(otherTransactions, rules)
  step('rules_applied', { overriddenCount: ruled.overriddenCount })

  // Reconstruit l'ordre d'origine du relevé par PARTITION, jamais par recherche (revue
  // pr-reviewer de la story 28.4, MINEUR 5) : `cardOps`/`otherOps` sont des sous-suites de
  // `raw.operations` qui préservent l'ordre relatif (`Array.filter`), donc chaque ligne du
  // relevé est soit la PROCHAINE ligne carte, soit la PROCHAINE ligne « autre » déjà classée —
  // deux pointeurs suffisent, sans comparaison de contenu ni contrat implicite sur l'ordre
  // conservé par `applyRules`.
  let cardIdx = 0
  let otherIdx = 0
  const extracted: WithCategory[] = raw.operations.map((op) => {
    if (CARD_LABEL_PATTERN.test(op.label.trim())) {
      const cardOp = cardOps[cardIdx++]!
      return { ...cardOp, amountCents: cents(cardOp.amountCents), categoryItemCode: CARD_UNDETAILED_ITEM_CODE }
    }
    return ruled.transactions[otherIdx++]!
  })

  // 8. Solde de départ DÉDUIT (D44) : `opening = closing − Σ transactions`, jamais lu.
  const sumCents = extracted.reduce((sum, t) => sum + t.amountCents, 0)
  const openingBalanceCents = cents(raw.closingBalanceCents - sumCents)

  // 9. Sauvegarde du fichier sur disque (point de rollback FS).
  await savePdfByHash(fileBuffer, hash, 'xlsx')
  step('file-saved', { hash })

  // 10. Réconciliation — écart nul PAR CONSTRUCTION (le solde de départ est calculé pour que
  // ce soit le cas). Il ne prouve rien, d'où l'état `unverified` (D44).
  const reconciliation = reconcile({
    openingCents: openingBalanceCents,
    closingCents: raw.closingBalanceCents,
    transactions: extracted.map(t => ({ amountCents: cents(t.amountCents) })),
  })
  step('reconciled', { isBalanced: reconciliation.isBalanced, gapCents: reconciliation.gapCents })

  const cardDetailMissing = cardOps.length > 0

  // 11. Persistance atomique.
  const replacedHashes = overlapping.map(o => o.hash)
  try {
    db.transaction((tx) => {
      for (const oldHash of replacedHashes) {
        tx.delete(bankStatements).where(eq(bankStatements.hashSha256, oldHash)).run()
      }
      tx.insert(bankStatements).values({
        hashSha256: hash,
        profileId,
        bank,
        periodStart: raw.periodStart,
        periodEnd: raw.periodEnd,
        openingBalanceCents,
        closingBalanceCents: raw.closingBalanceCents,
        gapAccepted: false,
        source: 'export',
        continuityGapCents: null,
        cardDetailMissing,
      }).run()
      if (extracted.length > 0) {
        tx.insert(transactions).values(extracted.map((t) => {
          const categoryItemId = itemIdByCode.get(t.categoryItemCode)
          if (categoryItemId === undefined) {
            throw domainError(
              ApiErrorCode.LlmExtractionFailed,
              { reason: 'unknown categoryItemCode', value: t.categoryItemCode },
              502,
            )
          }
          return {
            statementHash: hash,
            transactionDate: t.transactionDate,
            label: t.label,
            amountCents: t.amountCents,
            categoryItemId,
          }
        })).run()
      }
    })
  }
  catch (err) {
    await deletePdfByHash(hash).catch((cleanupErr) => {
      console.warn('[ingestExport] FS rollback failed — orphan file possible', { hash, cleanupErr })
    })
    throw err
  }
  step('db-committed', { insertedTransactions: extracted.length, replacedStatements: replacedHashes.length })

  // 12. Cleanup FS post-commit.
  for (const oldHash of replacedHashes) {
    await deletePdfByHash(oldHash).catch((cleanupErr) => {
      console.warn('[ingestExport] post-commit cleanup failed — orphan file', { oldHash, cleanupErr })
    })
  }

  const cardAggregateMonths = [...new Set(cardOps.map(op => op.transactionDate.slice(0, 7)))].sort()

  step('done', { hash, transactionCount: extracted.length, gapCents: reconciliation.gapCents })

  return {
    hash,
    periodStart: raw.periodStart,
    periodEnd: raw.periodEnd,
    transactionCount: extracted.length,
    isBalanced: reconciliation.isBalanced,
    gapCents: reconciliation.gapCents,
    source: 'export',
    ignoredSheets: raw.ignoredSheets,
    cardAggregateMonths,
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
