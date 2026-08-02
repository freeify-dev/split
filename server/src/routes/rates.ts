import { Hono } from 'hono'
import { z } from 'zod'
import { isCurrencyCode, isValidDateString, type RateDto } from '@solomon/shared'
import type { AppEnv } from '../app'
import { requireParam, validate } from '../lib/errors'
import { getGroupOr404 } from './groups'

const querySchema = z.object({
  currency: z.string().refine(isCurrencyCode, 'Unknown currency'),
  date: z.string().refine(isValidDateString, 'Invalid date (expected YYYY-MM-DD)'),
})

export const rateRoutes = new Hono<AppEnv>()

/** Rate preview for the expense form: expense currency → group currency at a date. */
rateRoutes.get('/', validate('query', querySchema), async (c) => {
  const db = c.get('db')
  const group = getGroupOr404(db, requireParam(c, 'gid'))
  const { currency, date } = c.req.valid('query')
  const resolved: RateDto = await c.get('fx').resolveRate(currency, group.currency, date)
  return c.json(resolved)
})
