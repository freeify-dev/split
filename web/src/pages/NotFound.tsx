import { Link } from 'react-router'

export function NotFound() {
  return (
    <main className="shell">
      <div className="empty">
        <div className="empty-emoji">🧭</div>
        <p style={{ fontWeight: 600 }}>Nothing here</p>
        <p style={{ marginTop: 'var(--space-4)' }}>
          <Link to="/" className="btn btn-primary">
            Back to my groups
          </Link>
        </p>
      </div>
    </main>
  )
}
