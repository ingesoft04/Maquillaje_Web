# Entornos, despliegue y promoción de cambios

Este documento registra la operación vigente del sitio Arte & Belleza al 30 de octubre de 2026. No contiene contraseñas, tokens ni valores secretos.

## 1. Entornos activos

| Entorno | URL pública | Rama | Puerto interno | Datos |
|---|---|---|---:|---|
| Producción | `https://maquillaje.dev-fmv.duckdns.org/` | `main` | `127.0.0.1:8088` | PostgreSQL y Redis productivos |
| Pruebas | `https://test-maquillaje.dev-fmv.duckdns.org/` | `test` | `127.0.0.1:8089` | PostgreSQL y Redis independientes |

La dirección anterior `https://dev-fmv.duckdns.org/maquillaje/` redirige permanentemente al subdominio productivo y conserva la ruta restante.

El entorno de pruebas muestra en la parte superior:

> **Entorno de prueba · Los cambios aquí aún no están en producción**

El aviso se activa por el hostname `test-maquillaje.dev-fmv.duckdns.org`; no se muestra en producción. Pruebas también responde con `Cache-Control: no-store, private` y `X-Robots-Tag: noindex, nofollow, noarchive` para evitar caché e indexación accidental.

## 2. Alojamiento actual

La aplicación se ejecuta en una máquina virtual Ubuntu accesible administrativamente como `fmv@192.168.122.176`.

| Recurso | Ubicación |
|---|---|
| Código desplegado de producción | `/home/fmv/apps/Maquillaje_Web` |
| Código desplegado de pruebas | `/home/fmv/apps/Maquillaje_Web_Test` |
| Compose productivo | `/home/fmv/apps/Maquillaje_Web/compose.deploy.yaml` |
| Compose de pruebas | `/home/fmv/apps/Maquillaje_Web_Test/compose.test.yaml` |
| Configuración Caddy | `/home/fmv/edge/Caddyfile` |
| Contenedor proxy | `edge-caddy` |

Caddy termina HTTPS y envía cada dominio a su puerto local. PostgreSQL, Redis y la API no publican puertos hacia Internet.

## 3. Aislamiento del entorno de pruebas

`compose.test.yaml` usa el proyecto Compose `maquillaje_web_test`. Sus volúmenes actuales son:

- `maquillaje_web_test_maquillaje_test_postgres`
- `maquillaje_web_test_maquillaje_test_redis`

Por lo tanto, crear clientes, citas, pagos o cambios administrativos en pruebas no modifica producción. No deben reutilizarse los volúmenes productivos ni copiarse bases reales al entorno de pruebas sin una autorización explícita y un proceso de anonimización.

PostgreSQL de pruebas usa `postgres:16-bookworm`. Esta variante evita el error de inicialización regional observado con una base nueva en `postgres:16-alpine`.

## 4. Flujo obligatorio de cambios

1. Comprobar autorización de GitHub con `gh auth status`.
2. Ejecutar `git fetch --prune origin` antes de modificar o fusionar.
3. Confirmar que la rama local no tenga cambios pendientes ni esté detrás del remoto.
4. Implementar y confirmar el cambio en una rama de trabajo o en `test`, según el alcance acordado.
5. Publicar primero en la rama y el entorno `test`.
6. Ejecutar pruebas unitarias, integrales y comprobaciones públicas.
7. Mostrar al responsable qué se va a fusionar y proporcionar la URL de pruebas.
8. Esperar confirmación expresa. La aprobación para probar no equivale a aprobación para producción.
9. Antes de fusionar, repetir `git fetch`, revisar diferencias remotas y verificar nuevamente producción.
10. Crear una copia recuperable de la configuración y los datos afectados.
11. Fusionar a `main`, desplegar producción y validar inmediatamente.

Nunca se debe desplegar directamente un cambio funcional en producción para revisarlo allí.

## 5. Despliegue de pruebas

En la VM, el despliegue usa una copia con permisos normalizados. El archivo `.env` permanece fuera de Git y con modo `0600`.

```bash
cd /home/fmv/apps/Maquillaje_Web_Test
docker compose -p maquillaje_web_test -f compose.test.yaml up -d --build
docker compose -p maquillaje_web_test -f compose.test.yaml ps
curl -fsS http://127.0.0.1:8089/health
```

