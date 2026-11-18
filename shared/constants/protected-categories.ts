/**
 * Postes système non supprimables.
 *
 * `divers-non-categorise` est le repli de `accept_gap` (réconciliation) et du
 * `llm-categorizer` quand le modèle renvoie un code hors référentiel. Le supprimer casserait
 * ces deux chemins. Le rename reste autorisé — c'est le `code` qui est protégé, pas le libellé.
 *
 * Sa nécessité n'est pas théorique : sondé le 2026-09-04, GLM-5.2 a inventé un code absent de
 * la taxonomie face à des libellés sans poste correspondant. Sans repli nommé, le modèle en
 * fabrique un.
 *
 * `internes-ecart-accepte` porte les écarts de réconciliation assumés (story 17.3). Le
 * supprimer casserait `accept_gap` ; en changer la nature ferait rentrer un écart dans le
 * résultat de la période. C'est le `code` qui est protégé, pas le libellé.
 */
import {
  FALLBACK_ITEM_CODE,
  ACCEPT_GAP_ITEM_CODE,
  JOINT_TRANSFER_ITEM_CODE,
  JOINT_REIMBURSEMENT_ITEM_CODE,
  JOINT_GROUP_CODE,
  CARD_UNDETAILED_ITEM_CODE,
} from './default-referential'

/*
 * Les deux postes du compte joint (story 21.1) sont protégés pour une raison PLUS forte que les
 * précédents : `compte-joint-part-remboursee` est un poste CALCULÉ, il ne porte jamais de
 * transaction en base. Le garde-fou habituel — « on ne supprime pas un poste qui contient des
 * lignes » — ne le protège donc de rien : sa suppression réussissait toujours, entraînait celle
 * de sa rubrique devenue vide, et la sonde de démarrage refusait ensuite de servir l'application
 * en réclamant une migration déjà passée. Base morte, sans issue par l'interface
 * (revue du 2026-09-08).
 */
export const PROTECTED_ITEM_CODES: ReadonlySet<string> = new Set([
  FALLBACK_ITEM_CODE,
  ACCEPT_GAP_ITEM_CODE,
  JOINT_TRANSFER_ITEM_CODE,
  JOINT_REIMBURSEMENT_ITEM_CODE,
  // Agrégat carte des exports Crédit Mutuel (story 28.4, FR84) : le supprimer casserait
  // l'ingestion d'export tant qu'un profil en dépend — le poste est rempli PAR LE CODE, sur les
  // DEUX chemins d'ingestion (`ingestStatement` ET `ingestExport` l'excluent explicitement des
  // postes proposés au modèle), qui ne peut donc jamais le proposer comme alternative.
  CARD_UNDETAILED_ITEM_CODE,
])

export function isProtectedItem(code: string): boolean {
  return PROTECTED_ITEM_CODES.has(code)
}

/**
 * Rubriques système non supprimables. `divers` héberge le poste de repli ; `internes` est la
 * seule destination de la nature `internal_transfer` et sa disparition rendrait FR22
 * inapplicable ; `compte-joint` héberge le poste calculé de la coupe, que le moteur nomme.
 */
export const PROTECTED_GROUP_CODES: ReadonlySet<string> = new Set(['divers', 'internes', JOINT_GROUP_CODE])

export function isProtectedGroup(code: string): boolean {
  return PROTECTED_GROUP_CODES.has(code)
}
