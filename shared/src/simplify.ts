import type { ParticipantBalance } from './balance'

export interface Transfer {
  fromId: string
  toId: string
  amount: number
}

/**
 * Turn per-participant nets into a small set of settling transfers: sort
 * debtors and creditors by size (descending, stable) and repeatedly match the
 * heads; each match extinguishes at least one side, so at most n−1 transfers
 * result. Minimizing the transfer COUNT is NP-hard — this greedy standard is
 * what Splitwise-style apps use and is deterministic for a given input.
 * Assumes Σ nets == 0 (guaranteed by computeNets); any residual is ignored.
 */
export function simplifyDebts(balances: readonly ParticipantBalance[]): Transfer[] {
  const creditors = balances
    .filter((b) => b.net > 0)
    .map((b) => ({ id: b.participantId, remaining: b.net }))
    .sort((a, b) => b.remaining - a.remaining)
  const debtors = balances
    .filter((b) => b.net < 0)
    .map((b) => ({ id: b.participantId, remaining: -b.net }))
    .sort((a, b) => b.remaining - a.remaining)

  const transfers: Transfer[] = []
  let creditorIdx = 0
  let debtorIdx = 0
  while (creditorIdx < creditors.length && debtorIdx < debtors.length) {
    const creditor = creditors[creditorIdx]!
    const debtor = debtors[debtorIdx]!
    const amount = Math.min(creditor.remaining, debtor.remaining)
    if (amount > 0) transfers.push({ fromId: debtor.id, toId: creditor.id, amount })
    creditor.remaining -= amount
    debtor.remaining -= amount
    if (creditor.remaining === 0) creditorIdx++
    if (debtor.remaining === 0) debtorIdx++
  }
  return transfers
}
