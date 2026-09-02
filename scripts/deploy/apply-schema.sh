#!/usr/bin/env bash
set -euo pipefail

# Apply numbered schema scripts to a fresh self-hosted database.
# Prefer restore-dump.sh when you already have a working database.
#
# Usage: bash scripts/deploy/apply-schema.sh

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "Applying numbered SQL scripts from scripts/ to supabase-db..."
shopt -s nullglob
scripts=(scripts/[0-9][0-9][0-9]_*.sql)
if [[ ${#scripts[@]} -eq 0 ]]; then
  echo "ERROR: no numbered SQL scripts found"
  exit 1
fi

for file in "${scripts[@]}"; do
  echo "→ ${file}"
  docker compose -f infrastructure/supabase/docker-compose.yml exec -T db \
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$file"
done

echo "Schema apply finished."
