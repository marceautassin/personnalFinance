/**
 * POST /api/reconciliation/[hash] — réconciliation manuelle (Story 3.1).
 *
 * Deux actions, validées par discriminated union (cf. shared/schemas/reconciliation.schema.ts) :
 *  - add_transaction : insère une transaction `is_manual: true`, recompute le gap.
 *                      `reliability` n'est PAS dégradée ici (elle reste à sa valeur courante) ;
 *                      le passage `unreliable` se fait exclusivement via `accept_gap`.
 *  - accept_gap : insère une transaction `divers` du montant exact du gap résiduel,
 *                 marque `bank_statements.reliability = 'unreliable'`. Refusé si déjà équilibré
 *                 ou si le statement est déjà `unreliable` (one-shot remediation).
 *
 * Convention de signe (cf. server/services/reconciler.ts) :
 *   gap = (closing - opening) - sum(transactions.amountCents)
 *   La transaction d'écart accepté a `amountCents = gapCents` (sans inversion de signe).
 */
import { defineEventHandler, getRouterParam } from 'h3'
import { eq, asc } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { bankStatements, transactions, categoryDefinitions } from '~~/server/db/schema'
import { reconcile } from '~~/server/services/reconciler'
import { validateBody } from '~~/server/utils/validation'
import { domainError, notFound } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { ReconciliationActionSchema } from '~~/shared/schemas/reconciliation.schema'
import { HashSha256Schema } from '~~/shared/schemas/transaction.schema'
import { cents } from '~~/shared/types/money'

const ACCEPT_GAP_CATEGORY = 'divers'
const ACCEPT_GAP_LABEL = 'Écart accepté (réconciliation)'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export default defineEventHandler(async (event) => {
  const hash = getRouterParam(event, 'hash')
  if (!hash || !HashSha256Schema.safeParse(hash).success) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'invalid hash', value: hash ?? null }, 422)
  }

  const action = await validateBody(event, ReconciliationActionSchema)

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

    // FK pre-check sur categoryCode (cf. pattern transactions/[id].patch.ts:28-41)
    const cat = await db
      .select({ code: categoryDefinitions.code })
      .from(categoryDefinitions)
      .where(eq(categoryDefinitions.code, tx.categoryCode))
      .limit(1)
    if (cat.length === 0) {
      throw domainError(
        ApiErrorCode.ValidationFailed,
        { reason: 'unknown categoryCode', value: tx.categoryCode },
        422,
      )
    }

    // Atomicité : insertion + recompute dans la même transaction → pas de TOCTOU
    // si un autre handler insère entre l'insert et le recompute.
    const reconciliation = db.transaction((trx) => {
      trx.insert(transactions).values({
        statementHash: hash,
        transactionDate: tx.transactionDate,
        label: tx.label,
        amountCents: tx.amountCents,
        categoryCode: tx.categoryCode,
        isManual: true,
        isDebtRepayment: false,
        debtId: null,
      }).run()
      return recomputeReconciliation(trx, statement.openingBalanceCents, statement.closingBalanceCents, hash)
    })

    return {
      isBalanced: reconciliation.isBalanced,
      gapCents: reconciliation.gapCents,
      reliability: statement.reliability,
    }
  }

  // accept_gap : one-shot. Refusé si déjà unreliable (sinon des "Écart accepté"
  // peuvent s'empiler après un add_transaction qui re-déséquilibre).
  if (statement.reliability === 'unreliable') {
    throw domainError(
      ApiErrorCode.ReconciliationFailed,
      { reason: 'already_unreliable' },
      400,
    )
  }

  // Vérifier que la catégorie 'divers' existe (seedée par bootstrap, défense en profondeur)
  const cat = await db
    .select({ code: categoryDefinitions.code })
    .from(categoryDefinitions)
    .where(eq(categoryDefinitions.code, ACCEPT_GAP_CATEGORY))
    .limit(1)
  if (cat.length === 0) {
    throw domainError(
      ApiErrorCode.ReconciliationFailed,
      { reason: 'missing_default_category', value: ACCEPT_GAP_CATEGORY },
      500,
    )
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
      categoryCode: ACCEPT_GAP_CATEGORY,
      isManual: true,
      isDebtRepayment: false,
      debtId: null,
    }).run()
    trx.update(bankStatements)
      .set({ reliability: 'unreliable' })
      .where(eq(bankStatements.hashSha256, hash))
      .run()
    return recomputeReconciliation(trx, statement.openingBalanceCents, statement.closingBalanceCents, hash)
  })

  return {
    isBalanced: result.isBalanced,
    gapCents: result.gapCents,
    reliability: 'unreliable' as const,
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
