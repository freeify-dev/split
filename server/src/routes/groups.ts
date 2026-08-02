import { asc, count, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { groupCreateSchema, groupPatchSchema, type GroupDto } from '@solomon/shared'
import type { AppEnv } from '../app'
import type { Db } from '../db/client'
import { expenses, groups, participants } from '../db/schema'
import { conflictError, notFoundError, validate } from '../lib/errors'
import { newGroupId, newId } from '../lib/id'
import { resolveActor, writeActivity } from '../services/activity'

export function getGroupOr404(db: Db, groupId: string) {
  const group = db.select().from(groups).where(eq(groups.id, groupId)).get()
  if (!group) throw notFoundError()
  return group
}

export function groupParticipants(db: Db, groupId: string) {
  return db
    .select()
    .from(participants)
    .where(eq(participants.groupId, groupId))
    .orderBy(asc(participants.createdAt), sql`rowid`) // rowid keeps insertion order within one ms
    .all()
}

export function toGroupDto(db: Db, group: typeof groups.$inferSelect): GroupDto {
  return {
    id: group.id,
    name: group.name,
    currency: group.currency,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    participants: groupParticipants(db, group.id).map((p) => ({ id: p.id, name: p.name })),
  }
}

export const groupRoutes = new Hono<AppEnv>()

groupRoutes.post('/', validate('json', groupCreateSchema), (c) => {
  const db = c.get('db')
  const input = c.req.valid('json')
  const now = Date.now()
  const groupId = newGroupId()

  db.transaction((tx) => {
    tx.insert(groups).values({ id: groupId, name: input.name, currency: input.currency, createdAt: now, updatedAt: now }).run()
    for (const p of input.participants) {
      tx.insert(participants).values({ id: newId(), groupId, name: p.name, createdAt: now }).run()
    }
  })
  writeActivity(c.get('db'), {
    groupId,
    actorId: null,
    entityType: 'group',
    entityId: groupId,
    verb: 'create',
    summary: `Group “${input.name}” created`,
  })

  const group = getGroupOr404(db, groupId)
  return c.json(toGroupDto(db, group), 201)
})

groupRoutes.get('/:gid', (c) => {
  const db = c.get('db')
  const group = getGroupOr404(db, c.req.param('gid'))
  return c.json(toGroupDto(db, group))
})

groupRoutes.patch('/:gid', validate('json', groupPatchSchema), (c) => {
  const db = c.get('db')
  const group = getGroupOr404(db, c.req.param('gid'))
  const input = c.req.valid('json')
  const actorId = resolveActor(db, group.id, c.get('actorHeader'))

  if (input.currency && input.currency !== group.currency) {
    const expenseCount = db.select({ n: count() }).from(expenses).where(eq(expenses.groupId, group.id)).get()
    if ((expenseCount?.n ?? 0) > 0) {
      throw conflictError('The currency can only be changed while the group has no expenses')
    }
  }

  db.update(groups)
    .set({
      name: input.name ?? group.name,
      currency: input.currency ?? group.currency,
      updatedAt: Date.now(),
    })
    .where(eq(groups.id, group.id))
    .run()

  const summaries: string[] = []
  if (input.name && input.name !== group.name) summaries.push(`renamed the group to “${input.name}”`)
  if (input.currency && input.currency !== group.currency) summaries.push(`changed the currency to ${input.currency}`)
  if (summaries.length > 0) {
    writeActivity(db, {
      groupId: group.id,
      actorId,
      entityType: 'group',
      entityId: group.id,
      verb: 'update',
      summary: summaries.join(' and '),
    })
  }

  return c.json(toGroupDto(db, getGroupOr404(db, group.id)))
})

groupRoutes.delete('/:gid', (c) => {
  const db = c.get('db')
  const group = getGroupOr404(db, c.req.param('gid'))

  // Order matters, and a single `delete from groups` does NOT work.
  //
  // Deleting a group cascades to both participants and expenses. But
  // expense_payers and expense_splits reference participants with ON DELETE
  // RESTRICT, and SQLite enforces that restriction before the expense cascade
  // has removed the referencing rows — so the whole statement fails with
  // "FOREIGN KEY constraint failed" for any group that has an expense.
  //
  // The RESTRICT is right and should stay: deleting a single participant who
  // appears in an expense would silently corrupt the ledger. So clear the
  // expenses first (which cascades payers and splits), leaving the group delete
  // to cascade only participants and activity.
  db.transaction((tx) => {
    tx.delete(expenses).where(eq(expenses.groupId, group.id)).run()
    tx.delete(groups).where(eq(groups.id, group.id)).run()
  })
  return c.body(null, 204)
})
