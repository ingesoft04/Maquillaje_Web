#!/bin/sh
set -eu

mkdir -p backups
docker compose --env-file .env.home -f docker-compose.home.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "backups/maquillaje_manual_$(date +%Y%m%d_%H%M%S).dump"
echo "Copia manual creada en backups/"
