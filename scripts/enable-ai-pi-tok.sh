#!/usr/bin/env bash
set -euo pipefail

# Configure hosted OpenAI for the isolated br-orakel stacks on pi-tok.
# The key is sent over the existing SSH connection and is never written to Git,
# passed as a command-line argument, or included in the Docker image.
remote_host="${BR_ORAKEL_REMOTE_HOST:-pi-tok}"
remote_dir="${BR_ORAKEL_REMOTE_DIR:-/home/tkruke/services/br-orakel}"
model="${OPENAI_MODEL:-gpt-5.6-luna}"

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  read -r -s -p "OpenAI API-nøkkel (vises ikke): " OPENAI_API_KEY
  printf '\n'
fi

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "OpenAI API-nøkkel mangler." >&2
  exit 1
fi

if ssh "$remote_host" "test -f '$remote_dir/.env'"; then
  echo "Avbryter: $remote_dir/.env finnes allerede. Ikke overskriv runtime-konfigurasjonen automatisk." >&2
  echo "Oppdater filen manuelt på pi-tok etter å ha kontrollert innholdet." >&2
  exit 1
fi

{
  printf 'AI_PROVIDER=openai\n'
  printf 'OPENAI_MODEL=%s\n' "$model"
  printf 'OPENAI_MAX_OUTPUT_TOKENS=%s\n' "${OPENAI_MAX_OUTPUT_TOKENS:-12000}"
  printf 'OPENAI_MAX_CONTEXT_CHARS=%s\n' "${OPENAI_MAX_CONTEXT_CHARS:-1000000}"
  printf 'OPENAI_TIMEOUT_MS=%s\n' "${OPENAI_TIMEOUT_MS:-60000}"
  printf 'OPENAI_STORE_RESPONSES=%s\n' "${OPENAI_STORE_RESPONSES:-false}"
  printf 'OPENAI_API_KEY=%s\n' "$OPENAI_API_KEY"
} | ssh "$remote_host" "umask 077; mkdir -p '$remote_dir'; cat > '$remote_dir/.env'; chmod 600 '$remote_dir/.env'"

./scripts/deploy-pi-tok.sh

echo "Hosted OpenAI er aktivert for demo og test på $remote_host."
