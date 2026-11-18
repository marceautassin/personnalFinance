import type { SettlementStatus } from '~~/shared/types/settlement-status'
import {
  JOINT_TRANSFER_ITEM_CODE,
  JOINT_REIMBURSEMENT_ITEM_CODE,
} from '~~/shared/constants/default-referential'

/** Texte, ton et explication d'un badge de réconciliation. */
export interface SettlementBadge {
  text: string
  /** Classe de ton, à poser à côté de `.tag`. */
  tone: 'tag--settled' | 'tag--pending'
  title: string
}

/**
 * Le badge d'une ligne — un seul endroit pour trois écrans.
 *
 * La vue mensuelle, la descente d'analyse et la descente d'évolution le portaient chacune de
 * leur côté ; trois formulations d'un même état finissent par se contredire, et c'est un état
 * que l'utilisateur lit juste à côté d'un montant.
 *
 * Il dit ce que la ligne est DEVENUE, pas seulement qu'elle appartient à un groupe : « lié »
 * sans état laisserait croire qu'une avance non encore remboursée ne compte plus.
 */
export function settlementBadge(status: SettlementStatus | null | undefined): SettlementBadge | null {
  switch (status) {
    case 'neutralized':
      return {
        text: 'remboursé',
        tone: 'tag--settled',
        title: 'Avance remboursée : cette ligne ne compte ni dans les dépenses ni dans les recettes.',
      }
    case 'partial':
      return {
        text: 'remboursé en partie',
        tone: 'tag--settled',
        title: 'Partiellement remboursée : seul le reste non couvert compte dans l\'analyse.',
      }
    case 'outstanding':
      return {
        text: 'à rembourser',
        tone: 'tag--pending',
        title: 'Liée à une réconciliation, mais pas encore remboursée : elle compte entièrement.',
      }
    default:
      return null
  }
}

/**
 * Le montant du relevé mérite-t-il d'être rappelé entre parenthèses ?
 *
 * Uniquement quand il diffère de ce que la ligne pèse : sur une ligne à charge, répéter deux
 * fois le même chiffre ne ferait qu'occuper de la place.
 */
export function showsOriginalAmount(amountCents: number, effectiveAmountCents: number): boolean {
  return amountCents !== effectiveAmountCents
}

/**
 * Le badge d'une ligne de descente — réconciliation OU coupe du compte joint.
 *
 * Un virement du joint s'affiche à sa moitié, montant du relevé entre parenthèses, exactement
 * comme une ligne réconciliée. Sans badge, l'utilisateur voyait un montant divisé par deux sans
 * rien qui le justifie, là où toutes les autres lignes à montant réduit s'expliquent
 * (revue du 2026-09-08).
 *
 * La réconciliation l'emporte quand les deux s'appliquent : le moteur ne coupe pas une ligne
 * déjà rattachée à un groupe, l'écran doit dire la même chose.
 */
export function lineBadge(
  tx: { settlementStatus?: SettlementStatus | null, categoryItemCode: string },
): SettlementBadge | null {
  const settlement = settlementBadge(tx.settlementStatus)
  if (settlement) return settlement
  if (tx.categoryItemCode === JOINT_TRANSFER_ITEM_CODE || tx.categoryItemCode === JOINT_REIMBURSEMENT_ITEM_CODE) {
    return {
      text: 'moitié · compte joint',
      tone: 'tag--settled',
      title: 'Compte joint alimenté à parts égales : la moitié de ce virement rembourse une '
        + 'dépense commune, l\'autre moitié est votre propre argent qui revient et ne compte nulle part.',
    }
  }
  return null
}
