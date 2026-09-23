import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { sha256 } from '~~/server/utils/hash'
import { TEST_SCHEMA_DDL, TEST_REFERENTIAL_DDL } from '~~/tests/fixtures/test-schema'

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
    LlmConfigError,
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
    // (48 postes) — ce qui prouve la lecture DB et non le repli sur la constante. Un poste
    // créé par l'utilisateur doit être proposé au modèle dès l'ingestion suivante.
    const seeded = dbMod.db.select({ code: schema.categoryItems.code }).from(schema.categoryItems).all()
    // Tous les postes de la base SAUF « Part remboursée » : ce poste est CALCULÉ, alimenté par
    // la coupe du compte joint et par rien d'autre. Le proposer au modèle l'inviterait à y
    // ranger de vraies lignes, qui compteraient EN PLUS de la moitié coupée (story 21.1).
    const attendus = seeded.map(r => r.code).filter(c => c !== 'compte-joint-part-remboursee')
    expect(passed.map(c => c.code).sort()).toEqual(attendus.sort())
    expect(passed.map(c => c.code)).not.toContain('compte-joint-part-remboursee')
    expect(passed.map(c => c.code)).toContain('internes-virement-joint')
    expect(passed.length).toBeLessThan(48)
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
