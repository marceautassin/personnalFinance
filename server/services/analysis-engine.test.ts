import { describe, it, expect } from 'vitest'
import { analyze, categorySeries, neutralizeSettlements, splitJointTransfers, resultTotalCents, type AnalysisItemRef, type AnalysisTransaction } from './analysis-engine'
import { JOINT_TRANSFER_ITEM_CODE, JOINT_REIMBURSEMENT_ITEM_CODE } from '~~/shared/constants/default-referential'

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
  { code: JOINT_TRANSFER_ITEM_CODE, label: 'Virement du compte joint', nature: 'internal_transfer', groupCode: 'internes', groupLabel: 'Mouvements internes' },
  { code: JOINT_REIMBURSEMENT_ITEM_CODE, label: 'Part remboursée', nature: 'expense', groupCode: 'compte-joint', groupLabel: 'Compte joint' },
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

/**
 * Flux bruts — story 18.11.
 *
 * Le net cache les mouvements qui le composent : sur les données réelles de 2026, « Virement
 * entre comptes » vaut −651,40 € alors que 4 512 € sont sortis et 3 861 € rentrés. Sur les
 * mouvements internes, où aucune nature n'annonce le sens attendu, c'est la seule lecture
 * possible de la ligne.
 */
describe('analyze — flux bruts par nœud (story 18.11)', () => {
  const DEUX_SENS = [
    tx('2026-03-02', -80_00, 'internes-virement-epargne'),
    tx('2026-03-09', 4_352_00, 'internes-virement-epargne'),
  ]

  it('sépare les sorties des entrées sur un poste qui va dans les deux sens', () => {
    const item = run(DEUX_SENS).natures
      .find(n => n.nature === 'internal_transfer')!.groups[0]!.items[0]!

    expect(item.outflowCents).toBe(-80_00)
    expect(item.inflowCents).toBe(4_352_00)
    expect(item.totalCents).toBe(4_272_00)
  })

  it('garde les trois valeurs cohérentes : sorties + entrées = net', () => {
    const r = run([...NOMINAL, ...DEUX_SENS])
    for (const nature of r.natures) {
      for (const group of nature.groups) {
        expect(group.outflowCents + group.inflowCents).toBe(group.totalCents)
        for (const item of group.items) {
          expect(item.outflowCents + item.inflowCents).toBe(item.totalCents)
        }
      }
    }
  })

  it('somme les flux des postes au niveau de la rubrique', () => {
    const group = run([
      tx('2026-03-02', -80_00, 'internes-virement-epargne'),
      tx('2026-03-09', 4_352_00, 'internes-virement-epargne'),
    ]).natures.find(n => n.nature === 'internal_transfer')!.groups[0]!

    expect(group.outflowCents).toBe(-80_00)
    expect(group.inflowCents).toBe(4_352_00)
  })

  /** Cas limite NFR3 — un poste à sens unique : l'autre sens vaut zéro, pas `null`. */
  it('rend zéro sur le sens qu\'un poste n\'emprunte jamais', () => {
    const item = run([tx('2026-03-05', 250_000, 'revenus-salaire')]).natures
      .find(n => n.nature === 'income')!.groups[0]!.items[0]!

    expect(item.outflowCents).toBe(0)
    expect(item.inflowCents).toBe(250_000)
  })

  /** Cas limite NFR3 — période sans transaction : aucun nœud, donc aucun flux à rendre. */
  it('ne rend aucun nœud, donc aucun flux, sur une période vide', () => {
    expect(run([]).natures).toEqual([])
  })

  /** Cas limite NFR3 — un montant nul ne compte d'aucun côté. */
  it('ne range un montant nul ni en sortie ni en entrée', () => {
    const item = run([
      tx('2026-03-05', 0, 'alimentation-courses'),
      tx('2026-03-06', -1_000, 'alimentation-courses'),
    ]).natures.find(n => n.nature === 'expense')!.groups[0]!.items[0]!

    expect(item.outflowCents).toBe(-1_000)
    expect(item.inflowCents).toBe(0)
    expect(item.transactionCount).toBe(2)
  })

  /** D28 — un remboursement sur un poste de dépense apparaît en entrée, sans valeur absolue. */
  it('range un remboursement en ENTRÉE sur un poste de dépense', () => {
    const item = run([
      tx('2026-03-05', -40_000, 'alimentation-courses'),
      tx('2026-03-06', 12_000, 'alimentation-courses'),
    ]).natures.find(n => n.nature === 'expense')!.groups[0]!.items[0]!

    expect(item.outflowCents).toBe(-40_000)
    expect(item.inflowCents).toBe(12_000)
    expect(item.totalCents).toBe(-28_000)
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
  /**
   * Répartition par poste — demande du 2026-09-06. Une courbe d'Alimentation qui monte ne dit
   * pas si ce sont les courses ou les restaurants ; c'est la question que résout la
   * répartition sur une période, posée ici sur une trajectoire.
   */
  describe('répartition par poste', () => {
    it('détaille les postes d\'une rubrique, du plus lourd au plus léger', () => {
      const janvier = run({ kind: 'group', code: 'alimentation' })[0]!

      expect(janvier.breakdown.map(b => [b.itemCode, b.totalCents])).toEqual([
        ['alimentation-courses', -30_000],
        ['alimentation-restaurant', -10_000],
      ])
    })

    it('classe par POIDS, sans se laisser tromper par le signe', () => {
      const s = categorySeries(
        [tx('2026-01-10', -30_000, 'alimentation-courses'), tx('2026-01-15', 5_000, 'alimentation-restaurant')],
        REF, 'month', { kind: 'group', code: 'alimentation' }, ['2026-01'],
      )
      // Un tri décroissant brut aurait remonté +5 000 devant −30 000.
      expect(s[0]!.breakdown.map(b => b.itemCode)).toEqual([
        'alimentation-courses',
        'alimentation-restaurant',
      ])
    })

    it('somme à la valeur du point', () => {
      for (const point of run({ kind: 'group', code: 'alimentation' })) {
        const somme = point.breakdown.reduce((n, b) => n + b.totalCents, 0)
        expect(somme).toBe(point.totalCents)
      }
    })

    /** Cas limite — une cible qui EST un poste n'a rien à répartir. */
    it('ne répartit rien sur une cible qui est déjà un poste', () => {
      for (const point of run({ kind: 'item', code: 'alimentation-courses' })) {
        expect(point.breakdown).toEqual([])
      }
    })

    /** Cas limite — une tranche sans mouvement a une répartition vide, pas absente. */
    it('rend une répartition vide sur une tranche sans mouvement', () => {
      expect(run({ kind: 'group', code: 'alimentation' })[1]!.breakdown).toEqual([])
    })
  })

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

/**
 * Neutralisation des avances remboursées — epic 19.
 *
 * L'utilisateur avance des achats pour un tiers et se fait rembourser plus tard, souvent en un
 * seul virement couvrant plusieurs achats, souvent le mois suivant. Sans traitement, ces lignes
 * gonflent ses dépenses ET ses recettes alors qu'il n'a ni dépensé ni gagné. Sur ses données
 * réelles : 47 lignes, environ 8 700 €, 8 % des recettes de l'historique.
 */
describe('compte joint — l\'agrégat, la trajectoire et le patrimoine (story 21.1)', () => {
  const AVEC_JOINT = [
    tx('2026-03-05', 250_000, 'revenus-salaire'),
    tx('2026-03-10', -78_000, 'alimentation-courses'),
    tx('2026-03-20', 78_000, JOINT_TRANSFER_ITEM_CODE),
  ]

  /** AC1 — la moitié diminue les dépenses ; le solde bancaire, lui, ne bouge pas. */
  it('la moitié remboursée diminue les dépenses, l\'autre reste interne', () => {
    const r = run(AVEC_JOINT)
    const depenses = r.natures.find(n => n.nature === 'expense')!
    const internes = r.natures.find(n => n.nature === 'internal_transfer')!

    expect(depenses.totalCents).toBe(-78_000 + 39_000)
    expect(internes.totalCents).toBe(39_000)
    // Le solde bancaire inclut TOUT : la coupe ne crée ni ne détruit d'argent (NFR4).
    const soldeBancaire = AVEC_JOINT.reduce((sum, t) => sum + t.amountCents, 0)
    expect(depenses.totalCents + internes.totalCents + 250_000).toBe(soldeBancaire)
  })

  it('la part remboursée forme sa propre rubrique, au net inversé', () => {
    const depenses = run(AVEC_JOINT).natures.find(n => n.nature === 'expense')!
    const joint = depenses.groups.find(g => g.groupCode === 'compte-joint')!
    expect(joint.totalCents).toBe(39_000)
    expect(joint.items[0]!.itemCode).toBe(JOINT_REIMBURSEMENT_ITEM_CODE)
  })

  /** AC2 — l'analyse et la trajectoire passent par la même coupe. */
  it('la trajectoire dit le même montant que l\'analyse', () => {
    const serie = categorySeries(AVEC_JOINT, REF, 'month', { kind: 'item', code: JOINT_REIMBURSEMENT_ITEM_CODE }, ['2026-03'])
    const depenses = run(AVEC_JOINT).natures.find(n => n.nature === 'expense')!
    const joint = depenses.groups.find(g => g.groupCode === 'compte-joint')!
    expect(serie[0]!.totalCents).toBe(joint.totalCents)
  })

  /**
   * Le patrimoine ANTÉRIEUR à une fenêtre passe par les mêmes transformations que celui de la
   * fenêtre : sans quoi un même mois pèse différemment des deux côtés de la borne, et la courbe
   * cumulée se décale.
   */
  it('le résultat total traverse la coupe, comme l\'agrégat', () => {
    expect(resultTotalCents(AVEC_JOINT, REF)).toBe(250_000 - 78_000 + 39_000)
    // Sans la coupe, la moitié remboursée ne compterait pas : c'est l'écart qu'on ferme.
    expect(resultTotalCents(AVEC_JOINT, REF)).not.toBe(250_000 - 78_000)
  })

  it('une contribution VERS le joint reste entière et interne', () => {
    const r = run([tx('2026-03-05', 250_000, 'revenus-salaire'), tx('2026-03-20', -32_450, JOINT_TRANSFER_ITEM_CODE)])
    expect(r.natures.find(n => n.nature === 'internal_transfer')!.totalCents).toBe(-32_450)
    expect(r.natures.find(n => n.nature === 'expense')).toBeUndefined()
  })
})

describe('splitJointTransfers', () => {
  const joint = (amountCents: number, transactionDate = '2026-04-10') => ({
    transactionDate,
    amountCents,
    categoryItemCode: JOINT_TRANSFER_ITEM_CODE,
    settlementGroupId: null,
  })

  it('laisse intacte une ligne d\'un autre poste', () => {
    const rows = [{ transactionDate: '2026-04-10', amountCents: -4210, categoryItemCode: 'alimentation-courses', settlementGroupId: null }]
    expect(splitJointTransfers(rows)).toEqual(rows)
  })

  it('coupe un virement entrant en deux moitiés égales', () => {
    const out = splitJointTransfers([joint(78_000)])
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ amountCents: 39_000, categoryItemCode: JOINT_REIMBURSEMENT_ITEM_CODE })
    expect(out[1]).toMatchObject({ amountCents: 39_000, categoryItemCode: JOINT_TRANSFER_ITEM_CODE })
  })

  /*
   * Huit des trente-trois virements de l'historique sont impairs : deux arrondis symétriques
   * feraient perdre ou inventer un centime à chacun.
   */
  it('sur un montant impair, la somme est conservée au centime', () => {
    const out = splitJointTransfers([joint(78_101)])
    expect(out.map(t => t.amountCents)).toEqual([39_050, 39_051])
    expect(out.reduce((sum, t) => sum + t.amountCents, 0)).toBe(78_101)
    // L'arrondi va à l'INTERNE : la moitié qui compte est plancher.
    expect(out[0]!.categoryItemCode).toBe(JOINT_REIMBURSEMENT_ITEM_CODE)
  })

  it('ne coupe PAS une sortie vers le joint — c\'est une contribution', () => {
    const rows = [joint(-32_450)]
    expect(splitJointTransfers(rows)).toEqual(rows)
  })

  it('laisse un montant nul intact, sans ligne fantôme', () => {
    const rows = [joint(0)]
    expect(splitJointTransfers(rows)).toEqual(rows)
  })

  it('conserve la date sur les deux moitiés', () => {
    const out = splitJointTransfers([joint(1_000, '2026-02-03')])
    expect(out.every(t => t.transactionDate === '2026-02-03')).toBe(true)
  })

  /*
   * Les deux mécanismes ne se partagent pas une ligne. La couper la ferait entrer EN DOUBLE
   * dans son groupe de réconciliation, et la descente — qui donne la priorité à la
   * réconciliation — dirait alors autre chose que le moteur.
   */
  it('ne coupe PAS une ligne déjà rattachée à un groupe de réconciliation', () => {
    const rows = [{ ...joint(78_000, '2026-02-03'), settlementGroupId: 7 }]
    expect(splitJointTransfers(rows)).toEqual(rows)
  })

  /* Un centime ne se coupe pas en deux : émettre une moitié nulle poserait sur la part
     remboursée un nœud à 0,00 € portant une transaction. */
  it('ne coupe pas un virement d\'un centime — la moitié serait nulle', () => {
    const rows = [joint(1)]
    expect(splitJointTransfers(rows)).toEqual(rows)
  })

  /*
   * Le compteur de transactions d'un poste est DÉDOUBLÉ par la coupe : une ligne de relevé pèse
   * sur deux nœuds. C'est voulu — chaque nœud compte les lignes qui le composent — mais la
   * somme des compteurs de l'arbre cesse d'égaler le nombre de lignes du relevé.
   */
  it('rend deux lignes pour une, chacune sur son poste', () => {
    const out = splitJointTransfers([joint(78_000)])
    expect(out.map(t => t.categoryItemCode))
      .toEqual([JOINT_REIMBURSEMENT_ITEM_CODE, JOINT_TRANSFER_ITEM_CODE])
  })

  it('la somme de toutes les lignes est inchangée, quel que soit le mélange', () => {
    const rows = [
      joint(78_101),
      joint(-32_450),
      { transactionDate: '2026-04-11', amountCents: -4210, categoryItemCode: 'alimentation-courses', settlementGroupId: null },
    ]
    const before = rows.reduce((s, t) => s + t.amountCents, 0)
    const after = splitJointTransfers(rows).reduce((s, t) => s + t.amountCents, 0)
    expect(after).toBe(before)
  })
})

describe('neutralizeSettlements', () => {
  const g = (
    date: string,
    amountCents: number,
    settlementGroupId: number | null = 1,
    code = 'alimentation-courses',
  ): AnalysisTransaction => ({ transactionDate: date, amountCents, categoryItemCode: code, settlementGroupId })

  const sum = (rows: AnalysisTransaction[]) => rows.reduce((n, t) => n + t.amountCents, 0)

  it('laisse intactes les lignes sans groupe', () => {
    const rows = [g('2026-01-05', -18_000, null), g('2026-01-06', 5_000, null)]
    expect(neutralizeSettlements(rows)).toEqual(rows)
  })

  /** Cas nominal : un virement qui couvre exactement plusieurs achats. */
  it('efface les deux côtés quand la couverture est exacte', () => {
    const out = neutralizeSettlements([
      g('2026-01-05', -18_000),
      g('2026-01-12', -4_200),
      g('2026-03-03', 22_200, 1, 'remboursements-divers'),
    ])
    expect(out).toEqual([])
  })

  /** Cas limite — couverture partielle : le reste demeure une dépense, dans SON mois. */
  it('laisse à charge ce qui n\'est pas remboursé, sur le mois de l\'avance', () => {
    const out = neutralizeSettlements([
      g('2026-01-05', -18_000),
      g('2026-01-12', -4_200),
      g('2026-02-20', -12_000),
      g('2026-03-03', 25_000, 1, 'remboursements-divers'),
    ])
    // 25 000 couvrent 18 000 puis 4 200 ; il reste 2 800 sur l'avance de février, qui en
    // devait 12 000 : 9 200 restent à charge, en février.
    expect(out).toEqual([
      { transactionDate: '2026-02-20', amountCents: -9_200, categoryItemCode: 'alimentation-courses', settlementGroupId: 1 },
    ])
  })

  /** L'imputation part des avances les plus ANCIENNES, quel que soit l'ordre reçu. */
  it('impute sur les avances les plus anciennes d\'abord', () => {
    const out = neutralizeSettlements([
      g('2026-02-20', -10_000),
      g('2026-01-05', -10_000),
      g('2026-03-03', 10_000, 1, 'remboursements-divers'),
    ])
    // Janvier est couvert, février reste dû.
    expect(out).toEqual([
      { transactionDate: '2026-02-20', amountCents: -10_000, categoryItemCode: 'alimentation-courses', settlementGroupId: 1 },
    ])
  })

  /** Cas limite — excédent : ce qui dépasse n'a rien remboursé, c'est une recette. */
  it('rend l\'excédent de remboursement comme une recette', () => {
    const out = neutralizeSettlements([
      g('2026-01-05', -10_000),
      g('2026-03-03', 15_000, 1, 'remboursements-divers'),
    ])
    expect(out).toEqual([
      { transactionDate: '2026-03-03', amountCents: 5_000, categoryItemCode: 'remboursements-divers', settlementGroupId: 1 },
    ])
  })

  /** Cas limite — groupe ouvert : sans remboursement, rien n'est neutralisé. */
  it('ne neutralise rien sur un groupe sans remboursement', () => {
    const rows = [g('2026-01-05', -18_000), g('2026-01-12', -4_200)]
    expect(neutralizeSettlements(rows)).toEqual(rows)
  })

  it('ne neutralise rien sur un groupe sans avance', () => {
    const rows = [g('2026-03-03', 22_200, 1, 'remboursements-divers')]
    expect(neutralizeSettlements(rows)).toEqual(rows)
  })

  /** L'invariant central : rien ne passe d'un mois à l'autre. */
  it('ne déplace aucun montant d\'un mois vers un autre', () => {
    const out = neutralizeSettlements([
      g('2026-01-05', -18_000),
      g('2026-03-03', 12_000, 1, 'remboursements-divers'),
    ])
    // Le reliquat reste daté de JANVIER, pas de mars.
    expect(out).toEqual([
      { transactionDate: '2026-01-05', amountCents: -6_000, categoryItemCode: 'alimentation-courses', settlementGroupId: 1 },
    ])
  })

  it('traite chaque groupe indépendamment', () => {
    const out = neutralizeSettlements([
      g('2026-01-05', -10_000, 1),
      g('2026-01-06', 10_000, 1, 'remboursements-divers'),
      g('2026-01-07', -7_000, 2),
    ])
    expect(out).toEqual([
      { transactionDate: '2026-01-07', amountCents: -7_000, categoryItemCode: 'alimentation-courses', settlementGroupId: 2 },
    ])
  })

  /** Un groupe équilibré ne change pas le patrimoine : il ne fait que circuler. */
  it('laisse la somme algébrique inchangée hors couverture', () => {
    const rows = [
      g('2026-01-05', -18_000),
      g('2026-03-03', 12_000, 1, 'remboursements-divers'),
      g('2026-01-09', -3_000, null),
    ]
    expect(sum(neutralizeSettlements(rows))).toBe(sum(rows))
  })

  it('accepte une liste vide', () => {
    expect(neutralizeSettlements([])).toEqual([])
  })
})
