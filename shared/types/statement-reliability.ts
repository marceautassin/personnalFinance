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
 * Quatre états depuis la story 28.4 (D44) :
 *  - `reliable`        : aucun écart, relevé PDF réconcilié ;
 *  - `gap_unreviewed`  : écart constaté, PERSONNE ne l'a encore examiné ;
 *  - `gap_accepted`    : écart constaté et assumé par l'utilisateur ;
 *  - `unverified`      : issu d'un EXPORT (`source = 'export'`) dont le solde de départ est
 *                        DÉDUIT et non lu — l'absence d'écart ne prouve rien, faute d'un
 *                        second point de mesure indépendant. Jamais `reliable` tant qu'aucun
 *                        relevé PDF n'a confirmé la continuité (28.2).
 *
 * Sans le troisième état, un mois signalé ne dit pas si on s'en est déjà occupé — et au bout
 * de quelques semaines, on ne s'en souvient plus.
 */
export const STATEMENT_RELIABILITIES = ['reliable', 'gap_unreviewed', 'gap_accepted', 'unverified'] as const

export type StatementReliability = typeof STATEMENT_RELIABILITIES[number]

export interface DeriveReliabilityInput {
  /** Écart courant recalculé depuis les transactions. */
  gapCents: number
  /** Décision persistée de l'utilisateur d'assumer un écart (`bank_statements.gap_accepted`). */
  gapAccepted: boolean
  /** Origine du relevé (D44). */
  source: import('./statement-source').StatementSource
  /**
   * Écart de continuité avec le relevé PDF précédent (28.2) — `null` tant qu'aucun raccord n'a
   * eu lieu. Sans objet sur un relevé `pdf` (toujours `null` dans ce cas).
   */
  continuityGapCents: number | null
}

/**
 * Dérive l'état de fiabilité.
 *
 * Ordre de priorité (story 28.4, D44) :
 *  1. `gapAccepted` prime sur l'écart courant : accepter un écart insère une transaction
 *     d'équilibrage, donc l'écart retombe à zéro dans la foulée. Sans cette priorité, un relevé
 *     dont l'utilisateur vient d'assumer le trou repasserait « fiable » — exactement le
 *     mensonge que ce type cherche à empêcher.
 *  2. Un écart INTERNE non nul (ligne manuelle ajoutée après coup, par exemple) prime sur
 *     l'origine du relevé : un export dont on a dérangé l'équilibre reste `gap_unreviewed`, pas
 *     `unverified` — c'est un problème PLUS grave qu'un simple défaut de confirmation externe.
 *  3. Un export sans raccord de continuité (`continuityGapCents === null`) est `unverified` :
 *     l'absence d'écart interne ne prouve rien, le solde de départ est déduit.
 *  4. Un export dont le raccord révèle un écart NON NUL reste `gap_unreviewed` (28.2 l'écrit,
 *     hors périmètre ici, mais l'ordre est posé dès maintenant).
 *  5. Sinon, `reliable`.
 */
export function deriveReliability(input: DeriveReliabilityInput): StatementReliability {
  const { gapCents, gapAccepted, source, continuityGapCents } = input
  if (gapAccepted) return 'gap_accepted'
  if (gapCents !== 0) return 'gap_unreviewed'
  if (source === 'export') {
    if (continuityGapCents === null) return 'unverified'
    if (continuityGapCents !== 0) return 'gap_unreviewed'
  }
  return 'reliable'
}

/** Vrai si le relevé ne peut pas être présenté comme sain (FR12, NFR11). */
export function isDegraded(reliability: StatementReliability): boolean {
  return reliability !== 'reliable'
}

/**
 * Fiabilité d'une PÉRIODE, agrégée sur les relevés qui y contribuent (D23).
 *
 * Le pire état l'emporte : un seul relevé bancal contamine tout le mois. Ordre (story 28.4) :
 * un écart non examiné est le plus alarmant (personne n'a regardé) ; vient ensuite un export
 * non confirmé (`unverified` — rien ne prouve qu'il est juste, mais rien ne dit qu'il est
 * faux non plus) ; puis un écart assumé (une décision a été prise).
 */
export function worstReliability(values: readonly StatementReliability[]): StatementReliability {
  if (values.includes('gap_unreviewed')) return 'gap_unreviewed'
  if (values.includes('unverified')) return 'unverified'
  if (values.includes('gap_accepted')) return 'gap_accepted'
  return 'reliable'
}

/** Libellés FR, pour l'UI. Le code reste en anglais (règle projet). */
export const RELIABILITY_LABELS: Record<StatementReliability, string> = {
  reliable: 'Réconcilié',
  gap_unreviewed: 'Écart non examiné',
  gap_accepted: 'Écart accepté',
  unverified: 'Non vérifié',
}
