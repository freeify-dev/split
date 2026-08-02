#!/usr/bin/env bash
# One-command Docker deploy to a remote host over SSH.
#
#   ./deploy/deploy-docker.sh gansehafen          # or ganse-vps, or any ssh host
#   PORT=3210 ./deploy/deploy-docker.sh gansehafen  # publish on a different host port
#
# Ships the committed tree (git archive HEAD), builds the image on the server,
# and (re)starts the container with the persistent solomon-data volume.
set -euo pipefail
HOST=${1:?usage: deploy-docker.sh <ssh-host>}
PORT=${PORT:-3000}
cd "$(dirname "$0")/.."

if ! git diff-index --quiet HEAD --; then
  echo "note: uncommitted changes will NOT be deployed (git archive ships HEAD)" >&2
fi

git archive HEAD | ssh "$HOST" "
  set -e
  rm -rf /tmp/solomon-build && mkdir -p /tmp/solomon-build && tar -x -C /tmp/solomon-build
  cd /tmp/solomon-build
  docker build -f deploy/Dockerfile -t solomon:latest .
  docker rm -f solomon 2>/dev/null || true
  docker run -d --name solomon -p ${PORT}:3000 \
    -v solomon-data:/app/data --restart unless-stopped solomon:latest
  rm -rf /tmp/solomon-build
  for i in \$(seq 1 30); do curl -sf http://127.0.0.1:${PORT}/healthz >/dev/null && break; sleep 0.5; done
  curl -sf http://127.0.0.1:${PORT}/healthz > /dev/null && echo 'deployed + healthy on :${PORT}'
"
