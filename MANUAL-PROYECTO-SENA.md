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

### Pendiente

- Agregar pruebas automatizadas.
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
