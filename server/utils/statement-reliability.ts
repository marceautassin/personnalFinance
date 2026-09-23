import { sql, and, lte, gte, eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { bankStatements, transactions } from '~~/server/db/schema'
import { deriveReliability, type StatementReliability } from '~~/shared/types/statement-reliability'

/**
 * Fiabilité des relevés, calculée à la lecture.
 *
 * L'écart n'est PAS stocké : le persister créerait un état dérivé capable de diverger de ses
 * propres transactions dès qu'une ligne est ajoutée ou reclassée. Il est donc recalculé ici,
 * de la même façon que `reconciler.ts` :
 *
 *     écart = (solde de clôture − solde d'ouverture) − Σ transactions
 *
 * Seule la DÉCISION de l'utilisateur (`gap_accepted`) est persistée — cf.
 * `shared/types/statement-reliability.ts` pour le pourquoi des trois états.
 */

export interface StatementReliabilityRow {
  hash: string
  periodStart: string
  periodEnd: string
  gapCents: number
  gapAccepted: boolean
  reliability: StatementReliability
}

/** Expression SQL de l'écart d'un relevé, réutilisée par toutes les lectures. */
const gapExpression = sql<number>`(
  (${bankStatements.closingBalanceCents} - ${bankStatements.openingBalanceCents})
  - COALESCE((
    SELECT SUM(${transactions.amountCents}) FROM ${transactions}
    WHERE ${transactions.statementHash} = ${bankStatements.hashSha256}
  ), 0)
)`

const baseSelection = {
  hash: bankStatements.hashSha256,
  periodStart: bankStatements.periodStart,
  periodEnd: bankStatements.periodEnd,
  gapAccepted: bankStatements.gapAccepted,
  gapCents: gapExpression,
}

function toRow(r: {
  hash: string
  periodStart: string
  periodEnd: string
  gapAccepted: boolean
  gapCents: number
}): StatementReliabilityRow {
  const gapCents = Number(r.gapCents)
  return {
    hash: r.hash,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    gapCents,
    gapAccepted: r.gapAccepted,
    reliability: deriveReliability(gapCents, r.gapAccepted),
  }
}

/** Fiabilité de tous les relevés DU PROFIL, indexée par hash (story 27.2, D37). */
export async function reliabilityByStatement(profileId: number): Promise<Map<string, StatementReliabilityRow>> {
  const rows = await db.select(baseSelection).from(bankStatements).where(eq(bankStatements.profileId, profileId))
  return new Map(rows.map(r => [r.hash, toRow(r)]))
}

/** Fiabilité d'un relevé précis DU PROFIL, ou `null` s'il n'existe pas ou pas dans ce profil. */
export async function reliabilityOfStatement(profileId: number, hash: string): Promise<StatementReliabilityRow | null> {
  const [row] = await db
    .select(baseSelection)
    .from(bankStatements)
    .where(and(eq(bankStatements.hashSha256, hash), eq(bankStatements.profileId, profileId)))
    .limit(1)
  return row ? toRow(row) : null
}

/**
 * Relevés qui CHEVAUCHENT une période, même sans transaction extraite.
 *
 * Le recouvrement se fait sur les intervalles de dates ISO et non sur les transactions : un
 * relevé dont aucune ligne n'a pu être extraite contribue quand même à la période, et son
 * écart doit y être signalé (FR12).
 */
export async function reliabilityOverlapping(
  profileId: number,
  periodStart: string,
  periodEnd: string,
): Promise<StatementReliabilityRow[]> {
  const rows = await db
    .select(baseSelection)
    .from(bankStatements)
    .where(and(
      eq(bankStatements.profileId, profileId),
      lte(bankStatements.periodStart, periodEnd),
      gte(bankStatements.periodEnd, periodStart),
    ))
  return rows.map(toRow)
}