Si los archivos provienen de un sistema que presenta permisos `0770`, deben copiarse como directorios `0755` y archivos `0644`. De lo contrario, el usuario no privilegiado `node` del contenedor puede recibir `EACCES` al leer `/app/index.js`. `.env` debe conservar `0600`.

No utilice `down -v` en un entorno con información que deba conservarse. Esa opción borra exclusivamente los volúmenes del proyecto indicado, pero la pérdida dentro de ese proyecto es definitiva si no existe copia.

## 6. Configuración Caddy de pruebas

El bloque operativo es equivalente a:

```caddy
test-maquillaje.dev-fmv.duckdns.org {
  encode zstd gzip
  reverse_proxy 127.0.0.1:8089

  header {
    Cache-Control "no-store, private"
    X-Robots-Tag "noindex, nofollow, noarchive"
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
    -Server
  }
}
```

Antes de cambiar Caddy:

1. Descargar o leer la versión vigente para no sobrescribir cambios de otros sitios.
2. Crear una copia del archivo actual.
3. Validar el candidato con `caddy validate` dentro del contenedor.
4. Reemplazar el archivo solo si la validación termina correctamente.
5. Recargar con `caddy reload`; no reiniciar el proxy si no es necesario.

## 7. Validación obligatoria en pruebas

Comprobación pública mínima:

```bash
curl -fsS https://test-maquillaje.dev-fmv.duckdns.org/health
curl -fsS https://test-maquillaje.dev-fmv.duckdns.org/api/tipos
curl -fsS https://test-maquillaje.dev-fmv.duckdns.org/api/especialistas
curl -fsS https://test-maquillaje.dev-fmv.duckdns.org/metrics
curl -fsSI https://test-maquillaje.dev-fmv.duckdns.org/
```

Debe comprobarse además:

- certificado HTTPS válido;
- aviso visible con el texto exacto;
- portada, `/citas` y `/aprende` con respuesta 200;
- catálogo cargado sin mensajes de error;
- selección de maquillaje conservada al abrir citas;
- CORS aceptando únicamente el origen de pruebas en ese entorno;
- cabeceras `no-store` y `noindex`;
- todos los contenedores saludables;
- producción todavía saludable y sin el aviso de pruebas.

La suite integral puede ejecutarse dentro del contenedor API, evitando que una ráfaga automatizada sea confundida con abuso por el limitador Nginx:

```bash
docker exec \
  -e TEST_BASE_URL=http://127.0.0.1:4000 \
  maquillaje_web_test-api-1 \
  node --test --test-concurrency=1 tests/integration.test.js
```

La validación del 29 de octubre de 2026 terminó con **25 de 25 pruebas integrales aprobadas**. El proxy también se verificó por separado. `/metrics` se enruta expresamente desde Nginx hacia la API.

## 8. Promoción a producción

La promoción solo comienza después de la aprobación del responsable al resultado visible en pruebas. Antes de la fusión se debe mostrar:

- commits incluidos;
- archivos modificados;
- resultado de pruebas;
- riesgos y plan de reversión;
- confirmación de que `main` y producción siguen sincronizados.

Después de fusionar a `main`, despliegue con el Compose productivo existente. No use `compose.test.yaml`, el puerto 8089 ni los volúmenes de pruebas para producción.

Validación posterior mínima:

```bash
curl -fsS https://maquillaje.dev-fmv.duckdns.org/health
curl -fsS https://maquillaje.dev-fmv.duckdns.org/api/tipos
curl -fsS https://maquillaje.dev-fmv.duckdns.org/api/especialistas
```

También deben repetirse los flujos visuales y funcionales aprobados en pruebas.

## 9. Reversión

Antes de cada despliegue productivo deben guardarse como mínimo:

- revisión Git actualmente desplegada;
- archivo Compose productivo;
- configuración Caddy vigente;
- copia verificada de PostgreSQL cuando el cambio afecte datos o migraciones.

Para revertir, despliegue la revisión anterior conocida, restaure su configuración y recargue Caddy tras validarlo. Una base de datos solo debe restaurarse cuando el cambio haya modificado su esquema o datos de forma incompatible; la restauración requiere una copia adicional y una ventana controlada.

## 10. Estado registrado

- Producción permanece en `main`, revisión `2f03751`, al crear el entorno de pruebas.
- Pruebas se encuentra en la rama `test`.
- La creación del entorno de pruebas no se fusionó a producción.
- El dominio productivo no cambió.
- La paleta café, vintage, clara y crema no fue alterada por esta infraestructura.
