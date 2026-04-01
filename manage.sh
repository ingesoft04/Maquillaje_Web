#!/bin/bash
# ═══════════════════════════════════════════════════════
#  manage.sh — Gestión del stack SENA Maquillaje
#  Uso: ./manage.sh <comando>
# ═══════════════════════════════════════════════════════

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

DC="docker compose -f docker-compose.prod.yml"

show_help() {
  echo -e "${CYAN}${BOLD}"
  echo "  ╔══════════════════════════════════════════════╗"
  echo "  ║   🌸 SENA Maquillaje — Panel de Gestión     ║"
  echo "  ╚══════════════════════════════════════════════╝"
  echo -e "${NC}"
  echo -e "  ${BOLD}Uso:${NC} ./manage.sh <comando>"
  echo ""
  echo -e "  ${YELLOW}ESTADO${NC}"
  echo "    status        Ver estado de todos los servicios"
  echo "    health        Health check completo"
  echo "    stats         Uso de CPU / RAM / Disco"
  echo ""
  echo -e "  ${YELLOW}SERVICIOS${NC}"
  echo "    start         Iniciar todos los servicios"
  echo "    stop          Detener todos los servicios"
  echo "    restart       Reiniciar todos los servicios"
  echo "    restart-api   Reiniciar solo la API (sin downtime de BD/Redis)"
  echo ""
  echo -e "  ${YELLOW}LOGS${NC}"
  echo "    logs          Logs de todos los servicios (últimas 100 líneas)"
  echo "    logs-api      Logs solo de la API"
  echo "    logs-nginx    Logs de Nginx (accesos + errores)"
  echo "    logs-db       Logs de PostgreSQL"
  echo "    logs-live     Logs en tiempo real de todos los servicios"
  echo ""
  echo -e "  ${YELLOW}BASE DE DATOS${NC}"
  echo "    backup        Crear backup de PostgreSQL"
  echo "    restore <archivo>  Restaurar backup"
  echo "    db-shell      Abrir consola psql"
  echo "    db-size       Ver tamaño de tablas"
  echo ""
  echo -e "  ${YELLOW}REDIS${NC}"
  echo "    redis-shell   Abrir consola redis-cli"
  echo "    redis-flush   Limpiar toda la caché (¡cuidado!)"
  echo "    redis-info    Estadísticas de Redis"
  echo ""
  echo -e "  ${YELLOW}SSL${NC}"
  echo "    ssl-renew     Renovar certificado SSL manualmente"
  echo "    ssl-status    Ver fecha de expiración del certificado"
  echo ""
  echo -e "  ${YELLOW}SEGURIDAD${NC}"
  echo "    blocked-ips   Ver IPs bloqueadas por rate limiting"
  echo "    top-ips       Las 10 IPs con más requests"
  echo ""
}

