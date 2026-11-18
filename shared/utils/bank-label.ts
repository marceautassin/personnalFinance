/**
 * Nettoyage des libellés bancaires — partagé entre le serveur et l'écran.
 *
 * **Pourquoi partagé (story 18.10).** L'écran « À ranger » groupe les lignes par libellé
 * nettoyé, puis PROPOSE CE MÊME LIBELLÉ comme motif de règle. Si le nettoyage du groupe et
 * celui du motif divergeaient d'un caractère, la règle créée ne couvrirait pas le groupe dont
 * elle est née — un défaut que l'utilisateur constaterait immédiatement, sans comprendre.
 * Ce n'est donc pas de la déduplication de confort : c'est un invariant.
 */
import { normalizeCategoryLabel } from '../schemas/category.schema'

/**
 * Fragments que les banques ajoutent autour du nom du commerçant : date d'opération, numéro
 * de carte tronqué, type d'opération, référence de mandat. Les retirer isole ce qui identifie
 * vraiment la ligne.
 *
 * Relevés sur 1 855 transactions Boursobank réelles, le 2026-09-05.
 */
const LABEL_NOISE: RegExp[] = [
  /\bCARTE\s+\d{2}\/\d{2}\/\d{2,4}\b/giu,
  /\bCB\*\d+\b/giu,
  /\b(?:PRLV|VIR)(?:\s+(?:SEPA|INST))?\b/giu,
  /\bR[èe]f\s*:\s*\S+/giu,
  /\b\d{2}\/\d{2}\/\d{2,4}\b/giu,
  // Un chèque n'a pas de commerçant, seulement un numéro : `CHQ. N.7925088` ne doit produire
  // aucun motif, sinon la règle proposée attraperait TOUS les chèques — qui vont pourtant
  // dans des postes différents (restaurant, frais scolaires…).
  /\bCHQ\.?\s*N?\.?\s*\d*/giu,
]

/** Libellé débarrassé de ce qui change d'une occurrence à l'autre. */
export function stripLabelNoise(label: string): string {
  let cleaned = label
  for (const noise of LABEL_NOISE) cleaned = cleaned.replace(noise, ' ')
  // Les suites de chiffres restantes sont des numéros d'opération ou de commande : elles
  // rendraient le motif unique à cette ligne, donc inutilisable comme règle.
  return cleaned.replace(/\d{3,}/gu, ' ')
}

/**
 * Ce qui identifie le commerçant dans un libellé bancaire, ou `null` s'il ne reste rien
 * d'exploitable.
 *
 * `CARTE 03/07/25 Mol*EXEMPLE BV CB*0000` donne `mol*exemple bv`, qui vaudra pour toutes
 * les occurrences futures — alors qu'un motif portant la date et le numéro de carte ne se
 * déclencherait jamais deux fois. Mieux vaut ne rien rendre qu'un motif qui attraperait la
 * moitié du relevé.
 */
export function merchantKey(label: string): string | null {
  const merchant = normalizeCategoryLabel(stripLabelNoise(label))
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
  // Le seuil porte sur les caractères ALPHANUMÉRIQUES : `. .` fait quatre caractères mais
  // n'identifie rien.
  return merchant.replace(/[^\p{L}\p{N}]/gu, '').length >= 3 ? merchant : null
}
