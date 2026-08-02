import path from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { closeDb, createDb } from './db/client'
import { env } from './env'
import { createFxService } from './services/fx'

const { db, sqlite } = createDb(path.join(env.dataDir, 'solomon.db'))
const fx = createFxService(db)
const stopFxRefresh = fx.startRefreshLoop()
const app = createApp(db, fx)

const server = serve({ fetch: app.fetch, port: env.port, hostname: env.host }, (info) => {
  console.log(`solomon listening on http://${info.address}:${info.port}`)
})

let shuttingDown = false
function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  console.log('shutting down…')
  const force = setTimeout(() => process.exit(1), 10_000)
  force.unref()
  stopFxRefresh()
  server.close(() => {
    closeDb(sqlite)
    process.exit(0)
  })
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
