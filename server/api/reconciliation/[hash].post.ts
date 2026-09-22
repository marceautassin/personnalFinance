/**
 * POST /api/reconciliation/[hash] — réconciliation manuelle (Story 3.1).
 *
 * Deux actions, validées par discriminated union (cf. shared/schemas/reconciliation.schema.ts) :
 *  - add_transaction : insère une transaction `is_manual: true`, recompute l'écart. Aucune
 *                      décision n'est prise ici : si l'ajout referme l'écart, le relevé
 *                      redevient fiable de lui-même, puisque la fiabilité est dérivée.
 *  - accept_gap : insère une transaction de repli du montant exact de l'écart résiduel et
 *                 pose `gap_accepted`. Refusé si déjà équilibré, ou si l'écart a déjà été
 *                 accepté (sinon des « Écart accepté » s'empilent après un add_transaction
 *                 qui re-déséquilibre).
 *
 * Convention de signe (cf. server/services/reconciler.ts) :
 *   gap = (closing - opening) - sum(transactions.amountCents)
 *   La transaction d'écart accepté a `amountCents = gapCents` (sans inversion de signe).
 */
import { defineEventHandler, getRouterParam, isError } from 'h3'
import { eq, asc } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { bankStatements, transactions } from '~~/server/db/schema'
import { ACCEPT_GAP_ITEM_CODE } from '~~/shared/constants/default-referential'
import { reconcile } from '~~/server/services/reconciler'
import { validateBody } from '~~/server/utils/validation'
import { resolveItemId } from '~~/server/utils/category-fk'
import { requireProfile } from '~~/server/utils/current-profile'
import { domainError, notFound } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { ReconciliationActionSchema } from '~~/shared/schemas/reconciliation.schema'
import { HashSha256Schema } from '~~/shared/schemas/transaction.schema'
import { cents } from '~~/shared/types/money'
import { deriveReliability } from '~~/shared/types/statement-reliability'

/**
 * Poste de repli d'un écart accepté. Défini une seule fois, dans le référentiel : un
 * littéral local ici divergerait silencieusement du poste protégé le jour où il changerait.
 */
