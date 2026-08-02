import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { CURRENCIES, groupCreateSchema, type GroupDto } from '@solomon/shared'
import { api } from '../api/client'
import { claimIdentity, rememberGroup } from '../lib/device'

export function CreateGroup() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [people, setPeople] = useState<string[]>(['', ''])
  const [claimFirst, setClaimFirst] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: (input: unknown) => api<GroupDto>('/api/groups', { method: 'POST', json: input }),
    onSuccess: (group) => {
      rememberGroup(group.id, { name: group.name })
      if (claimFirst && group.participants[0]) claimIdentity(group.id, group.participants[0].id)
      navigate(`/g/${group.id}`, { replace: true })
    },
    onError: (err) => setError(err.message),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const input = {
      name,
      currency,
      participants: people.map((n) => ({ name: n.trim() })).filter((p) => p.name.length > 0),
    }
    const parsed = groupCreateSchema.safeParse(input)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check the form')
      return
    }
    create.mutate(parsed.data)
  }

  return (
    <main className="shell">
      <div className="topbar">
        <Link to="/" className="btn btn-ghost" aria-label="Back">
          ←
        </Link>
        <h1 className="page-title">New group</h1>
      </div>

      <form onSubmit={submit}>
        <div className="field">
          <label className="label" htmlFor="group-name">
            Group name
          </label>
          <input
            id="group-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Lisbon trip, Flat 12, …"
            autoFocus
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="group-currency">
            Currency for totals
          </label>
          <select id="group-currency" className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
          <p className="hint">Expenses can be in any currency; balances are summarized in this one.</p>
        </div>

        <div className="field">
          <span className="label">People</span>
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            {people.map((person, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={i} style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <input
                  className="input"
                  value={person}
                  onChange={(e) => setPeople(people.map((p, j) => (j === i ? e.target.value : p)))}
                  placeholder={i === 0 ? 'Your name' : `Person ${i + 1}`}
                />
                {people.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    aria-label="Remove person"
                    onClick={() => setPeople(people.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start', marginTop: 'var(--space-2)' }} onClick={() => setPeople([...people, ''])}>
            ＋ Add person
          </button>
        </div>

        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-2)' }}>
          <input type="checkbox" checked={claimFirst} onChange={(e) => setClaimFirst(e.target.checked)} />
          <span className="small">The first person is me</span>
        </label>

        {error && <p className="error-text" style={{ marginBottom: 'var(--space-3)' }}>{error}</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create group'}
        </button>
        <p className="hint" style={{ marginTop: 'var(--space-3)' }}>
          You’ll get a private link to share — everyone with the link can add expenses. No sign-up needed.
        </p>
      </form>
    </main>
  )
}
