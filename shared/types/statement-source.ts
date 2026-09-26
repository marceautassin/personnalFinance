/**
 * StatementSource — origine d'un relevé (D44, story 28.4).
 *
 * `pdf` : ingéré depuis un PDF de relevé, réconcilié contre un solde d'ouverture ET de
 * clôture lus sur le document (FR2 à FR6).
 * `export` : ingéré depuis un export Excel de banque en ligne (FR82 à FR84) — un an
 * d'historique d'un coup, mais dont seul le solde final est lu ; le solde d'ouverture est
 * DÉDUIT, pas lu (`opening = closing − Σ transactions`), d'où l'état `unverified` tant
 * qu'aucun relevé PDF n'a confirmé la continuité (28.2).
 */
export const STATEMENT_SOURCES = ['pdf', 'export'] as const

export type StatementSource = typeof STATEMENT_SOURCES[number]
