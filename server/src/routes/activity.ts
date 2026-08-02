import { and, desc, eq, lt } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { ActivityPageDto } from '@solomon/shared'
import type { AppEnv } from '../app'
import { activity } from '../db/schema'
import { requireParam, validate } from '../lib/errors'
import { getGroupOr404 } from './groups'

const querySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const activityRoutes = new Hono<AppEnv>()

activityRoutes.get('/', validate('query', querySchema), (c) => {
  const db = c.get('db')
  const group = getGroupOr404(db, requireParam(c, 'gid'))
  const { before, limit } = c.req.valid('query')

  const rows = db
    .select()
    .from(activity)
    .where(and(eq(activity.groupId, group.id), before !== undefined ? lt(activity.id, before) : undefined))
    .orderBy(desc(activity.id))
    .limit(limit + 1)
    .all()

  const items = rows.slice(0, limit).map((row) => ({
    id: row.id,
    actorParticipantId: row.actorParticipantId,
    entityType: row.entityType,
    entityId: row.entityId,
    verb: row.verb,
    summary: row.summary,
    createdAt: row.createdAt,
  }))
  const page: ActivityPageDto = {
    items,
    nextBefore: rows.length > limit ? items[items.length - 1]!.id : null,
  }
  return c.json(page)
})
