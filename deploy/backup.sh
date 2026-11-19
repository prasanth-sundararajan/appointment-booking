#!/usr/bin/env bash
# Daily PostgreSQL backup for the production stack. Keeps the last 7 days.
# Cron (as the deploy user):
#   0 3 * * * /opt/slotease/deploy/backup.sh >> /var/log/slotease-backup.log 2>&1
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/slotease}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
COMPOSE_FILE="${APP_DIR}/docker-compose.prod.yml"

cd "$APP_DIR"

# Load POSTGRES_USER / POSTGRES_DB from the server .env
set -a
# shellcheck disable=SC1091
. "${APP_DIR}/.env"
set +a

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
OUTFILE="${BACKUP_DIR}/slotease_${TIMESTAMP}.sql.gz"

echo "[$(date -Is)] Backing up ${POSTGRES_DB} to ${OUTFILE}"
docker compose -f "$COMPOSE_FILE" exec -T db \
    pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --clean --if-exists \
    | gzip -9 > "${OUTFILE}.tmp"
mv "${OUTFILE}.tmp" "$OUTFILE"
chmod 600 "$OUTFILE"

find "$BACKUP_DIR" -name 'slotease_*.sql.gz' -type f -mtime +"$((RETENTION_DAYS - 1))" -delete

echo "[$(date -Is)] Done. Current backups:"
ls -1sh "$BACKUP_DIR"
