import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { CURRENCIES, type GroupDto, type ParticipantDto } from '@solomon/shared'
import { api } from '../api/client'
import { useExpenses, useInvalidateGroup } from '../api/queries'
import { claimIdentity, forgetGroup, getClaim } from '../lib/device'
import { useGroupContext } from './GroupLayout'

function ShareCard({ group }: { group: GroupDto }) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/g/${group.id}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy the group link:', url)
    }
  }

  const share = () => {
    void navigator.share({ title: `${group.name} on Solomon`, url }).catch(() => undefined)
  }

  return (
    <div className="card card-pad">
      <h3 className="label" style={{ marginBottom: 'var(--space-2)' }}>
        Invite people
      </h3>
      <p className="small muted" style={{ marginBottom: 'var(--space-3)' }}>
        Anyone with this link can see and add expenses. Treat it like a key.
      </p>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button type="button" className="btn btn-primary" onClick={copy}>
          {copied ? 'Copied ✓' : 'Copy link'}
        </button>
        {typeof navigator.share === 'function' && (
          <button type="button" className="btn" onClick={share}>
            Share…
          </button>
        )}
      </div>
    </div>
  )
}

function ParticipantRow({ group, participant }: { group: GroupDto; participant: ParticipantDto }) {
  const invalidate = useInvalidateGroup(group.id)
  const [error, setError] = useState<string | null>(null)

  const rename = useMutation({
    mutationFn: (name: string) =>
      api(`/api/groups/${group.id}/participants/${participant.id}`, {
        method: 'PATCH',
        json: { name },
        actor: getClaim(group.id),
      }),
    onSuccess: invalidate,
    onError: (err) => setError(err.message),
  })
  const remove = useMutation({
    mutationFn: () =>
      api(`/api/groups/${group.id}/participants/${participant.id}`, { method: 'DELETE', actor: getClaim(group.id) }),
    onSuccess: () => {
      if (getClaim(group.id) === participant.id) claimIdentity(group.id, null)
      invalidate()
    },
    onError: (err) => setError(err.message),
  })

  return (
    <div className="row row-static" style={{ flexWrap: 'wrap' }}>
      <div className="row-main">
        <div className="row-title" style={{ fontWeight: 500 }}>
          {participant.name}
        </div>
        {error && <div className="error-text small">{error}</div>}
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-label={`Rename ${participant.name}`}
        onClick={() => {
          setError(null)
          const name = window.prompt(`Rename ${participant.name}:`, participant.name)?.trim()
          if (name && name !== participant.name) rename.mutate(name)
        }}
      >
        ✏️
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-label={`Remove ${participant.name}`}
        onClick={() => {
          setError(null)
          if (window.confirm(`Remove ${participant.name} from the group?`)) remove.mutate()
        }}
      >
        ✕
      </button>
    </div>
  )
}

export function SettingsTab() {
  const { group, myParticipantId } = useGroupContext()
  const navigate = useNavigate()
  const invalidate = useInvalidateGroup(group.id)
  const expenses = useExpenses(group.id)
  const hasExpenses = (expenses.data?.length ?? 0) > 0

  const [name, setName] = useState(group.name)
  const [currency, setCurrency] = useState(group.currency)
  const [newPerson, setNewPerson] = useState('')
  const [error, setError] = useState<string | null>(null)

  const patchGroup = useMutation({
    mutationFn: (json: { name?: string; currency?: string }) =>
      api(`/api/groups/${group.id}`, { method: 'PATCH', json, actor: getClaim(group.id) }),
    onSuccess: invalidate,
    onError: (err) => setError(err.message),
  })

  const addPerson = useMutation({
    mutationFn: (personName: string) =>
      api(`/api/groups/${group.id}/participants`, {
        method: 'POST',
        json: { name: personName },
        actor: getClaim(group.id),
      }),
    onSuccess: () => {
      setNewPerson('')
      invalidate()
    },
    onError: (err) => setError(err.message),
  })

  const deleteGroup = useMutation({
    mutationFn: () => api(`/api/groups/${group.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      forgetGroup(group.id)
      navigate('/', { replace: true })
    },
    onError: (err) => setError(err.message),
  })

  return (
    <div className="stack">
      <ShareCard group={group} />

      <div className="card card-pad">
        <h3 className="label" style={{ marginBottom: 'var(--space-3)' }}>
          Group
        </h3>
        <div className="field">
          <label className="label" htmlFor="set-name">
            Name
          </label>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <input id="set-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
            <button
              type="button"
              className="btn"
              disabled={patchGroup.isPending || name.trim() === group.name || name.trim() === ''}
              onClick={() => patchGroup.mutate({ name: name.trim() })}
            >
              Save
            </button>
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label" htmlFor="set-currency">
            Summary currency
          </label>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <select
              id="set-currency"
              className="select"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={hasExpenses}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
            {!hasExpenses && (
              <button
                type="button"
                className="btn"
                disabled={patchGroup.isPending || currency === group.currency}
                onClick={() => patchGroup.mutate({ currency })}
              >
                Save
              </button>
            )}
          </div>
          {hasExpenses && <p className="hint">Locked once the group has expenses.</p>}
        </div>
      </div>

      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <h3 className="label">People</h3>
        </div>
        <div className="list" style={{ marginTop: 'var(--space-2)' }}>
          {group.participants.map((p) => (
            <ParticipantRow key={p.id} group={group} participant={p} />
          ))}
        </div>
        <div className="card-pad" style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <input
            className="input"
            value={newPerson}
            onChange={(e) => setNewPerson(e.target.value)}
            placeholder="Add someone…"
          />
          <button
            type="button"
            className="btn"
            disabled={addPerson.isPending || newPerson.trim() === ''}
            onClick={() => addPerson.mutate(newPerson.trim())}
          >
            Add
          </button>
        </div>
      </div>

      <div className="card card-pad">
        <h3 className="label" style={{ marginBottom: 'var(--space-2)' }}>
          I am…
        </h3>
        <select
          className="select"
          value={myParticipantId ?? ''}
          onChange={(e) => claimIdentity(group.id, e.target.value || null)}
        >
          <option value="">Just looking around</option>
          {group.participants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card card-pad">
        <h3 className="label" style={{ marginBottom: 'var(--space-2)' }}>
          Export
        </h3>
        <a href={`/api/groups/${group.id}/export.csv`} download className="btn">
          Download CSV
        </a>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card card-pad" style={{ borderColor: 'var(--color-danger-soft)' }}>
        <h3 className="label" style={{ color: 'var(--color-danger)', marginBottom: 'var(--space-2)' }}>
          Danger zone
        </h3>
        <button
          type="button"
          className="btn btn-danger"
          disabled={deleteGroup.isPending}
          onClick={() => {
            const check = window.prompt(`This permanently deletes "${group.name}" and every expense in it for everyone. Type the group name to confirm:`)
            if (check === group.name) deleteGroup.mutate()
          }}
        >
          Delete group
        </button>
      </div>
    </div>
  )
}
