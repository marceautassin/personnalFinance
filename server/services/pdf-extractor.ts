/**
 * pdf-extractor — extraction texte + métadonnées d'un relevé bancaire PDF.
 *
 * SEUL POINT D'ENTRÉE vers `unpdf` (NFR21, CLAUDE.md §Boundaries imperméables).
 * Tout autre import direct de `unpdf` ailleurs dans le code est un anti-pattern.
 *
 * La logique propre à chaque banque (reconnaissance, coupe du texte, lecture des soldes et
 * de la période) vit derrière `BankFormat`, dans `server/services/bank-formats/` (D41). Ce
 * fichier ne fait plus que : lire le PDF, router vers le bon format, et redacter l'identité
 * en dernier (règle commune à toutes les banques).
 */
import { extractText, getDocumentProxy } from 'unpdf'
import type { Cents } from '~~/shared/types/money'
import type { Bank } from '~~/shared/types/bank'
import { BANK_FORMATS, detectBank } from '~~/server/services/bank-formats'
import { BankMismatchError, type PositionedItem } from '~~/server/services/bank-formats/types'
import { maskIban, maskLabelledBankId } from '~~/server/services/bank-formats/identity'

export interface RawStatement {
  /** Texte concaténé de toutes les pages du PDF. */
  rawText: string
  /** Première date de la période couverte (YYYY-MM-DD) ou null si non détectée. */
  periodStart: string | null
  /** Dernière date de la période couverte (YYYY-MM-DD) ou null. */
  periodEnd: string | null
  /** Solde d'ouverture du relevé en Cents, null si non détecté. */
  openingBalanceCents: Cents | null
  /** Solde de clôture du relevé en Cents, null si non détecté. */
  closingBalanceCents: Cents | null
  /** Titres (sans numéros) des sections du relevé non importées — vide si la banque n'en a pas (story 28.2). */
  ignoredSections: string[]
}

/**
 * Texte plat concaténé de toutes les pages. Exportée pour la capture de fixture (D43, story
 * 28.1) : `unpdf` reste importé par ce seul fichier (NFR21), la capture y accède via cette
 * fonction plutôt qu'en important `unpdf` elle-même.
 */
export async function readFlatText(pdfBuffer: Buffer): Promise<string> {
  let flatText: string

  try {
    const result = await extractText(new Uint8Array(pdfBuffer), { mergePages: true })
    // `mergePages: true` type `text: string` côté `unpdf`, mais on garde une garde
    // défensive contre une éventuelle dérive de version (text: string[]).
    flatText = Array.isArray(result.text) ? result.text.join('\n') : (result.text ?? '')
  }
  catch (err) {
    throw new Error(`PDF extraction failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (!flatText || flatText.trim().length === 0) {
    throw new Error('PDF contains no extractable text')
  }

  return flatText
}

export async function extractStatement(pdfBuffer: Buffer, bank: Bank): Promise<RawStatement> {
  const flatText = await readFlatText(pdfBuffer)

  // Refus croisé (FR78, AR38) : AVANT tout appel au fournisseur, sans PDF sauvegardé ni ligne
  // écrite. Sur le texte plat COMPLET, avant toute coupe — reconnaître sur un texte déjà
  // amputé de son en-tête raterait le marqueur d'émetteur.
  const format = BANK_FORMATS[bank]
  if (!format.recognizes(flatText)) {
    throw new BankMismatchError(bank, detectBank(flatText))
  }

  // La lecture positionnelle est un CONFORT DE FIABILITÉ, pas un prérequis : son échec ne
  // doit pas faire échouer une ingestion que le texte plat rend possible. `console.warn` pour
  // que le repli reste visible (pas un `catch` qui avale silencieusement, CLAUDE.md).
  const pages = await readPositionedPages(pdfBuffer).catch((err) => {
    console.warn('[pdf-extractor] lecture positionnelle indisponible, repli sur le texte plat', err)
    return null
  })

  const rawText = redactIdentity(format.operationsText({ pages, flatText }))
  const { periodStart, periodEnd, openingCents, closingCents, ignoredSections } = format.balancesAndPeriod(flatText, pages)

  return {
    rawText,
    periodStart,
    periodEnd,
    openingBalanceCents: openingCents,
    closingBalanceCents: closingCents,
    ignoredSections: ignoredSections ?? [],
  }
}

/**
 * Remplace les identifiants bancaires par un marqueur neutre (NFR6, story 17.1).
 *
 * **Filet de sécurité, pas ligne de défense principale.** La coupe géométrique
 * (`operationRows`, dans `bank-formats/columns.ts`) retire déjà le bloc d'identité sur les
 * relevés dont les colonnes sont reconnues. Cette passe couvre ce qu'elle ne peut pas
 * atteindre : une page sans en-tête, un pied de page, un gabarit inconnu tombé sur le repli
 * texte plat. Appliquée en dernier, pour toutes les banques.
 *
 * **Portée assumée.** Le nom du titulaire figure DANS les libellés bancaires eux-mêmes
 * (`VIR SEPA DUPONT Jean charges`) : il est indissociable de la donnée métier et reste
 * transmis. Expurger ici le bloc d'identité, pas les libellés (cf. story 17.1, note de portée).
 */
export function redactIdentity(text: string): string {
  // IBAN : motif partagé avec le chemin export (`bank-formats/identity.ts`, story 28.4)
  // pour ne pas dupliquer la règle sur les deux chemins d'ingestion.
  return maskIban(maskLabelledBankId(text))
    // BIC : ancré sur son intitulé, car huit majuscules isolées peuvent être un marchand.
    .replace(/\b(BIC|SWIFT)\s*:?\s*[A-Z0-9]{8,11}\b/gu, '$1 : [BIC]')
}

/**
 * Lit les pages d'un PDF avec la position (x, y, largeur) de chaque fragment de texte.
 *
 * Exportée pour la capture de fixture (D43, story 28.1) : c'est la seule façon d'obtenir des
 * pages positionnées hors de `extractStatement`, sans dupliquer l'appel à `unpdf` ailleurs.
 */
export async function readPositionedPages(pdfBuffer: Buffer): Promise<PositionedItem[][]> {
  const doc = await getDocumentProxy(new Uint8Array(pdfBuffer))
  const pages: PositionedItem[][] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent()
    const items = (content.items as { str?: string, transform?: number[], width?: number }[])
      .flatMap((i) => {
        const text = (i.str ?? '').trim()
        const x = i.transform?.[4]
        const y = i.transform?.[5]
        if (text.length === 0 || typeof x !== 'number' || typeof y !== 'number') return []
        return [{ x, right: x + (i.width ?? 0), y, text }]
      })
    pages.push(items)
  }
  return pages
}
