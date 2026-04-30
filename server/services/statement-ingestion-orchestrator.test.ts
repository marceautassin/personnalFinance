import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { sha256 } from '~~/server/utils/hash'

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
  return {
    categorizeStatement: vi.fn(),
    LlmExtractionError,
    LlmUnavailableError,
  }
})

type DbModule = typeof import('~~/server/db/client')
type SchemaModule = typeof import('~~/server/db/schema')
type OrchModule = typeof import('./statement-ingestion-orchestrator')
type PdfMod = typeof import('~~/server/services/pdf-extractor')
type LlmMod = typeof import('~~/server/services/llm-categorizer')

let dbMod: DbModule
let schema: SchemaModule
let orch: OrchModule
let pdfMod: PdfMod
let llmMod: LlmMod
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlite: any

beforeAll(async () => {
  dbMod = await import('~~/server/db/client')
  schema = await import('~~/server/db/schema')
  pdfMod = await import('~~/server/services/pdf-extractor')
  llmMod = await import('~~/server/services/llm-categorizer')

  // @ts-expect-error -- propriété interne drizzle (better-sqlite3)
  sqlite = dbMod.db.$client ?? dbMod.db.session?.client
  sqlite.exec(`
    CREATE TABLE category_definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      is_variable INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE bank_statements (
      hash_sha256 TEXT PRIMARY KEY,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      opening_balance_cents INTEGER NOT NULL,
      closing_balance_cents INTEGER NOT NULL,
      reliability TEXT NOT NULL DEFAULT 'reliable',
      ingested_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      statement_hash TEXT NOT NULL REFERENCES bank_statements(hash_sha256) ON DELETE CASCADE,
      transaction_date TEXT NOT NULL,
      label TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      category_code TEXT NOT NULL REFERENCES category_definitions(code) ON DELETE RESTRICT,
      is_manual INTEGER NOT NULL DEFAULT 0,
      is_debt_repayment INTEGER NOT NULL DEFAULT 0,
      debt_id INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX transactions_period_idx ON transactions(transaction_date);
    CREATE INDEX transactions_statement_idx ON transactions(statement_hash);
  `)

  for (const c of [
    { code: 'courses', label: 'Courses' },
    { code: 'restaurants', label: 'Restaurants' },
    { code: 'are', label: 'ARE (chômage)' },
  ]) {
    dbMod.db.insert(schema.categoryDefinitions).values(c).run()
  }

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
})

function pdf(content: string): Buffer {
  return Buffer.from(content, 'utf8')
}

function pdfPathFor(buf: Buffer): string {
  return join(process.env.PDF_STORAGE_DIR!, `${sha256(buf)}.pdf`)
}

function mockExtract(opts: {
  periodStart?: string | null
  periodEnd?: string | null
  openingBalanceCents?: number | null
  closingBalanceCents?: number | null
  rawText?: string
} = {}) {
  vi.mocked(pdfMod.extractStatement).mockResolvedValue({
    rawText: opts.rawText ?? 'rawText sample',
    periodStart: opts.periodStart === undefined ? '2026-04-01' : opts.periodStart,
    periodEnd: opts.periodEnd === undefined ? '2026-04-30' : opts.periodEnd,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    openingBalanceCents: (opts.openingBalanceCents === undefined ? 100_000 : opts.openingBalanceCents) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    closingBalanceCents: (opts.closingBalanceCents === undefined ? 50_000 : opts.closingBalanceCents) as any,
  })
}

function mockCategorize(txs: Array<{
  transactionDate: string
  label: string
  amountCents: number
  categoryCode: string
}>) {
  vi.mocked(llmMod.categorizeStatement).mockResolvedValue(txs)
}

