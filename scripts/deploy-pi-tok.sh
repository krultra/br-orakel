#!/usr/bin/env bash
set -euo pipefail

# Deploy the committed br-orakel tree to a dedicated directory on pi-tok.
# Default is test only. Set BR_ORAKEL_DEPLOY_TARGET=demo explicitly for demo.
# This intentionally does not touch Caddy, DNS, or any other stack.
remote_host="${BR_ORAKEL_REMOTE_HOST:-pi-tok}"
remote_dir="${BR_ORAKEL_REMOTE_DIR:-/home/tkruke/services/br-orakel}"
target="${BR_ORAKEL_DEPLOY_TARGET:-test}"
build_number="${ORAKEL_BUILD_NUMBER:-$(node --import tsx scripts/next-build-number.ts)}"
demo_release="${ORAKEL_DEMO_RELEASE:-0}"
version="${ORAKEL_VERSION:-}"
environment_name="$target"
default_version="2.${demo_release}.${build_number}"
container_name="br-orakel-test-br-orakel-test-1"

if [[ "$target" == "demo" ]]; then
  container_name="br-orakel-demo-br-orakel-1"
fi

if [[ "$target" != "test" && "$target" != "demo" ]]; then
  echo "Ugyldig BR_ORAKEL_DEPLOY_TARGET: $target (bruk test eller demo)" >&2
  exit 2
fi

git archive --format=tar HEAD \
  | ssh "$remote_host" "mkdir -p '$remote_dir' && if docker container inspect '$container_name' >/dev/null 2>&1; then mkdir -p '$remote_dir/backups' && if docker cp '$container_name:/app/data/runtime/demo-store.json' '$remote_dir/backups/demo-store-$target-\$(date +%Y%m%d-%H%M%S).json'; then echo 'br-orakel: tok backup av $target-store er opprettet.'; else echo 'ADVARSEL: klarte ikke å ta backup av $target-store.' >&2; fi; else echo 'INFO: ingen eksisterende $target-container å ta store-backup fra.'; fi && tar -xf - -C '$remote_dir'"

if [[ "$target" == "demo" ]]; then
  ssh "$remote_host" "cd '$remote_dir' && ORAKEL_VERSION='$version' ORAKEL_DEMO_RELEASE='$demo_release' ORAKEL_BUILD_NUMBER='$build_number' ORAKEL_ENVIRONMENT='$environment_name' BR_ORAKEL_HOST_PORT=3010 docker compose -p br-orakel-demo -f docker-compose.yml up --build -d"
  if [[ -n "$version" ]]; then
    echo "br-orakel demo er bygget og startet på $remote_host (localhost:3010), versjon $version."
  else
    echo "br-orakel demo er bygget og startet på $remote_host (localhost:3010), versjon $default_version."
  fi
else
  ssh "$remote_host" "cd '$remote_dir' && ORAKEL_VERSION='$version' ORAKEL_DEMO_RELEASE='$demo_release' ORAKEL_BUILD_NUMBER='$build_number' ORAKEL_ENVIRONMENT='$environment_name' BR_ORAKEL_HOST_PORT=3020 docker compose -p br-orakel-test -f docker-compose.test.yml up --build -d"
  if [[ -n "$version" ]]; then
    echo "br-orakel test er bygget og startet på $remote_host (localhost:3020), versjon $version."
  else
    echo "br-orakel test er bygget og startet på $remote_host (localhost:3020), versjon $default_version."
  fi
fi
