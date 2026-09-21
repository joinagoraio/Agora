#!/usr/bin/env bash
set -euo pipefail

# Called from GitHub Actions. Syncs this checkout to the VPS and runs deploy.sh.
# Secrets: HETZNER_HOST, HETZNER_USER, HETZNER_SSH_KEY
# Does not overwrite .env.production or infrastructure/supabase/.env on the box.

HETZNER_HOST="${HETZNER_HOST:?}"
HETZNER_USER="${HETZNER_USER:?}"
HETZNER_SSH_KEY="${HETZNER_SSH_KEY:?}"
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

KEY_FILE="$(mktemp)"
trap 'rm -f "$KEY_FILE"' EXIT
printf '%s\n' "$HETZNER_SSH_KEY" > "$KEY_FILE"
chmod 600 "$KEY_FILE"

mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
ssh-keyscan -H "$HETZNER_HOST" >> "$HOME/.ssh/known_hosts" 2>/dev/null

SSH=(ssh -i "$KEY_FILE" -o IdentitiesOnly=yes -o BatchMode=yes
  -o ServerAliveInterval=30 -o ServerAliveCountMax=20)
RSYNC=(rsync -az --delete
  -e "ssh -i $KEY_FILE -o IdentitiesOnly=yes -o BatchMode=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=20"
  --exclude '.git/'
  --exclude 'node_modules/'
  --exclude '.next/'
  --exclude 'test-results/'
  --exclude 'coverage/'
  --exclude 'backups/'
  --exclude '.env'
  --exclude '.env.local'
  --exclude '.env.production'
  --exclude 'infrastructure/supabase/.env'
  --exclude 'supabase/.temp/'
)

"${SSH[@]}" "${HETZNER_USER}@${HETZNER_HOST}" "mkdir -p ~/Agora"
"${RSYNC[@]}" "$ROOT_DIR/" "${HETZNER_USER}@${HETZNER_HOST}:~/Agora/"
"${SSH[@]}" "${HETZNER_USER}@${HETZNER_HOST}" "cd ~/Agora && bash scripts/deploy/deploy.sh"
