#!/usr/bin/env bash
# Nightly online backup of the SQLite database (safe while the server runs).
# Cron:  15 3 * * *  /opt/solomon/deploy/backup.sh >> /opt/solomon/data/backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
exec node server/dist/backup.js
