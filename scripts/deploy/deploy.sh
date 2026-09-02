#!/usr/bin/env bash
set -euo pipefail

# Deploy Agora on the VPS. Run as the agora user from the repo root.
#
# Prerequisites:
#   - Docker + Compose
#   - DNS: $AGORA_APP_DOMAIN and $AGORA_API_DOMAIN → this box
#   - infrastructure/supabase/.env filled
#   - .env.production filled
#
# Usage:
#   cd ~/Agora
#   bash scripts/deploy/deploy.sh

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f infrastructure/supabase/.env ]]; then
  echo "ERROR: infrastructure/supabase/.env is missing."
  echo "Copy infrastructure/supabase/env.example, then run: node scripts/deploy/generate-keys.mjs"
  exit 1
fi

if [[ ! -f .env.production ]]; then
  echo "ERROR: .env.production is missing."
  echo "Copy .env.production.example and fill domain, keys, and OpenAI."
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.production
set +a

if [[ -z "${AGORA_APP_DOMAIN:-}" || -z "${AGORA_API_DOMAIN:-}" || -z "${ACME_EMAIL:-}" ]]; then
  echo "ERROR: AGORA_APP_DOMAIN, AGORA_API_DOMAIN, and ACME_EMAIL must be set in .env.production"
  exit 1
fi

echo "=== Starting self-hosted Supabase ==="
docker compose \
  -f infrastructure/supabase/docker-compose.yml \
  --env-file infrastructure/supabase/.env \
  up -d

echo "Waiting for Postgres..."
for i in $(seq 1 90); do
  if docker compose -f infrastructure/supabase/docker-compose.yml exec -T db pg_isready -U postgres >/dev/null 2>&1; then
    echo "Postgres is ready."
    break
  fi
  if [[ "$i" -eq 90 ]]; then
    echo "ERROR: Postgres did not become ready."
    exit 1
  fi
  sleep 2
done

echo "=== Building and starting Agora app + Caddy ==="
docker compose \
  -f infrastructure/docker-compose.yml \
  --env-file .env.production \
  up -d --build

echo ""
echo "=== Deploy complete ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "App:  https://${AGORA_APP_DOMAIN}"
echo "API:  https://${AGORA_API_DOMAIN}"
echo ""
echo "Load schema/data next if this is a new database:"
echo "  bash scripts/deploy/restore-dump.sh /path/to/agora.dump"
echo "  # or: bash scripts/deploy/apply-schema.sh"
echo ""
echo "Nightly backup:"
echo "  bash scripts/deploy/backup.sh"
