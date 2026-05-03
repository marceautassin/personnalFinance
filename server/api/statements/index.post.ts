/**
 * POST /api/statements — ingestion d'un PDF de relevé Boursorama (Story 2.6).
 *
 * Handler thin : valide le multipart (présence + taille du fichier), lit le header
 * `X-Confirm-Replace`, puis délègue toute la logique pipeline à
 * `ingestStatement` (server/services/statement-ingestion-orchestrator.ts).
 */
import { defineEventHandler, readMultipartFormData, getHeader } from 'h3'
import { domainError } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { ingestStatement } from '~~/server/services/statement-ingestion-orchestrator'

const MAX_PDF_BYTES = 10 * 1024 * 1024

const PDF_MAGIC = Buffer.from('%PDF-')

function isPdfBuffer(buf: Buffer): boolean {
  return buf.length >= PDF_MAGIC.length && buf.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)
}

export default defineEventHandler(async (event) => {
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
  if (filePart.data.length > MAX_PDF_BYTES) {
    throw domainError(
      ApiErrorCode.ValidationFailed,
      { reason: 'file too large', maxBytes: MAX_PDF_BYTES },
      400,
    )
  }
  const pdfBuffer = Buffer.from(filePart.data)
  if (!isPdfBuffer(pdfBuffer)) {
    throw domainError(
      ApiErrorCode.ValidationFailed,
      { reason: 'not a PDF (missing %PDF- magic bytes)', contentType: filePart.type ?? null },
      400,
    )
  }

  const confirmReplaceHeader = (getHeader(event, 'x-confirm-replace') ?? '').trim().toLowerCase()
  const confirmReplace = confirmReplaceHeader === 'true' || confirmReplaceHeader === '1'

  return ingestStatement({ pdfBuffer, confirmReplace })
})
