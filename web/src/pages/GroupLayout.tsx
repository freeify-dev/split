import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useOutletContext, useParams } from 'react-router'
import type { GroupDto } from '@solomon/shared'
import { ApiClientError, errorMessage } from '../api/client'
import { useGroup } from '../api/queries'
import { claimIdentity, forgetGroup, getDeviceState, rememberGroup, useDeviceState } from '../lib/device'

export interface GroupContext {
  group: GroupDto
  myParticipantId: string | null
}

export function useGroupContext(): GroupContext {
  return useOutletContext<GroupContext>()
}

function skipKey(gid: string) {
  return `solomon.skip-claim.${gid}`
}

function ClaimScreen({ group, onDone }: { group: GroupDto; onDone: () => void }) {
  return (
    <div className="card card-pad" style={{ marginTop: 'var(--space-5)' }}>
      <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-1)' }}>Who are you?</h2>
      <p className="muted small" style={{ marginBottom: 'var(--space-4)' }}>
        Pick yourself so balances show from your side. This is remembered on this device only.
      </p>
      <div className="stack" style={{ gap: 'var(--space-2)' }}>
        {group.participants.map((p) => (
          <button
            key={p.id}
            type="button"
            className="btn btn-block"
            onClick={() => {
              claimIdentity(group.id, p.id)
              sessionStorage.removeItem(skipKey(group.id))
              onDone()
            }}
          >
            {p.name}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-ghost btn-block muted"
          onClick={() => {
            sessionStorage.setItem(skipKey(group.id), '1')
            onDone()
          }}
        >
          Just looking around
        </button>
      </div>
    </div>
  )
}

export function GroupLayout() {
  const { gid = '' } = useParams()
  const groupQuery = useGroup(gid)
  const device = useDeviceState()
  const [claimOpen, setClaimOpen] = useState(false)
  const group = groupQuery.data

  useEffect(() => {
    if (group) rememberGroup(group.id, { name: group.name })
  }, [group?.id, group?.name])

  if (groupQuery.error instanceof ApiClientError && groupQuery.error.status === 404) {
    const known = Boolean(getDeviceState().groups[gid])
    return (
      <main className="shell">
        <div className="empty">
          <div className="empty-emoji">👻</div>
          <p style={{ fontWeight: 600 }}>This group doesn’t exist (anymore)</p>
          <p className="small muted" style={{ marginTop: 'var(--space-2)' }}>
            The link may be wrong, or the group was deleted.
          </p>
          <p style={{ marginTop: 'var(--space-4)' }}>
            <Link
              to="/"
              className="btn btn-primary"
              onClick={() => {
                if (known) forgetGroup(gid)
              }}
            >
              Back to my groups
            </Link>
          </p>
        </div>
      </main>
    )
  }

  if (groupQuery.isError) {
    return (
      <main className="shell">
        <div className="empty">
          <div className="empty-emoji">📡</div>
          <p style={{ fontWeight: 600 }}>Can’t reach the server</p>
          <p className="small muted" style={{ marginTop: 'var(--space-2)' }}>{errorMessage(groupQuery.error)}</p>
          <p style={{ marginTop: 'var(--space-4)' }}>
            <button type="button" className="btn btn-primary" onClick={() => groupQuery.refetch()}>
              Try again
            </button>
          </p>
        </div>
      </main>
    )
  }

  if (!group) {
    return (
      <main className="shell">
        <div className="skeleton">Loading group…</div>
      </main>
    )
  }

  const entry = device.groups[gid]
  const claimedId = entry?.claimedParticipantId ?? null
  const me = claimedId ? (group.participants.find((p) => p.id === claimedId) ?? null) : null
  const skipped = sessionStorage.getItem(skipKey(gid)) === '1'
  const needsClaim = !me && !skipped

  return (
    <main className="shell">
      <div className="topbar">
        <Link to="/" className="btn btn-ghost" aria-label="Home">
          ←
        </Link>
        <h1 className="page-title">{group.name}</h1>
        <button type="button" className="chip" onClick={() => setClaimOpen(true)}>
          {me ? `I’m ${me.name}` : 'Who am I?'}
        </button>
      </div>

      {needsClaim || claimOpen ? (
        <ClaimScreen group={group} onDone={() => setClaimOpen(false)} />
      ) : (
        <>
          <nav className="tabs">
            <NavLink to="expenses" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
              Expenses
            </NavLink>
            <NavLink to="balances" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
              Balances
            </NavLink>
            <NavLink to="activity" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
              Activity
            </NavLink>
            <NavLink to="settings" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
              Settings
            </NavLink>
          </nav>
          <Outlet context={{ group, myParticipantId: me?.id ?? null } satisfies GroupContext} />
        </>
      )}
    </main>
  )
}
