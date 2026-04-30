import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sha256 } from './hash'
import { savePdfByHash, pdfExists, loadPdfByHash, deletePdfByHash } from './file-storage'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'pf-test-'))
  process.env.PDF_STORAGE_DIR = tmpDir
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.PDF_STORAGE_DIR
})

describe('file-storage round-trip', () => {
  it('save → exists → load → delete → !exists', async () => {
    const content = Buffer.from('fake pdf content')
    const hash = sha256(content)

    expect(pdfExists(hash)).toBe(false)

    await savePdfByHash(content, hash)
    expect(pdfExists(hash)).toBe(true)

    const loaded = await loadPdfByHash(hash)
    expect(loaded.equals(content)).toBe(true)

    await deletePdfByHash(hash)
    expect(pdfExists(hash)).toBe(false)
  })

  it('save is idempotent (re-save same hash)', async () => {
    const content = Buffer.from('x')
    const hash = sha256(content)
    await savePdfByHash(content, hash)
    await expect(savePdfByHash(content, hash)).resolves.not.toThrow()
  })

  it('delete is idempotent on missing hash', async () => {
    await expect(deletePdfByHash('a'.repeat(64))).resolves.not.toThrow()
  })

  it('rejects invalid hash format', async () => {
    await expect(savePdfByHash(Buffer.from('x'), 'not-a-hash')).rejects.toThrow()
  })

  it('rejects uppercase hex hash (lowercase convention)', async () => {
    await expect(savePdfByHash(Buffer.from('x'), 'A'.repeat(64))).rejects.toThrow()
  })

  it('loadPdfByHash throws when absent', async () => {
    await expect(loadPdfByHash('b'.repeat(64))).rejects.toThrow()
  })
})
