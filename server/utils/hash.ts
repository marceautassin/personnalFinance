import { createHash } from 'node:crypto'

/**
 * SHA-256 hexadécimal d'un buffer.
 * Utilisé pour identifier idempotemment un PDF par son contenu (FR2).
 */
export function sha256(buf: Buffer | Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex')
}
