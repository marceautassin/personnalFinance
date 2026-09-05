import { describe, it, expect } from 'vitest'
import { analyze, categorySeries, type AnalysisItemRef, type AnalysisTransaction } from './analysis-engine'

/**
 * NFR3 impose, pour chaque fonction de calcul, un cas nominal et au moins deux cas limites.
 * Les trois nommés par le PRD sont couverts ici : période sans transaction, recettes nulles
 * (division par zéro sur les taux), et montant de signe inattendu pour la nature.
 */

const REF: AnalysisItemRef[] = [
  { code: 'revenus-salaire', label: 'Salaire', nature: 'income', groupCode: 'revenus', groupLabel: 'Revenus' },
  { code: 'revenus-primes', label: 'Primes', nature: 'income', groupCode: 'revenus', groupLabel: 'Revenus' },
  { code: 'alimentation-courses', label: 'Courses', nature: 'expense', groupCode: 'alimentation', groupLabel: 'Alimentation' },
  { code: 'alimentation-restaurant', label: 'Restaurant', nature: 'expense', groupCode: 'alimentation', groupLabel: 'Alimentation' },
  { code: 'voyages-restaurant', label: 'Restaurant', nature: 'expense', groupCode: 'voyages', groupLabel: 'Voyages' },
  { code: 'internes-virement-epargne', label: 'Virement épargne', nature: 'internal_transfer', groupCode: 'internes', groupLabel: 'Mouvements internes' },
]

const tx = (date: string, amountCents: number, categoryItemCode: string): AnalysisTransaction =>
  ({ transactionDate: date, amountCents, categoryItemCode })

const run = (transactions: AnalysisTransaction[], extra: Partial<Parameters<typeof analyze>[0]> = {}) =>
  analyze({ transactions, referential: REF, granularity: 'month', ...extra })

const NOMINAL = [
  tx('2026-03-05', 250_000, 'revenus-salaire'),
  tx('2026-03-10', -40_000, 'alimentation-courses'),
  tx('2026-03-12', -15_000, 'alimentation-restaurant'),
  tx('2026-03-18', -30_000, 'voyages-restaurant'),
  tx('2026-03-20', -50_000, 'internes-virement-epargne'),
]

describe('analyze — cas nominal', () => {
  const r = run(NOMINAL)

  it('regroupe les postes sous leur rubrique, et les rubriques sous leur nature', () => {
    const expense = r.natures.find(n => n.nature === 'expense')!
    expect(expense.groups.map(g => g.groupCode).sort()).toEqual(['alimentation', 'voyages'])
    const alimentation = expense.groups.find(g => g.groupCode === 'alimentation')!
    expect(alimentation.items.map(i => i.itemCode).sort())
      .toEqual(['alimentation-courses', 'alimentation-restaurant'])
  })

  /** FR19 : le même libellé sous deux rubriques reste deux nœuds distincts. */
  it('ne fusionne pas deux postes homonymes de rubriques différentes', () => {
    const expense = r.natures.find(n => n.nature === 'expense')!
    const restaurants = expense.groups.flatMap(g => g.items.filter(i => i.label === 'Restaurant'))
    expect(restaurants).toHaveLength(2)
    expect(restaurants.map(i => i.totalCents).sort((a, b) => a - b)).toEqual([-30_000, -15_000])
  })

  it('additionne les postes dans leur rubrique, et les rubriques dans leur nature', () => {
    const expense = r.natures.find(n => n.nature === 'expense')!
    expect(expense.groups.find(g => g.groupCode === 'alimentation')!.totalCents).toBe(-55_000)
    expect(expense.totalCents).toBe(-85_000)
  })

  it('compte les transactions à chaque niveau', () => {
    const expense = r.natures.find(n => n.nature === 'expense')!
    expect(expense.groups.find(g => g.groupCode === 'alimentation')!.transactionCount).toBe(2)
  })

  /** NFR4 — le résultat exclut les mouvements internes ; le solde bancaire, lui, les inclut. */
  it('exclut les mouvements internes du résultat, en les exposant à part', () => {
    expect(r.indicators.incomeCents).toBe(250_000)
    expect(r.indicators.expenseCents).toBe(-85_000)
    expect(r.indicators.internalCents).toBe(-50_000)
    expect(r.indicators.resultCents).toBe(165_000)
  })

  it('calcule les taux à partir des recettes', () => {
    expect(r.indicators.spendRate).toBeCloseTo(0.34, 5)
    expect(r.indicators.savingsRate).toBeCloseTo(0.66, 5)
  })

  it('omet les postes jamais touchés, pour ne pas noyer le signal', () => {
    const income = r.natures.find(n => n.nature === 'income')!
    expect(income.groups[0]!.items.map(i => i.itemCode)).toEqual(['revenus-salaire'])
  })
})