describe('ingestStatement (orchestrator)', () => {
  it('happy path: insère statement + transactions et retourne les méta', async () => {
    mockExtract({ openingBalanceCents: 100_000, closingBalanceCents: 50_000 })
    mockCategorize([
      { transactionDate: '2026-04-05', label: 'Courses Carrefour', amountCents: -30_000, categoryCode: 'courses' },
      { transactionDate: '2026-04-15', label: 'Resto Pizza', amountCents: -20_000, categoryCode: 'restaurants' },
    ])

    const buf = pdf('happy-path-pdf')
    const result = await orch.ingestStatement({ pdfBuffer: buf, confirmReplace: false })

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

  it('dédup : 2e POST avec même PDF → pdf_already_ingested', async () => {
    mockExtract()
    mockCategorize([
      { transactionDate: '2026-04-05', label: 'Op', amountCents: -50_000, categoryCode: 'courses' },
    ])

    const buf = pdf('dedup-same-pdf')
    await orch.ingestStatement({ pdfBuffer: buf, confirmReplace: false })

    await expect(
      orch.ingestStatement({ pdfBuffer: buf, confirmReplace: false }),
    ).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: ApiErrorCode.PdfAlreadyIngested,
    })
  })

  it('chevauchement sans header → period_overlap (409)', async () => {
    mockExtract({ periodStart: '2026-04-01', periodEnd: '2026-04-30' })
    mockCategorize([
      { transactionDate: '2026-04-10', label: 'A', amountCents: -50_000, categoryCode: 'courses' },
    ])
    await orch.ingestStatement({ pdfBuffer: pdf('first-april'), confirmReplace: false })

    mockExtract({ periodStart: '2026-04-15', periodEnd: '2026-05-15' })
    mockCategorize([
      { transactionDate: '2026-04-20', label: 'B', amountCents: -30_000, categoryCode: 'courses' },
    ])

    await expect(
      orch.ingestStatement({ pdfBuffer: pdf('second-overlapping'), confirmReplace: false }),
    ).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: ApiErrorCode.PeriodOverlap,
    })

    expect(dbMod.db.select().from(schema.bankStatements).all()).toHaveLength(1)
  })

  it('chevauchement avec confirmReplace=true → ancien supprimé (CASCADE), nouveau inséré', async () => {
    mockExtract({ periodStart: '2026-04-01', periodEnd: '2026-04-30' })
    mockCategorize([
      { transactionDate: '2026-04-10', label: 'Old', amountCents: -50_000, categoryCode: 'courses' },
    ])
    const firstBuf = pdf('first-april-replace')
    const first = await orch.ingestStatement({ pdfBuffer: firstBuf, confirmReplace: false })

    mockExtract({ periodStart: '2026-04-01', periodEnd: '2026-04-30' })
    mockCategorize([
      { transactionDate: '2026-04-12', label: 'New', amountCents: -40_000, categoryCode: 'courses' },
    ])
    const secondBuf = pdf('second-april-replace')
    const second = await orch.ingestStatement({ pdfBuffer: secondBuf, confirmReplace: true })

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
      orch.ingestStatement({ pdfBuffer: buf, confirmReplace: false }),
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
      orch.ingestStatement({ pdfBuffer: pdf('llm-extract-fail'), confirmReplace: false }),
    ).rejects.toMatchObject({
      statusCode: 502,
      statusMessage: ApiErrorCode.LlmExtractionFailed,
    })
  })

  it('PDF parse failure → pdf_parse_failed (400)', async () => {
    vi.mocked(pdfMod.extractStatement).mockRejectedValue(new Error('PDF extraction failed: malformed'))
    await expect(
      orch.ingestStatement({ pdfBuffer: pdf('bad-pdf'), confirmReplace: false }),
    ).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: ApiErrorCode.PdfParseFailed,
    })
    expect(dbMod.db.select().from(schema.bankStatements).all()).toHaveLength(0)
  })

  it('fallback période G3 : déduit periodStart/End des dates min/max si extracteur null', async () => {
    mockExtract({ periodStart: null, periodEnd: null })
    mockCategorize([
      { transactionDate: '2026-03-05', label: 'A', amountCents: -10_000, categoryCode: 'courses' },
      { transactionDate: '2026-03-25', label: 'B', amountCents: -40_000, categoryCode: 'courses' },
    ])

    const result = await orch.ingestStatement({ pdfBuffer: pdf('no-period'), confirmReplace: false })
    expect(result.periodStart).toBe('2026-03-05')
    expect(result.periodEnd).toBe('2026-03-25')
  })

  it('soldes manquants → pdf_parse_failed', async () => {
    mockExtract({ openingBalanceCents: null })
    mockCategorize([])
    await expect(
      orch.ingestStatement({ pdfBuffer: pdf('no-balance'), confirmReplace: false }),
    ).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: ApiErrorCode.PdfParseFailed,
    })
  })

  it('réconciliation déséquilibrée : isBalanced=false avec gap retourné', async () => {
    mockExtract({ openingBalanceCents: 100_000, closingBalanceCents: 50_000 })
    mockCategorize([
      { transactionDate: '2026-04-10', label: 'X', amountCents: -40_000, categoryCode: 'courses' },
    ])
    const result = await orch.ingestStatement({ pdfBuffer: pdf('imbalanced'), confirmReplace: false })
    expect(result.isBalanced).toBe(false)
    // expected = 50_000 - 100_000 = -50_000 ; found = -40_000 ; gap = -50_000 - (-40_000) = -10_000
    expect(result.gapCents).toBe(-10_000)
  })

  it('rollback FS : si la tx DB échoue (FK violation), le PDF est supprimé', async () => {
    mockExtract()
    mockCategorize([
      { transactionDate: '2026-04-10', label: 'X', amountCents: -50_000, categoryCode: 'nonexistent_cat' },
    ])

    const buf = pdf('fs-rollback-case')
    await expect(
      orch.ingestStatement({ pdfBuffer: buf, confirmReplace: false }),
    ).rejects.toThrow()

    expect(existsSync(pdfPathFor(buf))).toBe(false)
    expect(dbMod.db.select().from(schema.bankStatements).all()).toHaveLength(0)
  })
})
