import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'

export type Db = ReturnType<typeof drizzle<typeof schema>>

function migrationsFolder(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  // dev: src/db/../../drizzle ; prod bundle: dist/drizzle sits next to dist/index.js
  const candidates = [path.join(here, '../../drizzle'), path.join(here, 'drizzle')]
  const found = candidates.find((c) => fs.existsSync(c))
  if (!found) throw new Error(`drizzle migrations folder not found near ${here}`)
  return found
}

export function createDb(dbPath: string): { db: Db; sqlite: Database.Database } {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('busy_timeout = 5000')
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: migrationsFolder() })
  return { db, sqlite }
}

export function closeDb(sqlite: Database.Database): void {
  try {
    sqlite.pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    // checkpoint is best-effort during shutdown
  }
  sqlite.close()
}
