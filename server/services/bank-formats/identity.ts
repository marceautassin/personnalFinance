/**
 * bank-formats/identity — masquage des identifiants de compte dans un libellé (D42, story
 * 28.4). Pure, sans dépendance à `exceljs` ni à aucune banque précise : réutilisable par 28.2
 * (raccord PDF/export) sans modification.
 *
 * Trois couches, appliquées dans cet ordre :
 *  1. Remplacement EXACT de chaque numéro connu (le plus long d'abord, pour qu'un numéro plus
 *     court qui en serait un sous-ensemble ne le masque pas partiellement en premier).
 *  2. IBAN écrit par groupes (`FR76 XXXX XXXX …`) — même motif que `pdf-extractor.ts`
 *     (`redactIdentity`, story 17.1) : un libellé peut porter un IBAN COMPLET (`VIR … IBAN
 *     FR76 1234 5678 …`), que la couche « ≥ 10 chiffres consécutifs » ne voit pas puisqu'il est
 *     coupé par des espaces.
 *  3. Toute suite RESTANTE de 10 chiffres ou plus → `[NUMÉRO]`. Les suites de 7 chiffres
 *     (numéros de chèque) et les groupes isolés de 5 chiffres (codes postaux…) non collectés
 *     comme identifiants connus restent lisibles : ils ne désignent pas un compte.
 *
 * La couche 1 peut masquer un code postal qui coïnciderait avec un code guichet : faux positif
 * assumé (D42), sans conséquence sur la catégorisation.
 */

/**
 * IBAN : deux lettres, deux chiffres, puis des groupes alphanumériques éventuellement espacés.
 * Motif IDENTIQUE à celui de `pdf-extractor.ts` (`redactIdentity`) — un libellé bancaire en
 * majuscules ne prend pas cette forme, extrait ici pour être partagé par les deux chemins
 * d'ingestion (PDF et export) sans dupliquer la règle.
 *
 * **Resserré en story 28.2** : tous les groupes sont de QUATRE caractères, seul le dernier peut
 * être plus court (c'est la forme d'un IBAN réel, espacé ou compact). L'ancien motif acceptait
 * des groupes de 2 à 4 : sur Crédit Mutuel, `ASSURANCE SANTE SC0000001 55,28` en avalait le
 * MONTANT (`SC00 000 01 55` lu comme un IBAN) — le relevé perdait des opérations en silence.
 */
export function maskIban(text: string): string {
  return text.replace(/\b[A-Z]{2}\d{2}(?:[ \u{a0}\u{202f}]?[A-Z0-9]{4}){2,7}(?:[ \u{a0}\u{202f}]?[A-Z0-9]{1,4})?\b/gu, '[IBAN]')
}

/**
 * Identifiant bancaire introduit par son intitulé (`IBAN :`, `QXBAN :`, `RIB :`) : tout ce qui suit,
 * groupes irréguliers compris (`QX00 ZZZZ ZZ2A XXX …`, RIB `12345 67890 12345678901 23`).
 * Ancré sur l'intitulé, comme le BIC dans `redactIdentity`. Un groupe suivi d'une virgule ou d'un
 * point décimal est un MONTANT (`55,28`) : il n'est jamais avalé. Un second intitulé n'est pas absorbé.
 */
export function maskLabelledBankId(text: string): string {
  return text.replace(
    /\b(QXBAN|IBAN|RIB)(\s*:\s*)[A-Z0-9]{2,}(?:[ \u{a0}\u{202f}]+(?!(?:QXBAN|IBAN|RIB)\b)[A-Z0-9]{1,11}(?![A-Z0-9]|[.,]\d))*/gu,
    '$1$2[IBAN]',
  )
}

/** Un numéro de compte / RIB (avec ou sans espaces) est un « connu ». */
export function maskAccountNumbers(text: string, knownNumbers: readonly string[]): string {
  let masked = text
  // Le plus long d'abord : un numéro de 20 caractères qui contient un numéro de 11 chiffres
  // en sous-chaîne doit être remplacé EN ENTIER avant que le plus court ne soit cherché.
  const sorted = [...new Set(knownNumbers)].filter(n => n.length > 0).sort((a, b) => b.length - a.length)
  for (const known of sorted) {
    masked = masked.split(known).join('[COMPTE]')
  }
  // Couche 2 : IBAN écrit par groupes — AVANT la couche 3, sinon ses chiffres (hors lettres)
  // ne seraient jamais consécutifs sur ≥ 10 caractères et passeraient inaperçus.
  masked = maskIban(masked)
  // Couche 3 : toute suite de ≥ 10 chiffres restante (références SEPA, etc.). Les suites de 7
  // chiffres (chèques) et les groupes isolés plus courts ne sont PAS touchés ici.
  masked = masked.replace(/\d{10,}/g, '[NUMÉRO]')
  return masked
}
