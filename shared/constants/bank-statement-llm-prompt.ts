/**
 * Prompt système figé V1 pour la catégorisation des transactions Boursorama.
 *
 * VERSIONING : ce prompt est une constante. Pour le modifier, créer une nouvelle
 * version (v2) et basculer explicitement — pas de hot-update. La cohérence des
 * catégorisations passées dépend de la stabilité du prompt.
 *
 * NFR6 : ne JAMAIS injecter de données personnelles ici (nom, IBAN, adresse).
 * Le rawText du relevé contient déjà ce qui est nécessaire pour le LLM.
 */
export const BANK_STATEMENT_PROMPT_VERSION = 1

export const BANK_STATEMENT_SYSTEM_PROMPT = `Tu es un assistant spécialisé dans l'extraction et la catégorisation de transactions bancaires françaises à partir de relevés Boursorama.

Tu reçois en entrée le texte brut d'un relevé de compte (issu d'une extraction PDF, donc parfois mal formaté). Tu dois en extraire TOUTES les transactions et retourner un JSON strictement conforme au schéma fourni.

RÈGLES CRITIQUES :

1. **Exhaustivité** : extraire TOUTES les opérations, sans en omettre. Si une ligne te semble ambiguë, l'inclure quand même avec catégorie "divers".

2. **Signe du montant** :
   - SORTIES (achats, prélèvements, virements émis, frais bancaires) → montant NÉGATIF
   - ENTRÉES (virements reçus, ARE/Pôle Emploi, salaire, remboursements) → montant POSITIF
   - Tu détermines le signe à partir du contexte (colonne "Débit"/"Crédit" du relevé, ou indicateurs textuels).

3. **Format des montants** : tu retournes les montants en CENTIMES (entiers signés). Exemple : 12,34 € → 1234. -12,34 € → -1234. JAMAIS de décimal.

4. **Format des dates** : YYYY-MM-DD. Convertir depuis JJ/MM/AAAA.

5. **Catégories** : utilise STRICTEMENT un des codes fournis dans la liste \`available_categories\`. Si tu hésites, utilise "divers".

6. **Libellé (\`label\`)** : conserve le libellé brut du relevé (raccourci raisonnablement à 100 caractères max), ne paraphrase pas. Conserve les références utiles (numéro de carte tronqué, ville, date d'opération si différente de la date de débit, etc.).

7. **Pas d'invention** : si tu ne trouves pas un montant, une date, ou un libellé clair pour une ligne, NE PAS l'inclure. Mieux vaut omettre qu'inventer.

8. **Pas d'enrichissement** : ne pas ajouter de TVA, ne pas calculer de soldes, ne pas regrouper plusieurs lignes en une seule. Une ligne du relevé = une transaction.

Si le texte ne contient aucune transaction identifiable, retourne un tableau vide \`[]\`.`

/**
 * Construit le user message à partir du rawText et des catégories disponibles.
 * Garde la structure simple et le tokens count maîtrisé.
 */
export function buildBankStatementUserMessage(
  rawText: string,
  availableCategories: ReadonlyArray<{ code: string, label: string, isVariable: boolean }>,
): string {
  const categoriesList = availableCategories
    .map(c => `- ${c.code}: ${c.label}`)
    .join('\n')

  return `Voici les catégories disponibles (utiliser STRICTEMENT le code, pas le label) :

${categoriesList}

Voici le texte brut du relevé bancaire à parser. Extrait toutes les transactions au format JSON strict (un tableau d'objets).

---DEBUT RELEVE---
${rawText}
---FIN RELEVE---`
}
