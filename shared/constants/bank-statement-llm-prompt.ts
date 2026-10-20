/**
 * Prompt système pour l'extraction et la catégorisation des transactions bancaires (D41).
 *
 * VERSIONING : le prompt est une constante versionnée. Pour le modifier, incrémenter
 * `BANK_STATEMENT_PROMPT_VERSION` — la cohérence des catégorisations passées dépend de sa
 * stabilité.
 *
 * NFR6 : ne JAMAIS injecter de données personnelles ici (nom, IBAN, adresse). Seuls la date,
 * le libellé et le montant sortent de la machine.
 *
 * Depuis la version 4 (story 28.1), la partie commune est neutre vis-à-vis de la banque : un
 * paragraphe propre à chaque banque (`BANK_PROMPT_NOTES`) s'y ajoute via
 * `buildBankStatementSystemPrompt(bank)`.
 */
import type { Bank } from '../types/bank'
import type { MovementNature } from '../types/movement-nature'

/**
 * Poste tel qu'il est présenté au modèle.
 *
 * Il porte sa rubrique et sa nature, et pas seulement son code : sans la rubrique, le modèle
 * ne peut pas trancher entre `alimentation-restaurant` et `voyages-restaurant` (FR19) ; sans
 * la nature, il n'a aucun moyen de reconnaître qu'un virement vers un livret n'est pas une
 * dépense.
 */
export interface LlmCategoryItem {
  readonly code: string
  readonly label: string
  readonly nature: MovementNature
  readonly groupCode: string
  readonly groupLabel: string
}

/**
 * Version 5 (story 28.2) : paragraphe Crédit Mutuel (colonnes, date de l'opération). Version 4
 * (story 28.1) : partie commune neutre vis-à-vis de la banque, complétée par un
 * paragraphe par banque (`BANK_PROMPT_NOTES`). Précédemment, version 3 : référentiel
 * hiérarchique, trois natures (D17) et marqueurs de colonne.
 */
export const BANK_STATEMENT_PROMPT_VERSION = 5

const NATURE_FR: Record<MovementNature, string> = {
  income: 'recette',
  expense: 'dépense',
  internal_transfer: 'mouvement interne',
}

export const BANK_STATEMENT_SYSTEM_PROMPT = `Tu es un assistant spécialisé dans l'extraction et la catégorisation de transactions bancaires françaises à partir de relevés de compte.

Tu reçois en entrée le texte brut d'un relevé de compte (issu d'une extraction PDF, donc parfois mal formaté). Tu dois en extraire TOUTES les transactions et retourner un JSON strictement conforme au schéma fourni.

Le référentiel de classement est organisé en deux niveaux : des RUBRIQUES (titres \`##\`) qui contiennent des POSTES. Chaque poste porte une NATURE parmi trois : recette, dépense ou mouvement interne.

RÈGLES CRITIQUES :

1. **Exhaustivité** : extraire TOUTES les opérations, sans en omettre. Une ligne ambiguë est incluse quand même, avec le poste de repli.

2. **Signe du montant — il est DONNÉ, pas à déduire** :
   - Chaque montant est suivi du marqueur \`[DÉBIT]\` ou \`[CRÉDIT]\`, lu directement dans la colonne du relevé.
   - \`[DÉBIT]\` → montant NÉGATIF. \`[CRÉDIT]\` → montant POSITIF. **Sans exception.**
   - Ne JAMAIS contredire le marqueur, même si le libellé suggère l'inverse. Le marqueur vient du relevé ; le libellé n'est qu'un indice.
   - Si un montant n'a pas de marqueur, alors seulement, déduire le signe du contexte.
   - Le signe et la nature sont INDÉPENDANTS : un remboursement rangé sur un poste de dépense reste un montant positif, et c'est correct.

3. **Mouvement interne** : un déplacement d'argent entre les comptes de la même personne — virement vers ou depuis un livret, retrait d'espèces. Ce n'est NI une recette NI une dépense. Le classer en recette gonflerait les revenus et masquerait un déficit. En cas de doute sur un virement, regarde s'il désigne un compte d'épargne ou une contrepartie externe.

4. **Poste de repli** : si aucun poste ne convient, utiliser EXACTEMENT le code de repli indiqué dans le message utilisateur. Ne JAMAIS fabriquer un code qui n'est pas dans la liste, même s'il semble plus juste.

5. **Format des montants** : en CENTIMES (entiers signés). 12,34 € → 1234 ; -12,34 € → -1234. Jamais de décimale.

6. **Format des dates** : YYYY-MM-DD, converti depuis JJ/MM/AAAA.

7. **Libellé (\`label\`)** : conserver le libellé brut du relevé (raccourci raisonnablement à 100 caractères), sans paraphraser. Garder les références utiles (numéro de carte tronqué, ville, date d'opération si différente de la date de débit).

8. **Pas d'invention** : si le montant, la date ou le libellé d'une ligne n'est pas lisible, NE PAS l'inclure. Mieux vaut omettre qu'inventer.

   Les lignes de solde ne sont PAS des opérations : les ignorer.

9. **Pas d'enrichissement** : ne pas ajouter de TVA, ne pas calculer de soldes, ne pas regrouper plusieurs lignes. Une ligne du relevé = une transaction.

Si le texte ne contient aucune transaction identifiable, retourner un tableau vide \`[]\`.`

