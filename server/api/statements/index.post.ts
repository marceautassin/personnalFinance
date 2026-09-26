/**
 * POST /api/statements — ingestion d'un relevé bancaire (Story 2.6 ; export Excel story 28.4).
 *
 * Handler thin : valide le multipart (présence + taille du fichier, champ `bank` optionnel),
 * lit le header `X-Confirm-Replace`, détecte le FORMAT par ses OCTETS MAGIQUES (jamais par
 * l'extension du nom de fichier, falsifiable), puis délègue à `ingestStatement` (PDF) ou
 * `ingestExport` (Excel, D44).
 *
 * Champ multipart `bank` (D41, AR37) : optionnel, validé contre `BANKS`. Absent →
 * l'orchestrateur retombe sur la banque par défaut du profil courant. Présent mais hors de
 * `BANKS` → `422 validation_failed`.
 */
import { defineEventHandler, readMultipartFormData, getHeader } from 'h3'
import { domainError } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { ingestStatement, ingestExport } from '~~/server/services/statement-ingestion-orchestrator'
import { requireProfile } from '~~/server/utils/current-profile'
import { BANKS, isBank, type Bank } from '~~/shared/types/bank'

const MAX_FILE_BYTES = 10 * 1024 * 1024

const PDF_MAGIC = Buffer.from('%PDF-')
// Zip OOXML (.xlsx/.docx/…) : les quatre premiers octets d'une archive PKZIP.
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04])
// Ancien format binaire `.xls` (OLE2/CFBF) : reconnu pour un message de refus explicite plutôt
// qu'un `validation_failed` générique muet sur la cause.
const OLE2_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0])

function startsWith(buf: Buffer, magic: Buffer): boolean {
  return buf.length >= magic.length && buf.subarray(0, magic.length).equals(magic)
}

type FileFormat = 'pdf' | 'xlsx' | 'xls-legacy' | 'unknown'

function detectFormat(buf: Buffer): FileFormat {
  if (startsWith(buf, PDF_MAGIC)) return 'pdf'
  if (startsWith(buf, ZIP_MAGIC)) return 'xlsx'
  if (startsWith(buf, OLE2_MAGIC)) return 'xls-legacy'
  return 'unknown'
}

export default defineEventHandler(async (event) => {
  // Échoue vite sur un profil manquant/invalide, AVANT de lire un multipart potentiellement
  // volumineux — les orchestrateurs le revérifient de toute façon (point d'entrée unique, AC 1).
  requireProfile(event)

  let form: Awaited<ReturnType<typeof readMultipartFormData>>
  try {
    form = await readMultipartFormData(event)
  }
  catch (err) {
    throw domainError(
      ApiErrorCode.ValidationFailed,
      { reason: 'malformed multipart body', detail: err instanceof Error ? err.message : String(err) },
      400,
    )
  }

  const filePart = form?.find(p => p.name === 'file')
  if (!filePart || !filePart.data) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'missing file' }, 400)
  }
  if (filePart.data.length > MAX_FILE_BYTES) {
    throw domainError(
      ApiErrorCode.ValidationFailed,
      { reason: 'file too large', maxBytes: MAX_FILE_BYTES },
      400,
    )
  }
  const fileBuffer = Buffer.from(filePart.data)
  const format = detectFormat(fileBuffer)
  if (format === 'xls-legacy') {
    throw domainError(
      ApiErrorCode.ValidationFailed,
      { reason: 'format .xls non pris en charge (ancien format binaire) — exporter en .xlsx' },
      400,
    )
  }
  if (format === 'unknown') {
    throw domainError(
      ApiErrorCode.ValidationFailed,
      { reason: 'not a PDF or Excel file (missing magic bytes)', contentType: filePart.type ?? null },
      400,
    )
  }

  const confirmReplaceHeader = (getHeader(event, 'x-confirm-replace') ?? '').trim().toLowerCase()
  const confirmReplace = confirmReplaceHeader === 'true' || confirmReplaceHeader === '1'

  let bank: Bank | undefined
  const bankPart = form?.find(p => p.name === 'bank')
  if (bankPart?.data) {
    const raw = bankPart.data.toString('utf-8').trim()
    if (raw.length > 0) {
      if (!isBank(raw)) {
        throw domainError(
          ApiErrorCode.ValidationFailed,
          { reason: 'invalid bank', value: raw, allowed: BANKS },
          422,
        )
      }
      bank = raw
    }
  }

  if (format === 'pdf') {
    return ingestStatement({ event, pdfBuffer: fileBuffer, confirmReplace, bank })
  }
  return ingestExport({ event, fileBuffer, confirmReplace, bank })
})
