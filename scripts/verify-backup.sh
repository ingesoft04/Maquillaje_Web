#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Uso: ./scripts/verify-backup.sh backups/archivo.dump"
  exit 1
fi

test -f "$1"
db="verificacion_$(date +%s)"
cleanup() {
  docker compose --env-file .env.home -f docker-compose.home.yml exec -T postgres \
    sh -c "dropdb -U \"\$POSTGRES_USER\" --if-exists \"$db\"" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose --env-file .env.home -f docker-compose.home.yml exec -T postgres \
  sh -c "createdb -U \"\$POSTGRES_USER\" \"$db\""
cat "$1" | docker compose --env-file .env.home -f docker-compose.home.yml exec -T postgres \
  sh -c "pg_restore -U \"\$POSTGRES_USER\" -d \"$db\" --no-owner"
conteo=$(docker compose --env-file .env.home -f docker-compose.home.yml exec -T postgres \
  sh -c "psql -U \"\$POSTGRES_USER\" -d \"$db\" -Atc \"SELECT COUNT(*) FROM usuarios\"")
echo "Backup válido. Usuarios recuperables: $conteo"
