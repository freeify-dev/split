/**
 * Online SQLite backup — safe while the server is running (WAL mode).
 * Run from the repo root: `node server/dist/backup.js` (or `npx tsx server/scripts/backup.ts` in dev).
 * Cron example:  15 3 * * *  cd /opt/solomon && node server/dist/backup.js >> data/backups/backup.log 2>&1
 */
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

const KEEP_DAYS = 14

const dataDir = path.resolve(process.env.DATA_DIR ?? 'data')
const source = path.join(dataDir, 'solomon.db')
const backupsDir = path.join(dataDir, 'backups')

if (!fs.existsSync(source)) {
  console.error(`no database at ${source}`)
  process.exit(1)
}
fs.mkdirSync(backupsDir, { recursive: true })

const stamp = new Date().toISOString().slice(0, 10)
const destination = path.join(backupsDir, `solomon-${stamp}.db`)

const db = new Database(source, { readonly: true, fileMustExist: true })
await db.backup(destination)
db.close()
console.log(`${new Date().toISOString()} backed up → ${destination}`)

const cutoff = Date.now() - KEEP_DAYS * 86_400_000
for (const file of fs.readdirSync(backupsDir)) {
  if (!/^solomon-\d{4}-\d{2}-\d{2}\.db$/.test(file)) continue
  const full = path.join(backupsDir, file)
  if (fs.statSync(full).mtimeMs < cutoff) {
    fs.unlinkSync(full)
    console.log(`pruned ${file}`)
  }
}
