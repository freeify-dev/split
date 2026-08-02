import { useInfiniteQuery } from '@tanstack/react-query'
import type { ActivityItemDto, ActivityPageDto } from '@solomon/shared'
import { api } from '../api/client'
import { qk } from '../api/queries'
import { timeAgo } from '../lib/format'
import { useGroupContext } from './GroupLayout'

const VERB_EMOJI: Record<ActivityItemDto['verb'], string> = {
  create: '✨',
  update: '✏️',
  delete: '🗑️',
}

export function ActivityTab() {
  const { group } = useGroupContext()
  const names = new Map(group.participants.map((p) => [p.id, p.name]))

  const activity = useInfiniteQuery({
    queryKey: qk.activity(group.id),
    queryFn: ({ pageParam }) =>
      api<ActivityPageDto>(`/api/groups/${group.id}/activity${pageParam ? `?before=${pageParam}` : ''}`),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    staleTime: 15_000,
  })

  if (activity.isPending) return <div className="skeleton">Loading activity…</div>
  if (activity.isError) return <p className="error-text">{activity.error.message}</p>

  const items = activity.data.pages.flatMap((page) => page.items)

  if (items.length === 0) {
    return (
      <div className="card">
        <div className="empty">
          <div className="empty-emoji">🌱</div>
          <p style={{ fontWeight: 600, color: 'var(--color-text)' }}>Nothing has happened yet</p>
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="card list">
        {items.map((item) => (
          <div key={item.id} className="row row-static">
            <div className="row-emoji" style={{ fontSize: '1rem' }}>
              {VERB_EMOJI[item.verb]}
            </div>
            <div className="row-main">
              <div style={{ fontWeight: 450 }}>
                {item.actorParticipantId && names.has(item.actorParticipantId) && (
                  <strong>{names.get(item.actorParticipantId)}: </strong>
                )}
                {item.summary}
              </div>
              <div className="muted small">{timeAgo(item.createdAt)}</div>
            </div>
          </div>
        ))}
      </div>
      {activity.hasNextPage && (
        <button
          type="button"
          className="btn btn-block"
          onClick={() => activity.fetchNextPage()}
          disabled={activity.isFetchingNextPage}
        >
          {activity.isFetchingNextPage ? 'Loading…' : 'Show older'}
        </button>
      )}
    </div>
  )
}
