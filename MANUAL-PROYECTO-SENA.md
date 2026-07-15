# Manual técnico — Arte & Belleza SENA

## 1. Descripción del proyecto

Arte & Belleza SENA es una aplicación web para consultar contenido educativo de maquillaje, explorar servicios, registrar usuarios y administrar citas con especialistas.

El proyecto se divide en cuatro componentes:

1. **Frontend:** interfaz HTML, CSS y JavaScript que utiliza la persona usuaria.
2. **API:** servidor Node.js con Express que procesa solicitudes y aplica las reglas del negocio.
3. **PostgreSQL:** base de datos principal y permanente.
4. **Redis:** almacenamiento rápido y temporal para caché y control de sesiones.

Todo el sistema se ejecuta mediante Docker Compose.

## 2. Objetivo general

Desarrollar una aplicación web que permita divulgar conocimientos de maquillaje y gestionar citas de servicios de belleza mediante una arquitectura cliente-servidor segura, organizada y desplegable con contenedores.

## 3. Objetivos específicos

- Presentar contenido sobre historia, productos, técnicas y cuidado de la piel.
- Permitir el registro e inicio de sesión de usuarios.
- Consultar especialistas y tipos de maquillaje.
- Consultar disponibilidad y reservar citas.
- Evitar reservas duplicadas para una especialista en la misma fecha y hora.
- Utilizar caché para reducir consultas repetidas a la base de datos.
- facilitar el despliegue del sistema usando Docker.

## 4. ¿Por qué PostgreSQL y Redis?

### PostgreSQL

PostgreSQL guarda la información que no debe perderse: usuarios, contraseñas cifradas, especialistas, servicios, citas y comparaciones de imágenes.

Se eligió porque ofrece:

- Relaciones y llaves foráneas.
- Restricciones para proteger la integridad de los datos.
- Transacciones.
- UUID para identificadores.
- Campos JSONB y arreglos.
- Buen rendimiento y licencia libre.

### Redis

Redis no reemplaza a PostgreSQL. Se utiliza como complemento para datos temporales que deben consultarse rápidamente:

- Sesiones activas.
- Tokens revocados al cerrar sesión.
- Catálogos de especialistas y servicios.
- Listados de citas consultados recientemente.
- Disponibilidad por especialista y fecha.

Si Redis pierde su contenido, PostgreSQL conserva los datos principales y la caché puede reconstruirse.

### Alternativas evaluadas

MySQL también podría resolver el proyecto, pero PostgreSQL ofrece más flexibilidad para JSONB, arreglos y restricciones avanzadas. SQL Server es una excelente plataforma empresarial, pero para este alcance añade mayor consumo de recursos y dependencia del ecosistema Microsoft sin aportar una ventaja necesaria.

## 5. Arquitectura

```text
Navegador
   │ HTTP — localhost:8088
   ▼
Nginx / Frontend
   │ /api/*
   ▼
API Node.js + Express
   ├── PostgreSQL: datos permanentes
   └── Redis: caché y sesiones
```

Nginx entrega el archivo HTML. Cuando el frontend necesita datos, envía una solicitud a `/api`. Nginx reenvía esa solicitud al contenedor `api`. La API consulta PostgreSQL o Redis y devuelve una respuesta JSON.

## 6. Servicios Docker

El archivo `docker-compose.yml` define:

| Servicio | Tecnología | Puerto local | Responsabilidad |
|---|---|---:|---|
| `frontend` | Nginx | 8088 | Servir la interfaz y redirigir `/api` |
| `api` | Node.js 22 + Express | 4000 | Reglas del negocio y API REST |
| `postgres` | PostgreSQL 16 | 5432 | Persistencia principal |
| `redis` | Redis 7 | 6379 | Caché y sesiones |

Los volúmenes `postgres_data` y `redis_data` permiten conservar información aunque los contenedores se reinicien.

## 7. Estructura de archivos

