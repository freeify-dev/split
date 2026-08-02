import { Hono } from 'hono'
import { computeBalances, simplifyDebts, type BalancesDto } from '@solomon/shared'
import type { AppEnv } from '../app'
import { requireParam } from '../lib/errors'
import { getGroupOr404, groupParticipants } from './groups'
import { loadExpenseDtos } from './expenses'

export const balanceRoutes = new Hono<AppEnv>()

balanceRoutes.get('/', (c) => {
  const db = c.get('db')
  const group = getGroupOr404(db, requireParam(c, 'gid'))
  const participantIds = groupParticipants(db, group.id).map((p) => p.id)
  const expenseDtos = loadExpenseDtos(db, group.id)

  const balances = computeBalances(group.currency, expenseDtos, participantIds)
  const response: BalancesDto = {
    currency: group.currency,
    balances,
    transfers: simplifyDebts(balances),
  }
  return c.json(response)
})