describe('analyze — cas limite : période sans transaction (NFR3)', () => {
  const r = run([])

  it('ne lève pas et rend un arbre vide', () => {
    expect(r.natures).toEqual([])
    expect(r.series).toEqual([])
  })

  it('rend des indicateurs cohérents plutôt que des zéros trompeurs', () => {
    expect(r.indicators.incomeCents).toBe(0)
    expect(r.indicators.expenseCents).toBe(0)
    expect(r.indicators.resultCents).toBe(0)
    expect(r.indicators.spendRate).toBeNull()
    expect(r.indicators.savingsRate).toBeNull()
  })
})

describe('analyze — cas limite : recettes nulles (NFR3, AR10)', () => {
  const r = run([tx('2026-03-10', -80_000, 'alimentation-courses')])

  /**
   * Un mois sans recette et avec 800 € de dépenses n'a pas un taux d'épargne nul : il n'en a
   * pas. Renvoyer `0` mentirait, et `Infinity` remonterait jusqu'à l'écran.
   */
  it('rend null sur les deux taux, jamais 0 ni Infinity', () => {
    expect(r.indicators.spendRate).toBeNull()
    expect(r.indicators.savingsRate).toBeNull()
    expect(Number.isFinite(r.indicators.resultCents)).toBe(true)
  })

  it('calcule quand même le résultat, qui lui est défini', () => {
    expect(r.indicators.resultCents).toBe(-80_000)
  })
})

describe('analyze — cas limite : signe inattendu pour la nature (NFR3, D28)', () => {
  /**
   * Un remboursement de courses par un ami arrive au crédit sur un poste de dépense. La somme
   * est algébrique : il DIMINUE la dépense. L'ignorer ferait diverger le total de ses propres
   * lignes ; le router vers les recettes gonflerait le taux d'épargne.
   */
  const r = run([
    tx('2026-03-10', -40_000, 'alimentation-courses'),
    tx('2026-03-15', 12_000, 'alimentation-courses'),
  ])

  it('soustrait le remboursement de la dépense, sans le rerouter', () => {
    const expense = r.natures.find(n => n.nature === 'expense')!
    expect(expense.groups[0]!.items[0]!.totalCents).toBe(-28_000)
    expect(r.natures.find(n => n.nature === 'income')).toBeUndefined()
  })

  it('compte les deux lignes', () => {
    expect(r.natures[0]!.groups[0]!.items[0]!.transactionCount).toBe(2)
  })

  /** Un nœud peut avoir un net inversé : c'est un fait, pas une anomalie à corriger. */
  it('laisse un nœud de dépense passer en positif quand les remboursements dépassent', () => {
    const inverted = run([
      tx('2026-03-10', -10_000, 'alimentation-courses'),
      tx('2026-03-15', 25_000, 'alimentation-courses'),
    ])
    expect(inverted.natures.find(n => n.nature === 'expense')!.totalCents).toBe(15_000)
  })
})

