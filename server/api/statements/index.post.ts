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

export default defineEventHandler(async (event) => {
  const form = await readMultipartFormData(event)
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

  const confirmReplace = getHeader(event, 'x-confirm-replace') === 'true'
  return ingestStatement({
    pdfBuffer: Buffer.from(filePart.data),
    confirmReplace,
  })
})
