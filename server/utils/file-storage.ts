/**
 * file-storage — gestion des PDFs sources sur le filesystem local.
 *
 * Convention : un PDF est identifié par son SHA-256 (cf. hash.ts). Le hash EST le chemin.
 * Aucun autre code ne doit construire de chemin vers les PDFs sources — toujours via ces helpers.
 */
import { writeFile, readFile, unlink, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

function rawDir(): string {
  return resolve(process.env.PDF_STORAGE_DIR ?? './_data/raw')
}

function pathFor(hash: string): string {
  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    throw new Error(`Invalid hash '${hash}' (SHA-256 hex attendu)`)
  }
  return join(rawDir(), `${hash}.pdf`)
}

async function ensureDir(): Promise<void> {
  const dir = rawDir()
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
}

/** Écrit un PDF sous `_data/raw/{hash}.pdf`. Idempotent (réécriture OK). Retourne le path absolu. */
export async function savePdfByHash(buf: Buffer | Uint8Array, hash: string): Promise<string> {
  const path = pathFor(hash)
  await ensureDir()
  await writeFile(path, buf)
  return path
}

/** Vérifie si un PDF existe pour ce hash. */
export function pdfExists(hash: string): boolean {
  return existsSync(pathFor(hash))
}

/** Charge un PDF par son hash. Throw si absent. */
export async function loadPdfByHash(hash: string): Promise<Buffer> {
  const path = pathFor(hash)
  if (!existsSync(path)) {
    throw new Error(`PDF introuvable pour le hash '${hash}'`)
  }
  return readFile(path)
}

/** Supprime un PDF par son hash. Idempotent (no-op si absent). */
export async function deletePdfByHash(hash: string): Promise<void> {
  const path = pathFor(hash)
  if (existsSync(path)) {
    await unlink(path)
  }
}
