#!/bin/sh
# Container entrypoint: apply database migrations, then run the given command.
# Set SKIP_MIGRATIONS=1 for containers that must not migrate (e.g. the scheduler).
set -e

if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
    echo "[entrypoint] Running alembic upgrade head"
    alembic upgrade head
fi

echo "[entrypoint] Starting: $*"
exec "$@"