```text
Maquillaje_Web/
├── maquillaje-sena-v3.html       # Interfaz web
├── index.js                       # Entrada de la API
├── db.js                          # Conexión PostgreSQL
├── redis.js                       # Conexión y helpers Redis
├── auth.controller.js             # Registro, login, logout y perfil
├── citas.controller.js            # Gestión de citas
├── catalogo.controller.js         # Servicios, especialistas y tonos
├── comparaciones.controller.js    # Galería antes/después
├── middleware/auth.js             # Verificación JWT
├── routes/                         # Definición de endpoints
├── init.sql                        # Tablas, índices y datos iniciales
├── package.json                    # Dependencias y comandos Node
├── pnpm-lock.yaml                 # Versiones exactas instaladas
├── Dockerfile                     # Imagen de la API
├── Dockerfile.frontend            # Imagen del frontend
├── nginx.local.conf               # Proxy local frontend → API
├── docker-compose.yml             # Orquestación local completa
└── .env.example                   # Plantilla de configuración
```

## 8. Base de datos

### Tablas principales

- `usuarios`: datos de las cuentas y hash de contraseña.
- `especialistas`: profesionales disponibles.
- `tipos_maquillaje`: catálogo de servicios.
- `citas`: reservas realizadas por los usuarios.
- `tonos_piel`: recomendaciones de tonos y productos.
- `comparaciones`: imágenes de antes y después.

### Relaciones importantes

- Un usuario puede tener muchas citas.
- Una especialista puede atender muchas citas.
- Cada cita puede tener un tipo de maquillaje.
- Una comparación pertenece a un usuario.

La restricción `uq_especialista_horario` evita que una especialista tenga dos citas a la misma fecha y hora, incluso si dos solicitudes llegan simultáneamente.

## 9. Autenticación

1. El usuario envía correo y contraseña.
2. La API busca el correo en PostgreSQL.
3. `bcryptjs` compara la contraseña con el hash guardado.
4. Si coincide, la API genera un JWT con duración de siete días.
5. El frontend envía el token en `Authorization: Bearer TOKEN`.
6. El middleware valida el token antes de permitir rutas privadas.
7. Al cerrar sesión, el token se registra temporalmente como revocado en Redis.

Las contraseñas nunca se almacenan en texto plano.

## 10. Estrategia de caché

| Prefijo de clave | Contenido | Duración aproximada |
|---|---|---:|
| `session:` | Sesión activa | 7 días |
| `revoked:` | Token cerrado | 1 hora |
| `catalogo:` | Servicios y especialistas | 6 horas |
| `catalogo:tonos` | Tonos disponibles | 24 horas |
| `citas:usuario:` | Citas de un usuario | 5 minutos |
| `disponibilidad:` | Horas ocupadas | 2 minutos |

Cuando se crea o cancela una cita, la API elimina las claves relacionadas para evitar mostrar datos antiguos.

## 11. Endpoints principales

### Autenticación

| Método | Endpoint | Acceso |
|---|---|---|
| POST | `/api/auth/registro` | Público |
| POST | `/api/auth/login` | Público |
| POST | `/api/auth/logout` | JWT |
| GET | `/api/auth/perfil` | JWT |

### Catálogo

| Método | Endpoint | Acceso |
|---|---|---|
| GET | `/api/tipos` | Público |
| GET | `/api/especialistas` | Público |
| GET | `/api/tonos` | Público |
| POST | `/api/tonos/calcular` | Público/JWT opcional |

### Citas

| Método | Endpoint | Acceso |
|---|---|---|
| GET | `/api/citas` | JWT |
| POST | `/api/citas` | JWT |
| GET | `/api/citas/disponibilidad` | JWT |
| PATCH | `/api/citas/:id/cancelar` | JWT |
| GET | `/api/citas/:id/exportar` | JWT |

### Administración

| Método | Endpoint | Acceso |
|---|---|---|
| GET | `/api/admin/resumen` | Administrador |
| GET | `/api/admin/usuarios` | Administrador |
| GET | `/api/admin/citas` | Administrador |
| PATCH | `/api/admin/citas/:id/estado` | Administrador |

