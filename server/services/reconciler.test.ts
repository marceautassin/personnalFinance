import { describe, it, expect } from 'vitest'
import { reconcile } from './reconciler'
import { eurosToCents } from '~~/shared/types/money'

describe('reconcile', () => {
  it('balanced: opening 1000, closing 800, one outflow of -200', () => {
    const result = reconcile({
      openingCents: eurosToCents(1000),
      closingCents: eurosToCents(800),
      transactions: [{ amountCents: eurosToCents(-200) }],
    })
    expect(result.isBalanced).toBe(true)
    expect(result.gapCents).toBe(0)
  })

  it('balanced: empty transactions and equal balances', () => {
    const result = reconcile({
      openingCents: eurosToCents(500),
      closingCents: eurosToCents(500),
      transactions: [],
    })
    expect(result.isBalanced).toBe(true)
    expect(result.gapCents).toBe(0)
  })

  it('1 cent gap: opening 1000, closing 800, outflows -199.99', () => {
    const result = reconcile({
      openingCents: eurosToCents(1000),
      closingCents: eurosToCents(800),
      transactions: [{ amountCents: eurosToCents(-199.99) }],
    })
    expect(result.isBalanced).toBe(false)
    // expected = 800 - 1000 = -20000 cents
    // found = -19999
    // gap = -20000 - (-19999) = -1
    expect(result.gapCents).toBe(-1)
  })

  it('mixed: incomes + outflows summing exactly', () => {
    const result = reconcile({
      openingCents: eurosToCents(0),
      closingCents: eurosToCents(150),
      transactions: [
        { amountCents: eurosToCents(1000) },
        { amountCents: eurosToCents(-500) },
        { amountCents: eurosToCents(-350) },
      ],
    })
    expect(result.isBalanced).toBe(true)
    expect(result.gapCents).toBe(0)
  })

  it('negative gap: missing extracted transactions (real balance moved more)', () => {
    const result = reconcile({
      openingCents: eurosToCents(1000),
      closingCents: eurosToCents(700),
      transactions: [{ amountCents: eurosToCents(-200) }],
    })
    // expected = -300, found = -200, gap = -300 - (-200) = -100 € = -10000 cents
    expect(result.isBalanced).toBe(false)
    expect(result.gapCents).toBe(-10000)
  })

  it('positive gap: surplus transactions extracted', () => {
    const result = reconcile({
      openingCents: eurosToCents(1000),
      closingCents: eurosToCents(900),
      transactions: [{ amountCents: eurosToCents(-200) }],
    })
    // expected = -100, found = -200, gap = -100 - (-200) = +100 € = +10000 cents
    expect(result.isBalanced).toBe(false)
    expect(result.gapCents).toBe(10000)
  })

  it('handles negative balances (overdraft scenario)', () => {
    const result = reconcile({
      openingCents: eurosToCents(-100),
      closingCents: eurosToCents(-300),
      transactions: [{ amountCents: eurosToCents(-200) }],
    })
    expect(result.isBalanced).toBe(true)
    expect(result.gapCents).toBe(0)
  })

  it('does not mutate the input', () => {
    const transactions = [{ amountCents: eurosToCents(-100) }]
    const before = JSON.stringify(transactions)
    reconcile({
      openingCents: eurosToCents(1000),
      closingCents: eurosToCents(900),
      transactions,
    })
    expect(JSON.stringify(transactions)).toBe(before)
  })
})
