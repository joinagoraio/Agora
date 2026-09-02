#!/usr/bin/env bash
set -euo pipefail

# Dump Postgres + document storage from the running Hetzner stack.
# Usage: bash scripts/deploy/backup.sh [output-dir]

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${1:-$ROOT_DIR/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${OUT_DIR}/${STAMP}"

mkdir -p "$DEST"

echo "Dumping Postgres..."
docker compose -f "$ROOT_DIR/infrastructure/supabase/docker-compose.yml" exec -T db \
  pg_dump -U postgres -d postgres --format=custom --no-owner \
  > "${DEST}/postgres.dump"

echo "Copying storage volume..."
docker run --rm \
  -v supabase_storage-data:/source:ro \
  -v "${DEST}:/backup" \
  alpine tar czf /backup/storage.tar.gz -C /source .

echo "Backup written to ${DEST}"
ls -lh "$DEST"