### Comparaciones

| Método | Endpoint | Acceso |
|---|---|---|
| GET | `/api/comparaciones/publicas` | Público |
| GET | `/api/comparaciones` | JWT |
| POST | `/api/comparaciones` | JWT |
| DELETE | `/api/comparaciones/:id` | JWT |

## 12. Ejecución local con Docker

### Requisitos

- Docker Desktop instalado y abierto.
- Puertos 8088, 4000, 5432 y 6379 disponibles.

### Preparar variables

En PowerShell:

```powershell
Copy-Item .env.example .env
```

Cambiar `JWT_SECRET` en `.env` por una cadena larga y privada.

También se deben cambiar las credenciales iniciales del administrador:

```env
ADMIN_NAME=Administrador SENA
ADMIN_EMAIL=admin@sena.edu.co
ADMIN_PASSWORD=UnaClavePrivadaYSegura
```

En el entorno local actual, mientras no se cree un `.env` personalizado, el acceso de demostración es `admin@sena.edu.co` con la contraseña `CambieEstaClave2026!`. Estas credenciales no deben utilizarse en producción.

### Construir y arrancar

```powershell
docker compose up --build -d
```

### Verificar

```powershell
docker compose ps
docker compose logs -f api
```

Abrir:

- Aplicación: `http://localhost:8088`
- Agenda y administración: `http://localhost:8088/citas`
- Estado de la API: `http://localhost:8088/health`
- API directa: `http://localhost:4000/health`

La respuesta saludable debe indicar PostgreSQL y Redis en línea.

### Detener sin borrar datos

```powershell
docker compose down
```

### Detener y borrar los datos

```powershell
docker compose down -v
```

El último comando elimina las bases locales. Solo debe utilizarse cuando se quiera reiniciar completamente la demostración.

## 13. Comandos útiles

```powershell
# Ver todos los contenedores
docker compose ps

# Ver registros de la API
docker compose logs -f api

# Reiniciar únicamente la API
docker compose restart api

# Reconstruir después de modificar código
docker compose up --build -d

# Entrar a PostgreSQL
docker compose exec postgres psql -U sena -d maquillaje_sena

# Probar Redis
docker compose exec redis redis-cli -a redis1234 PING
```

## 14. Seguridad implementada

- Hash de contraseñas con bcrypt.
- Autenticación JWT.
- Revocación de sesión mediante Redis.
- Consultas SQL parametrizadas para evitar inyección SQL.
- Helmet para cabeceras HTTP seguras.
- CORS configurable.
- Límites de solicitudes globales y de autenticación.
- Restricciones y llaves foráneas en PostgreSQL.
- Base de datos y Redis aislados dentro de la red Docker en producción.

Para una producción real también se deben usar secretos fuertes, HTTPS, copias de seguridad, monitoreo y un proveedor de almacenamiento para imágenes.

## 15. Estado actual y trabajo pendiente

### Terminado

- Diseño base del frontend.
- Esquema PostgreSQL.
- Integración Redis.
- API de autenticación, catálogos, citas y comparaciones.
- Dockerfiles y composición local de cuatro servicios.
- Health check de infraestructura.
- Frontend conectado a la API para registro, login, sesión, catálogos y citas.
- Panel administrativo con métricas, usuarios, citas y gestión de estados.
- Exportación PDF institucional con resumen y paginación.
- Pruebas automatizadas de integración.

### Pendiente

- Implementar carga real de imágenes.
- Revisar roles administrativos.
- Preparar configuración de dominio y HTTPS para producción.

## 16. Guion sugerido para la sustentación

