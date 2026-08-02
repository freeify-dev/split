#!/usr/bin/env bash
# Update the live instance at https://split.yoos.dev (gansehafen, compose-managed).
# Ships committed HEAD, rebuilds the image on the server, rolls the compose service.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! git diff-index --quiet HEAD --; then
  echo "note: uncommitted changes will NOT be deployed (git archive ships HEAD)" >&2
fi

git archive HEAD | ssh gansehafen '
  set -e
  rm -rf /tmp/solomon-build && mkdir -p /tmp/solomon-build && tar -x -C /tmp/solomon-build
  cd /tmp/solomon-build && docker build -f deploy/Dockerfile -t solomon:latest .
  rm -rf /tmp/solomon-build
  cd /srv/config && docker compose up -d solomon
  for i in $(seq 1 30); do curl -sf http://127.0.0.1:3003/healthz >/dev/null && break; sleep 0.5; done
  curl -sf http://127.0.0.1:3003/healthz >/dev/null && echo "deployed + healthy → https://split.yoos.dev"
'
