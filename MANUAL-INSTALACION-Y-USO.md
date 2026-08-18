# Manual de instalación y uso

## Arte & Belleza — Proyecto SENA

Este documento explica cómo instalar, configurar, utilizar, actualizar y respaldar la aplicación. El manual técnico y académico continúa en `MANUAL-PROYECTO-SENA.md`.

## 1. Componentes del sistema

La solución se entrega completamente dockerizada:

- Frontend: HTML, CSS, JavaScript y Nginx.
- API: Node.js 22 y Express.
- Base de datos: PostgreSQL 16.
- Caché: Redis 7.
- Backups: contenedor PostgreSQL auxiliar en el despliegue doméstico.
- Monitoreo opcional: Prometheus y Grafana.

Para la instalación normal no se necesita instalar Node.js, PostgreSQL ni Redis directamente.

## 2. Requisitos

### Windows

- Windows 10 u 11 de 64 bits.
- Docker Desktop con Docker Compose.
- Virtualización y WSL 2 habilitados.
- 4 GB de RAM disponibles; se recomiendan 8 GB.
- Aproximadamente 5 GB de espacio libre.

### Servidor Linux

- Ubuntu Server 22.04/24.04, Debian 12 o equivalente.
- Docker Engine y complemento Docker Compose.
- Usuario con permiso para ejecutar Docker.
- 4 GB de RAM recomendados.
- IP local fija o reserva DHCP.
- Acceso al router si se publicará en Internet.

Verificación:

```bash
docker --version
docker compose version
```

## 3. Archivos importantes

| Archivo | Propósito |
|---|---|
| `.env.example` | Plantilla local |
| `.env.home.example` | Plantilla para servidor casero |
| `docker-compose.yml` | Desarrollo y demostración local |
| `docker-compose.home.yml` | Servidor casero reforzado |
| `Caddyfile.example` | Dominio y HTTPS |
| `MANUAL-PROYECTO-SENA.md` | Explicación académica |
| `docs/ARQUITECTURA-SOLID.md` | Principios SOLID |
| `scripts/` | Backup, restauración y healthcheck |

`.env` y `.env.home` contienen secretos. No deben publicarse en GitHub, enviarse por correo ni copiarse al frontend.

## 4. Instalación rápida en Windows

Abra PowerShell:

```powershell
Set-Location C:\Personal\Maquillaje_Web
Copy-Item .env.example .env
notepad .env
```

Cambie como mínimo:

```env
JWT_SECRET=UNA_CLAVE_ALEATORIA_DE_64_CARACTERES_O_MAS
DB_PASS=UNA_CLAVE_SEGURA_PARA_POSTGRES
REDIS_PASS=UNA_CLAVE_SEGURA_PARA_REDIS
ADMIN_EMAIL=correo-del-administrador@example.com
ADMIN_PASSWORD=UNA_CLAVE_ADMINISTRATIVA_SEGURA
```

Construya e inicie:

```powershell
docker compose up -d --build
docker compose ps
```

Espere hasta que API, PostgreSQL y Redis estén saludables. Compruebe:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:8088/health
```

Accesos:

- Página pública: `http://localhost:8088`
- Citas e inicio de sesión: `http://localhost:8088/citas`
- Documentación API: `http://localhost:8088/api/docs`
- Estado: `http://localhost:8088/health`

## 5. Primer inicio de sesión

Utilice los valores `ADMIN_EMAIL` y `ADMIN_PASSWORD` de `.env`.

La cuenta administrativa se crea durante el primer arranque. Si la base ya existía, cambiar `ADMIN_PASSWORD` en `.env` no modifica automáticamente la contraseña almacenada.

Después del ingreso:

1. Revise servicios, precios y duraciones en **Catálogo**.
2. Cree especialistas y accesos profesionales.
3. Revise horarios y bloqueos en **Agenda**.
4. Confirme anticipo, cancelación, tolerancia y privacidad.
5. Configure SMTP si desea correos reales.