1. **Problema:** la gestión manual de servicios y citas de maquillaje produce desorganización y posibles cruces de horario.
2. **Solución:** una plataforma web que combina información educativa con reservas digitales.
3. **Arquitectura:** mostrar los cuatro contenedores y explicar la responsabilidad de cada uno.
4. **Persistencia:** mostrar las tablas y la restricción que evita reservas duplicadas.
5. **Seguridad:** explicar bcrypt, JWT y consultas parametrizadas.
6. **Rendimiento:** explicar que Redis reduce consultas repetidas, pero PostgreSQL continúa siendo la fuente oficial.
7. **Demostración:** registrar una cuenta, iniciar sesión, consultar disponibilidad y agendar una cita.
8. **Docker:** ejecutar `docker compose ps` para demostrar que cada componente está aislado y saludable.
9. **Conclusión:** destacar mantenibilidad, seguridad básica y facilidad de despliegue.

## 17. Explicación breve para jurados

> El frontend se sirve mediante Nginx. Las operaciones se envían a una API REST desarrollada en Node.js y Express. PostgreSQL conserva la información permanente y aplica integridad relacional. Redis acelera consultas frecuentes y apoya el control de sesiones. Docker Compose permite ejecutar los cuatro componentes de forma reproducible con un solo comando.

## 18. Regla de documentación del proyecto

Cada cambio importante debe registrar:

- Qué problema resuelve.
- Qué archivos modifica.
- Qué decisión técnica se tomó y por qué.
- Cómo se prueba.
- Qué queda pendiente.

Este manual debe actualizarse a medida que se conecte el frontend con la API y se agreguen pruebas o funciones administrativas.

## 19. Registro de integración frontend–backend

### Problema resuelto

La primera versión guardaba usuarios y citas en `localStorage`. Ese mecanismo solo funciona en un navegador específico y no permite compartir datos entre equipos.

### Solución implementada

- El navegador conserva únicamente el JWT en `localStorage`.
- Registro y login se envían a la API.
- Servicios y especialistas se cargan desde PostgreSQL.
- Las citas se crean, consultan y cancelan mediante endpoints protegidos.
- Al recargar la página, el frontend valida el token consultando `/api/auth/perfil`.
- Nginx redirige las rutas `/api` al contenedor del backend.

### Archivos principales modificados

- `maquillaje-sena-v3.html`: cliente HTTP y manejo de sesión.
- `docker-compose.yml`: orquestación y puerto web 8088.
- `nginx.local.conf`: proxy inverso hacia la API.
- `Dockerfile`: actualización a Node.js 22 por compatibilidad con pnpm 11.

### Prueba realizada

La prueba completa confirmó:

- Health check en estado `ok`.
- Ocho tipos de maquillaje recuperados.
- Registro de usuario exitoso.
- Creación de cita exitosa.
- Consulta de la cita desde PostgreSQL/Redis.
- Cancelación exitosa.
- Catálogos visibles en el navegador sin errores de consola.

## 20. Módulo administrativo

### Propósito

El panel permite supervisar el sistema sin acceder directamente a PostgreSQL. Solamente aparece para usuarios cuyo campo `rol` sea `admin`.

### Seguridad por capas

Ocultar el panel en el HTML no sería una protección suficiente. Por eso la API aplica dos middlewares:

1. `autenticar` valida el JWT.
2. `soloAdmin` verifica que el token contenga el rol administrativo.

Un cliente autenticado que intente consultar `/api/admin/resumen` recibe HTTP `403 Forbidden`.

### Funciones disponibles

- Consultar número de usuarios, citas y especialistas.
- Consultar citas próximas.
- Listar usuarios registrados.
- Listar todas las citas con cliente y especialista.
- Cambiar estados entre confirmada, completada, reprogramada y cancelada.
- Invalidar la caché relacionada después de un cambio.

El archivo `bootstrap.js` agrega la columna `rol` a instalaciones existentes y crea o actualiza la cuenta administrativa definida en las variables de entorno.

## 21. Exportación PDF mejorada

El PDF se genera en el navegador con jsPDF e incluye:

- Encabezado institucional de Arte & Belleza SENA.
- Fecha y hora de generación.
- Nombre, correo y teléfono de la cliente.
- Resumen de citas totales, confirmadas y completadas.
- Tarjetas separadas para cada cita.
- Servicio, fecha, hora, especialista, estado y notas.
- Ajuste automático de notas extensas.
- Saltos de página calculados según el contenido.
- Encabezado en páginas adicionales.
- Pie institucional y numeración `Página X de Y`.
- Nombre de archivo normalizado y fechado.

