#!/bin/bash
set -euo pipefail

BACKUP_DIR="/opt/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/db_backup_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

# Dump & compress
docker compose -f /root/Asset-Manager/docker-compose.production.yml exec -T db \
  pg_dump -U ${POSTGRES_USER:-postgres} ${POSTGRES_DB:-apom_db} | gzip > "$BACKUP_FILE"

# Keep last 7 daily backups
find "$BACKUP_DIR" -name "db_backup_*.sql.gz" -mtime +7 -delete

echo "[$(date)] Backup created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