## 6. Configuración central

El proyecto no utiliza `web.config` porque no funciona sobre IIS/ASP.NET. Se configura con variables de entorno y Docker.

Base de datos y Redis:

```env
DB_USER=sena
DB_PASS=CLAVE_SEGURA
DB_NAME=maquillaje_sena
REDIS_PASS=OTRA_CLAVE_SEGURA
```

Autenticación:

```env
JWT_SECRET=SECRETO_ALEATORIO_MUY_LARGO
ADMIN_NAME=Administrador
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=CLAVE_ADMINISTRATIVA
```

No cambie `JWT_SECRET` salvo que quiera invalidar todas las sesiones actuales.

Dirección local:

```env
FRONTEND_URL=http://localhost:8088
CORS_ORIGINS=http://localhost:8088
```

IP pública temporal:

```env
FRONTEND_URL=http://IP_PUBLICA:8088
CORS_ORIGINS=http://IP_PUBLICA:8088
TRUST_PROXY=1
```

Dominio:

```env
FRONTEND_URL=https://citas.sudominio.com
CORS_ORIGINS=https://citas.sudominio.com
TRUST_PROXY=1
```

## 7. Configuración de SMTP

SMTP envía confirmaciones, recordatorios, cancelaciones y recuperación de contraseña:

```env
SMTP_HOST=smtp.proveedor.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=usuario@example.com
SMTP_PASS=CONTRASEÑA_DE_APLICACION_O_TOKEN
SMTP_FROM=Arte y Belleza <notificaciones@example.com>
NOTIFICATION_INTERVAL_MS=60000
```

- Puerto 587: `SMTP_SECURE=false` para STARTTLS.
- Puerto 465: `SMTP_SECURE=true` para TLS directo.

Use una contraseña de aplicación o token SMTP, nunca la contraseña principal.

Después de modificar SMTP:

```powershell
docker compose up -d --force-recreate api
docker compose logs -f api
```

Si SMTP queda vacío, la aplicación mantiene el flujo y simula los envíos en los registros.

Prueba:

1. Registre un cliente con un correo suyo.
2. Agende una cita.
3. Revise los logs de la API.
4. Compruebe entrada y spam.

## 8. Uso por roles

### Cliente

1. Entre en `/citas` y cree una cuenta.
2. Complete ficha cosmética y consentimientos.
3. Seleccione servicio, especialista, fecha y hora.
4. Consulte, reprograme o cancele citas.
5. Revise pagos, historial, recomendaciones y lista de espera.
6. Califique citas completadas.
7. Exporte datos o solicite corrección/eliminación.

El anticipo es no reembolsable y queda retenido al cancelar.

### Valores y modalidades de pago

El catálogo de servicios es público en `/citas`: cualquier visitante puede consultar nombre, descripción, precio, duración y especialistas antes de crear una cuenta. La autenticación se solicita únicamente cuando la persona decide completar la reserva.

El valor se configura en cada servicio desde **Administración → Catálogo**. Al reservar, la cliente ve el valor total y elige una modalidad:

La instalación incluye precios demostrativos entre $60.000 y $250.000 COP. Son datos de muestra y la administradora puede sustituirlos por los valores reales del negocio desde el catálogo.

- **Anticipo:** se calcula el porcentaje configurado (20 % por defecto); el saldo se paga durante la sesión.
- **Pago en la sesión:** se paga el valor completo al recibir el servicio.

Los métodos disponibles son efectivo, transferencia, tarjeta débito, tarjeta crédito, Nequi, Daviplata y otro. Esta selección registra la preferencia; no realiza todavía un débito bancario automático. Para cobrar en línea se deberá integrar posteriormente una pasarela como Wompi o Mercado Pago con las credenciales comerciales del negocio.

