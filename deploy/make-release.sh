#!/usr/bin/env bash
# Build everything and assemble a self-contained release tarball.
#
#   ./deploy/make-release.sh            → release/solomon-<git-sha>.tar.gz
#
# The tarball contains ONLY runtime artifacts (~16 MB):
#   server/dist/        bundled server + backup job + drizzle migrations
#   web/dist/           built SPA
#   node_modules/       just better-sqlite3 + its two runtime deps
#   deploy/             systemd unit, backup.sh, Caddyfile example
#   package.json        marker with the release version
#
# CAVEAT: better-sqlite3 ships a native binary — the tarball only works on a
# server with the same OS/arch as this machine (linux x64) and the same Node
# major version. Different platform? Build on the server instead (see README).
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build

SHA=$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d)
OUT="release/solomon-${SHA}"
rm -rf release && mkdir -p "$OUT"/node_modules

cp -r server/dist "$OUT/server-dist-tmp"
mkdir -p "$OUT/server" && mv "$OUT/server-dist-tmp" "$OUT/server/dist"
cp -r web/dist "$OUT/web-dist-tmp"
mkdir -p "$OUT/web" && mv "$OUT/web-dist-tmp" "$OUT/web/dist"
cp -r node_modules/better-sqlite3 node_modules/bindings node_modules/file-uri-to-path "$OUT/node_modules/"
# prebuild-install is install-time only — drop it from the copied package to keep npm quiet
cp -r deploy "$OUT/deploy"
printf '{\n  "name": "solomon-release",\n  "private": true,\n  "version": "%s",\n  "type": "module"\n}\n' "$SHA" > "$OUT/package.json"

tar -C release -czf "release/solomon-${SHA}.tar.gz" "solomon-${SHA}"
echo
echo "release/solomon-${SHA}.tar.gz  ($(du -h "release/solomon-${SHA}.tar.gz" | cut -f1))"
echo "unpack on the server, then:  node server/dist/index.js"
