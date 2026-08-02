import { Link } from 'react-router'
import { APP_NAME } from '@solomon/shared'
import { ApiClientError } from '../api/client'
import { useHomeBalances } from '../api/queries'
import { forgetGroup, useDeviceState, type DeviceGroupEntry } from '../lib/device'
import { money } from '../lib/format'

function GroupCard({ gid, entry }: { gid: string; entry: DeviceGroupEntry }) {
  const balances = useHomeBalances(gid)

  if (balances.error instanceof ApiClientError && balances.error.status === 404) {
    return (
      <div className="row row-static">
        <div className="row-emoji">👻</div>
        <div className="row-main">
          <div className="row-title">{entry.name}</div>
          <div className="muted small">This group no longer exists</div>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => forgetGroup(gid)}>
          Remove
        </button>
      </div>
    )
  }

  const mine = entry.claimedParticipantId
    ? balances.data?.balances.find((b) => b.participantId === entry.claimedParticipantId)
    : undefined

  let sub = <span className="muted small">Tap to open</span>
  if (mine && balances.data) {
    if (mine.net > 0) sub = <span className="small positive">You get back {money(mine.net, balances.data.currency)}</span>
    else if (mine.net < 0) sub = <span className="small negative">You owe {money(-mine.net, balances.data.currency)}</span>
    else sub = <span className="muted small">You’re settled up</span>
  }

  return (
    <Link to={`/g/${gid}`} className="row" style={{ textDecoration: 'none' }}>
      <div className="row-emoji">🧾</div>
      <div className="row-main">
        <div className="row-title">{entry.name}</div>
        {sub}
      </div>
      <span className="muted">›</span>
    </Link>
  )
}

export function Home() {
  const device = useDeviceState()
  const entries = Object.entries(device.groups).sort((a, b) => b[1].lastVisitedAt - a[1].lastVisitedAt)

  return (
    <main className="shell">
      <div className="topbar">
        <h1 className="page-title">{APP_NAME}</h1>
        <Link to="/new" className="btn btn-primary">
          ＋ New group
        </Link>
      </div>

      {entries.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-emoji">⚖️</div>
            <p style={{ fontWeight: 600, color: 'var(--color-text)' }}>Split expenses without the fuss</p>
            <p className="small" style={{ marginTop: 'var(--space-2)' }}>
              Create a group, share its link with your people, and track who owes whom — no accounts, unlimited
              expenses, any currency.
            </p>
            <p style={{ marginTop: 'var(--space-4)' }}>
              <Link to="/new" className="btn btn-primary">
                Create your first group
              </Link>
            </p>
          </div>
        </div>
      ) : (
        <div className="card list">
          {entries.map(([gid, entry]) => (
            <GroupCard key={gid} gid={gid} entry={entry} />
          ))}
        </div>
      )}

      <p className="hint" style={{ marginTop: 'var(--space-4)' }}>
        Groups you visit on this device show up here. Opening a group’s link on another device adds it there too.
      </p>
    </main>
  )
}