Si la cliente cancela una cita que ya tiene un anticipo registrado, el pago cambia a estado **retenido**. El anticipo no se devuelve, incluso si la cancelación se hizo con anticipación, conforme a la política definida para el proyecto. Los abonos o pagos de saldo no se convierten automáticamente en anticipos.

### Especialista

1. Administración crea su especialista y acceso.
2. Inicia sesión en `/citas`.
3. Consulta únicamente su agenda.
4. Cambia estados de atención.
5. Registra expediente, productos, tonos y observaciones.
6. Añade recomendaciones y seguimientos.

### Administrador

Puede gestionar:

- Citas y calendario semanal.
- Especialistas y cuentas profesionales.
- Servicios, precios y duración.
- Pagos y anticipos.
- Inventario, recetas y proveedores.
- Lista de espera y reseñas.
- Fotografías manuales y consentimientos.
- Privacidad, reportes, auditoría y analítica.

Una fotografía pública exige consentimiento vigente. Al retirarlo, se despublica.

### Uso del panel administrativo

El menú se divide en tres grupos para facilitar la explicación durante la presentación:

- **Operación:** citas, calendario, agenda y lista de espera.
- **Negocio:** caja, inventario y catálogo.
- **Gestión:** usuarios, reseñas, fotografías, analítica, reportes, auditoría, privacidad, configuración y Google Calendar.

En computador se muestran los botones agrupados. En celular se reemplazan automáticamente por una lista desplegable. El campo **Buscar en este módulo** filtra las filas de la tabla que está abierta y muestra cuántas coinciden. El botón **Actualizar** vuelve a consultar la información del servidor sin cerrar la sesión.

## 9. Operación diaria

```powershell
docker compose ps
docker compose logs -f api
docker compose restart api
docker compose up -d --build
docker compose down
```

`docker compose down` conserva los datos. No ejecute `docker compose down -v` con información real: elimina los volúmenes.

## 10. Pruebas automatizadas

```powershell
docker compose exec -T api node --test --test-concurrency=1 tests/comparacion.service.test.js
docker compose exec -T api node --test --test-concurrency=1 tests/admin-ui.test.js tests/google-calendar.unit.test.js
docker compose exec -T -e TEST_BASE_URL=http://localhost:4000 api node --test --test-concurrency=1 tests/integration.test.js
```

Referencia actual:

- 10 pruebas unitarias, SOLID y de interfaz administrativa.
- 25 pruebas integrales.
- 0 fallos.

## 11. Servidor casero

```bash
cd /opt/maquillaje-web
cp .env.home.example .env.home
nano .env.home
mkdir -p backups
chmod 700 backups
chmod 600 .env.home
```

Reemplace todos los valores `CAMBIE_` e inicie:

```bash
docker compose --env-file .env.home -f docker-compose.home.yml up -d --build
docker compose --env-file .env.home -f docker-compose.home.yml ps
chmod +x scripts/*.sh
./scripts/healthcheck-home.sh
```

Acceso en red local:

```text
http://IP_LOCAL_DEL_SERVIDOR:8088
```

PostgreSQL, Redis y la API permanecen en la red privada de Docker.

## 12. IP pública temporal

En `.env.home`:

```env
WEB_PORT=8088
PUBLIC_IP=SU_IP_PUBLICA
FRONTEND_URL=http://SU_IP_PUBLICA:8088
TRUST_PROXY=1
```

En el router:

```text
Puerto público 8088 → IP local del servidor:8088
```

No exponga PostgreSQL 5432, Redis 6379, API 4000, Grafana ni Prometheus.

HTTP mediante IP pública debe limitarse a demostraciones sin datos reales.

## 13. Dominio y HTTPS

Al comprar el dominio, cree en el proveedor DNS:

```text
Tipo: A
Nombre: citas
Destino: SU_IP_PUBLICA
```

Ejemplo: `citas.sudominio.com`.

Actualice `.env.home`:

```env
FRONTEND_URL=https://citas.sudominio.com
TRUST_PROXY=1
```