describe('analyze — comparaison à la période précédente (D24)', () => {
  const r = run(NOMINAL, {
    previousTransactions: [
      tx('2026-02-05', 240_000, 'revenus-salaire'),
      tx('2026-02-10', -20_000, 'alimentation-courses'),
    ],
  })

  it('porte previousTotalCents sur les postes et les rubriques', () => {
    const expense = r.natures.find(n => n.nature === 'expense')!
    const alimentation = expense.groups.find(g => g.groupCode === 'alimentation')!
    expect(alimentation.items.find(i => i.itemCode === 'alimentation-courses')!.previousTotalCents)
      .toBe(-20_000)
    expect(alimentation.previousTotalCents).toBe(-20_000)
  })

  it('rend zéro — et non null — pour un poste absent de la période précédente', () => {
    const expense = r.natures.find(n => n.nature === 'expense')!
    const restaurant = expense.groups
      .flatMap(g => g.items)
      .find(i => i.itemCode === 'alimentation-restaurant')!
    expect(restaurant.previousTotalCents).toBe(0)
  })

  /**
   * Un poste présent AVANT et absent maintenant doit rester visible à zéro : sa disparition
   * est précisément ce qu'on veut voir dans une comparaison.
   */
  it('conserve un poste tombé à zéro, présent seulement sur la période précédente', () => {
    const withVanished = run([tx('2026-03-05', 250_000, 'revenus-salaire')], {
      previousTransactions: [tx('2026-02-10', -20_000, 'alimentation-courses')],
    })
    const expense = withVanished.natures.find(n => n.nature === 'expense')!
    expect(expense.groups[0]!.items[0]).toMatchObject({
      itemCode: 'alimentation-courses',
      totalCents: 0,
      previousTotalCents: -20_000,
      transactionCount: 0,
    })
  })

  /** Sans période précédente, `null` distingue « inconnu » de « zéro ». */
  it('laisse previousTotalCents à null quand aucune période précédente n\'est fournie', () => {
    const alone = run(NOMINAL)
    expect(alone.natures[0]!.previousTotalCents).toBeNull()
    expect(alone.natures[0]!.groups[0]!.items[0]!.previousTotalCents).toBeNull()
  })
})

describe('analyze — série temporelle', () => {
  const spread = [
    tx('2026-01-05', 100_000, 'revenus-salaire'),
    tx('2026-01-20', -30_000, 'alimentation-courses'),
    tx('2026-02-05', 100_000, 'revenus-salaire'),
    tx('2026-02-20', -60_000, 'alimentation-courses'),
    tx('2026-04-05', 100_000, 'revenus-salaire'),
  ]

  it('découpe au mois et cumule dans l\'ordre chronologique', () => {
    const r = run(spread)
    expect(r.series.map(p => p.bucket)).toEqual(['2026-01', '2026-02', '2026-04'])
    expect(r.series.map(p => p.resultCents)).toEqual([70_000, 40_000, 100_000])
    expect(r.series.map(p => p.cumulativeResultCents)).toEqual([70_000, 110_000, 210_000])
  })

  it('découpe au trimestre', () => {
    const r = run(spread, { granularity: 'quarter' })
    expect(r.series.map(p => p.bucket)).toEqual(['2026-T1', '2026-T2'])
    expect(r.series.map(p => p.resultCents)).toEqual([110_000, 100_000])
  })

  it('découpe à l\'année', () => {
    const r = run(spread, { granularity: 'year' })
    expect(r.series).toHaveLength(1)
    expect(r.series[0]!.resultCents).toBe(210_000)
  })

  /** Les mouvements internes ne font pas bouger la série : ils n'appauvrissent ni n'enrichissent. */
  it('exclut les mouvements internes de la série', () => {
    const r = run([...spread, tx('2026-01-25', -500_000, 'internes-virement-epargne')])
    expect(r.series[0]!.resultCents).toBe(70_000)
  })

  it('ne fabrique pas les tranches sans transaction', () => {
    const r = run(spread)
    expect(r.series.map(p => p.bucket)).not.toContain('2026-03')
  })

  it('aligne la trésorerie cumulée des indicateurs sur la fin de la série', () => {
    const r = run(spread)
    expect(r.indicators.cumulativeResultCents).toBe(210_000)
  })
})

