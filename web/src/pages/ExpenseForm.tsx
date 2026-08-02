import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import {
  CATEGORIES,
  CURRENCIES,
  expenseInputSchema,
  formatRate,
  minorToDecimalString,
  parseAmount,
  parseRateToNanos,
  rateNanosToDecimalString,
  convertMinor,
  type ExpenseDto,
  type RateDto,
  type SplitMode,
} from '@solomon/shared'
import { api, ApiClientError } from '../api/client'
import { useDeleteExpense, useExpenses, useSaveExpense } from '../api/queries'
import { money, shortDate, todayString } from '../lib/format'
import { useGroupContext } from './GroupLayout'

/** "33.33" → 3333 basis points, string math only. */
function percentToBp(input: string): number | null {
  const match = /^(\d{1,3})(?:[.,](\d{0,2}))?$/.exec(input.trim())
  if (!match) return null
  const whole = Number(match[1])
  const frac = (match[2] ?? '').padEnd(2, '0')
  const bp = whole * 100 + Number(frac || '0')
  return bp > 10_000 ? null : bp
}

function bpToPercentString(bp: number): string {
  const whole = Math.trunc(bp / 100)
  const frac = bp % 100
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}`
}

const MODE_LABELS: Record<SplitMode, string> = {
  equal: 'Equally',
  exact: 'Amounts',
  percentage: 'Percent',
  shares: 'Shares',
}

export function ExpenseFormPage() {
  const { group, myParticipantId } = useGroupContext()
  const { eid } = useParams()
  const navigate = useNavigate()
  const expenses = useExpenses(group.id)
  const save = useSaveExpense(group.id, eid)
  const remove = useDeleteExpense(group.id)

  const existingQuery = useQuery({
    queryKey: ['expense', group.id, eid],
    queryFn: () => api<ExpenseDto>(`/api/groups/${group.id}/expenses/${eid}`),
    enabled: Boolean(eid),
    initialData: eid ? expenses.data?.find((e) => e.id === eid) : undefined,
  })
  const existing = eid ? existingQuery.data : undefined

  const [description, setDescription] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [currency, setCurrency] = useState(group.currency)
  const [date, setDate] = useState(todayString())
  const [category, setCategory] = useState('general')
  const [notes, setNotes] = useState('')
  const [paidBy, setPaidBy] = useState(myParticipantId ?? group.participants[0]?.id ?? '')
  const [splitMode, setSplitMode] = useState<SplitMode>('equal')
  const [equalSelected, setEqualSelected] = useState<Set<string>>(new Set(group.participants.map((p) => p.id)))
  const [valueInputs, setValueInputs] = useState<Record<string, string>>({})
  const [manualRate, setManualRate] = useState(false)
  const [rateStr, setRateStr] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  // prefill once when editing
  useEffect(() => {
    if (!existing || loaded) return
    setDescription(existing.description)
    setAmountStr(minorToDecimalString(existing.amount, existing.currency))
    setCurrency(existing.currency)
    setDate(existing.date)
    setCategory(existing.category)
    setNotes(existing.notes ?? '')
    setPaidBy(existing.payers[0]?.participantId ?? paidBy)
    setSplitMode(existing.splitMode)
    setEqualSelected(new Set(existing.splits.map((s) => s.participantId)))
    const values: Record<string, string> = {}
    for (const s of existing.splits) {
      if (existing.splitMode === 'exact') values[s.participantId] = minorToDecimalString(s.splitInput ?? s.owedAmount, existing.currency)
      else if (existing.splitMode === 'percentage') values[s.participantId] = bpToPercentString(s.splitInput ?? 0)
      else if (existing.splitMode === 'shares') values[s.participantId] = String(s.splitInput ?? 1)
    }
    setValueInputs(values)
    if (existing.rateSource === 'manual') {
      setManualRate(true)
      setRateStr(rateNanosToDecimalString(existing.rateNanos))
    }
    setLoaded(true)
  }, [existing, loaded, paidBy])

  const isForeign = currency !== group.currency
  const amountMinor = parseAmount(amountStr, currency)

  const rateQuery = useQuery({
    queryKey: ['rate', group.id, currency, date],
    queryFn: () => api<RateDto>(`/api/groups/${group.id}/rate?currency=${currency}&date=${date}`),
    enabled: isForeign && !manualRate,
    staleTime: 60_000,
    retry: false,
  })
  const rateUnavailable = rateQuery.error instanceof ApiClientError && rateQuery.error.status === 503
  const effectiveRateNanos = manualRate || rateUnavailable ? parseRateToNanos(rateStr) : (rateQuery.data?.rateNanos ?? null)

  const setValue = (pid: string, value: string) => setValueInputs((prev) => ({ ...prev, [pid]: value }))

  // live remainder feedback
  const splitStatus = useMemo(() => {
    if (splitMode === 'equal' || amountMinor === null) return null
    if (splitMode === 'exact') {
      let sum = 0
      for (const p of group.participants) {
        const raw = (valueInputs[p.id] ?? '').trim()
        if (!raw) continue
        const parsed = parseAmount(raw, currency)
        if (parsed === null) return { ok: false, text: 'Check the amounts' }
        sum += parsed
      }
      const left = amountMinor - sum
      if (left === 0) return { ok: true, text: 'All assigned ✓' }
      return { ok: false, text: left > 0 ? `${money(left, currency)} left to assign` : `${money(-left, currency)} too much` }
    }
    if (splitMode === 'percentage') {
      let bp = 0
      for (const p of group.participants) {
        const raw = (valueInputs[p.id] ?? '').trim()
        if (!raw) continue
        const parsed = percentToBp(raw)
        if (parsed === null) return { ok: false, text: 'Check the percentages' }
        bp += parsed
      }
      if (bp === 10_000) return { ok: true, text: '100% ✓' }
      return { ok: false, text: bp < 10_000 ? `${bpToPercentString(10_000 - bp)}% left` : `${bpToPercentString(bp - 10_000)}% over` }
    }
    let shares = 0
    for (const p of group.participants) {
      const raw = (valueInputs[p.id] ?? '').trim()
      if (!raw) continue
      if (!/^\d{1,6}$/.test(raw)) return { ok: false, text: 'Shares must be whole numbers' }
      shares += Number(raw)
    }
    return shares > 0 ? { ok: true, text: `${shares} share${shares === 1 ? '' : 's'} total` } : { ok: false, text: 'Give at least one share' }
  }, [splitMode, amountMinor, valueInputs, group.participants, currency])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (amountMinor === null) {
      setError('Enter a valid amount')
      return
    }

    let splits: { participantId: string; splitInput?: number | null }[]
    if (splitMode === 'equal') {
      splits = group.participants.filter((p) => equalSelected.has(p.id)).map((p) => ({ participantId: p.id }))
    } else {
      splits = []
      for (const p of group.participants) {
        const raw = (valueInputs[p.id] ?? '').trim()
        if (!raw) continue
        const parsed = splitMode === 'exact' ? parseAmount(raw, currency) : splitMode === 'percentage' ? percentToBp(raw) : /^\d{1,6}$/.test(raw) ? Number(raw) : null
        if (parsed === null) {
          setError(`Check the ${MODE_LABELS[splitMode].toLowerCase()} values`)
          return
        }
        splits.push({ participantId: p.id, splitInput: parsed })
      }
    }

    const needsManualRate = isForeign && (manualRate || rateUnavailable)
    if (needsManualRate && effectiveRateNanos === null) {
      setError(`Enter the exchange rate (1 ${currency} = ? ${group.currency})`)
      return
    }

    const wasManual = existing?.rateSource === 'manual'
    const input = {
      description,
      amount: amountMinor,
      currency,
      date,
      category,
      notes: notes.trim() ? notes.trim() : null,
      isReimbursement: existing?.isReimbursement ?? false,
      splitMode,
      paidBy,
      splits,
      rateOverrideNanos: needsManualRate ? effectiveRateNanos : wasManual && !manualRate ? null : undefined,
    }
    const parsed = expenseInputSchema.safeParse(input)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check the form')
      return
    }
    save.mutate(parsed.data, {
      onSuccess: () => navigate(`/g/${group.id}/expenses`),
      onError: (err) => {
        setError(err.message)
        if (err instanceof ApiClientError && err.code === 'RATE_UNAVAILABLE') setManualRate(true)
      },
    })
  }

  const onDelete = () => {
    if (!eid || !window.confirm('Delete this expense?')) return
    remove.mutate(eid, { onSuccess: () => navigate(`/g/${group.id}/expenses`) })
  }

  if (eid && !existing) {
    return existingQuery.isError ? (
      <p className="error-text">Couldn’t load this expense.</p>
    ) : (
      <div className="skeleton">Loading expense…</div>
    )
  }

  const title = existing?.isReimbursement ? (eid ? 'Edit payment' : 'Record payment') : eid ? 'Edit expense' : 'New expense'
  const activeCategory = CATEGORIES.find((c) => c.slug === category) ?? CATEGORIES[0]!

  return (
    <form onSubmit={submit}>
      <div className="spread" style={{ marginBottom: 'var(--space-4)' }}>
        <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>{title}</h2>
        <Link to={`/g/${group.id}/expenses`} className="btn btn-ghost btn-sm">
          Cancel
        </Link>
      </div>

      {!existing?.isReimbursement && (
        <div className="field">
          <label className="label" htmlFor="exp-desc">
            Description
          </label>
          <input
            id="exp-desc"
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Dinner, taxi, museum…"
            autoFocus={!eid}
          />
        </div>
      )}

      <div className="field">
        <label className="label" htmlFor="exp-amount">
          Amount
        </label>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <input
            id="exp-amount"
            className="input"
            style={{ flex: 1 }}
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
          />
          <select
            className="select"
            style={{ width: '7.5rem' }}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            aria-label="Currency"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isForeign && (
        <div className="field">
          <span className="label">Exchange rate</span>
          {!manualRate && rateQuery.data && (
            <p className="hint">
              {formatRate(rateQuery.data.rateNanos, currency, group.currency)}
              {rateQuery.data.rateDate ? ` · ECB ${rateQuery.data.rateDate}` : ''}
              {rateQuery.data.source === 'fallback' ? ' (older cached rate)' : ''}{' '}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setManualRate(true); setRateStr(rateNanosToDecimalString(rateQuery.data.rateNanos)) }}>
                edit
              </button>
            </p>
          )}
          {!manualRate && rateQuery.isPending && <p className="hint">Looking up the ECB rate…</p>}
          {(manualRate || rateUnavailable) && (
            <>
              {rateUnavailable && <p className="hint">No automatic rate available — enter it yourself.</p>}
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <span className="small muted" style={{ whiteSpace: 'nowrap' }}>1 {currency} =</span>
                <input
                  className="input"
                  value={rateStr}
                  onChange={(e) => setRateStr(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  style={{ flex: 1 }}
                />
                <span className="small muted">{group.currency}</span>
                {manualRate && !rateUnavailable && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setManualRate(false)}>
                    auto
                  </button>
                )}
              </div>
            </>
          )}
          {amountMinor !== null && effectiveRateNanos !== null && (
            <p className="hint">= {money(convertMinor(amountMinor, currency, group.currency, effectiveRateNanos), group.currency)} in {group.currency}</p>
          )}
        </div>
      )}

      <div className="field">
        <label className="label" htmlFor="exp-payer">
          Paid by
        </label>
        <select id="exp-payer" className="select" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
          {group.participants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.id === myParticipantId ? ' (you)' : ''}
            </option>
          ))}
        </select>
      </div>

      {!existing?.isReimbursement && (
        <div className="field">
          <span className="label">Split</span>
          <div className="segmented" style={{ marginBottom: 'var(--space-2)' }}>
            {(Object.keys(MODE_LABELS) as SplitMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`segment${splitMode === mode ? ' active' : ''}`}
                onClick={() => setSplitMode(mode)}
              >
                {MODE_LABELS[mode]}
              </button>
            ))}
          </div>

          <div className="card list">
            {group.participants.map((p) => (
              <div key={p.id} className="row row-static" style={{ minHeight: 48 }}>
                {splitMode === 'equal' ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={equalSelected.has(p.id)}
                      onChange={(e) => {
                        const next = new Set(equalSelected)
                        if (e.target.checked) next.add(p.id)
                        else next.delete(p.id)
                        setEqualSelected(next)
                      }}
                    />
                    <span className="row-title" style={{ fontWeight: 500 }}>
                      {p.name}
                    </span>
                    {equalSelected.has(p.id) && amountMinor !== null && equalSelected.size > 0 && (
                      <span className="muted small" style={{ marginLeft: 'auto' }}>
                        ≈ {money(Math.round(amountMinor / equalSelected.size), currency)}
                      </span>
                    )}
                  </label>
                ) : (
                  <>
                    <span className="row-title" style={{ flex: 1, fontWeight: 500 }}>
                      {p.name}
                    </span>
                    <input
                      className="input"
                      style={{ width: '7rem', textAlign: 'right' }}
                      value={valueInputs[p.id] ?? ''}
                      onChange={(e) => setValue(p.id, e.target.value)}
                      inputMode={splitMode === 'shares' ? 'numeric' : 'decimal'}
                      placeholder={splitMode === 'percentage' ? '%' : splitMode === 'shares' ? '0' : '0.00'}
                    />
                  </>
                )}
              </div>
            ))}
          </div>
          {splitStatus && (
            <p className={splitStatus.ok ? 'hint' : 'error-text'} style={{ marginTop: 'var(--space-1)' }}>
              {splitStatus.text}
            </p>
          )}
        </div>
      )}

      <details className="more">
        <summary>
          <span>More options</span>
          <span className="more-summary-info muted">
            {shortDate(date)}
            {!existing?.isReimbursement && ` · ${activeCategory.emoji} ${activeCategory.label}`}
            {notes.trim() !== '' && ' · 📝'}
          </span>
          <span className="more-chevron">▾</span>
        </summary>
        <div className="more-body">
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <div className="field" style={{ flex: 1 }}>
              <label className="label" htmlFor="exp-date">
                Date
              </label>
              <input id="exp-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            {!existing?.isReimbursement && (
              <div className="field" style={{ flex: 1 }}>
                <label className="label" htmlFor="exp-cat">
                  Category
                </label>
                <select id="exp-cat" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.emoji} {c.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="field">
            <label className="label" htmlFor="exp-notes">
              Notes <span style={{ fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea
              id="exp-notes"
              className="input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
      </details>

      {error && <p className="error-text" style={{ marginBottom: 'var(--space-3)' }}>{error}</p>}

      <button type="submit" className="btn btn-primary btn-block" disabled={save.isPending}>
        {save.isPending ? 'Saving…' : eid ? 'Save changes' : 'Add expense'}
      </button>

      {eid && (
        <button
          type="button"
          className="btn btn-danger btn-block"
          style={{ marginTop: 'var(--space-3)' }}
          onClick={onDelete}
          disabled={remove.isPending}
        >
          {remove.isPending ? 'Deleting…' : 'Delete'}
        </button>
      )}
    </form>
  )
}
