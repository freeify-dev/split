import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { expenseInputSchema, minorToDecimalString, parseAmount } from '@solomon/shared'
import { useSaveExpense } from '../api/queries'
import { todayString } from '../lib/format'
import { useGroupContext } from './GroupLayout'

export function SettleUpPage() {
  const { group, myParticipantId } = useGroupContext()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const save = useSaveExpense(group.id)

  const prefillAmount = Number(params.get('amount'))
  const [from, setFrom] = useState(params.get('from') ?? myParticipantId ?? group.participants[0]?.id ?? '')
  const [to, setTo] = useState(params.get('to') ?? group.participants.find((p) => p.id !== from)?.id ?? '')
  const [amountStr, setAmountStr] = useState(
    Number.isSafeInteger(prefillAmount) && prefillAmount > 0 ? minorToDecimalString(prefillAmount, group.currency) : '',
  )
  const [date, setDate] = useState(todayString())
  const [error, setError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const amount = parseAmount(amountStr, group.currency)
    if (amount === null) {
      setError('Enter a valid amount')
      return
    }
    if (from === to) {
      setError('Choose two different people')
      return
    }
    const input = {
      description: 'Payment',
      amount,
      currency: group.currency,
      date,
      category: 'general',
      isReimbursement: true,
      splitMode: 'exact' as const,
      paidBy: from,
      splits: [{ participantId: to, splitInput: amount }],
    }
    const parsed = expenseInputSchema.safeParse(input)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check the form')
      return
    }
    save.mutate(parsed.data, {
      onSuccess: () => navigate(`/g/${group.id}/balances`),
      onError: (err) => setError(err.message),
    })
  }

  return (
    <form onSubmit={submit}>
      <div className="spread" style={{ marginBottom: 'var(--space-4)' }}>
        <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>Record a payment</h2>
        <Link to={`/g/${group.id}/balances`} className="btn btn-ghost btn-sm">
          Cancel
        </Link>
      </div>

      <p className="notice" style={{ marginBottom: 'var(--space-4)' }}>
        Use this when money actually changed hands — cash, bank transfer, anything.
      </p>

      <div className="field">
        <label className="label" htmlFor="settle-from">
          Who paid
        </label>
        <select id="settle-from" className="select" value={from} onChange={(e) => setFrom(e.target.value)}>
          {group.participants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.id === myParticipantId ? ' (you)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="label" htmlFor="settle-to">
          Who received it
        </label>
        <select id="settle-to" className="select" value={to} onChange={(e) => setTo(e.target.value)}>
          {group.participants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.id === myParticipantId ? ' (you)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <div className="field" style={{ flex: 1 }}>
          <label className="label" htmlFor="settle-amount">
            Amount ({group.currency})
          </label>
          <input
            id="settle-amount"
            className="input"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            autoFocus
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label className="label" htmlFor="settle-date">
            Date
          </label>
          <input id="settle-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {error && <p className="error-text" style={{ marginBottom: 'var(--space-3)' }}>{error}</p>}

      <button type="submit" className="btn btn-primary btn-block" disabled={save.isPending}>
        {save.isPending ? 'Recording…' : 'Record payment'}
      </button>
    </form>
  )
}
