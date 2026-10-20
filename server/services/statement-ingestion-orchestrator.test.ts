import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { sha256 } from '~~/server/utils/hash'
import { TEST_SCHEMA_DDL, TEST_REFERENTIAL_DDL } from '~~/tests/fixtures/test-schema'
import { BankMismatchError, ExportFormatError, StatementFormatError } from '~~/server/services/bank-formats/types'
import { deriveReliability } from '~~/shared/types/statement-reliability'
import { CARD_UNDETAILED_ITEM_CODE } from '~~/shared/constants/default-referential'

/**
 * `event` est obligatoire dans `IngestStatementArgs` (revue de la story 27.1). Depuis la story
 * 27.2, `requireProfile` LIT le cookie `pf_profile` — `node.req.headers` doit donc exister,
 * même vide : sans cookie et avec le seul profil `marceau` semé par `TEST_REFERENTIAL_DDL`, le
 * repli « exactement un profil » (AC 10) s'applique.
 */
const FAKE_EVENT = {
  path: '/api/statements',
  method: 'POST',
  node: { req: { headers: {} }, res: {} },
} as unknown as H3Event

/**
 * Événement avec cookie EXPLICITE sur le profil 1 (`marceau`) — nécessaire dès qu'un test
 * antérieur du fichier a créé un second profil, ce qui fait disparaître le repli « exactement
 * un profil » dont `FAKE_EVENT` dépend (AC 10).
 */
const PROFILE_1_EVENT = {
  path: '/api/statements',
  method: 'POST',
  node: { req: { headers: { cookie: 'pf_profile=1' } }, res: {} },
} as unknown as H3Event

// Setup tmpdirs AVANT tout import du singleton db/client (qui ouvre la DB à l'import).
const tmpRoot = mkdtempSync(join(tmpdir(), 'pf-ingest-'))
const previousDatabaseUrl = process.env.DATABASE_URL
const previousPdfDir = process.env.PDF_STORAGE_DIR
process.env.DATABASE_URL = join(tmpRoot, 'test.db')
process.env.PDF_STORAGE_DIR = join(tmpRoot, 'raw')

// Mock pdf-extractor & llm-categorizer pour ne pas faire d'appels réels (vi.mock hoisté).
vi.mock('~~/server/services/pdf-extractor', () => ({
  extractStatement: vi.fn(),
}))
vi.mock('~~/server/services/llm-categorizer', () => {
  class LlmExtractionError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'LlmExtractionError'
    }
  }
  class LlmUnavailableError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'LlmUnavailableError'
    }
  }
  // Sous-classe, comme en production : c'est ce qui rend l'ORDRE des tests d'instance
  // significatif dans l'orchestrateur (story 17.5).
  class LlmConfigError extends LlmUnavailableError {
    constructor(message: string) {
      super(message)
      this.name = 'LlmConfigError'
    }
  }
  return {
    categorizeStatement: vi.fn(),
    categorizeLabels: vi.fn(),
    LlmConfigError,
    LlmExtractionError,
    LlmUnavailableError,
  }
})

vi.mock('~~/server/services/spreadsheet-extractor', () => ({
  extractExport: vi.fn(),
}))

type DbModule = typeof import('~~/server/db/client')
type SchemaModule = typeof import('~~/server/db/schema')
type OrchModule = typeof import('./statement-ingestion-orchestrator')
type PdfMod = typeof import('~~/server/services/pdf-extractor')
type LlmMod = typeof import('~~/server/services/llm-categorizer')
type SpreadsheetMod = typeof import('~~/server/services/spreadsheet-extractor')

let dbMod: DbModule
let schema: SchemaModule
let orch: OrchModule
let pdfMod: PdfMod
let llmMod: LlmMod
let spreadsheetMod: SpreadsheetMod
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlite: any

beforeAll(async () => {
  dbMod = await import('~~/server/db/client')
  schema = await import('~~/server/db/schema')
  pdfMod = await import('~~/server/services/pdf-extractor')
  llmMod = await import('~~/server/services/llm-categorizer')
  spreadsheetMod = await import('~~/server/services/spreadsheet-extractor')

  // @ts-expect-error -- propriété interne drizzle (better-sqlite3)
  sqlite = dbMod.db.$client ?? dbMod.db.session?.client
  sqlite.exec(TEST_SCHEMA_DDL)
  sqlite.exec(TEST_REFERENTIAL_DDL)

  orch = await import('./statement-ingestion-orchestrator')
})

afterAll(() => {
  sqlite?.close?.()
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl
  if (previousPdfDir === undefined) delete process.env.PDF_STORAGE_DIR
  else process.env.PDF_STORAGE_DIR = previousPdfDir
  rmSync(tmpRoot, { recursive: true, force: true })
})

beforeEach(() => {
  dbMod.db.delete(schema.transactions).run()
  dbMod.db.delete(schema.bankStatements).run()
  vi.mocked(pdfMod.extractStatement).mockReset()
  vi.mocked(llmMod.categorizeStatement).mockReset()
  vi.mocked(llmMod.categorizeLabels).mockReset()
  vi.mocked(spreadsheetMod.extractExport).mockReset()
})

function pdf(content: string): Buffer {
  return Buffer.from(content, 'utf8')
}

function pdfPathFor(buf: Buffer): string {
  return join(process.env.PDF_STORAGE_DIR!, `${sha256(buf)}.pdf`)
}

function xlsxPathFor(buf: Buffer): string {
  return join(process.env.PDF_STORAGE_DIR!, `${sha256(buf)}.xlsx`)
}

function mockExtract(opts: {
  periodStart?: string | null
  periodEnd?: string | null
  openingBalanceCents?: number | null
  closingBalanceCents?: number | null
  rawText?: string
  ignoredSections?: string[]
} = {}) {
  vi.mocked(pdfMod.extractStatement).mockResolvedValue({
    rawText: opts.rawText ?? 'rawText sample',
    periodStart: opts.periodStart === undefined ? '2026-04-01' : opts.periodStart,
    periodEnd: opts.periodEnd === undefined ? '2026-04-30' : opts.periodEnd,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    openingBalanceCents: (opts.openingBalanceCents === undefined ? 100_000 : opts.openingBalanceCents) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    closingBalanceCents: (opts.closingBalanceCents === undefined ? 50_000 : opts.closingBalanceCents) as any,
    ignoredSections: opts.ignoredSections ?? [],
  })
}

