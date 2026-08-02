import { Hono } from 'hono'
import { convertMinor, minorToDecimalString, rateNanosToDecimalString } from '@solomon/shared'
import type { AppEnv } from '../app'
import { requireParam } from '../lib/errors'
import { getGroupOr404, groupParticipants } from './groups'
import { loadExpenseDtos } from './expenses'

/** Neutralize spreadsheet formula injection, then apply RFC-4180 quoting. */
function csvCell(raw: string): string {
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return /[",\n\r]/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded
}

export const exportRoutes = new Hono<AppEnv>()

exportRoutes.get('/', (c) => {
  const db = c.get('db')
  const group = getGroupOr404(db, requireParam(c, 'gid'))
  const participants = groupParticipants(db, group.id)
  const names = new Map(participants.map((p) => [p.id, p.name]))
  const expenseDtos = loadExpenseDtos(db, group.id).reverse() // chronological

  const header = [
    'Date',
    'Description',
    'Category',
    'Payment',
    'Currency',
    'Amount',
    `Rate (${group.currency})`,
    `Amount (${group.currency})`,
    'Paid by',
    'Split mode',
    ...participants.map((p) => `Owed by ${p.name}`),
  ]

  const lines = [header.map(csvCell).join(',')]
  for (const expense of expenseDtos) {
    const converted = convertMinor(expense.amount, expense.currency, group.currency, expense.rateNanos)
    const owedBy = new Map(expense.splits.map((s) => [s.participantId, s.owedAmount]))
    const row = [
      expense.date,
      expense.description,
      expense.category,
      expense.isReimbursement ? 'yes' : '',
      expense.currency,
      minorToDecimalString(expense.amount, expense.currency),
      rateNanosToDecimalString(expense.rateNanos),
      minorToDecimalString(converted, group.currency),
      expense.payers.map((p) => names.get(p.participantId) ?? '?').join(' + '),
      expense.splitMode,
      ...participants.map((p) => {
        const owed = owedBy.get(p.id)
        return owed === undefined ? '' : minorToDecimalString(owed, expense.currency)
      }),
    ]
    lines.push(row.map(csvCell).join(','))
  }

  const filename = `${group.name.replace(/[^A-Za-z0-9-_ ]/g, '').trim() || 'solomon'}.csv`
  return c.body('\uFEFF' + lines.join('\r\n') + '\r\n', 200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="${filename}"`,
  })
})
