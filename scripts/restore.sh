#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Uso: ./scripts/restore.sh backups/archivo.dump"
  exit 1
fi

test -f "$1"
cat "$1" | docker compose --env-file .env.home -f docker-compose.home.yml exec -T postgres \
  sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner'
echo "Restauración finalizada desde $1"
