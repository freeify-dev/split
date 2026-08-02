import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { RateSource, SplitMode } from '@solomon/shared'

export const groups = sqliteTable('groups', {
  id: text('id').primaryKey(), // nanoid(21) — the capability
  name: text('name').notNull(),
  currency: text('currency').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const participants = sqliteTable(
  'participants',
  {
    id: text('id').primaryKey(), // nanoid(12)
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('participants_group_name_unique').on(t.groupId, t.name), index('participants_group_idx').on(t.groupId)],
)

export const expenses = sqliteTable(
  'expenses',
  {
    id: text('id').primaryKey(), // nanoid(12)
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    category: text('category').notNull().default('general'),
    currency: text('currency').notNull(),
    amount: integer('amount').notNull(), // minor units of `currency`
    date: text('date').notNull(), // 'YYYY-MM-DD' calendar date
    splitMode: text('split_mode').$type<SplitMode>().notNull(),
    isReimbursement: integer('is_reimbursement', { mode: 'boolean' }).notNull().default(false),
    rateNanos: integer('rate_nanos').notNull(), // LOCKED rate expense→group (×1e9)
    rateSource: text('rate_source').$type<RateSource>().notNull(),
    rateDate: text('rate_date'), // ECB banking day actually used
    notes: text('notes'),
    createdBy: text('created_by').references(() => participants.id, { onDelete: 'set null' }),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('expenses_group_list_idx').on(t.groupId, t.date, t.createdAt)],
)

export const expensePayers = sqliteTable(
  'expense_payers',
  {
    expenseId: text('expense_id')
      .notNull()
      .references(() => expenses.id, { onDelete: 'cascade' }),
    participantId: text('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'restrict' }),
    amount: integer('amount').notNull(), // minor units, expense currency; Σ per expense == expenses.amount
  },
  (t) => [primaryKey({ columns: [t.expenseId, t.participantId] }), index('expense_payers_participant_idx').on(t.participantId)],
)

export const expenseSplits = sqliteTable(
  'expense_splits',
  {
    expenseId: text('expense_id')
      .notNull()
      .references(() => expenses.id, { onDelete: 'cascade' }),
    participantId: text('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'restrict' }),
    owedAmount: integer('owed_amount').notNull(), // resolved minor units; Σ per expense == expenses.amount
    splitInput: integer('split_input'), // raw form value (exact→minor, percentage→bp, shares→weight)
  },
  (t) => [primaryKey({ columns: [t.expenseId, t.participantId] }), index('expense_splits_participant_idx').on(t.participantId)],
)

export const activity = sqliteTable(
  'activity',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    actorParticipantId: text('actor_participant_id').references(() => participants.id, { onDelete: 'set null' }),
    entityType: text('entity_type').$type<'group' | 'expense' | 'participant'>().notNull(),
    entityId: text('entity_id').notNull(),
    verb: text('verb').$type<'create' | 'update' | 'delete'>().notNull(),
    summary: text('summary').notNull(), // denormalized human string — survives entity deletion
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('activity_group_idx').on(t.groupId, t.id)],
)

export const fxRates = sqliteTable(
  'fx_rates',
  {
    date: text('date').notNull(), // ECB banking day
    currency: text('currency').notNull(), // quote currency; base is always EUR
    rateNanos: integer('rate_nanos').notNull(), // 1 EUR = rateNanos/1e9 <currency>
    fetchedAt: integer('fetched_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.date, t.currency] })],
)