function mockCategorize(txs: Array<{
  transactionDate: string
  label: string
  amountCents: number
  categoryItemCode: string
}>) {
  vi.mocked(llmMod.categorizeStatement).mockResolvedValue(txs)
}

describe('ingestStatement (orchestrator)', () => {
  it('happy path: insère statement + transactions et retourne les méta', async () => {
    mockExtract({ openingBalanceCents: 100_000, closingBalanceCents: 50_000 })
    mockCategorize([
      { transactionDate: '2026-04-05', label: 'Courses Carrefour', amountCents: -30_000, categoryItemCode: 'alimentation-courses' },
      { transactionDate: '2026-04-15', label: 'Resto Pizza', amountCents: -20_000, categoryItemCode: 'alimentation-restaurant' },
    ])

    const buf = pdf('happy-path-pdf')
    const result = await orch.ingestStatement({ event: FAKE_EVENT, pdfBuffer: buf, confirmReplace: false })

    expect(result.transactionCount).toBe(2)
    expect(result.isBalanced).toBe(true)
    expect(result.gapCents).toBe(0)
    expect(result.periodStart).toBe('2026-04-01')
    expect(result.periodEnd).toBe('2026-04-30')
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/)

    const stmts = dbMod.db.select().from(schema.bankStatements).all()
    expect(stmts).toHaveLength(1)
    expect(stmts[0]!.hashSha256).toBe(result.hash)

    const rows = dbMod.db.select().from(schema.transactions).all()
    expect(rows).toHaveLength(2)
    expect(existsSync(pdfPathFor(buf))).toBe(true)
  })

  it('passe au LLM les postes lus en base, pas le référentiel constant', async () => {
    mockExtract()
    mockCategorize([
      { transactionDate: '2026-04-05', label: 'Op', amountCents: -10_000, categoryItemCode: 'alimentation-courses' },
    ])

    await orch.ingestStatement({ event: FAKE_EVENT, pdfBuffer: pdf('cats-from-db'), confirmReplace: false })

    const passed = vi.mocked(llmMod.categorizeStatement).mock.calls[0]![1] as ReadonlyArray<{ code: string }>
    // Exactement les postes seedés en base — un sous-ensemble strict de DEFAULT_REFERENTIAL
    // (52 postes) — ce qui prouve la lecture DB et non le repli sur la constante. Un poste
    // créé par l'utilisateur doit être proposé au modèle dès l'ingestion suivante.
    const seeded = dbMod.db.select({ code: schema.categoryItems.code }).from(schema.categoryItems).all()
    // Tous les postes de la base SAUF « Part remboursée » (compte joint, story 21.1) ET « Carte
    // (non détaillée) » (story 28.4, AC 5) : deux postes CALCULÉS, jamais alimentés par le
    // modèle. Le compte joint est rempli par la coupe ; l'agrégat carte par le code sur un
    // export — le proposer sur un relevé PDF Boursorama l'inviterait à y ranger de vrais achats
    // `CARTE … SUPERMARCHE`, indiscernables ensuite d'un authentique agrégat d'export.
    const attendus = seeded.map(r => r.code).filter(c => c !== 'compte-joint-part-remboursee' && c !== CARD_UNDETAILED_ITEM_CODE)
    expect(passed.map(c => c.code).sort()).toEqual(attendus.sort())
    expect(passed.map(c => c.code)).not.toContain('compte-joint-part-remboursee')
    expect(passed.map(c => c.code)).not.toContain(CARD_UNDETAILED_ITEM_CODE)
    expect(passed.map(c => c.code)).toContain('internes-virement-joint')
    expect(passed.length).toBeLessThan(52)
  })

  it('dédup : 2e POST avec même PDF → pdf_already_ingested', async () => {
    mockExtract()
    mockCategorize([
      { transactionDate: '2026-04-05', label: 'Op', amountCents: -50_000, categoryItemCode: 'alimentation-courses' },
    ])

    const buf = pdf('dedup-same-pdf')
    await orch.ingestStatement({ event: FAKE_EVENT, pdfBuffer: buf, confirmReplace: false })

    await expect(
      orch.ingestStatement({ event: FAKE_EVENT, pdfBuffer: buf, confirmReplace: false }),
    ).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: ApiErrorCode.PdfAlreadyIngested,
    })
  })

  it('chevauchement sans header → period_overlap (409)', async () => {
    mockExtract({ periodStart: '2026-04-01', periodEnd: '2026-04-30' })
    mockCategorize([
      { transactionDate: '2026-04-10', label: 'A', amountCents: -50_000, categoryItemCode: 'alimentation-courses' },
    ])
    await orch.ingestStatement({ event: FAKE_EVENT, pdfBuffer: pdf('first-april'), confirmReplace: false })

    mockExtract({ periodStart: '2026-04-15', periodEnd: '2026-05-15' })
    mockCategorize([
      { transactionDate: '2026-04-20', label: 'B', amountCents: -30_000, categoryItemCode: 'alimentation-courses' },
    ])

    await expect(
      orch.ingestStatement({ event: FAKE_EVENT, pdfBuffer: pdf('second-overlapping'), confirmReplace: false }),
    ).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: ApiErrorCode.PeriodOverlap,
    })

    expect(dbMod.db.select().from(schema.bankStatements).all()).toHaveLength(1)
  })

  it('chevauchement avec confirmReplace=true → ancien supprimé (CASCADE), nouveau inséré', async () => {
    mockExtract({ periodStart: '2026-04-01', periodEnd: '2026-04-30' })
    mockCategorize([
      { transactionDate: '2026-04-10', label: 'Old', amountCents: -50_000, categoryItemCode: 'alimentation-courses' },
    ])
    const firstBuf = pdf('first-april-replace')
    const first = await orch.ingestStatement({ event: FAKE_EVENT, pdfBuffer: firstBuf, confirmReplace: false })

    mockExtract({ periodStart: '2026-04-01', periodEnd: '2026-04-30' })
    mockCategorize([
      { transactionDate: '2026-04-12', label: 'New', amountCents: -40_000, categoryItemCode: 'alimentation-courses' },
    ])
    const secondBuf = pdf('second-april-replace')
    const second = await orch.ingestStatement({ event: FAKE_EVENT, pdfBuffer: secondBuf, confirmReplace: true })

    expect(second.hash).not.toBe(first.hash)
    const stmts = dbMod.db.select().from(schema.bankStatements).all()
    expect(stmts).toHaveLength(1)
    expect(stmts[0]!.hashSha256).toBe(second.hash)

    const rows = dbMod.db.select().from(schema.transactions).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.label).toBe('New')

    // L'ancien PDF a été supprimé du disque, le nouveau y est.
    expect(existsSync(pdfPathFor(firstBuf))).toBe(false)
    expect(existsSync(pdfPathFor(secondBuf))).toBe(true)
  })

  it('LLM down → 503 + pas de persistance + pas de PDF orphelin', async () => {
    mockExtract()
    vi.mocked(llmMod.categorizeStatement).mockRejectedValue(
      new llmMod.LlmUnavailableError('Claude API unreachable'),
    )

    const buf = pdf('llm-down-case')
    await expect(
      orch.ingestStatement({ event: FAKE_EVENT, pdfBuffer: buf, confirmReplace: false }),
    ).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: ApiErrorCode.LlmUnavailable,
    })

    expect(dbMod.db.select().from(schema.bankStatements).all()).toHaveLength(0)
    // savePdfByHash n'a pas été appelé (categorize est en amont) → pas de PDF orphelin.
    expect(existsSync(pdfPathFor(buf))).toBe(false)
  })

  it('LLM extraction error → 502 llm_extraction_failed', async () => {
    mockExtract()
    vi.mocked(llmMod.categorizeStatement).mockRejectedValue(
      new llmMod.LlmExtractionError('Schema validation failed'),
    )
    await expect(
      orch.ingestStatement({ event: FAKE_EVENT, pdfBuffer: pdf('llm-extract-fail'), confirmReplace: false }),
    ).rejects.toMatchObject({
      statusCode: 502,
      statusMessage: ApiErrorCode.LlmExtractionFailed,
    })
  })

  it('PDF parse failure → pdf_parse_failed (400)', async () => {
    vi.mocked(pdfMod.extractStatement).mockRejectedValue(new Error('PDF extraction failed: malformed'))
    await expect(
      orch.ingestStatement({ event: FAKE_EVENT, pdfBuffer: pdf('bad-pdf'), confirmReplace: false }),
    ).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: ApiErrorCode.PdfParseFailed,
    })
    expect(dbMod.db.select().from(schema.bankStatements).all()).toHaveLength(0)
  })

  it('bank absent → défaut la banque du profil courant, transmis à extractStatement et categorizeStatement (D41, story 28.1)', async () => {
    mockExtract()
    mockCategorize([])
    const result = await orch.ingestStatement({ event: FAKE_EVENT, pdfBuffer: pdf('default-bank'), confirmReplace: false })
    expect(vi.mocked(pdfMod.extractStatement).mock.calls[0]![1]).toBe('boursorama')
    expect(vi.mocked(llmMod.categorizeStatement).mock.calls[0]![2]).toBe('boursorama')
    const stmt = dbMod.db.select().from(schema.bankStatements).all().find(s => s.hashSha256 === result.hash)
    expect(stmt?.bank).toBe('boursorama')
  })

  it('bank explicite → transmise telle quelle à extractStatement, et persistée (AC 3)', async () => {
    mockExtract()
    mockCategorize([])
    const result = await orch.ingestStatement({ event: FAKE_EVENT, pdfBuffer: pdf('explicit-bank'), confirmReplace: false, bank: 'credit_mutuel' })
    expect(vi.mocked(pdfMod.extractStatement).mock.calls[0]![1]).toBe('credit_mutuel')
    const stmt = dbMod.db.select().from(schema.bankStatements).all().find(s => s.hashSha256 === result.hash)
    expect(stmt?.bank).toBe('credit_mutuel')
  })

  it('bank absent → défaut LA BANQUE DU PROFIL COURANT, pas une constante globale (story 28.1)', async () => {
    // Profil temporaire, nettoyé en fin de test (contrairement au profil « conjoint » du
    // dernier test de la suite, qui reste en base à dessein).
    const tmp = sqlite
      .prepare('INSERT INTO profiles (name, default_bank) VALUES (?, ?)')
      .run('cm-default', 'credit_mutuel')
    const tmpProfileId = Number(tmp.lastInsertRowid)
    // Référentiel minimal : un profil sans poste échoue en `categories_not_seeded` avant même
    // d'atteindre la résolution de la banque.
    const tmpGroup = sqlite
      .prepare('INSERT INTO category_groups (profile_id, code, label, position) VALUES (?, ?, ?, 0)')
      .run(tmpProfileId, 'alimentation', 'Alimentation (tmp)')
    sqlite
      .prepare('INSERT INTO category_items (profile_id, code, group_id, label, nature, position) VALUES (?, ?, ?, ?, ?, 0)')
      .run(tmpProfileId, 'alimentation-courses', Number(tmpGroup.lastInsertRowid), 'Courses (tmp)', 'expense')
    const tmpEvent = {
      path: '/api/statements',
      method: 'POST',
      node: { req: { headers: { cookie: `pf_profile=${tmpProfileId}` } }, res: {} },
    } as unknown as H3Event

    try {
      mockExtract()
      mockCategorize([])
      const result = await orch.ingestStatement({ event: tmpEvent, pdfBuffer: pdf('profile-default-bank'), confirmReplace: false })
      expect(vi.mocked(pdfMod.extractStatement).mock.calls[0]![1]).toBe('credit_mutuel')
      const stmt = dbMod.db.select().from(schema.bankStatements).all().find(s => s.hashSha256 === result.hash)
      expect(stmt?.bank).toBe('credit_mutuel')
    }
    finally {
      sqlite.prepare('DELETE FROM bank_statements WHERE profile_id = ?').run(tmpProfileId)
      sqlite.prepare('DELETE FROM category_items WHERE profile_id = ?').run(tmpProfileId)
      sqlite.prepare('DELETE FROM category_groups WHERE profile_id = ?').run(tmpProfileId)
      sqlite.prepare('DELETE FROM profiles WHERE id = ?').run(tmpProfileId)
    }
  })

  it('banque déclarée ne reconnaît pas le relevé → 400 bank_mismatch (FR78, AR38)', async () => {
    const { BankMismatchError } = await import('~~/server/services/bank-formats/types')
    vi.mocked(pdfMod.extractStatement).mockRejectedValue(new BankMismatchError('credit_mutuel', 'boursorama'))
    await expect(
      orch.ingestStatement({ event: FAKE_EVENT, pdfBuffer: pdf('bank-mismatch'), confirmReplace: false, bank: 'credit_mutuel' }),
    ).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: ApiErrorCode.BankMismatch,
      data: { expected: 'credit_mutuel', detected: 'boursorama' },
    })
    // AVANT tout appel au fournisseur, sans PDF sauvegardé ni ligne écrite.
    expect(llmMod.categorizeStatement).not.toHaveBeenCalled()
    expect(dbMod.db.select().from(schema.bankStatements).all()).toHaveLength(0)
    expect(dbMod.db.select().from(schema.transactions).all()).toHaveLength(0)
    expect(existsSync(pdfPathFor(pdf('bank-mismatch')))).toBe(false)
  })

  it('structure Crédit Mutuel non reconnue (story 28.2) → 400 statement_format_unrecognized, avant l\'appel au fournisseur', async () => {
    vi.mocked(pdfMod.extractStatement).mockRejectedValue(
      new StatementFormatError('unsupported_balance_line', { label: 'SOLDE DEBITEUR AU' }),
    )
    await expect(
      orch.ingestStatement({ event: FAKE_EVENT, pdfBuffer: pdf('cm-debtor'), confirmReplace: false, bank: 'credit_mutuel' }),
    ).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: ApiErrorCode.StatementFormatUnrecognized,
      data: { reason: 'unsupported_balance_line', label: 'SOLDE DEBITEUR AU' },
    })
    expect(llmMod.categorizeStatement).not.toHaveBeenCalled()
    expect(dbMod.db.select().from(schema.bankStatements).all()).toHaveLength(0)
    expect(existsSync(pdfPathFor(pdf('cm-debtor')))).toBe(false)
  })

  it('les sections ignorées de l\'extraction sont rendues dans la réponse (AC 2, story 28.2)', async () => {
    mockExtract({ ignoredSections: ['LIVRET BLEU', 'PLAN D\'EPARGNE LOGEMENT EXEMPLE'], openingBalanceCents: 100_000, closingBalanceCents: 90_000 })
    mockCategorize([
      { transactionDate: '2026-04-05', label: 'Op', amountCents: -10_000, categoryItemCode: 'alimentation-courses' },
    ])
    const result = await orch.ingestStatement({ event: FAKE_EVENT, pdfBuffer: pdf('ignored-sections'), confirmReplace: false })
    expect(result.ignoredSections).toEqual(['LIVRET BLEU', 'PLAN D\'EPARGNE LOGEMENT EXEMPLE'])
  })

  it('fallback période G3 : déduit periodStart/End des dates min/max si extracteur null', async () => {
    mockExtract({ periodStart: null, periodEnd: null })
    mockCategorize([
      { transactionDate: '2026-03-05', label: 'A', amountCents: -10_000, categoryItemCode: 'alimentation-courses' },
      { transactionDate: '2026-03-25', label: 'B', amountCents: -40_000, categoryItemCode: 'alimentation-courses' },
    ])

    const result = await orch.ingestStatement({ event: FAKE_EVENT, pdfBuffer: pdf('no-period'), confirmReplace: false })
    expect(result.periodStart).toBe('2026-03-05')
    expect(result.periodEnd).toBe('2026-03-25')
  })

  it('soldes manquants → pdf_parse_failed', async () => {
    mockExtract({ openingBalanceCents: null })
    mockCategorize([])
    await expect(
      orch.ingestStatement({ event: FAKE_EVENT, pdfBuffer: pdf('no-balance'), confirmReplace: false }),
    ).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: ApiErrorCode.PdfParseFailed,
    })
  })

  it('réconciliation déséquilibrée : isBalanced=false avec gap retourné', async () => {
    mockExtract({ openingBalanceCents: 100_000, closingBalanceCents: 50_000 })
    mockCategorize([
      { transactionDate: '2026-04-10', label: 'X', amountCents: -40_000, categoryItemCode: 'alimentation-courses' },
    ])
    const result = await orch.ingestStatement({ event: FAKE_EVENT, pdfBuffer: pdf('imbalanced'), confirmReplace: false })
    expect(result.isBalanced).toBe(false)
    // expected = 50_000 - 100_000 = -50_000 ; found = -40_000 ; gap = -50_000 - (-40_000) = -10_000
    expect(result.gapCents).toBe(-10_000)
  })

  it('rollback FS : si la tx DB échoue (FK violation), le PDF est supprimé', async () => {
    mockExtract()
    mockCategorize([
      { transactionDate: '2026-04-10', label: 'X', amountCents: -50_000, categoryItemCode: 'nonexistent_cat' },
    ])

    const buf = pdf('fs-rollback-case')
    await expect(
      orch.ingestStatement({ event: FAKE_EVENT, pdfBuffer: buf, confirmReplace: false }),
    ).rejects.toThrow()

    expect(existsSync(pdfPathFor(buf))).toBe(false)
    expect(dbMod.db.select().from(schema.bankStatements).all()).toHaveLength(0)
  })

  /**
   * Story 17.4 — dates bornées à la période du relevé.
   *
   * Rien ne contraignait les dates du modèle : une ligne du relevé de mars 2026 datée
   * 2025-03-05 partait polluer l'analyse de mars 2025, sans que la fiabilité — calculée par
   * période de relevé — ne signale quoi que ce soit.
   */
  describe('bornage des dates à la période (story 17.4)', () => {
    it('refuse une ligne antérieure à la période', async () => {
      mockExtract({ periodStart: '2026-04-01', periodEnd: '2026-04-30' })
      mockCategorize([
        { transactionDate: '2026-04-05', label: 'Courses', amountCents: -30_000, categoryItemCode: 'alimentation-courses' },
        { transactionDate: '2025-03-05', label: 'Ligne égarée', amountCents: -20_000, categoryItemCode: 'alimentation-courses' },
      ])

      await expect(
        orch.ingestStatement({ event: FAKE_EVENT, pdfBuffer: pdf('out-of-period-before'), confirmReplace: false }),
      ).rejects.toMatchObject({
        statusCode: 502,
        statusMessage: ApiErrorCode.LlmExtractionFailed,
      })
      expect(dbMod.db.select().from(schema.bankStatements).all()).toHaveLength(0)
    })

    it('refuse une ligne postérieure à la période', async () => {
      mockExtract({ periodStart: '2026-04-01', periodEnd: '2026-04-30' })
      mockCategorize([
        { transactionDate: '2026-05-02', label: 'Trop tard', amountCents: -50_000, categoryItemCode: 'alimentation-courses' },
      ])

      await expect(
        orch.ingestStatement({ event: FAKE_EVENT, pdfBuffer: pdf('out-of-period-after'), confirmReplace: false }),
      ).rejects.toMatchObject({ statusCode: 502 })
    })

    it('accepte les dates aux bornes exactes', async () => {
      mockExtract({ periodStart: '2026-04-01', periodEnd: '2026-04-30', openingBalanceCents: 100_000, closingBalanceCents: 50_000 })
      mockCategorize([
        { transactionDate: '2026-04-01', label: 'Premier jour', amountCents: -25_000, categoryItemCode: 'alimentation-courses' },
        { transactionDate: '2026-04-30', label: 'Dernier jour', amountCents: -25_000, categoryItemCode: 'alimentation-courses' },
      ])

      const result = await orch.ingestStatement({ event: FAKE_EVENT, pdfBuffer: pdf('bounds-inclusive'), confirmReplace: false })
      expect(result.transactionCount).toBe(2)
    })

    it('ne rejette rien quand la période vient du repli sur les dates extraites', async () => {
      // La période est alors l'enveloppe des dates : la garde ne peut pas mordre.
      mockExtract({ periodStart: null, periodEnd: null, openingBalanceCents: 100_000, closingBalanceCents: 50_000 })
      mockCategorize([
        { transactionDate: '2025-03-05', label: 'Vieille ligne', amountCents: -25_000, categoryItemCode: 'alimentation-courses' },
        { transactionDate: '2026-04-30', label: 'Récente', amountCents: -25_000, categoryItemCode: 'alimentation-courses' },
      ])

      const result = await orch.ingestStatement({ event: FAKE_EVENT, pdfBuffer: pdf('fallback-period'), confirmReplace: false })
      expect(result.periodStart).toBe('2025-03-05')
      expect(result.periodEnd).toBe('2026-04-30')
    })
  })

  /**
   * Story 17.5 — les soldes sont vérifiés AVANT l'appel au fournisseur.
   *
   * Un relevé sans solde lisible faisait payer un appel voué au rejet : le contrôle ne dépend
   * que du texte extrait et n'a rien à faire derrière l'appel.
   */
  describe('ordre des étapes (story 17.5)', () => {
    it.each([
      ['ouverture', { openingBalanceCents: null }],
      ['clôture', { closingBalanceCents: null }],
    ])('refuse un solde de %s illisible sans appeler le fournisseur', async (_name, opts) => {
      mockExtract(opts)
      mockCategorize([])

      await expect(
        orch.ingestStatement({ event: FAKE_EVENT, pdfBuffer: pdf(`no-balance-${_name}`), confirmReplace: false }),
      ).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: ApiErrorCode.PdfParseFailed,
      })
      expect(vi.mocked(llmMod.categorizeStatement)).not.toHaveBeenCalled()
    })
  })

  /**
   * Story 17.5 — un défaut de configuration se distingue d'une panne du fournisseur.
   *
   * Sans code métier dédié, une clé invalide sortait en « fournisseur indisponible » et l'UI
   * proposait un bouton « Réessayer » sur un problème que retenter ne résout pas.
   */
  it('traduit un défaut de configuration en code métier dédié', async () => {
    mockExtract()
    vi.mocked(llmMod.categorizeStatement).mockRejectedValue(
      new llmMod.LlmConfigError('Accès refusé (401)'),
    )

    await expect(
      orch.ingestStatement({ event: FAKE_EVENT, pdfBuffer: pdf('llm-config'), confirmReplace: false }),
    ).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: ApiErrorCode.LlmConfigError,
    })
  })

  /**
   * AC 5 (story 27.2) : A dépose un relevé couvrant une période que seul B a déjà ingérée —
   * aucun chevauchement n'est signalé, le dépôt réussit.
   *
   * ⚠️ Semé un second profil de façon PERMANENTE dans la base de ce fichier (aucun cleanup
   * possible sans violer la FK `bank_statements.profile_id`) : ce test reste le DERNIER de la
   * suite, pour ne pas casser le repli « exactement un profil » (AC 10) sur lequel `FAKE_EVENT`
   * s'appuie dans tous les tests précédents.
   */
  it('chevauchement avec un relevé d\'un AUTRE profil : ignoré, pas de period_overlap (AC 5)', async () => {
    // Profil B, avec son propre référentiel minimal (un profil ne voit que ses propres codes).
    const other = sqlite
      .prepare('INSERT INTO profiles (name, default_bank) VALUES (?, ?)')
      .run('conjoint', 'boursorama')
    const otherProfileId = Number(other.lastInsertRowid)
    const otherGroup = sqlite
      .prepare('INSERT INTO category_groups (profile_id, code, label, position) VALUES (?, ?, ?, 0)')
      .run(otherProfileId, 'alimentation', 'Alimentation (B)')
    sqlite
      .prepare('INSERT INTO category_items (profile_id, code, group_id, label, nature, position) VALUES (?, ?, ?, ?, ?, 0)')
      .run(otherProfileId, 'alimentation-courses', Number(otherGroup.lastInsertRowid), 'Courses (B)', 'expense')

    const eventForB = {
      path: '/api/statements',
      method: 'POST',
      node: { req: { headers: { cookie: `pf_profile=${otherProfileId}` } }, res: {} },
    } as unknown as H3Event

    // B ingère avril en premier.
    mockExtract({ periodStart: '2026-04-01', periodEnd: '2026-04-30' })
    mockCategorize([
      { transactionDate: '2026-04-10', label: 'A', amountCents: -50_000, categoryItemCode: 'alimentation-courses' },
    ])
    await orch.ingestStatement({ event: eventForB, pdfBuffer: pdf('other-profile-april'), confirmReplace: false })

    // A dépose ensuite un relevé qui couvre la MÊME période : aucun chevauchement pour A.
    // Deux profils existent désormais, le cookie doit désigner A explicitement (AC 10).
    const eventForA = {
      path: '/api/statements',
      method: 'POST',
      node: { req: { headers: { cookie: 'pf_profile=1' } }, res: {} },
    } as unknown as H3Event
    mockExtract({ periodStart: '2026-04-15', periodEnd: '2026-05-15' })
    mockCategorize([
      { transactionDate: '2026-04-20', label: 'B', amountCents: -30_000, categoryItemCode: 'alimentation-courses' },
    ])
    const result = await orch.ingestStatement({
      event: eventForA,
      pdfBuffer: pdf('profile-a-overlaps-b'),
      confirmReplace: false,
    })

    // Aucun `period_overlap` : la période de B n'entre pas dans le calcul de A.
    expect(result.periodStart).toBe('2026-04-15')
    const statements = dbMod.db.select().from(schema.bankStatements).all()
    expect(statements).toHaveLength(2)
    expect(statements.find(s => s.profileId === 1)!.periodStart).toBe('2026-04-15')
    expect(statements.find(s => s.profileId === otherProfileId)!.periodStart).toBe('2026-04-01')
  })
})

