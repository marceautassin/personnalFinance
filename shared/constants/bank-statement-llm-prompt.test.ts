import { describe, it, expect } from 'vitest'
import {
  buildBankStatementUserMessage,
  buildBankStatementSystemPrompt,
  BANK_STATEMENT_SYSTEM_PROMPT,
  BANK_STATEMENT_PROMPT_VERSION,
  type LlmCategoryItem,
} from './bank-statement-llm-prompt'
import { DEFAULT_REFERENTIAL, FALLBACK_ITEM_CODE } from './default-referential'

const ITEMS: LlmCategoryItem[] = DEFAULT_REFERENTIAL.flatMap(g =>
  g.items.map(i => ({
    code: i.code,
    label: i.label,
    nature: i.nature,
    groupCode: g.code,
    groupLabel: g.label,
  })),
)

describe('buildBankStatementUserMessage', () => {
  const message = buildBankStatementUserMessage('RELEVE BRUT', ITEMS, FALLBACK_ITEM_CODE)

  it('décrit la hiérarchie rubrique → poste, pas une liste plate', () => {
    expect(message).toContain('## Alimentation')
    expect(message).toContain('## Voyages')
    expect(message).toContain('- alimentation-restaurant : Restaurant (dépense)')
    expect(message).toContain('- voyages-restaurant : Restaurant (dépense)')
  })

  it('expose les trois natures en clair', () => {
    expect(message).toContain('(recette)')
    expect(message).toContain('(dépense)')
    expect(message).toContain('(mouvement interne)')
  })

  /**
   * Sondé le 2026-09-04 sans repli nommé, le modèle a inventé `AUTRES_DEPENSES` face à des
   * libellés sans poste correspondant — dans un JSON pourtant conforme au schéma. Nommé, il
   * l'utilise. Ce n'est donc pas une précaution de style.
   */
  it('nomme explicitement le code de repli', () => {
    expect(message).toContain(`Code de repli à utiliser quand aucun poste ne convient : ${FALLBACK_ITEM_CODE}`)
  })

  it('encadre le relevé par des marqueurs', () => {
    expect(message).toContain('---DEBUT RELEVE---\nRELEVE BRUT\n---FIN RELEVE---')
  })

  it('rend chaque poste exactement une fois, sous sa rubrique', () => {
    for (const item of ITEMS) {
      const occurrences = message.split(`- ${item.code} :`).length - 1
      expect(occurrences, item.code).toBe(1)
    }
  })

  it('conserve l\'ordre reçu, pour que le prompt soit reproductible', () => {
    const codes = [...message.matchAll(/^- ([a-z0-9-]+) :/gmu)].map(m => m[1])
    expect(codes).toEqual(ITEMS.map(i => i.code))
  })

  /** Un référentiel réduit ne doit pas laisser traîner de rubrique vide dans le prompt. */
  it('n\'émet que les rubriques réellement représentées', () => {
    const partial = buildBankStatementUserMessage(
      'X',
      ITEMS.filter(i => i.groupCode === 'internes'),
      FALLBACK_ITEM_CODE,
    )
    expect(partial).toContain('## Mouvements internes')
    expect(partial).not.toContain('## Alimentation')
  })
})

describe('BANK_STATEMENT_SYSTEM_PROMPT', () => {
  it('interdit d\'inventer un code hors référentiel', () => {
    expect(BANK_STATEMENT_SYSTEM_PROMPT).toMatch(/ne JAMAIS fabriquer un code/i)
  })

  it('explique pourquoi un mouvement interne n\'est ni recette ni dépense', () => {
    expect(BANK_STATEMENT_SYSTEM_PROMPT).toMatch(/masquerait un déficit/i)
  })

  /**
   * Le signe est une donnée du relevé, la nature une propriété du poste (D28). Les confondre
   * conduirait le modèle à « corriger » un remboursement en le déplaçant vers une recette.
   */
  it('dissocie le signe du montant de la nature du poste', () => {
    expect(BANK_STATEMENT_SYSTEM_PROMPT).toMatch(/signe et la nature sont INDÉPENDANTS/)
  })

  /**
   * Le signe ne se déduit plus : il est lu dans la colonne du relevé et transmis en marqueur.
   * Le modèle avait donné deux signes opposés au même libellé récurrent quand il devait le
   * deviner (constaté le 2026-09-05 sur les relevés réels).
   */
  it('impose les marqueurs de colonne comme autorité sur le signe', () => {
    expect(BANK_STATEMENT_SYSTEM_PROMPT).toContain('[DÉBIT]')
    expect(BANK_STATEMENT_SYSTEM_PROMPT).toContain('[CRÉDIT]')
    expect(BANK_STATEMENT_SYSTEM_PROMPT).toMatch(/Ne JAMAIS contredire le marqueur/)
  })

  it('écarte explicitement les lignes de solde', () => {
    expect(BANK_STATEMENT_SYSTEM_PROMPT).toMatch(/lignes de solde.*ne sont PAS des opérations/su)
  })

  /** Depuis la version 4 (story 28.1), la partie commune est neutre vis-à-vis de la banque. */
  it('ne mentionne plus Boursorama (D41, AC 8)', () => {
    expect(BANK_STATEMENT_SYSTEM_PROMPT).not.toMatch(/boursorama/i)
  })

  it('ne cite plus les intitulés de solde propres à Boursorama', () => {
    expect(BANK_STATEMENT_SYSTEM_PROMPT).not.toContain('SOLDE AU')
    expect(BANK_STATEMENT_SYSTEM_PROMPT).not.toContain('Nouveau solde')
  })
})

describe('BANK_STATEMENT_PROMPT_VERSION', () => {
  it('vaut 4 depuis la story 28.1', () => {
    expect(BANK_STATEMENT_PROMPT_VERSION).toBe(4)
  })
})

/**
 * buildBankStatementSystemPrompt(bank) — D41, AC 8. Pour Boursorama, l'ensemble « commun +
 * paragraphe » doit conserver TOUTES les règles de la version 3, phrase-clé par phrase-clé.
 */
describe('buildBankStatementSystemPrompt', () => {
  const boursoramaPrompt = buildBankStatementSystemPrompt('boursorama')

  it('cite « SOLDE AU » uniquement dans le paragraphe Boursorama', () => {
    expect(boursoramaPrompt).toContain('SOLDE AU')
    expect(boursoramaPrompt).toContain('Nouveau solde')
  })

  it.each([
    /Exhaustivité/i, // règle 1
    /Ne JAMAIS contredire le marqueur/, // règle 2
    /masquerait un déficit/i, // règle 3
    /Poste de repli/i, // règle 4
    /CENTIMES/, // règle 5
    /YYYY-MM-DD/, // règle 6
    /conserver le libellé brut du relevé.*sans paraphraser/i, // règle 7
    /Pas d'invention/i, // règle 8
    /Pas d'enrichissement/i, // règle 9
  ])('conserve la règle « %s » de la v3', (rule) => {
    expect(boursoramaPrompt).toMatch(rule)
  })

  it('credit_mutuel reste neutre (extraction reportée à la story 28.2)', () => {
    const creditMutuelPrompt = buildBankStatementSystemPrompt('credit_mutuel')
    expect(creditMutuelPrompt).toBe(BANK_STATEMENT_SYSTEM_PROMPT)
    expect(creditMutuelPrompt).not.toContain('SOLDE AU')
  })
})
