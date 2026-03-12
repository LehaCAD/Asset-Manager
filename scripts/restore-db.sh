#!/bin/bash
set -e

DUMP_FILE="${1:?Usage: ./restore-db.sh <path-to-backup.sql>}"

if [ ! -f "$DUMP_FILE" ]; then
  echo "Error: File $DUMP_FILE not found"
  exit 1
fi

CONTAINER=$(docker compose -f docker-compose.production.yml ps -q db 2>/dev/null || true)
if [ -z "$CONTAINER" ]; then
  echo "Error: PostgreSQL container (db) not running. Start with: docker compose -f docker-compose.production.yml up -d db"
  exit 1
fi

echo "Restoring from $DUMP_FILE..."
docker compose -f docker-compose.production.yml exec -T db psql -U postgres -d apom_db < "$DUMP_FILE"
echo "Done. Restart backend and celery: docker compose -f docker-compose.production.yml restart backend celery"