/**
 * Paragraphe propre à chaque banque, ajouté à la suite de la partie commune (D41, AC 8).
 * Crédit Mutuel (story 28.2) : colonnes du compte courant et piège de la date de valeur.
 */
export const BANK_PROMPT_NOTES: Record<Bank, string> = {
  boursorama: `\n\nNote propre à ce relevé Boursorama : les lignes de solde portent les intitulés « SOLDE AU » et « Nouveau solde » — ce sont elles qu'il faut ignorer (règle 8).`,
  credit_mutuel: `\n\nNote propre à ce relevé Crédit Mutuel : les colonnes sont « Date », « Date valeur », « Opération », « Débit EUROS » et « Crédit EUROS ». La date de l'opération est la PREMIÈRE colonne, JAMAIS la date de valeur (la deuxième date de la ligne). Une ligne sans date prolonge le libellé de la ligne précédente : ne pas en faire une opération à part. Les références de prélèvement (« ICS : », « RUM : ») font partie du libellé de l'opération qui les précède.`,
}

/**
 * Prompt système complet pour une banque donnée : partie commune + note. Pour Boursorama,
 * l'ensemble conserve toutes les règles de la version 3 (AC 8).
 */
export function buildBankStatementSystemPrompt(bank: Bank): string {
  return `${BANK_STATEMENT_SYSTEM_PROMPT}${BANK_PROMPT_NOTES[bank]}`
}

/**
 * Rend le référentiel groupé par rubrique.
 *
 * L'ordre est celui reçu, lui-même issu d'un `ORDER BY` : sans tri stable, l'ordre des postes
 * dans le prompt dépendrait de l'historique de création en base et la catégorisation ne serait
 * pas reproductible d'une base à l'autre (revue 2026-08-04).
 */
function renderReferential(items: ReadonlyArray<LlmCategoryItem>): string {
  const byGroup = new Map<string, { label: string, items: LlmCategoryItem[] }>()
  for (const item of items) {
    const entry = byGroup.get(item.groupCode) ?? { label: item.groupLabel, items: [] }
    entry.items.push(item)
    byGroup.set(item.groupCode, entry)
  }
  return [...byGroup.values()]
    .map(g => [
      `## ${g.label}`,
      ...g.items.map(i => `- ${i.code} : ${i.label} (${NATURE_FR[i.nature]})`),
    ].join('\n'))
    .join('\n\n')
}

/**
 * Construit le message utilisateur : référentiel hiérarchique, code de repli, puis relevé.
 *
 * Le code de repli est passé explicitement plutôt que laissé à déduire. Sondé le 2026-09-04
 * sans repli nommé, le modèle a INVENTÉ `AUTRES_DEPENSES` face à des libellés sans poste
 * correspondant — dans un JSON pourtant conforme au schéma. Nommé, il l'utilise.
 */
export function buildBankStatementUserMessage(
  rawText: string,
  availableCategories: ReadonlyArray<LlmCategoryItem>,
  fallbackItemCode: string,
): string {
  return `Voici le référentiel de classement. Retourne TOUJOURS le code du poste, jamais son libellé ni le nom de la rubrique.

${renderReferential(availableCategories)}

Code de repli à utiliser quand aucun poste ne convient : ${fallbackItemCode}

Voici le texte brut du relevé bancaire à parser. Extrais toutes les transactions au format JSON strict.

---DEBUT RELEVE---
${rawText}
---FIN RELEVE---`
}

