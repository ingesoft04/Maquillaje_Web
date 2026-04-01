#!/bin/bash
# ═══════════════════════════════════════════════════════
#  deploy.sh — Script de despliegue SENA Maquillaje
#  Uso: ./deploy.sh [--ssl] [--backup] [--update]
# ═══════════════════════════════════════════════════════

set -euo pipefail

# ── Colores ──────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

log()  { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $1"; }
ok()   { echo -e "${GREEN}✔${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
err()  { echo -e "${RED}✖${NC} $1"; exit 1; }

banner() {
  echo -e "${CYAN}"
  echo "  ╔══════════════════════════════════════════╗"
  echo "  ║   🌸 SENA Maquillaje — Deploy Script     ║"
  echo "  ╚══════════════════════════════════════════╝"
  echo -e "${NC}"
}

# ── Verificar prerequisitos ───────────────────────────
check_deps() {
  log "Verificando dependencias..."
  command -v docker   >/dev/null || err "Docker no instalado. Ver: https://docs.docker.com/engine/install/"
  command -v docker   >/dev/null && docker compose version >/dev/null 2>&1 || err "Docker Compose plugin no instalado."
  ok "Docker y Docker Compose disponibles"
}

# ── Verificar .env ────────────────────────────────────
check_env() {
  log "Verificando variables de entorno..."
  [ -f ".env" ] || err "Archivo .env no encontrado. Copia .env.example y edítalo:\n  cp .env.example .env"

  # Variables obligatorias en producción
  source .env
  [ -z "${JWT_SECRET:-}" ]  && err "JWT_SECRET no está definido en .env"
  [ -z "${DB_PASS:-}" ]     && err "DB_PASS no está definido en .env"
  [ -z "${REDIS_PASS:-}" ]  && err "REDIS_PASS no está definido en .env"
  [ "${JWT_SECRET}" = "mi_secreto_super_seguro_sena_2025" ] && \
    warn "JWT_SECRET tiene el valor por defecto. ¡Cámbialo en producción!"

  ok "Variables de entorno válidas"
}

# ── Backup de base de datos ───────────────────────────
backup_db() {
  log "Creando backup de la base de datos..."
  mkdir -p backups
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  BACKUP_FILE="backups/sena_db_${TIMESTAMP}.sql.gz"

  docker compose -f docker-compose.prod.yml exec -T postgres \
    pg_dump -U "${DB_USER:-sena}" "${DB_NAME:-maquillaje_sena}" | gzip > "$BACKUP_FILE"

  ok "Backup guardado: $BACKUP_FILE"
  # Mantener solo los últimos 7 backups
  ls -t backups/*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm
}

# ── Obtener certificado SSL con Let's Encrypt ─────────
setup_ssl() {
  source .env
  DOMAIN="${DOMAIN:-tudominio.com}"
  EMAIL="${SSL_EMAIL:-admin@tudominio.com}"

  log "Configurando SSL para $DOMAIN..."

  # Primero levantar solo Nginx en modo HTTP para el challenge
  docker compose -f docker-compose.prod.yml up -d nginx certbot

  sleep 3

  # Solicitar certificado
  docker compose -f docker-compose.prod.yml run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN" \
    -d "www.$DOMAIN"

  ok "Certificado SSL obtenido para $DOMAIN"
  log "Recarga Nginx para activar HTTPS..."
  docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
}

# ── Despliegue principal ──────────────────────────────
deploy() {
  log "Iniciando despliegue..."

  # Construir imagen de la API
  log "Construyendo imagen Docker de la API..."
  docker compose -f docker-compose.prod.yml build api
  ok "Imagen construida"

  # Levantar servicios
  log "Levantando todos los servicios..."
  docker compose -f docker-compose.prod.yml up -d

  # Esperar que la API esté lista
  log "Esperando que la API esté disponible..."
  RETRIES=0
  until docker compose -f docker-compose.prod.yml exec -T api \
    wget -qO- http://localhost:4000/health >/dev/null 2>&1; do
    RETRIES=$((RETRIES+1))
    [ $RETRIES -gt 30 ] && err "La API no respondió después de 60 segundos"
    sleep 2
  done

  ok "API disponible"
}

# ── Mostrar estado ────────────────────────────────────
show_status() {
  echo ""
  log "Estado de los servicios:"
  docker compose -f docker-compose.prod.yml ps
  echo ""
  log "Health check:"
  docker compose -f docker-compose.prod.yml exec -T api \
    wget -qO- http://localhost:4000/health 2>/dev/null | python3 -m json.tool || true
  echo ""
  ok "Despliegue completado 🌸"
  echo ""
  echo -e "  ${GREEN}🌐 Tu aplicación está en:${NC}"
  echo -e "     http://$(hostname -I | awk '{print $1}'):80"
  echo -e "     https://tudominio.com (si configuraste SSL)"
  echo ""
}

# ── Main ──────────────────────────────────────────────
banner
check_deps
check_env

DO_SSL=false
DO_BACKUP=false
DO_UPDATE=false

for arg in "$@"; do
  case $arg in
    --ssl)    DO_SSL=true ;;
    --backup) DO_BACKUP=true ;;
    --update) DO_UPDATE=true ;;
  esac
done

if $DO_BACKUP; then
  backup_db
fi

if $DO_SSL; then
  setup_ssl
fi

if $DO_UPDATE; then
  log "Modo actualización: reconstruyendo solo la API..."
  docker compose -f docker-compose.prod.yml build api
  docker compose -f docker-compose.prod.yml up -d --no-deps api
  ok "API actualizada sin downtime"
else
  deploy
fi

show_status