// ---------------------------------------------------------------------------------------------
// ingestExport — Excel (story 28.4, D44)
// ---------------------------------------------------------------------------------------------

function xlsx(content: string): Buffer {
  return Buffer.from(content, 'utf8')
}

interface MockOp { transactionDate: string, label: string, amountCents: number }

function mockExportExtract(opts: {
  operations?: MockOp[]
  closingBalanceCents?: number
  periodStart?: string
  periodEnd?: string
  knownNumbers?: string[]
  ignoredSheets?: string[]
} = {}) {
  const operations = opts.operations ?? [
    { transactionDate: '2026-04-05', label: 'CARTE ACHAT SUPERMARCHE FICTIF', amountCents: -8_750 },
    { transactionDate: '2026-04-10', label: 'VIR RECU AMI FICTIF', amountCents: 5_000 },
  ]
  vi.mocked(spreadsheetMod.extractExport).mockResolvedValue({
    operations,
    closingBalanceCents: opts.closingBalanceCents ?? 96_250,
    periodStart: opts.periodStart ?? '2026-04-05',
    periodEnd: opts.periodEnd ?? '2026-04-11',
    knownNumbers: opts.knownNumbers ?? [],
    ignoredSheets: opts.ignoredSheets ?? ['Vos comptes'],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

/** Retourne un code de poste identique pour chaque libellé reçu, dans l'ordre. */
function mockCategorizeLabelsWith(codeFor: (label: string) => string) {
  vi.mocked(llmMod.categorizeLabels).mockImplementation(async labels => labels.map(l => codeFor(l.label)))
}

/** Code de poste effectivement persisté pour une transaction, par jointure sur son id. */
function categoryCodeOf(itemId: number): string {
  const found = dbMod.db.select({ code: schema.categoryItems.code, id: schema.categoryItems.id })
    .from(schema.categoryItems)
    .all()
    .find(c => c.id === itemId)
  if (!found) throw new Error(`unknown item id ${itemId}`)
  return found.code
}

describe('ingestExport (orchestrator, story 28.4)', () => {
  it('happy path : source = export, opening déduit, continuity_gap_cents NULL, card_detail_missing', async () => {
    mockExportExtract({
      operations: [
        { transactionDate: '2026-04-05', label: 'CARTE ACHAT SUPERMARCHE FICTIF', amountCents: -8_750 },
        { transactionDate: '2026-04-10', label: 'RELEVE CARTE', amountCents: -32_000 },
        { transactionDate: '2026-05-10', label: 'RELEVE CARTE', amountCents: -41_000 },
      ],
      closingBalanceCents: 100_000,
      periodStart: '2026-04-05',
      periodEnd: '2026-05-11',
    })
    mockCategorizeLabelsWith(() => 'alimentation-courses')

    const buf = xlsx('happy-path-export')
    const result = await orch.ingestExport({ event: PROFILE_1_EVENT, fileBuffer: buf, confirmReplace: false })

    expect(result.source).toBe('export')
    expect(result.transactionCount).toBe(3)
    expect(result.isBalanced).toBe(true)
    expect(result.gapCents).toBe(0)
    expect(result.ignoredSheets).toEqual(['Vos comptes'])
    expect(result.cardAggregateMonths).toEqual(['2026-04', '2026-05'])

    const [stmt] = dbMod.db.select().from(schema.bankStatements).all()
    expect(stmt!.source).toBe('export')
    expect(stmt!.continuityGapCents).toBeNull()
    expect(stmt!.cardDetailMissing).toBe(true)
    expect(stmt!.closingBalanceCents).toBe(100_000)
    expect(stmt!.openingBalanceCents).toBe(100_000 - (-8_750 - 32_000 - 41_000))
    expect(existsSync(xlsxPathFor(buf))).toBe(true)
  })

  it('les lignes RELEVE CARTE sont rangées sur le poste dédié, hors modèle', async () => {
    mockExportExtract({
      operations: [
        { transactionDate: '2026-04-05', label: 'CARTE ACHAT SUPERMARCHE FICTIF', amountCents: -8_750 },
        { transactionDate: '2026-04-28', label: 'RELEVE CARTE', amountCents: -32_000 },
      ],
    })
    mockCategorizeLabelsWith(() => 'alimentation-courses')

    await orch.ingestExport({ event: PROFILE_1_EVENT, fileBuffer: xlsx('card-lines'), confirmReplace: false })

    // Le modèle ne reçoit PAS la ligne carte.
    const [labels] = vi.mocked(llmMod.categorizeLabels).mock.calls
    expect(labels![0].map(l => l.label)).not.toContain('RELEVE CARTE')
    expect(labels![0]).toHaveLength(1)

    const rows = dbMod.db
      .select({ label: schema.transactions.label, itemId: schema.transactions.categoryItemId })
      .from(schema.transactions)
      .all()
    const cardRow = rows.find(r => r.label === 'RELEVE CARTE')!
    expect(categoryCodeOf(cardRow.itemId)).toBe(CARD_UNDETAILED_ITEM_CODE)
  })

  it('texte transmis au modèle : aucun identifiant, montant, titre de feuille ni « Solde »/« R.I.B. »', async () => {
    mockExportExtract({
      operations: [
        { transactionDate: '2026-04-05', label: 'VIR PEL 00012345678', amountCents: -20_000 },
      ],
      knownNumbers: ['00012345678'],
    })
    mockCategorizeLabelsWith(() => 'alimentation-courses')

    await orch.ingestExport({ event: PROFILE_1_EVENT, fileBuffer: xlsx('masking'), confirmReplace: false })

    const [labels] = vi.mocked(llmMod.categorizeLabels).mock.calls
    const transmitted = labels![0].map(l => l.label).join(' ')
    expect(transmitted).not.toContain('00012345678')
    expect(transmitted).not.toMatch(/\d+[.,]\d{2}/)
    expect(transmitted).not.toMatch(/Solde/i)
    expect(transmitted).not.toMatch(/R\.I\.B\./i)
  })

  it('libellés dédoublonnés avant l\'appel au modèle', async () => {
    mockExportExtract({
      operations: [
        { transactionDate: '2026-04-05', label: 'CARTE ACHAT SUPERMARCHE FICTIF', amountCents: -8_750 },
        { transactionDate: '2026-04-06', label: 'CARTE ACHAT SUPERMARCHE FICTIF', amountCents: -1_200 },
      ],
    })
    mockCategorizeLabelsWith(() => 'alimentation-courses')

    await orch.ingestExport({ event: PROFILE_1_EVENT, fileBuffer: xlsx('dedup'), confirmReplace: false })

    const [labels] = vi.mocked(llmMod.categorizeLabels).mock.calls
    expect(labels![0]).toHaveLength(1)
    const rows = dbMod.db.select().from(schema.transactions).all()
    expect(rows).toHaveLength(2)
  })

  it('dédup fichier : 2e dépôt du même fichier → pdf_already_ingested, modèle non appelé', async () => {
    mockExportExtract()
    mockCategorizeLabelsWith(() => 'alimentation-courses')
    const buf = xlsx('same-export-twice')
    await orch.ingestExport({ event: PROFILE_1_EVENT, fileBuffer: buf, confirmReplace: false })

    vi.mocked(llmMod.categorizeLabels).mockClear()
    await expect(orch.ingestExport({ event: PROFILE_1_EVENT, fileBuffer: buf, confirmReplace: false }))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: ApiErrorCode.PdfAlreadyIngested })
    expect(llmMod.categorizeLabels).not.toHaveBeenCalled()
  })

  it('export reconnu sous une autre banque → bank_mismatch, aucun fichier, aucune ligne', async () => {
    vi.mocked(spreadsheetMod.extractExport).mockRejectedValue(new BankMismatchError('boursorama', 'credit_mutuel'))
    const buf = xlsx('wrong-bank')

    await expect(orch.ingestExport({ event: PROFILE_1_EVENT, fileBuffer: buf, confirmReplace: false, bank: 'boursorama' }))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: ApiErrorCode.BankMismatch })
    expect(llmMod.categorizeLabels).not.toHaveBeenCalled()
    expect(existsSync(xlsxPathFor(buf))).toBe(false)
    expect(dbMod.db.select().from(schema.bankStatements).all()).toHaveLength(0)
  })

  it('.xlsx non reconnu → statement_format_unrecognized, aucun fichier, aucune ligne', async () => {
    vi.mocked(spreadsheetMod.extractExport).mockRejectedValue(new ExportFormatError('no_recognized_account_sheet'))
    const buf = xlsx('unrecognized')

    await expect(orch.ingestExport({ event: PROFILE_1_EVENT, fileBuffer: buf, confirmReplace: false }))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: ApiErrorCode.StatementFormatUnrecognized })
    expect(llmMod.categorizeLabels).not.toHaveBeenCalled()
    expect(existsSync(xlsxPathFor(buf))).toBe(false)
    expect(dbMod.db.select().from(schema.bankStatements).all()).toHaveLength(0)
  })

  it('poste carte non détaillée absent du profil → 500 categories_not_seeded', async () => {
    mockExportExtract()
    mockCategorizeLabelsWith(() => 'alimentation-courses')
    dbMod.db.delete(schema.categoryItems).where(eq(schema.categoryItems.code, CARD_UNDETAILED_ITEM_CODE)).run()

    await expect(orch.ingestExport({ event: PROFILE_1_EVENT, fileBuffer: xlsx('missing-card-item'), confirmReplace: false }))
      .rejects.toMatchObject({ statusCode: 500, statusMessage: ApiErrorCode.CategoriesNotSeeded })
    expect(llmMod.categorizeLabels).not.toHaveBeenCalled()

    // Remet le poste en place pour ne pas polluer les tests suivants.
    const divers = dbMod.db.select({ id: schema.categoryGroups.id }).from(schema.categoryGroups)
      .where(eq(schema.categoryGroups.code, 'divers')).all()[0]!
    dbMod.db.insert(schema.categoryItems).values({
      profileId: 1,
      code: CARD_UNDETAILED_ITEM_CODE,
      groupId: divers.id,
      label: 'Carte (non détaillée)',
      nature: 'expense',
      position: 99,
    }).run()
  })

  it('chevauchement de période sans confirmation → 409, SANS appel au modèle', async () => {
    mockExportExtract({ periodStart: '2026-06-01', periodEnd: '2026-06-30' })
    mockCategorizeLabelsWith(() => 'alimentation-courses')
    await orch.ingestExport({ event: PROFILE_1_EVENT, fileBuffer: xlsx('overlap-1'), confirmReplace: false })

    vi.mocked(llmMod.categorizeLabels).mockClear()
    mockExportExtract({ periodStart: '2026-06-15', periodEnd: '2026-07-15' })
    await expect(orch.ingestExport({ event: PROFILE_1_EVENT, fileBuffer: xlsx('overlap-2'), confirmReplace: false }))
      .rejects.toMatchObject({ statusCode: 409, statusMessage: ApiErrorCode.PeriodOverlap })
    expect(llmMod.categorizeLabels).not.toHaveBeenCalled()
  })
})

