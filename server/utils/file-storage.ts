/**
 * file-storage — gestion des fichiers sources (PDF ou export Excel) sur le filesystem local.
 *
 * Convention : un fichier est identifié par son SHA-256 (cf. hash.ts). Le hash EST le chemin,
 * complété d'une extension (`pdf` ou `xlsx`, story 28.4, D44) qui dit d'où il vient sans avoir
 * à rouvrir le fichier. Aucun autre code ne doit construire de chemin vers ces fichiers —
 * toujours via ces helpers.
 */
import { writeFile, readFile, unlink, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

export type StoredFileExtension = 'pdf' | 'xlsx'

function rawDir(): string {
  return resolve(process.env.PDF_STORAGE_DIR ?? './_data/raw')
}

function pathFor(hash: string, extension: StoredFileExtension): string {
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error(`Invalid hash '${hash}' (SHA-256 hex attendu)`)
  }
  return join(rawDir(), `${hash}.${extension}`)
}

async function ensureDir(): Promise<void> {
  const dir = rawDir()
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
}

/** Écrit un fichier sous `_data/raw/{hash}.{extension}`. Idempotent. Retourne le path absolu. */
export async function savePdfByHash(buf: Buffer | Uint8Array, hash: string, extension: StoredFileExtension = 'pdf'): Promise<string> {
  const path = pathFor(hash, extension)
  await ensureDir()
  await writeFile(path, buf)
  return path
}

/** Vérifie si un fichier existe pour ce hash (PDF ou export). */
export function pdfExists(hash: string): boolean {
  return existsSync(pathFor(hash, 'pdf')) || existsSync(pathFor(hash, 'xlsx'))
}

/** Charge un PDF par son hash. Throw si absent. */
export async function loadPdfByHash(hash: string): Promise<Buffer> {
  const path = pathFor(hash, 'pdf')
  if (!existsSync(path)) {
    throw new Error(`PDF introuvable pour le hash '${hash}'`)
  }
  return readFile(path)
}

/**
 * Supprime le(s) fichier(s) source(s) par hash — `.pdf` ET `.xlsx` (story 28.4) : le
 * remplacement d'un export par un PDF, ou l'inverse (FR6), ne doit pas laisser d'orphelin.
 * Idempotent (no-op si absent).
 */
export async function deletePdfByHash(hash: string): Promise<void> {
  for (const extension of ['pdf', 'xlsx'] as const) {
    const path = pathFor(hash, extension)
    if (existsSync(path)) {
      await unlink(path)
    }
  }
}
