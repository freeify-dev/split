import { describe, expect, it } from 'vitest'
import { computeBalances, computeNets, type ExpenseForBalance } from './balance'
import { RATE_ONE_NANOS } from './money'

function makeRng(seed: number) {
  let state = seed
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)

describe('computeNets', () => {
  it('handles a simple same-currency equal split', () => {
    const expenses: ExpenseForBalance[] = [
      {
        amount: 3000,
        currency: 'EUR',
        rateNanos: RATE_ONE_NANOS,
        payers: [{ participantId: 'A', amount: 3000 }],
        splits: [
          { participantId: 'A', owedAmount: 1000 },
          { participantId: 'B', owedAmount: 1000 },
          { participantId: 'C', owedAmount: 1000 },
        ],
      },
    ]
    const nets = computeNets('EUR', expenses, ['A', 'B', 'C'])
    expect(nets).toEqual({ A: 2000, B: -1000, C: -1000 })
  })

  it('converts foreign-currency expenses at the locked rate', () => {
    const expenses: ExpenseForBalance[] = [
      {
        // $100.00 at 1 USD = 0.9214 EUR → 92.14 EUR
        amount: 10000,
        currency: 'USD',
        rateNanos: 921_400_000,
        payers: [{ participantId: 'A', amount: 10000 }],
        splits: [
          { participantId: 'A', owedAmount: 5000 },
          { participantId: 'B', owedAmount: 5000 },
        ],
      },
      {
        // ¥1000 at 1 JPY = 0.0065 EUR → 6.50 EUR, B paid for A only
        amount: 1000,
        currency: 'JPY',
        rateNanos: 6_500_000,
        payers: [{ participantId: 'B', amount: 1000 }],
        splits: [{ participantId: 'A', owedAmount: 1000 }],
      },
    ]
    const nets = computeNets('EUR', expenses, ['A', 'B'])
    expect(nets).toEqual({ A: 3957, B: -3957 })
    expect(sum(nets)).toBe(0)
  })

  it('keeps group nets at exactly zero despite awkward rates (reconciliation)', () => {
    const expenses: ExpenseForBalance[] = [
      {
        // $100.01 at 0.333333 → 33.34 EUR converted total, three-way split
        amount: 10001,
        currency: 'USD',
        rateNanos: 333_333_000,
        payers: [{ participantId: 'A', amount: 10001 }],
        splits: [
          { participantId: 'A', owedAmount: 3334 },
          { participantId: 'B', owedAmount: 3334 },
          { participantId: 'C', owedAmount: 3333 },
        ],
      },
    ]
    const nets = computeNets('EUR', expenses, ['A', 'B', 'C'])
    expect(sum(nets)).toBe(0)
  })

  it('a reimbursement exactly cancels a debt', () => {
    const expenses: ExpenseForBalance[] = [
      {
        amount: 1000,
        currency: 'EUR',
        rateNanos: RATE_ONE_NANOS,
        payers: [{ participantId: 'B', amount: 1000 }],
        splits: [
          { participantId: 'A', owedAmount: 500 },
          { participantId: 'B', owedAmount: 500 },
        ],
      },
      {
        // A settles up: pays B 5.00
        amount: 500,
        currency: 'EUR',
        rateNanos: RATE_ONE_NANOS,
        payers: [{ participantId: 'A', amount: 500 }],
        splits: [{ participantId: 'B', owedAmount: 500 }],
      },
    ]
    expect(computeNets('EUR', expenses, ['A', 'B'])).toEqual({ A: 0, B: 0 })
  })

  it('zero-sum holds across 500 randomized mixed-currency scenarios', () => {
    const rng = makeRng(7)
    const currencies = ['EUR', 'USD', 'JPY', 'BHD', 'GBP']
    for (let round = 0; round < 500; round++) {
      const people = ['A', 'B', 'C', 'D', 'E'].slice(0, 2 + Math.floor(rng() * 4))
      const expenses: ExpenseForBalance[] = []
      const count = 1 + Math.floor(rng() * 6)
      for (let i = 0; i < count; i++) {
        const currency = currencies[Math.floor(rng() * currencies.length)]!
        const amount = 1 + Math.floor(rng() * 1_000_000)
        const weights: number[] = people.map(() => Math.floor(rng() * 100))
        if (weights.reduce((a, b) => a + b, 0) === 0) weights[0] = 1
        const weightSum = weights.reduce((a, b) => a + b, 0)
        // build owed amounts that sum to the total, like the server does
        const owed = weights.map((w, idx) =>
          idx === weights.length - 1
            ? amount - weights.slice(0, -1).reduce((acc, w2, j) => acc + Math.floor((amount * weights[j]!) / weightSum), 0)
            : Math.floor((amount * w) / weightSum),
        )
        let splits = people
          .map((p, idx) => ({ participantId: p, owedAmount: owed[idx]! }))
          .filter((s) => s.owedAmount > 0 || rng() > 0.5)
        // ensure splits not empty and re-balance the sum after filtering
        if (splits.length === 0) splits = [{ participantId: people[0]!, owedAmount: amount }]
        const splitSum = splits.reduce((a, s) => a + s.owedAmount, 0)
        if (splitSum !== amount) splits[0] = { ...splits[0]!, owedAmount: splits[0]!.owedAmount + amount - splitSum }
        expenses.push({
          amount,
          currency,
          rateNanos: currency === 'EUR' ? RATE_ONE_NANOS : 1 + Math.floor(rng() * 2_000_000_000),
          payers: [{ participantId: people[Math.floor(rng() * people.length)]!, amount }],
          splits,
        })
      }
      const nets = computeNets('EUR', expenses, people)
      expect(sum(nets)).toBe(0)
    }
  })
})

describe('computeBalances', () => {
  it('preserves participant order and zero-fills', () => {
    const balances = computeBalances('EUR', [], ['X', 'Y'])
    expect(balances).toEqual([
      { participantId: 'X', net: 0 },
      { participantId: 'Y', net: 0 },
    ])
  })
})
