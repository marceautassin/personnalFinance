import { defineEventHandler } from 'h3'
import { asc, and, or, eq, gt, gte, lte, inArray } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { transactions, categoryItems, categoryGroups, bankStatements } from '~~/server/db/schema'
import { type StatementReliability, worstReliability } from '~~/shared/types/statement-reliability'
import { reliabilityOverlapping } from '~~/server/utils/statement-reliability'
import { validateQuery } from '~~/server/utils/validation'
import { settlementEffectByTransaction } from '~~/server/utils/settlement-status'
import { jointReimbursedCents } from '~~/server/services/analysis-engine'
import {
  JOINT_TRANSFER_ITEM_CODE,
  JOINT_REIMBURSEMENT_ITEM_CODE,
  JOINT_GROUP_CODE,
} from '~~/shared/constants/default-referential'
import { TransactionListQuerySchema } from '~~/shared/schemas/transaction.schema'
import { requireProfile } from '~~/server/utils/current-profile'

export default defineEventHandler(async (event) => {
  const query = validateQuery(event, TransactionListQuerySchema)
  const profileId = requireProfile(event)

  // Deux formes de requête, une seule lecture : la vue mensuelle et la descente depuis un
  // agrégat lisent la même table, avec le même tri.
  const [from, to] = 'month' in query
    // LIKE 'YYYY-MM-%' utilise l'index transactions_period_idx (text comparable en préfixe) ;
    // les bornes ci-dessous sont équivalentes et couvrent tous les jours du mois.
    ? [`${query.month}-01`, `${query.month}-31`]
    : [query.from, query.to]
  const requestedItem = 'month' in query ? undefined : query.item
  const requestedGroup = 'month' in query ? undefined : query.group

  /*
   * Le poste « Part remboursée » du compte joint ne porte AUCUNE ligne en base : c'est un poste
   * calculé, alimenté par la coupe du moteur (story 21.1). Le descendre revient donc à
   * descendre AUSSI les virements du joint, montrés à leur moitié qui compte — sans quoi ouvrir
   * un montant bien réel donnerait une liste vide, le contraire de NFR2.
   *
   * « Aussi », et non « à la place » : rien n'interdit à l'utilisateur de ranger une ligne sur
   * ce poste, ni d'ajouter un autre poste à la rubrique. Ces lignes-là comptent dans l'agrégat ;
   * les remplacer par les virements les rendrait introuvables (revue du 2026-09-08).
   */
  const drillsIntoJointShare = requestedItem === JOINT_REIMBURSEMENT_ITEM_CODE
    || requestedGroup === JOINT_GROUP_CODE
  const itemFilter = requestedItem
  const groupFilter = requestedGroup

  /*
   * Ce que la requête désigne : un poste, une rubrique, ou tout.
   *
   * Le filtre par RUBRIQUE passe par une sous-requête et non par une jointure — la projection ne
   * change pas, et l'index `transactions_item_idx` reste utilisable.
   *
   * Quand on descend la part remboursée du compte joint, les virements du joint S'AJOUTENT à ce
   * que la portée désigne déjà : le poste est calculé, mais rien n'interdit qu'il porte aussi de
   * vraies lignes, ni que sa rubrique en contienne d'autres (revue du 2026-09-08).
   */
  // `category_item_id` est la clé technique de la table (D37) ; le filtre reste exprimé en
  // CODE, celui de l'API, résolu ici par sous-requête plutôt que par une traduction préalable
  // — une sous-requête vide (code inconnu) ne sélectionne rien, exactement le comportement
  // d'avant sur un code qui ne matchait aucune ligne.
  const requestedScope = itemFilter
    ? inArray(
        transactions.categoryItemId,
        db.select({ id: categoryItems.id }).from(categoryItems)
          .where(and(eq(categoryItems.profileId, profileId), eq(categoryItems.code, itemFilter))),
      )
    : groupFilter
      ? inArray(
          transactions.categoryItemId,
          db.select({ id: categoryItems.id })
            .from(categoryItems)
            .innerJoin(categoryGroups, eq(categoryGroups.id, categoryItems.groupId))
            .where(and(eq(categoryItems.profileId, profileId), eq(categoryGroups.code, groupFilter))),
        )
      : undefined
  const jointTransferIdSubquery = db
    .select({ id: categoryItems.id })
    .from(categoryItems)
    .where(and(eq(categoryItems.profileId, profileId), eq(categoryItems.code, JOINT_TRANSFER_ITEM_CODE)))
  const scopeFilter = drillsIntoJointShare
    ? or(
        requestedScope,
        // Seules les ENTRÉES nourrissent la part remboursée : une sortie vers le joint est une
        // contribution, que la coupe laisse entière et interne.
        and(inArray(transactions.categoryItemId, jointTransferIdSubquery), gt(transactions.amountCents, 0)),
      )
    : requestedScope

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
      categoryItemCode: categoryItems.code,
      isManual: transactions.isManual,
      settlementGroupId: transactions.settlementGroupId,
    })
    .from(transactions)
    .innerJoin(categoryItems, eq(categoryItems.id, transactions.categoryItemId))
    .innerJoin(bankStatements, eq(bankStatements.hashSha256, transactions.statementHash))
    .where(and(
      eq(bankStatements.profileId, profileId),
      gte(transactions.transactionDate, from),
      lte(transactions.transactionDate, to),
      scopeFilter,
    ))
    .orderBy(asc(transactions.transactionDate), asc(transactions.id))

  // Fiabilité agrégée des relevés *qui couvrent la période demandée*, le pire état
  // l'emportant (D23) : un seul relevé bancal contamine tout le mois.
  const statements = await reliabilityOverlapping(profileId, from, to)

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
          categoryItemCode: categoryItems.code,
          settlementGroupId: transactions.settlementGroupId,
        })
        .from(transactions)
        .innerJoin(categoryItems, eq(categoryItems.id, transactions.categoryItemId))
        .innerJoin(bankStatements, eq(bankStatements.hashSha256, transactions.statementHash))
        .where(and(
          eq(bankStatements.profileId, profileId),
          gte(transactions.transactionDate, settlementFrom),
          lte(transactions.transactionDate, settlementTo),
          inArray(transactions.settlementGroupId, groupIds),
        ))
        // Même ordre que l'entrée du moteur : le tri stable de `neutralizeSettlements`
        // départage deux avances du même jour par leur ordre d'arrivée.
        .orderBy(asc(transactions.transactionDate), asc(transactions.id))
  const effects = settlementEffectByTransaction(settlementLines)

  /**
   * Ce qu'un virement du joint pèse SUR LE POSTE DEMANDÉ.
   *
   * La coupe en fait deux montants : la part remboursée, qui diminue les dépenses, et le reste,
   * qui demeure un mouvement interne. Une même ligne pèse donc l'un ou l'autre selon le poste
   * qu'on est en train d'ouvrir — il n'y a pas de valeur unique à en donner.
   */
  function jointEffective(row: { categoryItemCode: string, amountCents: number }): number {
    if (row.categoryItemCode !== JOINT_TRANSFER_ITEM_CODE || row.amountCents <= 0) {
      return row.amountCents
    }
    const reimbursed = jointReimbursedCents(row.amountCents)
    if (drillsIntoJointShare) return reimbursed
    if (requestedItem === JOINT_TRANSFER_ITEM_CODE) return row.amountCents - reimbursed
    /*
     * Aucun poste demandé : la ligne pèse son montant ENTIER.
     *
     * Ses deux moitiés vivent sur deux postes, mais une liste non filtrée n'en désigne aucun —
     * n'en rendre qu'une ferait disparaître l'autre de la somme, sans qu'aucune ligne ne la
     * porte (revue du 2026-09-08).
     */
    return row.amountCents
  }

  return {
    transactions: rows.map((r) => {
      const effect = effects.get(r.id)
      return {
        ...r,
        settlementStatus: effect?.status ?? null,
        // Hors groupe, ce que la ligne pèse EST son montant : l'appelant somme une seule
        // colonne, sans avoir à savoir laquelle des deux regarder (NFR2).
        effectiveAmountCents: effect?.effectiveAmountCents ?? jointEffective(r),
      }
    }),
    reliability,
  }
})
