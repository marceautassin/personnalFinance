import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const fetchMock = vi.fn()
const mapErrorMock = vi.fn((err: unknown) => {
  const e = err as { statusMessage?: string, data?: { statusMessage?: string } }
  return `mapped:${e.data?.statusMessage ?? e.statusMessage ?? 'unknown'}`
})
const invalidateAnalysis = vi.fn()

vi.stubGlobal('$fetch', fetchMock)
vi.stubGlobal('useApiError', () => ({ mapError: mapErrorMock }))
vi.stubGlobal('useInvalidate', () => ({ invalidateAnalysis }))

const { useStatements } = await import('./useStatements')

beforeEach(() => {
  fetchMock.mockReset()
  mapErrorMock.mockClear()
  invalidateAnalysis.mockClear()
})
afterEach(() => vi.clearAllMocks())

const fakeFile = new File(['hello'], 'releve.pdf', { type: 'application/pdf' })

describe('useStatements.uploadStatement', () => {
  /**
   * Story 17.7 — l'invalidation n'est PLUS déclenchée par fichier.
   *
   * Sur un dépôt d'historique de vingt-quatre relevés, une invalidation globale par fichier
   * provoquait vingt-quatre rechargements complets de toutes les vues montées, pour des états
   * intermédiaires que personne ne regarde. C'est la file (`useIngestionQueue.drain`) qui
   * invalide une fois, quand elle se vide.
   */
  it('retourne le résultat sans invalider les vues à chaque fichier', async () => {
    const result = {
      hash: 'a'.repeat(64),
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      transactionCount: 12,
      isBalanced: true,
      gapCents: 0,
    }
    fetchMock.mockResolvedValueOnce(result)

    const out = await useStatements().uploadStatement(fakeFile)

    expect(out.result).toEqual(result)
    expect(out.error).toBeUndefined()
    expect(out.overlap).toBeUndefined()
    expect(invalidateAnalysis).not.toHaveBeenCalled()

    // POST multipart sans header Confirm-Replace par défaut
    const [url, opts] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/statements')
    expect(opts.method).toBe('POST')
    expect(opts.body).toBeInstanceOf(FormData)
    expect(opts.headers).toBeUndefined()
  })

  it('ajoute le champ multipart bank quand fourni (AC 2, story 28.1)', async () => {
    fetchMock.mockResolvedValueOnce({
      hash: 'd'.repeat(64),
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      transactionCount: 0,
      isBalanced: true,
      gapCents: 0,
    })
    await useStatements().uploadStatement(fakeFile, { bank: 'credit_mutuel' })
    const [, opts] = fetchMock.mock.calls[0]!
    const form = opts.body as FormData
    expect(form.get('bank')).toBe('credit_mutuel')
  })

  it('n\'ajoute aucun champ bank quand absent — le serveur retombe sur le défaut du profil', async () => {
    fetchMock.mockResolvedValueOnce({
      hash: 'e'.repeat(64),
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      transactionCount: 0,
      isBalanced: true,
      gapCents: 0,
    })
    await useStatements().uploadStatement(fakeFile)
    const [, opts] = fetchMock.mock.calls[0]!
    const form = opts.body as FormData
    expect(form.get('bank')).toBeNull()
  })

  it('ajoute le header X-Confirm-Replace quand confirmReplace = true', async () => {
    fetchMock.mockResolvedValueOnce({
      hash: 'b'.repeat(64),
      periodStart: '2026-02-01',
      periodEnd: '2026-02-28',
      transactionCount: 1,
      isBalanced: true,
      gapCents: 0,
    })
    await useStatements().uploadStatement(fakeFile, { confirmReplace: true })
    const [, opts] = fetchMock.mock.calls[0]!
    expect(opts.headers).toEqual({ 'X-Confirm-Replace': 'true' })
  })

  it('retourne overlap (et pas error) sur 409 period_overlap', async () => {
    const overlapData = {
      statusMessage: 'period_overlap',
      existingHashes: ['c'.repeat(64)],
      existingPeriods: [{ start: '2026-01-01', end: '2026-01-31' }],
      newPeriod: { start: '2026-01-15', end: '2026-02-14' },
    }
    fetchMock.mockRejectedValueOnce({ statusCode: 409, statusMessage: 'Conflict', data: overlapData })

    const out = await useStatements().uploadStatement(fakeFile)

    expect(out.overlap).toEqual({
      existingHashes: overlapData.existingHashes,
      existingPeriods: overlapData.existingPeriods,
      newPeriod: overlapData.newPeriod,
    })
    expect(out.error).toBeUndefined()
    expect(out.result).toBeUndefined()
    expect(mapErrorMock).not.toHaveBeenCalled()
    expect(invalidateAnalysis).not.toHaveBeenCalled()
  })

  it('retombe sur error si 409 mais data est incomplète', async () => {
    fetchMock.mockRejectedValueOnce({ statusCode: 409, data: { statusMessage: 'period_overlap' } })
    const out = await useStatements().uploadStatement(fakeFile)
    expect(out.overlap).toBeUndefined()
    expect(out.error).toBeDefined()
  })

  it('mappe les autres erreurs vers un message FR et expose errorCode', async () => {
    fetchMock.mockRejectedValueOnce({
      statusCode: 400,
      statusMessage: 'Bad Request',
      data: { statusMessage: 'pdf_already_ingested' },
    })
    const out = await useStatements().uploadStatement(fakeFile)
    expect(out.error).toBe('mapped:pdf_already_ingested')
    expect(out.errorCode).toBe('pdf_already_ingested')
    expect(mapErrorMock).toHaveBeenCalledTimes(1)
    expect(invalidateAnalysis).not.toHaveBeenCalled()
  })

  it('retourne aborted=true quand le signal est avorté', async () => {
    const ctrl = new AbortController()
    fetchMock.mockImplementationOnce(() => {
      ctrl.abort()
      const err = new Error('aborted') as Error & { name: string }
      err.name = 'AbortError'
      return Promise.reject(err)
    })
    const out = await useStatements().uploadStatement(fakeFile, { signal: ctrl.signal })
    expect(out.aborted).toBe(true)
    expect(out.error).toBeUndefined()
    expect(out.errorCode).toBeUndefined()
    expect(mapErrorMock).not.toHaveBeenCalled()
  })
})

describe('isRetryableErrorCode', () => {
  it('retourne true pour llm_unavailable et pdf_parse_failed uniquement', async () => {
    const { isRetryableErrorCode } = await import('./useStatements')
    expect(isRetryableErrorCode('llm_unavailable')).toBe(true)
    expect(isRetryableErrorCode('pdf_parse_failed')).toBe(true)
    expect(isRetryableErrorCode('pdf_already_ingested')).toBe(false)
    expect(isRetryableErrorCode('period_overlap')).toBe(false)
    expect(isRetryableErrorCode(undefined)).toBe(false)
  })
})