Ajuste `Caddyfile.example`:

```caddy
citas.sudominio.com {
  encode zstd gzip
  reverse_proxy frontend:80
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "strict-origin-when-cross-origin"
  }
}
```

Router:

```text
Puerto 80  → servidor:80
Puerto 443 → servidor:443
```

Caddy puede solicitar y renovar automáticamente HTTPS. Si la IP cambia, configure DNS dinámico.

Al retomar Google Calendar:

```env
GOOGLE_REDIRECT_URI=https://citas.sudominio.com/api/google/oauth/callback
```

Registre exactamente la misma URL en Google Cloud.

## 14. Copias de seguridad

Configuración automática:

```env
BACKUP_INTERVAL_SECONDS=86400
BACKUP_RETENTION_DAYS=14
```

Operación:

```bash
./scripts/backup-now.sh
./scripts/verify-backup.sh backups/maquillaje_YYYYMMDD_HHMMSS.dump
./scripts/restore.sh backups/maquillaje_YYYYMMDD_HHMMSS.dump
```

La restauración reemplaza datos. Haga otra copia y detenga el uso antes de restaurar.

Mantenga una copia externa en otro disco, NAS o almacenamiento cifrado.

## 15. Actualización

Antes:

```bash
./scripts/backup-now.sh
./scripts/verify-backup.sh backups/ARCHIVO_RECIENTE.dump
```

Después de copiar cambios:

```bash
docker compose --env-file .env.home -f docker-compose.home.yml up -d --build
./scripts/healthcheck-home.sh
docker compose --env-file .env.home -f docker-compose.home.yml logs --tail=100 api
```

Las migraciones compatibles se aplican al arrancar la API.

## 16. Monitoreo opcional

```bash
docker compose --env-file .env.home -f docker-compose.home.yml --profile monitoring up -d
```

- Prometheus: `http://127.0.0.1:9090`
- Grafana: `http://127.0.0.1:3001`

Configure `GRAFANA_PASSWORD` antes de habilitarlo.

## 17. Solución de problemas

### La página no abre

```powershell
docker compose ps
docker compose logs --tail=100 frontend
docker compose logs --tail=100 api
```

Compruebe que 8088 no esté ocupado.

### API no saludable

```powershell
docker compose logs --tail=200 api
docker compose logs --tail=100 postgres
docker compose logs --tail=100 redis
```

Revise claves, puertos y memoria de Docker.

### La nueva contraseña administrativa no funciona

Si la base ya existía, la cuenta no se recrea. Use la contraseña almacenada o recuperación. No elimine el volumen para corregirla.

### No llegan correos

- Revise host, puerto y `SMTP_SECURE`.
- Use contraseña de aplicación.
- Revise spam y logs.
- Confirme que el proveedor permita SMTP desde su IP.

### El dominio no abre

- Compruebe el registro A y la IP pública.
- Revise puertos 80/443 y firewall.
- Verifique los logs de Caddy.
- Consulte al proveedor si utiliza CGNAT.

Con CGNAT necesita solicitar IP pública o usar un túnel seguro.

## 18. Lista previa a producción

- [ ] Se reemplazaron todas las claves de ejemplo.
- [ ] `.env.home` tiene permisos restringidos.
- [ ] SMTP fue probado.
- [ ] Dominio y HTTPS funcionan.
- [ ] PostgreSQL, Redis y API no están expuestos.
- [ ] Backups y restauración fueron probados.
- [ ] Existe una copia externa.
- [ ] Pasan las pruebas automatizadas.
- [ ] Se revisaron consentimiento y privacidad.
- [ ] Se reconsideró 2FA para cuentas privilegiadas.

## 19. Documentación relacionada

- `MANUAL-PROYECTO-SENA.md`
- `docs/REQUISITOS-Y-DISENO-SENA.md`
- `docs/ARQUITECTURA-SOLID.md`
- API ejecutándose: `/api/docs`