describe('raccord relevé PDF / export (story 28.2, AC 12, FR83)', () => {
  const EXPORT_HASH = 'e'.repeat(64)

  /** Export Crédit Mutuel du profil 1, clos à `periodEnd`, sans raccord encore (`unverified`). */
  function seedExport(periodEnd: string, closingBalanceCents: number, periodStart = '2026-09-01') {
    dbMod.db.insert(schema.bankStatements).values({
      hashSha256: EXPORT_HASH,
      profileId: 1,
      bank: 'credit_mutuel',
      periodStart,
      periodEnd,
      openingBalanceCents: 0,
      closingBalanceCents,
      source: 'export',
      continuityGapCents: null,
    }).run()
  }

  function ingestCreditMutuelStatement(name: string) {
    mockExtract({ periodStart: '2026-10-02', periodEnd: '2026-10-16', openingBalanceCents: 200_000, closingBalanceCents: 185_000 })
    mockCategorize([
      { transactionDate: '2026-10-05', label: 'Op avant la date de solde', amountCents: -3_000, categoryItemCode: 'alimentation-courses' },
      { transactionDate: '2026-10-08', label: 'Op le jour de la date de solde', amountCents: -2_000, categoryItemCode: 'alimentation-courses' },
      { transactionDate: '2026-10-10', label: 'Op après la date de solde', amountCents: -10_000, categoryItemCode: 'alimentation-courses' },
    ])
    return orch.ingestStatement({ event: PROFILE_1_EVENT, pdfBuffer: pdf(name), confirmReplace: false, bank: 'credit_mutuel' })
  }

  const statementRow = (hash: string) => dbMod.db.select().from(schema.bankStatements).where(eq(schema.bankStatements.hashSha256, hash)).get()!

  it('raccord à zéro : lignes couvertes écartées, relevé décalé, export passe fiable', async () => {
    seedExport('2026-10-08', 195_000)
    const result = await ingestCreditMutuelStatement('raccord-zero')

    // Écartées : celles datées jusqu'à la date de solde de l'export INCLUSE. Reste 1 ligne.
    expect(result.transactionCount).toBe(1)
    expect(result.periodStart).toBe('2026-10-09')
    expect(result.periodEnd).toBe('2026-10-16')
    expect(result.isBalanced).toBe(true)
    expect(result.gapCents).toBe(0)

    const stmt = statementRow(result.hash)
    expect(stmt.openingBalanceCents).toBe(195_000) // 200 000 − 3 000 − 2 000 (lignes écartées)
    expect(stmt.periodStart).toBe('2026-10-09')
    expect(dbMod.db.select().from(schema.transactions).where(eq(schema.transactions.statementHash, result.hash)).all()).toHaveLength(1)

    const exp = statementRow(EXPORT_HASH)
    expect(exp.continuityGapCents).toBe(0)
    expect(deriveReliability({ gapCents: 0, gapAccepted: false, source: 'export', continuityGapCents: exp.continuityGapCents })).toBe('reliable')
    // Pas de chevauchement : l'export n'a pas été remplacé.
    expect(dbMod.db.select().from(schema.bankStatements).all()).toHaveLength(2)
  })

  it('raccord avec écart : l\'écart est écrit sur l\'export, qui devient non fiable', async () => {
    seedExport('2026-10-08', 194_000)
    const result = await ingestCreditMutuelStatement('raccord-ecart')

    expect(result.isBalanced).toBe(true) // le relevé, lui, se réconcilie sur les lignes qu'il porte
    const exp = statementRow(EXPORT_HASH)
    expect(exp.continuityGapCents).toBe(1_000) // 195 000 − 194 000
    expect(deriveReliability({ gapCents: 0, gapAccepted: false, source: 'export', continuityGapCents: exp.continuityGapCents })).toBe('gap_unreviewed')
  })

  it('aucun chevauchement : l\'export reste unverified, relevé inchangé', async () => {
    seedExport('2026-09-26', 195_000)
    const result = await ingestCreditMutuelStatement('raccord-aucun')

    expect(result.transactionCount).toBe(3)
    expect(result.periodStart).toBe('2026-10-02')
    const stmt = statementRow(result.hash)
    expect(stmt.openingBalanceCents).toBe(200_000)
    const exp = statementRow(EXPORT_HASH)
    expect(exp.continuityGapCents).toBeNull()
    expect(deriveReliability({ gapCents: 0, gapAccepted: false, source: 'export', continuityGapCents: exp.continuityGapCents })).toBe('unverified')
  })

  it('export commençant APRÈS le début du relevé : pas de raccord, 409 period_overlap', async () => {
    seedExport('2026-10-08', 195_000, '2026-10-04')
    await expect(ingestCreditMutuelStatement('raccord-export-tardif')).rejects.toMatchObject({ statusCode: 409, statusMessage: ApiErrorCode.PeriodOverlap })
    expect(statementRow(EXPORT_HASH).continuityGapCents).toBeNull()
  })

  it('export couvrant tout le relevé : pas de raccord, 409 period_overlap', async () => {
    seedExport('2026-10-20', 195_000)
    await expect(ingestCreditMutuelStatement('raccord-export-couvrant')).rejects.toMatchObject({ statusCode: 409, statusMessage: ApiErrorCode.PeriodOverlap })
    expect(statementRow(EXPORT_HASH).continuityGapCents).toBeNull()
  })

  it('borne : export clos le jour du début du relevé → raccord, aucune ligne écartée', async () => {
    seedExport('2026-10-02', 200_000)
    const result = await ingestCreditMutuelStatement('raccord-borne')
    expect(result.transactionCount).toBe(3)
    expect(result.periodStart).toBe('2026-10-03')
    expect(statementRow(result.hash).openingBalanceCents).toBe(200_000)
    expect(statementRow(EXPORT_HASH).continuityGapCents).toBe(0)
  })

  it('un export d\'une autre banque n\'est pas raccordé (chevauchement ordinaire)', async () => {
    dbMod.db.insert(schema.bankStatements).values({
      hashSha256: EXPORT_HASH, profileId: 1, bank: 'boursorama', periodStart: '2026-09-01', periodEnd: '2026-10-08',
      openingBalanceCents: 0, closingBalanceCents: 195_000, source: 'export', continuityGapCents: null,
    }).run()
    // Pas de raccord : la période de l'autre banque se traite comme un chevauchement ordinaire.
    await expect(ingestCreditMutuelStatement('raccord-autre-banque')).rejects.toMatchObject({ statusMessage: ApiErrorCode.PeriodOverlap })
    expect(statementRow(EXPORT_HASH).continuityGapCents).toBeNull()
  })
})
