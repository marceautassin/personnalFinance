import { defineEventHandler } from 'h3'
import { asc, and, eq, gte, lte, inArray } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { transactions, categoryItems } from '~~/server/db/schema'
import { type StatementReliability, worstReliability } from '~~/shared/types/statement-reliability'
import { reliabilityOverlapping } from '~~/server/utils/statement-reliability'
import { validateQuery } from '~~/server/utils/validation'
import { settlementEffectByTransaction } from '~~/server/utils/settlement-status'
import { TransactionListQuerySchema } from '~~/shared/schemas/transaction.schema'

export default defineEventHandler(async (event) => {
  const query = validateQuery(event, TransactionListQuerySchema)

  // Deux formes de requête, une seule lecture : la vue mensuelle et la descente depuis un
  // agrégat lisent la même table, avec le même tri.
  const [from, to] = 'month' in query
    // LIKE 'YYYY-MM-%' utilise l'index transactions_period_idx (text comparable en préfixe) ;
    // les bornes ci-dessous sont équivalentes et couvrent tous les jours du mois.
    ? [`${query.month}-01`, `${query.month}-31`]
    : [query.from, query.to]
  const itemFilter = 'month' in query ? undefined : query.item
  const groupFilter = 'month' in query ? undefined : query.group

  // Portée de la réconciliation : celle des lignes demandées, sauf quand l'appelant explique un
  // agrégat plus large que sa descente — la trajectoire d'une cible neutralise sur la fenêtre
  // entière puis répartit par tranche (story 19.4).
  const [settlementFrom, settlementTo] = 'month' in query || query.settlementFrom === undefined
    ? [from, to]
    : [query.settlementFrom, query.settlementTo!]

  const rows = await db
    .select({
      id: transactions.id,
      statementHash: transactions.statementHash,
      transactionDate: transactions.transactionDate,
      label: transactions.label,
      amountCents: transactions.amountCents,
      categoryItemCode: transactions.categoryItemCode,
      isManual: transactions.isManual,
      settlementGroupId: transactions.settlementGroupId,
    })
    .from(transactions)
    .where(and(
      gte(transactions.transactionDate, from),
      lte(transactions.transactionDate, to),
      itemFilter ? eq(transactions.categoryItemCode, itemFilter) : undefined,
      // Filtre par RUBRIQUE : la rubrique n'est pas portée par la transaction, elle vit sur le
      // poste. Une sous-requête plutôt qu'une jointure — la projection ne change pas, et
      // l'index `transactions_item_idx` reste utilisable.
      groupFilter
        ? inArray(
            transactions.categoryItemCode,
            db.select({ code: categoryItems.code })
              .from(categoryItems)
              .where(eq(categoryItems.groupCode, groupFilter)),
          )
        : undefined,
    ))
    .orderBy(asc(transactions.transactionDate), asc(transactions.id))

  // Fiabilité agrégée des relevés *qui couvrent la période demandée*, le pire état
  // l'emportant (D23) : un seul relevé bancal contamine tout le mois.
  const statements = await reliabilityOverlapping(from, to)

  const reliability: StatementReliability | null = statements.length > 0
    ? worstReliability(statements.map(s => s.reliability))
    : null

  // L'état de réconciliation est CALCULÉ, en rejouant la neutralisation du moteur : deux
  // implémentations de la même règle finiraient par diverger (epic 19, story 19.3).
  //
  // Il se calcule sur la PÉRIODE ENTIÈRE, jamais sur les lignes déjà filtrées : le moteur
  // d'analyse neutralise sur tout `[from, to]`, et une avance rangée en « Alimentation » se
  // compense avec un virement rangé en « Remboursements ». Restreindre le calcul au poste
  // demandé amputait le groupe de ses remboursements et affichait « à rembourser » sur une
  // ligne que le total, lui, ne comptait déjà plus (story 19.4).
  const groupIds = [...new Set(
    rows.map(r => r.settlementGroupId).filter((id): id is number => id !== null),
  )]
  const settlementLines = groupIds.length === 0
    ? []
    : await db
        .select({
          id: transactions.id,
          transactionDate: transactions.transactionDate,
          amountCents: transactions.amountCents,
          categoryItemCode: transactions.categoryItemCode,
          settlementGroupId: transactions.settlementGroupId,
        })
        .from(transactions)
        .where(and(
          gte(transactions.transactionDate, settlementFrom),
          lte(transactions.transactionDate, settlementTo),
          inArray(transactions.settlementGroupId, groupIds),
        ))
        // Même ordre que l'entrée du moteur : le tri stable de `neutralizeSettlements`
        // départage deux avances du même jour par leur ordre d'arrivée.
        .orderBy(asc(transactions.transactionDate), asc(transactions.id))
  const effects = settlementEffectByTransaction(settlementLines)

  return {
    transactions: rows.map((r) => {
      const effect = effects.get(r.id)
      return {
        ...r,
        settlementStatus: effect?.status ?? null,
        // Hors groupe, ce que la ligne pèse EST son montant : l'appelant somme une seule
        // colonne, sans avoir à savoir laquelle des deux regarder (NFR2).
        effectiveAmountCents: effect?.effectiveAmountCents ?? r.amountCents,
      }
    }),
    reliability,
  }
})
