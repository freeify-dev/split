import { allocate, convertMinor, RATE_ONE_NANOS } from './money'

/** The slice of an expense the balance fold needs (API DTOs and DB rows both satisfy it). */
export interface ExpenseForBalance {
  amount: number
  currency: string
  rateNanos: number
  payers: ReadonlyArray<{ participantId: string; amount: number }>
  splits: ReadonlyArray<{ participantId: string; owedAmount: number }>
}

/**
 * Fold expenses into per-participant nets in the group currency (minor units;
 * positive = is owed money). Per expense the TOTAL is converted once, then the
 * converted total is re-allocated across payers (credits) and splits (debits)
 * using the original expense-currency amounts as weights — so credits and
 * debits both sum to the converted total and the group's nets sum to exactly
 * zero, regardless of rates and rounding.
 */
export function computeNets(
  groupCurrency: string,
  expenses: readonly ExpenseForBalance[],
  participantIds: readonly string[] = [],
): Record<string, number> {
  const nets: Record<string, number> = {}
  for (const id of participantIds) nets[id] = 0

  for (const expense of expenses) {
    const totalInGroup =
      expense.currency === groupCurrency && expense.rateNanos === RATE_ONE_NANOS
        ? expense.amount
        : convertMinor(expense.amount, expense.currency, groupCurrency, expense.rateNanos)

    const debits = allocate(totalInGroup, expense.splits.map((s) => s.owedAmount))
    const credits = allocate(totalInGroup, expense.payers.map((p) => p.amount))

    expense.splits.forEach((split, i) => {
      nets[split.participantId] = (nets[split.participantId] ?? 0) - debits[i]!
    })
    expense.payers.forEach((payer, i) => {
      nets[payer.participantId] = (nets[payer.participantId] ?? 0) + credits[i]!
    })
  }
  return nets
}

export interface ParticipantBalance {
  participantId: string
  net: number
}

/** computeNets as an ordered array (input participant order preserved, unknowns appended). */
export function computeBalances(
  groupCurrency: string,
  expenses: readonly ExpenseForBalance[],
  participantIds: readonly string[],
): ParticipantBalance[] {
  const nets = computeNets(groupCurrency, expenses, participantIds)
  const ordered = participantIds.map((id) => ({ participantId: id, net: nets[id] ?? 0 }))
  for (const id of Object.keys(nets)) {
    if (!participantIds.includes(id)) ordered.push({ participantId: id, net: nets[id]! })
  }
  return ordered
}
