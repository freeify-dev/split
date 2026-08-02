import { Link, useNavigate } from 'react-router'
import type { ExpenseDto } from '@solomon/shared'
import { categoryEmoji, convertMinor, RATE_ONE_NANOS } from '@solomon/shared'
import { errorMessage } from '../api/client'
import { useExpenses } from '../api/queries'
import { money, shortDate } from '../lib/format'
import { useGroupContext } from './GroupLayout'

function ExpenseRow({ expense }: { expense: ExpenseDto }) {
  const { group, myParticipantId } = useGroupContext()
  const navigate = useNavigate()
  const names = new Map(group.participants.map((p) => [p.id, p.name]))
  const nameOf = (id: string | undefined) => (id ? (names.get(id) ?? 'Someone') : 'Someone')
  const payerId = expense.payers[0]?.participantId
  const isForeign = expense.currency !== group.currency || expense.rateNanos !== RATE_ONE_NANOS

  if (expense.isReimbursement) {
    const toId = expense.splits[0]?.participantId
    return (
      <button type="button" className="row" onClick={() => navigate(`${expense.id}/edit`)}>
        <div className="row-emoji" style={{ background: 'var(--color-accent-soft)' }}>
          💸
        </div>
        <div className="row-main">
          <div className="row-title" style={{ fontWeight: 500 }}>
            {nameOf(payerId)} paid {nameOf(toId)}
          </div>
          <div className="muted small">{shortDate(expense.date)}</div>
        </div>
        <div className="amount muted">{money(expense.amount, expense.currency)}</div>
      </button>
    )
  }

  const myShare = myParticipantId ? expense.splits.find((s) => s.participantId === myParticipantId) : undefined
  const iPaid = payerId === myParticipantId

  return (
    <button type="button" className="row" onClick={() => navigate(`${expense.id}/edit`)}>
      <div className="row-emoji">{categoryEmoji(expense.category)}</div>
      <div className="row-main">
        <div className="row-title">{expense.description}</div>
        <div className="muted small">
          {nameOf(payerId)} paid · {shortDate(expense.date)}
          {myShare && !iPaid ? ` · your share ${money(myShare.owedAmount, expense.currency)}` : ''}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="amount">{money(expense.amount, expense.currency)}</div>
        {isForeign && (
          <div className="muted small">
            ≈ {money(convertMinor(expense.amount, expense.currency, group.currency, expense.rateNanos), group.currency)}
          </div>
        )}
      </div>
    </button>
  )
}

export function ExpensesTab() {
  const { group } = useGroupContext()
  const expenses = useExpenses(group.id)

  return (
    <div className="stack">
      <Link to="new" className="btn btn-primary btn-block">
        ＋ Add expense
      </Link>

      {expenses.isPending && <div className="skeleton">Loading expenses…</div>}
      {expenses.isError && <p className="error-text">{errorMessage(expenses.error)}</p>}

      {expenses.data && expenses.data.length === 0 && (
        <div className="card">
          <div className="empty">
            <div className="empty-emoji">🍕</div>
            <p style={{ fontWeight: 600, color: 'var(--color-text)' }}>No expenses yet</p>
            <p className="small" style={{ marginTop: 'var(--space-1)' }}>
              Add the first one — dinner, tickets, the taxi…
            </p>
          </div>
        </div>
      )}

      {expenses.data && expenses.data.length > 0 && (
        <div className="card list">
          {expenses.data.map((e) => (
            <ExpenseRow key={e.id} expense={e} />
          ))}
        </div>
      )}
    </div>
  )
}