describe('analyze — lignes orphelines', () => {
  /**
   * Un poste supprimé du référentiel laisse des transactions qui ne peuvent être placées
   * nulle part. Les taire produirait un total qui ne dit pas ce qu'il omet — exactement le
   * chiffre invérifiable que ce produit refuse (NFR2).
   */
  it('compte les lignes dont le poste n\'existe plus, sans les agréger', () => {
    const r = run([
      tx('2026-03-05', 250_000, 'revenus-salaire'),
      tx('2026-03-06', -9_999, 'poste-supprime'),
    ])
    expect(r.orphanCount).toBe(1)
    expect(r.indicators.expenseCents).toBe(0)
    expect(r.indicators.incomeCents).toBe(250_000)
  })

  it('rend zéro orpheline quand tout est rattaché', () => {
    expect(run(NOMINAL).orphanCount).toBe(0)
  })
})

/**
 * Cohérence des indicateurs — invariants vérifiés comme PROPRIÉTÉS et non par valeurs
 * littérales, pour protéger contre une régression de structure et non d'un seul chiffre.
 */
describe('analyze — invariants de somme', () => {
  const cases: Array<[string, AnalysisTransaction[]]> = [
    ['cas nominal', NOMINAL],
    ['période vide', []],
    ['recettes nulles', [tx('2026-03-10', -80_000, 'alimentation-courses')]],
    ['dépense au net inversé', [
      tx('2026-03-10', -10_000, 'alimentation-courses'),
      tx('2026-03-15', 25_000, 'alimentation-courses'),
      tx('2026-03-05', 250_000, 'revenus-salaire'),
    ]],
    ['plusieurs mois et plusieurs rubriques', [
      tx('2026-01-05', 100_000, 'revenus-salaire'),
      tx('2026-01-20', -30_000, 'alimentation-courses'),
      tx('2026-02-05', 120_000, 'revenus-primes'),
      tx('2026-02-20', -60_000, 'voyages-restaurant'),
      tx('2026-02-25', -75_000, 'internes-virement-epargne'),
    ]],
  ]

  it.each(cases)('%s : la somme des postes vaut la rubrique', (_name, transactions) => {
    for (const nature of run(transactions).natures) {
      for (const group of nature.groups) {
        expect(group.items.reduce((s, i) => s + i.totalCents, 0)).toBe(group.totalCents)
        expect(group.items.reduce((s, i) => s + i.transactionCount, 0)).toBe(group.transactionCount)
      }
    }
  })

  it.each(cases)('%s : la somme des rubriques vaut la nature', (_name, transactions) => {
    for (const nature of run(transactions).natures) {
      expect(nature.groups.reduce((s, g) => s + g.totalCents, 0)).toBe(nature.totalCents)
    }
  })

  it.each(cases)('%s : les indicateurs dérivent exactement de l\'arbre', (_name, transactions) => {
    const r = run(transactions)
    const totalOf = (n: string) => r.natures.find(x => x.nature === n)?.totalCents ?? 0
    expect(r.indicators.incomeCents).toBe(totalOf('income'))
    expect(r.indicators.expenseCents).toBe(totalOf('expense'))
    expect(r.indicators.internalCents).toBe(totalOf('internal_transfer'))
    expect(r.indicators.resultCents).toBe(totalOf('income') + totalOf('expense'))
  })

  /**
   * Les deux taux partagent le même dénominateur et partitionnent les recettes : leur somme
   * vaut 1 dès que ce dénominateur existe. C'est cet invariant que `Math.abs` cassait sur une
   * nature `expense` au net positif.
   */
  it.each(cases)('%s : spendRate + savingsRate valent 1 quand ils sont définis', (_name, transactions) => {
    const { spendRate, savingsRate } = run(transactions).indicators
    if (spendRate === null || savingsRate === null) {
      expect(spendRate).toBeNull()
      expect(savingsRate).toBeNull()
      return
    }
    expect(spendRate + savingsRate).toBeCloseTo(1, 10)
  })

  it('reste cohérent quand les remboursements dépassent les achats du mois', () => {
    const r = run([
      tx('2026-03-05', 250_000, 'revenus-salaire'),
      tx('2026-03-10', -10_000, 'alimentation-courses'),
      tx('2026-03-15', 25_000, 'alimentation-courses'),
    ])
    expect(r.indicators.expenseCents).toBe(15_000)
    expect(r.indicators.spendRate).toBeCloseTo(-0.06, 5)
    expect(r.indicators.savingsRate).toBeCloseTo(1.06, 5)
  })

  /**
   * Bornes non alignées sur la tranche : la série ne couvre que ce qu'on lui donne, la période
   * peut en déborder. Le comportement est voulu — on le fige pour qu'il ne dérive pas.
   */
  it('n\'aligne pas la dernière tranche de la série sur la période quand les bornes sont libres', () => {
    const r = run([
      tx('2026-01-20', -30_000, 'alimentation-courses'),
      tx('2026-02-10', -50_000, 'alimentation-courses'),
    ])
    expect(r.series).toHaveLength(2)
    expect(r.series.at(-1)!.resultCents).toBe(-50_000)
    expect(r.indicators.resultCents).toBe(-80_000)
  })
})

