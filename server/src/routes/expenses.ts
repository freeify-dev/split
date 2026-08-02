import { desc, eq, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import {
  allocate,
  expenseInputSchema,
  minorToDecimalString,
  type ExpenseDto,
  type ExpenseInput,
} from '@solomon/shared'
import type { AppEnv } from '../app'
import type { Db } from '../db/client'
import { expensePayers, expenses, expenseSplits } from '../db/schema'
import { ApiError, notFoundError, requireParam, validate } from '../lib/errors'
import { newId } from '../lib/id'
import type { ResolvedRate } from '../services/fx'
import { resolveActor, writeActivity } from '../services/activity'
import { getGroupOr404, groupParticipants } from './groups'

type ExpenseRow = typeof expenses.$inferSelect

/** All expenses of a group, newest first, with payers and splits inlined. */
export function loadExpenseDtos(db: Db, groupId: string): ExpenseDto[] {
  const rows = db
    .select()
    .from(expenses)
    .where(eq(expenses.groupId, groupId))
    .orderBy(desc(expenses.date), desc(expenses.createdAt))
    .all()
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id)
  // rowid ordering = insertion order (composite-PK index scans would sort by random participant id)
  const payers = db.select().from(expensePayers).where(inArray(expensePayers.expenseId, ids)).orderBy(sql`rowid`).all()
  const splits = db.select().from(expenseSplits).where(inArray(expenseSplits.expenseId, ids)).orderBy(sql`rowid`).all()

  const payersByExpense = new Map<string, { participantId: string; amount: number }[]>()
  for (const p of payers) {
    const list = payersByExpense.get(p.expenseId) ?? []
    list.push({ participantId: p.participantId, amount: p.amount })
    payersByExpense.set(p.expenseId, list)
  }
  const splitsByExpense = new Map<string, { participantId: string; owedAmount: number; splitInput: number | null }[]>()
  for (const s of splits) {
    const list = splitsByExpense.get(s.expenseId) ?? []
    list.push({ participantId: s.participantId, owedAmount: s.owedAmount, splitInput: s.splitInput })
    splitsByExpense.set(s.expenseId, list)
  }

  return rows.map((row) => toDto(row, payersByExpense.get(row.id) ?? [], splitsByExpense.get(row.id) ?? []))
}

function toDto(
  row: ExpenseRow,
  payers: { participantId: string; amount: number }[],
  splits: { participantId: string; owedAmount: number; splitInput: number | null }[],
): ExpenseDto {
  return {
    id: row.id,
    groupId: row.groupId,
    description: row.description,
    category: row.category,
    currency: row.currency,
    amount: row.amount,
    date: row.date,
    splitMode: row.splitMode,
    isReimbursement: row.isReimbursement,
    rateNanos: row.rateNanos,
    rateSource: row.rateSource,
    rateDate: row.rateDate,
    notes: row.notes,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    payers,
    splits,
  }
}

function getExpenseRowOr404(db: Db, groupId: string, expenseId: string): ExpenseRow {
  const row = db.select().from(expenses).where(eq(expenses.id, expenseId)).get()
  if (!row || row.groupId !== groupId) throw notFoundError()
  return row
}

function getExpenseDto(db: Db, groupId: string, expenseId: string): ExpenseDto {
  const row = getExpenseRowOr404(db, groupId, expenseId)
  const payers = db.select().from(expensePayers).where(eq(expensePayers.expenseId, row.id)).orderBy(sql`rowid`).all()
  const splits = db.select().from(expenseSplits).where(eq(expenseSplits.expenseId, row.id)).orderBy(sql`rowid`).all()
  return toDto(
    row,
    payers.map((p) => ({ participantId: p.participantId, amount: p.amount })),
    splits.map((s) => ({ participantId: s.participantId, owedAmount: s.owedAmount, splitInput: s.splitInput })),
  )
}

function assertMembers(db: Db, groupId: string, input: ExpenseInput): void {
  const memberIds = new Set(groupParticipants(db, groupId).map((p) => p.id))
  const referenced = [input.paidBy, ...input.splits.map((s) => s.participantId)]
  if (referenced.some((id) => !memberIds.has(id))) {
    throw new ApiError(422, 'VALIDATION', 'Expense references someone who is not in this group')
  }
}

/** Resolve owed minor amounts per split row (aligned with input order). */
function computeOwedAmounts(input: ExpenseInput): number[] {
  switch (input.splitMode) {
    case 'equal':
      return allocate(input.amount, input.splits.map(() => 1))
    case 'exact':
      return input.splits.map((s) => s.splitInput!) // schema validated Σ == amount
    case 'percentage':
    case 'shares':
      return allocate(input.amount, input.splits.map((s) => s.splitInput!))
  }
}

function amountLabel(amount: number, currency: string): string {
  return `${minorToDecimalString(amount, currency)} ${currency}`
}

function createSummary(db: Db, groupId: string, input: ExpenseInput): string {
  if (input.isReimbursement) {
    const names = new Map(groupParticipants(db, groupId).map((p) => [p.id, p.name]))
    const payer = names.get(input.paidBy) ?? 'Someone'
    const recipient = names.get(input.splits[0]!.participantId) ?? 'someone'
    return `${payer} paid ${recipient} ${amountLabel(input.amount, input.currency)}`
  }
  return `Added “${input.description}” · ${amountLabel(input.amount, input.currency)}`
}

