#!/bin/sh
set -eu

url="${1:-http://localhost:8088/health}"
curl -fsS "$url"
echo
docker compose --env-file .env.home -f docker-compose.home.yml ps
df -h .