/**
 * Prompt de catégorisation SEULE (story 28.4, D44) : le libellé arrive déjà extrait par le
 * code (export Excel), le modèle ne fait plus d'EXTRACTION — ni montant, ni date, ni règle de
 * signe. Reprend seulement les règles 3 (mouvement interne) et 4 (repli) de la version 4 :
 * les autres (signe, format de montant/date, exhaustivité de lignes de relevé) n'ont plus
 * d'objet quand l'entrée est une liste de libellés déjà isolés.
 *
 * VERSIONING séparé de `BANK_STATEMENT_PROMPT_VERSION` — les deux chemins évoluent
 * indépendamment.
 */
export const LABELS_PROMPT_VERSION = 1

export const LABELS_CATEGORIZATION_SYSTEM_PROMPT = `Tu es un assistant spécialisé dans la catégorisation de libellés d'opérations bancaires françaises.

Tu reçois une LISTE de libellés, chacun accompagné du sens de son mouvement — \`[DÉBIT]\` (argent qui sort) ou \`[CRÉDIT]\` (argent qui entre). Tu dois attribuer à CHAQUE libellé, par son index, un SEUL code de poste parmi le référentiel fourni.

Le référentiel de classement est organisé en deux niveaux : des RUBRIQUES (titres \`##\`) qui contiennent des POSTES. Chaque poste porte une NATURE parmi trois : recette, dépense ou mouvement interne.

RÈGLES CRITIQUES :

1. **Un poste par libellé, par index** : réponds pour CHAQUE index reçu, une seule fois chacun. N'invente ni n'omets aucun index.

2. **Mouvement interne** : un déplacement d'argent entre les comptes de la même personne — virement vers ou depuis un livret, retrait d'espèces. Ce n'est NI une recette NI une dépense. En cas de doute sur un virement, regarde s'il désigne un compte d'épargne ou une contrepartie externe.

3. **Poste de repli** : si aucun poste ne convient, utiliser EXACTEMENT le code de repli indiqué dans le message utilisateur. Ne JAMAIS fabriquer un code qui n'est pas dans la liste, même s'il semble plus juste.

4. **Le sens \`[DÉBIT]\`/\`[CRÉDIT]\` aide à trancher recette / dépense / mouvement interne, mais ne détermine PAS seul la nature du poste** : un remboursement peut arriver en \`[CRÉDIT]\` sur un poste de dépense (D28), et un mouvement interne peut être un \`[DÉBIT]\` comme un \`[CRÉDIT]\`.

Retourne un JSON strictement conforme au schéma fourni.`

/**
 * Construit le message utilisateur de `categorizeLabels` : référentiel hiérarchique, code de
 * repli, puis la liste des libellés à catégoriser — chacun avec son INDEX et son sens
 * `[DÉBIT]`/`[CRÉDIT]` (tranché le 2026-09-26 par l'architecte, story 28.4) — jamais son
 * montant.
 */
/**
 * Neutralise sauts de ligne et caractères de contrôle d'un libellé d'export (D42, story 28.4) —
 * même nettoyage que celui appliqué aux libellés de poste dans `renderReferential` /
 * l'orchestrateur. Un libellé un par ligne dans le message : un saut de ligne à l'intérieur
 * romprait le format « index. [SENS] libellé » et ferait glisser le libellé suivant sur un
 * index qu'il n'a pas.
 */
function cleanLabel(value: string): string {
  return value.replace(/[\p{Cc}\p{Cf}]+/gu, ' ').trim()
}

export function buildLabelsUserMessage(
  labels: ReadonlyArray<{ label: string, direction: 'debit' | 'credit' }>,
  availableCategories: ReadonlyArray<LlmCategoryItem>,
  fallbackItemCode: string,
): string {
  const rendered = labels
    .map((l, i) => `${i}. [${l.direction === 'debit' ? 'DÉBIT' : 'CRÉDIT'}] ${cleanLabel(l.label)}`)
    .join('\n')
  return `Voici le référentiel de classement. Retourne TOUJOURS le code du poste, jamais son libellé ni le nom de la rubrique.

${renderReferential(availableCategories)}

Code de repli à utiliser quand aucun poste ne convient : ${fallbackItemCode}

Voici les libellés à catégoriser, un par ligne, précédés de leur index et du sens du mouvement.

---DEBUT LIBELLES---
${rendered}
---FIN LIBELLES---`
}