## 22. Pruebas automatizadas

La suite está en `tests/integration.test.js` y se ejecuta contra los contenedores activos:

```powershell
pnpm test:integration
```

Si `pnpm` no está disponible localmente, también puede ejecutarse dentro del contenedor:

```powershell
docker compose exec -e TEST_BASE_URL=http://localhost:4000 api node --test --test-concurrency=1 tests/integration.test.js
```

Las once verificaciones actuales cubren:

1. Estado de PostgreSQL y Redis.
2. Catálogos públicos.
3. Registro y generación de JWT.
4. Rechazo administrativo para clientes.
5. Consulta de disponibilidad y creación de cita.
6. Listado de citas del cliente.
7. Login y métricas administrativas.
8. Actualización administrativa del estado.
9. Respuesta JSON para rutas inexistentes.
10. Reprogramación y liberación del horario anterior.
11. Gestión administrativa del catálogo y registro de auditoría.

Resultado validado: **16 pruebas aprobadas, 0 fallidas**. La suite cubre salud de PostgreSQL y Redis, catálogos, autenticación y autorización, ficha cosmética, disponibilidad, creación y reprogramación de citas, administración, inventario, caja, analítica, OpenAPI, métricas y rutas inexistentes.

## 23. Separación visual de la agenda

La aplicación utiliza dos rutas visuales servidas por el mismo frontend:

- `/`: página informativa, técnicas, productos, tendencias y galería.
- `/citas`: registro, login, agenda personal, PDF y administración.

Ambas rutas reutilizan el mismo HTML, CSS y JavaScript. La ruta activa agrega una clase de presentación al `<body>` y Nginx entrega el mismo archivo. Esta decisión evita duplicar formularios y lógica de autenticación.

Los botones “Agendar una cita”, el enlace del menú y las reservas iniciadas desde la galería llevan a `/citas`. Cuando se elige un look desde la galería, el nombre del servicio se conserva temporalmente y se preselecciona al abrir la agenda.

También se corrigió el tratamiento de fechas retornadas por PostgreSQL. Una fecha ISO como `2026-08-29T00:00:00.000Z` se normaliza primero a `2026-08-29` y se presenta como `29 Ago 26`, evitando que el componente de hora aparezca dentro del día.

## 24. Disponibilidad y reprogramación

Al seleccionar especialista y fecha, el frontend consulta `/api/citas/disponibilidad`. Las horas ocupadas se deshabilitan y muestran la etiqueta “Ocupado”.

Para reprogramar:

1. La cliente selecciona `Reprogramar` en una cita vigente.
2. El formulario recupera servicio, especialista, fecha, hora y notas.
3. La cliente elige el nuevo horario.
4. La API verifica propiedad de la cita y disponibilidad.
5. PostgreSQL actualiza el registro con estado `reprogramada`.
6. Redis elimina la disponibilidad anterior, la nueva y el listado de la cliente.

La unicidad de horarios utiliza un índice parcial que solo considera citas no canceladas. Así, cancelar una cita libera verdaderamente el espacio para otra reserva.

## 25. Administración del catálogo y auditoría

La pestaña `Catálogo` permite:

- Crear especialistas.
- Activar o desactivar especialistas.
- Crear servicios con nombre, slug, descripción, categoría e ícono.
- Configurar precio y duración en minutos.
- Activar o desactivar servicios.

Los servicios o especialistas inactivos dejan de aparecer en el formulario público, pero se conservan para no romper el historial de citas.

La tabla `auditoria` registra usuario administrador, acción, entidad, identificador, datos, dirección IP y fecha. La pestaña `Auditoría` permite consultar los últimos movimientos.

## 26. Preparación para servidor casero

El archivo `docker-compose.home.yml` está diseñado para el equipo que alojará el proyecto permanentemente.