/** Write expense + payers + splits atomically. */
function writeExpenseRows(
  db: Db,
  expenseId: string,
  groupId: string,
  input: ExpenseInput,
  rate: ResolvedRate,
  owed: number[],
  actorId: string | null,
  createdAt: number,
  replaceExisting: boolean,
): void {
  db.transaction((tx) => {
    const now = Date.now()
    const base = {
      groupId,
      description: input.description,
      category: input.category,
      currency: input.currency,
      amount: input.amount,
      date: input.date,
      splitMode: input.splitMode,
      isReimbursement: input.isReimbursement,
      rateNanos: rate.rateNanos,
      rateSource: rate.source,
      rateDate: rate.rateDate,
      notes: input.notes ?? null,
      updatedAt: now,
    }
    if (replaceExisting) {
      tx.update(expenses).set(base).where(eq(expenses.id, expenseId)).run()
      tx.delete(expensePayers).where(eq(expensePayers.expenseId, expenseId)).run()
      tx.delete(expenseSplits).where(eq(expenseSplits.expenseId, expenseId)).run()
    } else {
      tx.insert(expenses)
        .values({ ...base, id: expenseId, createdBy: actorId, createdAt })
        .run()
    }
    tx.insert(expensePayers).values({ expenseId, participantId: input.paidBy, amount: input.amount }).run()
    tx.insert(expenseSplits)
      .values(
        input.splits.map((s, i) => ({
          expenseId,
          participantId: s.participantId,
          owedAmount: owed[i]!,
          splitInput: input.splitMode === 'equal' ? null : (s.splitInput ?? null),
        })),
      )
      .run()
  })
}

export const expenseRoutes = new Hono<AppEnv>()

expenseRoutes.get('/', (c) => {
  const db = c.get('db')
  const group = getGroupOr404(db, requireParam(c, 'gid'))
  return c.json(loadExpenseDtos(db, group.id))
})

expenseRoutes.get('/:eid', (c) => {
  const db = c.get('db')
  const group = getGroupOr404(db, requireParam(c, 'gid'))
  return c.json(getExpenseDto(db, group.id, requireParam(c, 'eid')))
})

expenseRoutes.post('/', validate('json', expenseInputSchema), async (c) => {
  const db = c.get('db')
  const group = getGroupOr404(db, requireParam(c, 'gid'))
  const input = c.req.valid('json')
  assertMembers(db, group.id, input)
  const actorId = resolveActor(db, group.id, c.get('actorHeader'))

  const rate: ResolvedRate =
    typeof input.rateOverrideNanos === 'number'
      ? { rateNanos: input.rateOverrideNanos, rateDate: null, source: 'manual' }
      : await c.get('fx').resolveRate(input.currency, group.currency, input.date)

  const owed = computeOwedAmounts(input)
  const id = newId()
  writeExpenseRows(db, id, group.id, input, rate, owed, actorId, Date.now(), false)
  writeActivity(db, {
    groupId: group.id,
    actorId,
    entityType: 'expense',
    entityId: id,
    verb: 'create',
    summary: createSummary(db, group.id, input),
  })
  return c.json(getExpenseDto(db, group.id, id), 201)
})

expenseRoutes.put('/:eid', validate('json', expenseInputSchema), async (c) => {
  const db = c.get('db')
  const group = getGroupOr404(db, requireParam(c, 'gid'))
  const existing = getExpenseRowOr404(db, group.id, requireParam(c, 'eid'))
  const input = c.req.valid('json')
  assertMembers(db, group.id, input)
  const actorId = resolveActor(db, group.id, c.get('actorHeader'))

  let rate: ResolvedRate
  if (typeof input.rateOverrideNanos === 'number') {
    rate = { rateNanos: input.rateOverrideNanos, rateDate: null, source: 'manual' }
  } else if (
    input.currency !== existing.currency ||
    input.date !== existing.date ||
    (input.rateOverrideNanos === null && existing.rateSource === 'manual')
  ) {
    rate = await c.get('fx').resolveRate(input.currency, group.currency, input.date)
  } else {
    // nothing rate-relevant changed → keep the locked rate, never silently re-rate
    rate = { rateNanos: existing.rateNanos, rateDate: existing.rateDate, source: existing.rateSource }
  }

  const owed = computeOwedAmounts(input)
  writeExpenseRows(db, existing.id, group.id, input, rate, owed, actorId, existing.createdAt, true)
  writeActivity(db, {
    groupId: group.id,
    actorId,
    entityType: 'expense',
    entityId: existing.id,
    verb: 'update',
    summary: input.isReimbursement
      ? `Edited a payment · ${amountLabel(input.amount, input.currency)}`
      : `Edited “${input.description}”`,
  })
  return c.json(getExpenseDto(db, group.id, existing.id))
})

expenseRoutes.delete('/:eid', (c) => {
  const db = c.get('db')
  const group = getGroupOr404(db, requireParam(c, 'gid'))
  const existing = getExpenseRowOr404(db, group.id, requireParam(c, 'eid'))
  const actorId = resolveActor(db, group.id, c.get('actorHeader'))

  db.delete(expenses).where(eq(expenses.id, existing.id)).run() // cascades payers/splits
  writeActivity(db, {
    groupId: group.id,
    actorId,
    entityType: 'expense',
    entityId: existing.id,
    verb: 'delete',
    summary: existing.isReimbursement
      ? `Deleted a payment · ${amountLabel(existing.amount, existing.currency)}`
      : `Deleted “${existing.description}” · ${amountLabel(existing.amount, existing.currency)}`,
  })
  return c.body(null, 204)
})