case "${1:-help}" in

  # ── ESTADO ─────────────────────────────────────────
  status)
    echo -e "\n${CYAN}${BOLD}📊 Estado de servicios:${NC}\n"
    $DC ps
    ;;

  health)
    echo -e "\n${CYAN}${BOLD}🏥 Health check:${NC}\n"
    HEALTH=$(curl -s http://localhost/health 2>/dev/null || echo '{"error":"No responde"}')
    echo "$HEALTH" | python3 -m json.tool
    echo ""
    echo -e "${CYAN}Uptime del servidor:${NC}"
    uptime
    ;;

  stats)
    echo -e "\n${CYAN}${BOLD}📈 Uso de recursos:${NC}\n"
    docker stats --no-stream \
      sena_nginx sena_api sena_postgres sena_redis \
      --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" 2>/dev/null || \
      echo "Algunos servicios no están corriendo"
    echo ""
    echo -e "${CYAN}Disco:${NC}"
    df -h / | tail -1
    echo ""
    echo -e "${CYAN}Volúmenes Docker:${NC}"
    docker system df
    ;;

  # ── SERVICIOS ──────────────────────────────────────
  start)
    echo -e "${GREEN}▶ Iniciando servicios...${NC}"
    $DC up -d
    echo -e "${GREEN}✔ Servicios iniciados${NC}"
    ;;

  stop)
    echo -e "${YELLOW}⏸ Deteniendo servicios...${NC}"
    $DC stop
    echo -e "${YELLOW}⏸ Servicios detenidos (datos conservados)${NC}"
    ;;

  restart)
    echo -e "${YELLOW}🔄 Reiniciando servicios...${NC}"
    $DC restart
    echo -e "${GREEN}✔ Servicios reiniciados${NC}"
    ;;

  restart-api)
    echo -e "${YELLOW}🔄 Reiniciando API (sin afectar BD/Redis)...${NC}"
    $DC restart api
    echo -e "${GREEN}✔ API reiniciada${NC}"
    ;;

  # ── LOGS ────────────────────────────────────────────
  logs)
    $DC logs --tail=100
    ;;

  logs-api)
    $DC logs --tail=200 api
    ;;

  logs-nginx)
    echo -e "${CYAN}=== ACCESOS ===${NC}"
    docker exec sena_nginx tail -50 /var/log/nginx/access.log 2>/dev/null || \
      $DC logs --tail=50 nginx
    echo ""
    echo -e "${RED}=== ERRORES ===${NC}"
    docker exec sena_nginx tail -20 /var/log/nginx/error.log 2>/dev/null
    ;;

  logs-db)
    $DC logs --tail=100 postgres
    ;;

  logs-live)
    echo -e "${CYAN}Ctrl+C para salir${NC}"
    $DC logs -f
    ;;

  # ── BASE DE DATOS ────────────────────────────────────
  backup)
    source .env 2>/dev/null || true
    mkdir -p backups
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    FILE="backups/sena_db_${TIMESTAMP}.sql.gz"
    echo -e "${CYAN}💾 Creando backup...${NC}"
    $DC exec -T postgres pg_dump -U "${DB_USER:-sena}" "${DB_NAME:-maquillaje_sena}" | gzip > "$FILE"
    SIZE=$(du -sh "$FILE" | cut -f1)
    echo -e "${GREEN}✔ Backup creado: $FILE ($SIZE)${NC}"
    # Listar backups disponibles
    echo ""
    echo -e "${CYAN}Backups disponibles:${NC}"
    ls -lh backups/*.sql.gz 2>/dev/null | awk '{print "  "$9, $5, $6, $7}'
    ;;

  restore)
    [ -z "${2:-}" ] && echo -e "${RED}Uso: ./manage.sh restore backups/archivo.sql.gz${NC}" && exit 1
    [ ! -f "$2" ] && echo -e "${RED}Archivo no encontrado: $2${NC}" && exit 1
    source .env 2>/dev/null || true
    echo -e "${YELLOW}⚠️  ESTO SOBREESCRIBIRÁ LA BASE DE DATOS ACTUAL${NC}"
    read -p "¿Continuar? (escribe 'si' para confirmar): " CONFIRM
    [ "$CONFIRM" != "si" ] && echo "Cancelado." && exit 0
    echo -e "${CYAN}Restaurando backup...${NC}"
    gunzip -c "$2" | $DC exec -T postgres psql -U "${DB_USER:-sena}" "${DB_NAME:-maquillaje_sena}"
    echo -e "${GREEN}✔ Restauración completada${NC}"
    ;;

  db-shell)
    source .env 2>/dev/null || true
    echo -e "${CYAN}Conectando a PostgreSQL (\\q para salir)...${NC}"
    $DC exec postgres psql -U "${DB_USER:-sena}" "${DB_NAME:-maquillaje_sena}"
    ;;

  db-size)
    source .env 2>/dev/null || true
    $DC exec -T postgres psql -U "${DB_USER:-sena}" "${DB_NAME:-maquillaje_sena}" -c "
      SELECT
        relname AS tabla,
        pg_size_pretty(pg_total_relation_size(oid)) AS tamaño_total,
        n_live_tup AS filas
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(oid) DESC;"
    ;;

  # ── REDIS ────────────────────────────────────────────
  redis-shell)
    source .env 2>/dev/null || true
    echo -e "${CYAN}Conectando a Redis (exit para salir)...${NC}"
    $DC exec redis redis-cli -a "${REDIS_PASS:-redis1234}"
    ;;

  redis-flush)
    source .env 2>/dev/null || true
    echo -e "${YELLOW}⚠️  Esto eliminará TODA la caché de Redis${NC}"
    read -p "¿Continuar? (escribe 'si'): " CONFIRM
    [ "$CONFIRM" != "si" ] && echo "Cancelado." && exit 0
    $DC exec redis redis-cli -a "${REDIS_PASS:-redis1234}" FLUSHALL
    echo -e "${GREEN}✔ Caché limpiada${NC}"
    ;;

  redis-info)
    source .env 2>/dev/null || true
    $DC exec -T redis redis-cli -a "${REDIS_PASS:-redis1234}" INFO server | grep -E "redis_version|uptime|hz"
    echo "---"
    $DC exec -T redis redis-cli -a "${REDIS_PASS:-redis1234}" INFO memory | grep -E "used_memory_human|maxmemory_human"
    echo "---"
    $DC exec -T redis redis-cli -a "${REDIS_PASS:-redis1234}" INFO keyspace
    ;;

  # ── SSL ─────────────────────────────────────────────
  ssl-renew)
    echo -e "${CYAN}🔒 Renovando certificado SSL...${NC}"
    $DC exec certbot certbot renew
    $DC exec nginx nginx -s reload
    echo -e "${GREEN}✔ Certificado renovado y Nginx recargado${NC}"
    ;;

  ssl-status)
    source .env 2>/dev/null || true
    DOMAIN="${DOMAIN:-tudominio.com}"
    echo -e "${CYAN}🔒 Estado del certificado para $DOMAIN:${NC}"
    $DC exec -T certbot certbot certificates 2>/dev/null || \
      echo "Certbot no está corriendo o no hay certificados"
    ;;

  # ── SEGURIDAD ────────────────────────────────────────
  blocked-ips)
    echo -e "${CYAN}IPs con rate limit (últimas 500 líneas de log):${NC}"
    docker exec sena_nginx grep "limiting requests" /var/log/nginx/error.log 2>/dev/null | \
      tail -20 || echo "No hay registros de bloqueo recientes"
    ;;

  top-ips)
    echo -e "${CYAN}Top 10 IPs por número de requests:${NC}"
    docker exec sena_nginx awk '{print $1}' /var/log/nginx/access.log 2>/dev/null | \
      sort | uniq -c | sort -rn | head -10 || echo "No hay datos de acceso"
    ;;

  help|--help|-h|*)
    show_help
    ;;
esac
