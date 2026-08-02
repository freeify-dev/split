import { Link } from 'react-router'
import { computeBalances, simplifyDebts } from '@solomon/shared'
import { errorMessage } from '../api/client'
import { useExpenses } from '../api/queries'
import { money } from '../lib/format'
import { useGroupContext } from './GroupLayout'

export function BalancesTab() {
  const { group, myParticipantId } = useGroupContext()
  const expenses = useExpenses(group.id)
  const names = new Map(group.participants.map((p) => [p.id, p.name]))
  const nameOf = (id: string) => names.get(id) ?? 'Someone'

  if (expenses.isPending) return <div className="skeleton">Computing balances…</div>
  if (expenses.isError) return <p className="error-text">{errorMessage(expenses.error)}</p>

  // same shared math the server uses — cannot disagree with it
  const balances = computeBalances(
    group.currency,
    expenses.data,
    group.participants.map((p) => p.id),
  )
  const transfers = simplifyDebts(balances)
  const mine = myParticipantId ? balances.find((b) => b.participantId === myParticipantId) : undefined

  return (
    <div className="stack">
      {mine && (
        <div className="card card-pad spread">
          <span style={{ fontWeight: 600 }}>
            {mine.net > 0 ? 'You get back' : mine.net < 0 ? 'You owe' : 'You’re settled up'}
          </span>
          {mine.net !== 0 && (
            <span className={`amount ${mine.net > 0 ? 'positive' : 'negative'}`} style={{ fontSize: 'var(--text-lg)' }}>
              {money(Math.abs(mine.net), group.currency)}
            </span>
          )}
          {mine.net === 0 && <span>🎉</span>}
        </div>
      )}

      <div className="card list">
        {balances.map((b) => (
          <div key={b.participantId} className="row row-static">
            <div className="row-main">
              <div className="row-title" style={{ fontWeight: b.participantId === myParticipantId ? 650 : 500 }}>
                {nameOf(b.participantId)}
                {b.participantId === myParticipantId ? ' (you)' : ''}
              </div>
              <div className="muted small">
                {b.net > 0 ? 'gets back' : b.net < 0 ? 'owes' : 'settled up'}
              </div>
            </div>
            <div className={`amount ${b.net > 0 ? 'positive' : b.net < 0 ? 'negative' : 'muted'}`}>
              {b.net === 0 ? '—' : money(Math.abs(b.net), group.currency)}
            </div>
          </div>
        ))}
      </div>

      {transfers.length > 0 && (
        <>
          <h2 className="label" style={{ fontSize: 'var(--text-md)' }}>
            Simplest way to settle up
          </h2>
          <div className="card list">
            {transfers.map((t) => (
              <div key={`${t.fromId}-${t.toId}`} className="row row-static">
                <div className="row-main">
                  <div className="row-title" style={{ fontWeight: 500 }}>
                    {nameOf(t.fromId)} → {nameOf(t.toId)}
                  </div>
                </div>
                <span className="amount">{money(t.amount, group.currency)}</span>
                <Link
                  to={`../settle?from=${t.fromId}&to=${t.toId}&amount=${t.amount}`}
                  className="btn btn-sm"
                >
                  Record
                </Link>
              </div>
            ))}
          </div>
          <p className="hint">
            {transfers.length} payment{transfers.length > 1 ? 's' : ''} settle{transfers.length > 1 ? '' : 's'} the whole
            group. Record one when the money actually moves.
          </p>
        </>
      )}
    </div>
  )
}
