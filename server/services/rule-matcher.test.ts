import { describe, it, expect } from 'vitest'
import { resolveRule, applyRules, normalizeForMatch } from './rule-matcher'

const rule = (pattern: string, categoryItemCode: string) => ({ pattern, categoryItemCode })

describe('normalizeForMatch', () => {
  it('efface la casse et les accents', () => {
    expect(normalizeForMatch('PÉAGE Autoroute')).toBe('peage autoroute')
  })

  it('réduit les espaces multiples', () => {
    expect(normalizeForMatch('  CARTE   01/03  ')).toBe('carte 01/03')
  })
})

describe('resolveRule', () => {
  const rules = [rule('carrefour', 'alimentation-courses'), rule('societex', 'internes-remboursement-cca')]

  it('trouve la règle dont le motif est contenu dans le libellé', () => {
    expect(resolveRule('CARTE 01/03 CARREFOUR MARKET EXEMPLEVILLE', rules)?.categoryItemCode)
      .toBe('alimentation-courses')
  })

  it('ignore la casse et les accents des deux côtés', () => {
    expect(resolveRule('PEAGE A10', [rule('péage', 'transport-peage-parking')])?.categoryItemCode)
      .toBe('transport-peage-parking')
    expect(resolveRule('PÉAGE A10', [rule('peage', 'transport-peage-parking')])?.categoryItemCode)
      .toBe('transport-peage-parking')
  })

  it('rend null quand rien ne correspond', () => {
    expect(resolveRule('VIR SALAIRE ACME', rules)).toBeNull()
  })

  it('rend null sans aucune règle', () => {
    expect(resolveRule('CARREFOUR', [])).toBeNull()
  })

  /**
   * Le départage doit être compréhensible sans regarder la base : plus le motif est long,
   * plus il est spécifique. Sans cette règle, le résultat dépendrait de l'ordre d'insertion.
   */
  it('donne la priorité au motif le plus long', () => {
    const withOverlap = [
      rule('amazon', 'divers-non-categorise'),
      rule('amazon prime', 'abonnements-streaming'),
    ]
    expect(resolveRule('CARTE 12/03 AMAZON PRIME FR', withOverlap)?.categoryItemCode)
      .toBe('abonnements-streaming')
    expect(resolveRule('CARTE 12/03 AMAZON EU SARL', withOverlap)?.categoryItemCode)
      .toBe('divers-non-categorise')
  })

  it('à longueur égale, garde la première règle reçue', () => {
    const ties = [rule('abcdef', 'poste-a'), rule('uvwxyz', 'poste-b')]
    expect(resolveRule('abcdef uvwxyz', ties)?.categoryItemCode).toBe('poste-a')
  })
})

describe('applyRules', () => {
  const tx = (label: string, categoryItemCode: string) => ({ label, categoryItemCode, amountCents: -100 })

  /**
   * Le cas qui a motivé la fonctionnalité : quatre libellés identiques, classés de deux façons
   * différentes par le modèle dans le même lot (constaté le 2026-09-05).
   */
  it('écrase le poste proposé par le modèle, même quand il était plausible', () => {
    const input = [
      tx('VIR INST SOCIETEX', 'divers-non-categorise'),
      tx('VIR INST SOCIETEX', 'remboursements-divers'),
    ]
    const out = applyRules(input, [rule('societex', 'internes-remboursement-cca')])
    expect(out.transactions.map(t => t.categoryItemCode))
      .toEqual(['internes-remboursement-cca', 'internes-remboursement-cca'])
    expect(out.overriddenCount).toBe(2)
  })

  it('laisse intactes les lignes qu\'aucune règle ne couvre', () => {
    const input = [tx('VIR SALAIRE ACME', 'revenus-salaire')]
    const out = applyRules(input, [rule('societex', 'internes-remboursement-cca')])
    expect(out.transactions[0]!.categoryItemCode).toBe('revenus-salaire')
    expect(out.overriddenCount).toBe(0)
  })

  it('ne compte pas un écrasement quand la règle confirme le modèle', () => {
    const input = [tx('CARREFOUR', 'alimentation-courses')]
    const out = applyRules(input, [rule('carrefour', 'alimentation-courses')])
    expect(out.overriddenCount).toBe(0)
  })

  it('préserve les autres champs de la transaction', () => {
    const out = applyRules([tx('CARREFOUR', 'divers-non-categorise')], [rule('carrefour', 'alimentation-courses')])
    expect(out.transactions[0]).toMatchObject({ label: 'CARREFOUR', amountCents: -100 })
  })

  it('accepte une liste vide', () => {
    expect(applyRules([], [rule('x', 'y')])).toEqual({ transactions: [], overriddenCount: 0 })
  })
})
