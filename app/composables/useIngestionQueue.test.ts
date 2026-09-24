import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'

// `useIngestionQueue.ts` utilise `ref`/`computed` en auto-import (Nuxt) — sous Vitest nu, on
// les fournit en globals, comme le ferait le plugin d'auto-import en développement.
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)

const uploadStatementMock = vi.fn()
const refreshListMock = vi.fn()
const invalidateAnalysisMock = vi.fn()

vi.mock('./useStatements', () => ({
  useStatements: () => ({ uploadStatement: uploadStatementMock }),
  useStatementsList: () => ({ refresh: refreshListMock }),
}))
vi.mock('~/composables/useInvalidate', () => ({
  useInvalidate: () => ({ invalidateAnalysis: invalidateAnalysisMock }),
}))

const { useIngestionQueue } = await import('./useIngestionQueue')

beforeEach(() => {
  uploadStatementMock.mockReset()
  refreshListMock.mockReset()
  invalidateAnalysisMock.mockReset()
})

function fakeFile(name = 'releve.pdf'): File {
  return new File(['x'], name, { type: 'application/pdf' })
}

const FAKE_RESULT = {
  hash: 'a'.repeat(64),
  periodStart: '2026-01-01',
  periodEnd: '2026-01-31',
  transactionCount: 1,
  isBalanced: true,
  gapCents: 0,
}

/**
 * AC 1 (story 28.1, revue) : la banque est figée SUR L'ÉLÉMENT au moment du dépôt, pas relue
 * depuis un état extérieur. Ce test manquait — noté BLOQUANT-adjacent en revue de la story,
 * la seule preuve existante étant l'E2E (`import-bank.spec.ts`), plus lente et moins précise
 * sur le contrat exact passé à `uploadStatement`.
 */
describe('useIngestionQueue — banque figée par élément (AC 1)', () => {
  it('enqueue(files, bank) transmet la banque à uploadStatement, et retry() la réutilise après un échec', async () => {
    uploadStatementMock
      .mockResolvedValueOnce({ error: 'Fournisseur indisponible', errorCode: 'llm_unavailable' })
      .mockResolvedValueOnce({ result: FAKE_RESULT })

    const queue = useIngestionQueue()
    queue.enqueue([fakeFile()], 'credit_mutuel')

    await vi.waitFor(() => {
      expect(queue.items.value[0]?.status).toBe('failed')
    })

    expect(uploadStatementMock).toHaveBeenCalledTimes(1)
    expect(uploadStatementMock.mock.calls[0]![1]).toMatchObject({ bank: 'credit_mutuel' })

    const id = queue.items.value[0]!.id
    await queue.retry(id)

    expect(uploadStatementMock).toHaveBeenCalledTimes(2)
    // Même banque au second appel : `retry` ne relit rien d'externe, il rejoue l'élément tel quel.
    expect(uploadStatementMock.mock.calls[1]![1]).toMatchObject({ bank: 'credit_mutuel' })
    expect(queue.items.value[0]!.status).toBe('success')
  })

  it('deux dépôts avec des banques différentes gardent chacun la leur', async () => {
    uploadStatementMock
      .mockResolvedValueOnce({ result: FAKE_RESULT })
      .mockResolvedValueOnce({ result: FAKE_RESULT })

    const queue = useIngestionQueue()
    queue.enqueue([fakeFile('a.pdf')], 'boursorama')
    await vi.waitFor(() => expect(queue.items.value[0]?.status).toBe('success'))

    queue.enqueue([fakeFile('b.pdf')], 'credit_mutuel')
    await vi.waitFor(() => expect(queue.items.value[1]?.status).toBe('success'))

    expect(uploadStatementMock.mock.calls[0]![1]).toMatchObject({ bank: 'boursorama' })
    expect(uploadStatementMock.mock.calls[1]![1]).toMatchObject({ bank: 'credit_mutuel' })
  })
})
