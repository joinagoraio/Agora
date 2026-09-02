#!/usr/bin/env bash
set -euo pipefail

# Restore a pg_dump custom file into the self-hosted database.
# Usage: bash scripts/deploy/restore-dump.sh /path/to/agora.dump

DUMP_PATH="${1:?Pass path to a pg_dump custom file}"
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ ! -f "$DUMP_PATH" ]]; then
  echo "ERROR: dump not found: ${DUMP_PATH}"
  exit 1
fi

echo "Restoring ${DUMP_PATH} into supabase-db..."
docker compose -f "$ROOT_DIR/infrastructure/supabase/docker-compose.yml" exec -T db \
  pg_restore -U postgres -d postgres --no-owner --clean --if-exists < "$DUMP_PATH"

echo "Restore finished."
