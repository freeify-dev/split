import { describe, expect, it } from 'vitest'
import { expenseInputSchema, groupCreateSchema, isValidDateString } from './schemas'

const baseExpense = {
  description: 'Dinner',
  amount: 3000,
  currency: 'EUR',
  date: '2026-07-30',
  splitMode: 'equal' as const,
  paidBy: 'p1',
  splits: [{ participantId: 'p1' }, { participantId: 'p2' }],
}

describe('expenseInputSchema', () => {
  it('accepts a plain equal split and applies defaults', () => {
    const parsed = expenseInputSchema.parse(baseExpense)
    expect(parsed.category).toBe('general')
    expect(parsed.isReimbursement).toBe(false)
  })

  it('rejects exact splits that do not sum to the total', () => {
    const result = expenseInputSchema.safeParse({
      ...baseExpense,
      splitMode: 'exact',
      splits: [
        { participantId: 'p1', splitInput: 1000 },
        { participantId: 'p2', splitInput: 1000 },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('accepts exact splits that sum, including a zero row', () => {
    const result = expenseInputSchema.safeParse({
      ...baseExpense,
      splitMode: 'exact',
      splits: [
        { participantId: 'p1', splitInput: 3000 },
        { participantId: 'p2', splitInput: 0 },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('requires percentages to total exactly 100%', () => {
    const bad = expenseInputSchema.safeParse({
      ...baseExpense,
      splitMode: 'percentage',
      splits: [
        { participantId: 'p1', splitInput: 5000 },
        { participantId: 'p2', splitInput: 4999 },
      ],
    })
    expect(bad.success).toBe(false)

    const good = expenseInputSchema.safeParse({
      ...baseExpense,
      splitMode: 'percentage',
      splits: [
        { participantId: 'p1', splitInput: 3333 },
        { participantId: 'p2', splitInput: 6667 },
      ],
    })
    expect(good.success).toBe(true)
  })

  it('rejects duplicate participants in a split', () => {
    const result = expenseInputSchema.safeParse({
      ...baseExpense,
      splits: [{ participantId: 'p1' }, { participantId: 'p1' }],
    })
    expect(result.success).toBe(false)
  })

  it('constrains reimbursements to one exact counterparty', () => {
    const good = expenseInputSchema.safeParse({
      ...baseExpense,
      isReimbursement: true,
      splitMode: 'exact',
      splits: [{ participantId: 'p2', splitInput: 3000 }],
    })
    expect(good.success).toBe(true)

    const selfPay = expenseInputSchema.safeParse({
      ...baseExpense,
      isReimbursement: true,
      splitMode: 'exact',
      splits: [{ participantId: 'p1', splitInput: 3000 }],
    })
    expect(selfPay.success).toBe(false)

    const twoTargets = expenseInputSchema.safeParse({
      ...baseExpense,
      isReimbursement: true,
      splitMode: 'exact',
      splits: [
        { participantId: 'p2', splitInput: 1500 },
        { participantId: 'p1', splitInput: 1500 },
      ],
    })
    expect(twoTargets.success).toBe(false)
  })

  it('rejects unknown currencies and invalid dates', () => {
    expect(expenseInputSchema.safeParse({ ...baseExpense, currency: 'ZZZ' }).success).toBe(false)
    expect(expenseInputSchema.safeParse({ ...baseExpense, date: '2026-02-30' }).success).toBe(false)
  })
})

describe('groupCreateSchema', () => {
  it('requires unique participant names (case-insensitive)', () => {
    const result = groupCreateSchema.safeParse({
      name: 'Trip',
      currency: 'EUR',
      participants: [{ name: 'Ana' }, { name: 'ana' }],
    })
    expect(result.success).toBe(false)
  })
})

describe('isValidDateString', () => {
  it('validates calendar dates including leap years', () => {
    expect(isValidDateString('2024-02-29')).toBe(true)
    expect(isValidDateString('2026-02-29')).toBe(false)
    expect(isValidDateString('2026-13-01')).toBe(false)
    expect(isValidDateString('2026-7-30')).toBe(false)
  })
})
