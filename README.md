# Solomon

Self-hosted bill splitting for groups — the Splitwise core without the premium locks, and without accounts.

- **Groups by secret link.** Create a group, share its URL. Anyone with the link can view and add expenses; each device picks "I am X" once so balances show from their side. No sign-up, ever.
- **Unlimited expenses**, split equally, by exact amounts, percentages, or shares — with exact-to-the-cent allocation.
- **Any currency, one summary currency per group.** Daily ECB reference rates (via frankfurter.dev) are cached locally and **locked into each expense at its date**, so history never shifts; manual rate override always available, and the app keeps working if the rate feed is down.
- **Debt simplification** — the minimal practical set of "who pays whom" transfers, plus one-tap settle-up recording.
- **Activity log & CSV export** per group.
- **Installable PWA** — responsive mobile-first UI, add-to-home-screen on iOS/Android, reads cached data offline.
- **Built to self-host**: one Node process, one SQLite file, WAL mode, health endpoint, online backups.

## Stack

npm-workspaces monorepo: `shared/` (money math, balance fold, zod schemas — used identically by client and server), `server/` (Hono + better-sqlite3 + Drizzle), `web/` (React + Vite + TanStack Query, CSS design tokens). All money is integer minor units; FX rates are integer nanos; BigInt for products — floats never touch money.

## Development

```bash
nvm use             # Node 24 LTS (see .nvmrc)
npm install
npm run dev         # API on :3000, web (Vite) on :5173
npm test            # vitest: shared unit suite + server integration suite
npm run typecheck
```

The dev database lives at `server/data/solomon.db` (gitignored).

## Deployment

**Live instance:** https://split.yoos.dev — runs on gansehafen (compose service in
`/srv/config`, fronted by home caddy + the VPS edge). Update it with
`./deploy/deploy-gansehafen.sh`. Nightly backups land in `/srv/data/solomon/backups`
via `/etc/cron.d/solomon-backup`.

Generic options for any server — build once, run one process; it serves both the API
and the built web app on one port.

### Option A — release tarball (same OS/arch as the build machine)

```bash
./deploy/make-release.sh                     # → release/solomon-<sha>.tar.gz (~4 MB)
scp release/solomon-*.tar.gz yourserver:
# on the server (needs Node 24 — nvm install 24):
sudo mkdir -p /opt/solomon && sudo tar -C /opt/solomon --strip-components=1 -xzf solomon-*.tar.gz
cd /opt/solomon && node server/dist/index.js   # smoke test, then set up systemd (below)
```

The tarball contains only runtime artifacts — `server/dist/`, `web/dist/`, three
node_modules packages (better-sqlite3 + deps), and `deploy/`. **Caveat:** the native
SQLite binding is platform-specific; this works when the server matches the build
machine (linux x64, Node 24). Different platform → Option B/C.

### Option B — Docker

```bash
docker compose up -d --build        # builds the image and starts on :3000
curl localhost:3000/healthz         # → {"ok":true}
```

Data lives in the named volume `solomon-data`. Updating = `git pull` (or rsync the
source) then `docker compose up -d --build` — migrations apply on boot.

Backups under Docker (host crontab):

```bash
15 3 * * *  docker exec solomon node server/dist/backup.js
# pull backups out of the volume whenever you like:
docker cp solomon:/app/data/backups ./solomon-backups
# restore drill: stop, overwrite the db inside the volume, start
docker compose stop && docker run --rm -v solomon-data:/app/data -v "$PWD":/host \
  alpine cp /host/solomon-backups/solomon-YYYY-MM-DD.db /app/data/solomon.db && docker compose start
```

### Option C — build from source on the server

```bash
# on the server (rsync the source or clone your remote)
rsync -a --exclude node_modules --exclude data --exclude dist --exclude release \
  ./ yourserver:/opt/solomon/
cd /opt/solomon
nvm install && npm ci && npm run build
```

### systemd (for Options A and C)

```bash
sudo ln -sf "$(which node)" /usr/local/bin/node
sudo useradd -r -s /usr/sbin/nologin solomon && sudo chown -R solomon: /opt/solomon
sudo cp /opt/solomon/deploy/solomon.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now solomon
curl localhost:3000/healthz   # → {"ok":true}
```

### TLS / reverse proxy

Put Caddy (or nginx) in front — see [deploy/Caddyfile.example](deploy/Caddyfile.example) (3 lines, automatic HTTPS).

> **Secret-link caveat:** a group's URL *is* its key. Reverse-proxy access logs will contain those URLs — restrict who can read them. The app itself sends `Referrer-Policy: no-referrer` and `noindex` everywhere.

### Configuration (env vars)

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | listen port |
| `HOST` | `0.0.0.0` | bind address (use `127.0.0.1` behind a proxy) |
| `DATA_DIR` | `./data` | holds `solomon.db` and `backups/` |
| `STATIC_DIR` | `./web/dist` | built SPA to serve |

## Backups

Nightly online backup (safe while the server runs) + 14-day retention:

```bash
# crontab -e
15 3 * * *  /opt/solomon/deploy/backup.sh >> /opt/solomon/data/backups/backup.log 2>&1
```

**Restore drill** (do this once so it's boring in an emergency):

```bash
systemctl stop solomon
cp /opt/solomon/data/backups/solomon-YYYY-MM-DD.db /opt/solomon/data/solomon.db
systemctl start solomon
```

## Design notes

- **Balances always sum to zero.** Each expense's total is converted to the group currency once, then re-allocated across payers and shares (largest-remainder) — rounding can never leak a cent, even in mixed-currency groups.
- **Rates are locked, never silently re-rated.** Editing an expense keeps its stored rate unless you change its date/currency or override manually.
- **Settle-ups are just expenses** flagged `isReimbursement` — one code path for all balance math.
- **Concurrency**: better-sqlite3 is a single synchronous connection — writes are naturally serialized; concurrent edits are last-write-wins (fine at friends scale).
- Deferred for later: multi-payer UI (schema already supports it), recurring expenses, receipt photos, offline write queue, Capacitor store apps, websocket live updates (the app polls every 30 s and refetches on focus).
