/**
 * Fiabilité d'un relevé — état DÉRIVÉ, jamais stocké.
 *
 * Le modèle d'origine confondait deux choses sous un seul champ : le FAIT qu'un relevé
 * présente un écart, et la DÉCISION de l'utilisateur d'assumer cet écart. Conséquence
 * constatée le 2026-09-05 sur des données réelles : deux relevés portant 2 187 € et 1 764 €
 * d'écart s'affichaient « fiables », parce que personne n'avait encore rien accepté.
 *
 * Ici, seule la décision est persistée (`bank_statements.gap_accepted`). L'écart, lui, est
 * recalculé depuis les transactions à chaque lecture — le stocker créerait un état dérivé
 * capable de diverger de ses propres lignes, ce que l'architecture proscrit.
 *
 * Trois états, et la nuance entre les deux derniers est le sujet :
 *  - `reliable`        : aucun écart ;
 *  - `gap_unreviewed`  : écart constaté, PERSONNE ne l'a encore examiné ;
 *  - `gap_accepted`    : écart constaté et assumé par l'utilisateur.
 *
 * Sans le troisième état, un mois signalé ne dit pas si on s'en est déjà occupé — et au bout
 * de quelques semaines, on ne s'en souvient plus.
 */
export const STATEMENT_RELIABILITIES = ['reliable', 'gap_unreviewed', 'gap_accepted'] as const

export type StatementReliability = typeof STATEMENT_RELIABILITIES[number]

/**
 * Dérive l'état de fiabilité.
 *
 * `gapAccepted` prime sur l'écart courant, et ce n'est pas un détail : accepter un écart
 * insère une transaction d'équilibrage, donc l'écart retombe à zéro dans la foulée. Sans
 * cette priorité, un relevé dont l'utilisateur vient d'assumer le trou repasserait
 * « fiable » — exactement le mensonge que ce type cherche à empêcher.
 */
export function deriveReliability(gapCents: number, gapAccepted: boolean): StatementReliability {
  if (gapAccepted) return 'gap_accepted'
  return gapCents === 0 ? 'reliable' : 'gap_unreviewed'
}

/** Vrai si le relevé ne peut pas être présenté comme sain (FR12, NFR11). */
export function isDegraded(reliability: StatementReliability): boolean {
  return reliability !== 'reliable'
}

/**
 * Fiabilité d'une PÉRIODE, agrégée sur les relevés qui y contribuent (D23).
 *
 * Le pire état l'emporte : un seul relevé bancal contamine tout le mois. Un écart non examiné
 * est plus alarmant qu'un écart assumé — d'où l'ordre.
 */
export function worstReliability(values: readonly StatementReliability[]): StatementReliability {
  if (values.includes('gap_unreviewed')) return 'gap_unreviewed'
  if (values.includes('gap_accepted')) return 'gap_accepted'
  return 'reliable'
}

/** Libellés FR, pour l'UI. Le code reste en anglais (règle projet). */
export const RELIABILITY_LABELS: Record<StatementReliability, string> = {
  reliable: 'Réconcilié',
  gap_unreviewed: 'Écart non examiné',
  gap_accepted: 'Écart accepté',
}