### Diferencias frente al entorno de desarrollo

- Solo el frontend publica un puerto en el servidor.
- API, PostgreSQL y Redis permanecen dentro de una red Docker interna.
- PostgreSQL y Redis utilizan volúmenes persistentes.
- Redis habilita AOF para recuperar información temporal después de reinicios.
- Un servicio independiente realiza copias de PostgreSQL.
- Los respaldos se guardan físicamente en `backups/`.
- Las contraseñas no tienen valores predeterminados en la composición de servidor.

### Requisitos sugeridos del servidor

- Linux de 64 bits, preferiblemente Debian o Ubuntu Server.
- Docker Engine y complemento Docker Compose.
- Dirección IP local reservada desde el router.
- Disco con espacio para base de datos, imágenes y backups.
- Hora y zona horaria correctamente configuradas.
- Copia adicional en otro disco o equipo.
- Sistema de alimentación estable; UPS recomendado.

### Preparar configuración

```bash
cp .env.home.example .env.home
nano .env.home
mkdir -p backups
chmod 700 backups
```

Se deben reemplazar todas las claves que empiezan por `CAMBIE_`. `FRONTEND_URL` debe contener la IP local o dominio real del servidor.

### Iniciar en el servidor

```bash
docker compose --env-file .env.home -f docker-compose.home.yml up --build -d
docker compose --env-file .env.home -f docker-compose.home.yml ps
```

### Ver registros

```bash
docker compose --env-file .env.home -f docker-compose.home.yml logs -f api
docker compose --env-file .env.home -f docker-compose.home.yml logs -f backup
```

### Actualizar sin borrar datos

```bash
git pull
docker compose --env-file .env.home -f docker-compose.home.yml up --build -d
```

No se debe ejecutar `down -v` en el servidor porque `-v` elimina los volúmenes de PostgreSQL y Redis.

## 27. Copias y restauración

El servicio `backup` crea un archivo PostgreSQL en formato custom cada 24 horas. La frecuencia y retención se configuran con:

```env
BACKUP_INTERVAL_SECONDS=86400
BACKUP_RETENTION_DAYS=14
```

### Copia manual

```bash
chmod +x scripts/backup-now.sh scripts/restore.sh
./scripts/backup-now.sh
```

### Restaurar

```bash
./scripts/restore.sh backups/maquillaje_YYYYMMDD_HHMMSS.dump
```

Antes de restaurar se recomienda crear otra copia y detener temporalmente el frontend para evitar escrituras durante el proceso.

### Regla 3-2-1 recomendada

- Mantener al menos tres copias de la información.
- Utilizar dos medios diferentes.
- Conservar una copia fuera del servidor principal.

La carpeta `backups/` no se incluye en Git. Debe copiarse periódicamente a otro disco, NAS o almacenamiento externo.

## 28. Publicación segura desde casa

Para uso exclusivo dentro de la vivienda, se accede mediante la IP local y `WEB_PORT`.

Para acceso desde Internet no se deben publicar directamente los puertos 4000, 5432 ni 6379. Las alternativas recomendadas son:

- VPN privada como Tailscale o WireGuard para acceso limitado.
- Dominio con proxy inverso HTTPS si será un servicio público.
- Firewall que solo permita los puertos estrictamente necesarios.
- Certificado TLS válido.
- Actualizaciones periódicas del sistema y las imágenes Docker.

Antes de abrir el servicio públicamente también se deben cambiar todas las credenciales de demostración, probar restauración de backups y agregar almacenamiento externo para las fotografías.

## 29. Módulos Pro implementados

### Agenda avanzada

Cada especialista dispone de jornadas por día de la semana. Los intervalos se calculan cada 30 minutos y respetan la duración real del servicio, otras citas y los bloqueos administrativos. Una cita de 90 minutos impide que se ofrezca un turno superpuesto aunque la hora inicial sea distinta.

El administrador puede consultar y crear horarios, además de bloquear periodos por almuerzo, incapacidad, vacaciones, capacitación o cualquier otro motivo. Al cambiar la agenda se invalida su caché en Redis.