/**
 * Trajectoire d'une rubrique ou d'un poste (FR31) — la question qui a fait construire ce
 * produit, et à laquelle une courbe de résultat global ne répond pas.
 */
describe('categorySeries', () => {
  const BUCKETS = ['2026-01', '2026-02', '2026-03']
  const spread = [
    tx('2026-01-10', -30_000, 'alimentation-courses'),
    tx('2026-01-15', -10_000, 'alimentation-restaurant'),
    tx('2026-03-10', -50_000, 'alimentation-courses'),
    tx('2026-03-12', -20_000, 'voyages-restaurant'),
    tx('2026-02-05', 250_000, 'revenus-salaire'),
  ]

  const run = (target: Parameters<typeof categorySeries>[3]) =>
    categorySeries(spread, REF, 'month', target, BUCKETS)

  it('suit un poste précis dans le temps', () => {
    const s = run({ kind: 'item', code: 'alimentation-courses' })
    expect(s.map(p => p.totalCents)).toEqual([-30_000, 0, -50_000])
    expect(s.map(p => p.transactionCount)).toEqual([1, 0, 1])
  })

  it('suit une rubrique entière, tous postes confondus', () => {
    const s = run({ kind: 'group', code: 'alimentation' })
    expect(s.map(p => p.totalCents)).toEqual([-40_000, 0, -50_000])
  })

  /**
   * Une tranche sans mouvement vaut zéro, elle n'est pas omise : une série trouée se lirait
   * comme une accélération, et la disparition d'un poste est précisément une information.
   */
  it('rend zéro sur une tranche sans mouvement, sans la supprimer', () => {
    const s = run({ kind: 'item', code: 'alimentation-courses' })
    expect(s).toHaveLength(3)
    expect(s[1]).toMatchObject({ bucket: '2026-02', totalCents: 0, transactionCount: 0 })
  })

  it('ne confond pas deux postes homonymes de rubriques différentes (FR19)', () => {
    expect(run({ kind: 'item', code: 'alimentation-restaurant' }).map(p => p.totalCents))
      .toEqual([-10_000, 0, 0])
    expect(run({ kind: 'item', code: 'voyages-restaurant' }).map(p => p.totalCents))
      .toEqual([0, 0, -20_000])
  })

  it('rend une série de zéros sur une cible inconnue, sans lever', () => {
    expect(run({ kind: 'item', code: 'poste-fantome' }).map(p => p.totalCents)).toEqual([0, 0, 0])
  })

  it('porte les libellés de tranche, pour l\'axe du graphique', () => {
    expect(run({ kind: 'group', code: 'alimentation' }).map(p => p.label))
      .toEqual(['janvier 2026', 'février 2026', 'mars 2026'])
  })

  it('somme algébriquement, remboursements compris (D28)', () => {
    const withRefund = categorySeries(
      [tx('2026-01-10', -30_000, 'alimentation-courses'), tx('2026-01-20', 12_000, 'alimentation-courses')],
      REF, 'month', { kind: 'item', code: 'alimentation-courses' }, BUCKETS,
    )
    expect(withRefund[0]!.totalCents).toBe(-18_000)
  })
})
