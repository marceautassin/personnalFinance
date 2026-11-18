import { describe, it, expect } from 'vitest'
import { groupKey } from './useUncategorized'
import { merchantKey } from '~~/shared/utils/bank-label'

/**
 * Regroupement des lignes non catégorisées — story 18.10.
 *
 * C'est la pièce qui fait tenir l'écran : sans nettoyage du libellé, `CARTE 17/08/26 SUPER U`
 * et `CARTE 19/08/26 SUPER U` formeraient deux groupes d'une ligne, et ranger « un groupe »
 * ne vaudrait jamais mieux que ranger une ligne.
 */
describe('groupKey', () => {
  it('réunit deux passages du même commerçant à des dates différentes', () => {
    expect(groupKey('CARTE 17/08/26 SUPER U 9 CB*0000'))
      .toBe(groupKey('CARTE 19/08/26 SUPER U 9 CB*0000'))
  })

  it('sépare deux commerçants distincts', () => {
    expect(groupKey('CARTE 17/08/26 SUPER U CB*0000'))
      .not.toBe(groupKey('CARTE 17/08/26 AUCHAN CB*0000'))
  })

  it('ignore la casse et les accents', () => {
    expect(groupKey('CB CRÈCHE LES PETITS EXEMPLES')).toBe(groupKey('cb creche les petits exemples'))
  })

  it('retire le type d\'opération, qui ne dit rien du commerçant', () => {
    expect(groupKey('PRLV SEPA SAS EXEMPLE LA CARTE')).toBe(groupKey('VIR SEPA SAS EXEMPLE LA CARTE'))
  })

  it('retire la référence de mandat, unique à chaque ligne', () => {
    expect(groupKey('VIR SEPA DUPONT Jean charges Rèf : SCT000001'))
      .toBe(groupKey('VIR SEPA DUPONT Jean charges Rèf : SCT999999'))
  })

  /**
   * Un chèque n'a pas de commerçant, seulement un numéro. Les réunir mélangerait des dépenses
   * sans rapport — un restaurant et des frais scolaires dans le même groupe.
   */
  it('laisse seul un libellé qui n\'identifie aucun commerçant', () => {
    expect(groupKey('CHQ. N.7925088')).not.toBe(groupKey('CHQ. N.7925099'))
  })

  it('rend une clé non vide même sur un libellé réduit à des chiffres', () => {
    expect(groupKey('123456').length).toBeGreaterThan(0)
  })

  it('réduit les espaces multiples, qui ne distinguent rien', () => {
    expect(groupKey('CARTE 01/01/26  SUPER   U  CB*1')).toBe(groupKey('CARTE 02/01/26 SUPER U CB*1'))
  })
})

/**
 * L'écran propose le motif de règle d'un groupe. Le repli de `groupKey` — le libellé entier,
 * date et numéro de carte compris — ferait une règle qui ne se déclencherait jamais deux fois.
 * Le motif proposé doit donc venir de `merchantKey`, pas de la clé de regroupement.
 */
describe('motif de règle proposé', () => {
  it('vaut la clé de regroupement quand un commerçant est identifiable', () => {
    const label = 'CARTE 17/08/26 SUPER U 9 CB*0000'
    expect(merchantKey(label)).toBe(groupKey(label))
  })

  it('est nul là où la clé de regroupement retombe sur le libellé entier', () => {
    const label = 'CHQ. N.7925088'
    expect(merchantKey(label)).toBeNull()
    // La clé, elle, existe toujours : sans elle le groupe n'aurait pas d'identité.
    expect(groupKey(label)).toBe('chq. n.7925088')
  })
})