### CRM y ficha cosmética

Cada cliente puede registrar tipo de piel, subtono, sensibilidad, alergias, condiciones, ingredientes que se deben evitar, preferencias y consentimientos. La información se mantiene separada por usuario y solo se obtiene con un JWT válido.

Esta ficha no reemplaza una valoración médica. En la sustentación debe explicarse como información preventiva para personalizar el servicio y reducir riesgos cosméticos.

### Caja, precios y abonos

El precio se copia a la cita al reservar. Esto conserva el valor histórico aunque después cambie el catálogo. Caja permite registrar abonos por efectivo, transferencia, tarjeta u otro método. La API rechaza valores negativos y pagos que superen el saldo.

### Inventario

El módulo registra productos, marca, categoría, tono, lote, vencimiento, cantidad, unidad, stock mínimo y costo. Los movimientos de entrada, salida y ajuste se realizan dentro de una transacción PostgreSQL. Si una salida produce inventario negativo, toda la operación se cancela.

### Analítica

El panel resume citas, valor agendado, cancelaciones, inasistencias, servicios más solicitados, productividad por especialista, comportamiento mensual y alertas de inventario bajo o próximo a vencer.

## 30. PWA, correo y observabilidad

La aplicación incluye `manifest.webmanifest`, icono y service worker. En un servidor con HTTPS puede instalarse como PWA. En `localhost`, los navegadores también permiten probar esta función.

Las confirmaciones, reprogramaciones, cancelaciones y recordatorios se guardan primero en la tabla `notificaciones`. Un proceso de la API revisa la cola. Si SMTP no está configurado, simula el envío en los registros sin perder el flujo funcional. Para habilitar correo real se completan `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `SMTP_FROM` en `.env.home`.

Rutas operativas:

- Documentación OpenAPI: `http://localhost:8088/api/docs`
- Contrato JSON: `http://localhost:8088/api/openapi.json`
- Salud: `http://localhost:8088/health`
- Métricas Prometheus: `http://localhost:4000/metrics` en desarrollo

En el servidor casero Prometheus y Grafana son opcionales:

```bash
docker compose --env-file .env.home -f docker-compose.home.yml --profile monitoring up -d
```

Sus puertos se enlazan únicamente a `127.0.0.1`; para consultarlos remotamente se recomienda un túnel SSH o una VPN, no publicarlos directamente en el router.

## 31. Recorrido recomendado para la sustentación

1. Abrir `http://localhost:8088` y explicar el contenido educativo.
2. Entrar a `http://localhost:8088/citas`, crear un cliente y diligenciar la ficha cosmética.
3. Elegir servicio y especialista; mostrar cómo cambian los horarios disponibles.
4. Agendar, reprogramar y exportar el comprobante PDF.
5. Iniciar como administrador y recorrer las ocho pestañas del panel.
6. Crear un producto, registrar una salida y explicar la transacción de inventario.
7. Registrar un abono y mostrarlo en la cuenta del cliente.
8. Mostrar analítica, auditoría y documentación OpenAPI.
9. Ejecutar la suite automatizada y enseñar el resultado de 16 pruebas.
10. Cerrar explicando Docker, backups, red interna y migración al servidor casero.

## 32. Decisiones técnicas para explicar al instructor

- **PostgreSQL** almacena la información permanente y relacional.
- **Redis** acelera consultas repetidas; nunca es la fuente principal de datos.
- **Express** concentra reglas de negocio y evita exponer directamente la base de datos.
- **JWT y roles** separan clientes y administradores.
- **Docker Compose** reproduce la misma arquitectura en el portátil y en el servidor.
- **Nginx** entrega la web y funciona como único punto de entrada en producción doméstica.
- **OpenAPI** documenta el contrato que une frontend y backend.
- **Prometheus/Grafana** permiten detectar degradación y observar el servicio.
- **Backups probados** protegen los datos; un volumen por sí solo no es una copia de seguridad.
