import fs from 'node:fs'
import path from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import type { Db } from './db/client'
import { env } from './env'
import { errorResponse } from './lib/errors'
import { createFxService, type FxService } from './services/fx'
import { activityRoutes } from './routes/activity'
import { balanceRoutes } from './routes/balances'
import { expenseRoutes } from './routes/expenses'
import { exportRoutes } from './routes/export'
import { groupRoutes } from './routes/groups'
import { participantRoutes } from './routes/participants'
import { rateRoutes } from './routes/rates'

export type AppEnv = {
  Variables: {
    db: Db
    fx: FxService
    actorHeader: string | null
  }
}

export function createApp(db: Db, fx: FxService = createFxService(db)) {
  const app = new Hono<AppEnv>()

  if (process.env.VITEST === undefined) app.use(logger())
  app.use(async (c, next) => {
    c.set('db', db)
    c.set('fx', fx)
    c.set('actorHeader', c.req.header('x-solomon-actor') ?? null)
    await next()
    c.header('Referrer-Policy', 'no-referrer')
    c.header('X-Robots-Tag', 'noindex')
    const p = c.req.path
    if (p.startsWith('/assets/') || p.startsWith('/workbox-')) {
      c.header('Cache-Control', 'public, max-age=31536000, immutable')
    } else if (['/', '/index.html', '/sw.js', '/registerSW.js', '/manifest.webmanifest'].includes(p)) {
      c.header('Cache-Control', 'no-cache') // deploys must propagate promptly
    }
  })
  app.onError((err, c) => errorResponse(c, err))
  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404))

  app.get('/healthz', (c) => {
    c.get('db').get(sql`select 1`)
    return c.json({ ok: true })
  })

  app.route('/api/groups', groupRoutes)
  app.route('/api/groups/:gid/participants', participantRoutes)
  app.route('/api/groups/:gid/activity', activityRoutes)
  app.route('/api/groups/:gid/expenses', expenseRoutes)
  app.route('/api/groups/:gid/balances', balanceRoutes)
  app.route('/api/groups/:gid/rate', rateRoutes)
  app.route('/api/groups/:gid/export.csv', exportRoutes)

  // Production: the same process serves the built SPA (in dev, Vite does and this dir is absent).
  if (fs.existsSync(env.staticDir)) {
    const root = path.relative(process.cwd(), env.staticDir)
    app.use('*', serveStatic({ root }))
    app.get('*', (c, next) => {
      if (c.req.path.startsWith('/api/')) return next() // fall through to the JSON 404
      return serveStatic({ root, path: 'index.html' })(c, next) // SPA fallback for /g/… deep links
    })
  }

  return app
}
