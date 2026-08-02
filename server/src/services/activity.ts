import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { activity, participants } from '../db/schema'

/** Resolve the device's claimed identity header to a participant of this group, else null. */
export function resolveActor(db: Db, groupId: string, actorHeader: string | null): string | null {
  if (!actorHeader) return null
  const row = db
    .select({ id: participants.id })
    .from(participants)
    .where(and(eq(participants.id, actorHeader), eq(participants.groupId, groupId)))
    .get()
  return row?.id ?? null
}

export function writeActivity(
  db: Db,
  entry: {
    groupId: string
    actorId: string | null
    entityType: 'group' | 'expense' | 'participant'
    entityId: string
    verb: 'create' | 'update' | 'delete'
    summary: string
  },
): void {
  db.insert(activity)
    .values({
      groupId: entry.groupId,
      actorParticipantId: entry.actorId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      verb: entry.verb,
      summary: entry.summary,
      createdAt: Date.now(),
    })
    .run()
}
