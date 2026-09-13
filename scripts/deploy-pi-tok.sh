#!/usr/bin/env bash
set -euo pipefail

# Deploy the committed br-orakel tree to a dedicated directory on pi-tok.
# This intentionally does not touch Caddy, DNS, or any other stack.
remote_host="${BR_ORAKEL_REMOTE_HOST:-pi-tok}"
remote_dir="${BR_ORAKEL_REMOTE_DIR:-/home/tkruke/services/br-orakel}"

git archive --format=tar HEAD \
  | ssh "$remote_host" "mkdir -p '$remote_dir' && tar -xf - -C '$remote_dir'"

ssh "$remote_host" "cd '$remote_dir' && docker compose -p br-orakel-demo -f docker-compose.yml -f deploy/docker-compose.pi-tok.yml up --build -d"

echo "br-orakel demo er bygget og startet på $remote_host (localhost:3010)."