// Poste dédié de nature `internal_transfer` (story 17.3). Auparavant le repli
// `divers-non-categorise`, de nature `expense` : un écart POSITIF venait alors diminuer les
// dépenses de la période, et la ligne comptait dans le taux de correction manuelle du jalon.
const ACCEPT_GAP_CATEGORY = ACCEPT_GAP_ITEM_CODE
const ACCEPT_GAP_LABEL = 'Écart accepté (réconciliation)'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export default defineEventHandler(async (event) => {
  const hash = getRouterParam(event, 'hash')
  if (!hash || !HashSha256Schema.safeParse(hash).success) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'invalid hash', value: hash ?? null }, 422)
  }

  const action = await validateBody(event, ReconciliationActionSchema)
  const profileId = requireProfile(event)

  const [statement] = await db
    .select()
    .from(bankStatements)
    .where(eq(bankStatements.hashSha256, hash))
    .limit(1)
  if (!statement) {
    throw notFound(ApiErrorCode.NotFound, { resource: 'bank_statement', hash })
  }

  if (action.action === 'add_transaction') {
    const tx = action.transaction

    // Borner la date à la période du statement (FR12 — la tx manuelle existe pour
    // équilibrer CE relevé, pas pour polluer un autre mois).
    if (tx.transactionDate < statement.periodStart || tx.transactionDate > statement.periodEnd) {
      throw domainError(
        ApiErrorCode.ValidationFailed,
        {
          reason: 'transactionDate out of statement period',
          value: tx.transactionDate,
          periodStart: statement.periodStart,
          periodEnd: statement.periodEnd,
        },
        422,
      )
    }

    // FK pre-check + résolution code → id, toujours dans le profil (D37).
    const categoryItemId = await resolveItemId(profileId, tx.categoryItemCode)

    // Atomicité : insertion + recompute dans la même transaction → pas de TOCTOU
    // si un autre handler insère entre l'insert et le recompute.
    const reconciliation = db.transaction((trx) => {
      trx.insert(transactions).values({
        statementHash: hash,
        transactionDate: tx.transactionDate,
        label: tx.label,
        amountCents: tx.amountCents,
        categoryItemId,
        isManual: true,
      }).run()
      return recomputeReconciliation(trx, statement.openingBalanceCents, statement.closingBalanceCents, hash)
    })

    return {
      isBalanced: reconciliation.isBalanced,
      gapCents: reconciliation.gapCents,
      reliability: deriveReliability(reconciliation.gapCents, statement.gapAccepted),
    }
  }

  // accept_gap : one-shot. Refusé si un écart a déjà été accepté sur ce relevé (sinon des
  // « Écart accepté » peuvent s'empiler après un add_transaction qui re-déséquilibre).
  if (statement.gapAccepted) {
    throw domainError(
      ApiErrorCode.ReconciliationFailed,
      { reason: 'already_unreliable' },
      400,
    )
  }

  // Le poste d'écart accepté doit exister (seedé au bootstrap, posé par la migration 0005 sur
  // les bases antérieures). Défense en profondeur : sans ce contrôle, son absence sortirait en
  // violation de clé étrangère, c'est-à-dire un 500 opaque au lieu d'un motif lisible.
  let acceptGapItemId: number
  try {
    acceptGapItemId = await resolveItemId(profileId, ACCEPT_GAP_CATEGORY)
  }
  catch (err) {
    // Seule l'erreur DOMAINE que `resolveItemId` rend explicitement (poste inconnu, 422
    // `validation_failed`) est reconvertie ici. Tout le reste — panne DB, bug imprévu — doit
    // remonter tel quel plutôt que d'être avalé sous un même message trompeur (revue de la
    // story 27.1, cf. règle d'or CLAUDE.md « pas de try/catch qui mange une erreur »).
    if (isError(err) && err.statusCode === 422 && err.statusMessage === ApiErrorCode.ValidationFailed) {
      throw domainError(
        ApiErrorCode.ReconciliationFailed,
        { reason: 'missing_default_category', value: ACCEPT_GAP_CATEGORY },
        500,
      )
    }
    throw err
  }

  // Atomicité : recompute + insertion + update reliability dans la même transaction
  // pour éliminer le TOCTOU entre la lecture du gap et l'écriture (better-sqlite3 sync).
  const result = db.transaction((trx) => {
    const current = recomputeReconciliation(trx, statement.openingBalanceCents, statement.closingBalanceCents, hash)
    if (current.isBalanced) {
      throw domainError(ApiErrorCode.ReconciliationFailed, { reason: 'no_gap_to_accept' }, 400)
    }
    trx.insert(transactions).values({
      statementHash: hash,
      transactionDate: statement.periodEnd,
      label: ACCEPT_GAP_LABEL,
      amountCents: current.gapCents,
      categoryItemId: acceptGapItemId,
      isManual: true,
    }).run()
    trx.update(bankStatements)
      .set({ gapAccepted: true })
      .where(eq(bankStatements.hashSha256, hash))
      .run()
    return recomputeReconciliation(trx, statement.openingBalanceCents, statement.closingBalanceCents, hash)
  })

  return {
    isBalanced: result.isBalanced,
    gapCents: result.gapCents,
    // L'insertion d'équilibrage vient de ramener l'écart à zéro : c'est la DÉCISION, et non
    // l'écart courant, qui maintient le relevé signalé.
    reliability: 'gap_accepted' as const,
  }
})

/**
 * Recalcule la réconciliation à la volée à partir des transactions courantes du statement.
 * Pas de cache : la source de vérité est la table `transactions` + soldes du statement.
 * Prend une instance `Tx` (transaction Drizzle) pour pouvoir être appelé dans un context atomique.
 */
function recomputeReconciliation(
  trx: Tx,
  openingBalanceCents: number,
  closingBalanceCents: number,
  hash: string,
): { isBalanced: boolean, gapCents: number } {
  const txRows = trx
    .select({ amountCents: transactions.amountCents })
    .from(transactions)
    .where(eq(transactions.statementHash, hash))
    .orderBy(asc(transactions.id))
    .all()
  return reconcile({
    openingCents: cents(openingBalanceCents),
    closingCents: cents(closingBalanceCents),
    transactions: txRows.map(t => ({ amountCents: cents(t.amountCents) })),
  })
}
