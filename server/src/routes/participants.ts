import { and, count, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { participantCreateSchema, participantPatchSchema } from '@solomon/shared'
import type { AppEnv } from '../app'
import type { Db } from '../db/client'
import { expensePayers, expenseSplits, participants } from '../db/schema'
import { conflictError, notFoundError, requireParam, validate } from '../lib/errors'
import { newId } from '../lib/id'
import { resolveActor, writeActivity } from '../services/activity'
import { getGroupOr404 } from './groups'

function getParticipantOr404(db: Db, groupId: string, participantId: string) {
  const row = db
    .select()
    .from(participants)
    .where(and(eq(participants.id, participantId), eq(participants.groupId, groupId)))
    .get()
  if (!row) throw notFoundError()
  return row
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && 'code' in err && String((err as { code: unknown }).code).startsWith('SQLITE_CONSTRAINT')
}

export const participantRoutes = new Hono<AppEnv>()

participantRoutes.post('/', validate('json', participantCreateSchema), (c) => {
  const db = c.get('db')
  const group = getGroupOr404(db, requireParam(c, 'gid'))
  const { name } = c.req.valid('json')
  const actorId = resolveActor(db, group.id, c.get('actorHeader'))

  const id = newId()
  try {
    db.insert(participants).values({ id, groupId: group.id, name, createdAt: Date.now() }).run()
  } catch (err) {
    if (isUniqueViolation(err)) throw conflictError(`“${name}” is already in this group`)
    throw err
  }
  writeActivity(db, {
    groupId: group.id,
    actorId,
    entityType: 'participant',
    entityId: id,
    verb: 'create',
    summary: `Added ${name}`,
  })
  return c.json({ id, name }, 201)
})

participantRoutes.patch('/:pid', validate('json', participantPatchSchema), (c) => {
  const db = c.get('db')
  const group = getGroupOr404(db, requireParam(c, 'gid'))
  const participant = getParticipantOr404(db, group.id, requireParam(c, 'pid'))
  const { name } = c.req.valid('json')
  const actorId = resolveActor(db, group.id, c.get('actorHeader'))

  try {
    db.update(participants).set({ name }).where(eq(participants.id, participant.id)).run()
  } catch (err) {
    if (isUniqueViolation(err)) throw conflictError(`“${name}” is already in this group`)
    throw err
  }
  if (name !== participant.name) {
    writeActivity(db, {
      groupId: group.id,
      actorId,
      entityType: 'participant',
      entityId: participant.id,
      verb: 'update',
      summary: `Renamed ${participant.name} to ${name}`,
    })
  }
  return c.json({ id: participant.id, name })
})

participantRoutes.delete('/:pid', (c) => {
  const db = c.get('db')
  const group = getGroupOr404(db, requireParam(c, 'gid'))
  const participant = getParticipantOr404(db, group.id, requireParam(c, 'pid'))
  const actorId = resolveActor(db, group.id, c.get('actorHeader'))

  const payerRefs = db.select({ n: count() }).from(expensePayers).where(eq(expensePayers.participantId, participant.id)).get()
  const splitRefs = db.select({ n: count() }).from(expenseSplits).where(eq(expenseSplits.participantId, participant.id)).get()
  const references = (payerRefs?.n ?? 0) + (splitRefs?.n ?? 0)
  if (references > 0) {
    throw conflictError(`${participant.name} is part of existing expenses and can’t be removed`)
  }

  db.delete(participants).where(eq(participants.id, participant.id)).run()
  writeActivity(db, {
    groupId: group.id,
    actorId: actorId === participant.id ? null : actorId,
    entityType: 'participant',
    entityId: participant.id,
    verb: 'delete',
    summary: `Removed ${participant.name}`,
  })
  return c.body(null, 204)
})
