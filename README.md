# 🌸 SENA Maquillaje — Backend API

Backend completo para el proyecto **Arte & Belleza SENA**, construido con:

- **Node.js 20 + Express** — API REST
- **PostgreSQL 16** — base de datos principal
- **Redis 7** — caché de alta velocidad y manejo de sesiones
- **Docker Compose** — orquestación de servicios

---

## 🚀 Inicio rápido (3 pasos)

### 1. Clonar y configurar variables de entorno

```bash
git clone <tu-repositorio>
cd maquillaje-sena-backend

cp .env.example .env
# Edita .env con tus valores reales
```

### 2. Levantar todo con Docker

```bash
docker compose up -d
```

Docker automáticamente:
- Crea la base de datos PostgreSQL
- Ejecuta el schema SQL (`sql/init.sql`)
- Carga los datos iniciales (especialistas, tipos de maquillaje, tonos de piel)
- Levanta Redis con contraseña
- Inicia la API en el puerto 4000

### 3. Verificar que funciona

```bash
curl http://localhost:4000/health
```

Respuesta esperada:
```json
{
  "status": "ok",
  "postgres": "✔ online",
  "redis": "✔ online"
}
```

---

## 📡 Endpoints de la API

### Autenticación

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/registro` | Crear cuenta nueva |
| POST | `/api/auth/login` | Iniciar sesión → retorna JWT |
| POST | `/api/auth/logout` | Cerrar sesión (revoca token en Redis) |
| GET  | `/api/auth/perfil` | Perfil del usuario autenticado |

**Ejemplo registro:**
```json
POST /api/auth/registro
{
  "nombre": "Laura García",
  "email": "laura@email.com",
  "telefono": "3001234567",
  "password": "mipass123"
}
```

### Citas 🗓️

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET  | `/api/citas` | Mis citas (con caché Redis) |
| POST | `/api/citas` | Agendar nueva cita |
| PATCH | `/api/citas/:id/cancelar` | Cancelar cita |
| GET  | `/api/citas/disponibilidad?especialista_id=1&fecha=2025-08-15` | Horarios disponibles |
| GET  | `/api/citas/:id/exportar` | Datos del comprobante (para PDF) |

**Ejemplo agendar cita:**
```json
POST /api/citas
Authorization: Bearer <token>
{
  "especialista_id": 1,
  "tipo_id": 2,
  "fecha": "2025-08-20",
  "hora": "10:00",
  "notas": "Piel sensible"
}
```

### Catálogo 🎨

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/tipos` | Todos los tipos de maquillaje |
| GET | `/api/tipos?categoria=artistico` | Filtrar por categoría |
| GET | `/api/especialistas` | Lista de especialistas |
| GET | `/api/tonos` | Tonos de piel disponibles |
| POST | `/api/tonos/calcular` | Calculadora de tono de piel |

**Ejemplo calculadora de tono:**
```json
POST /api/tonos/calcular
{
  "subtono": "calido",
  "luminosidad": 2
}
```
→ Retorna tono recomendado, color hex, temporadas y productos sugeridos.

### Comparaciones antes/después 📸

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET  | `/api/comparaciones/publicas` | Galería pública |
| GET  | `/api/comparaciones` | Mis comparaciones |
| POST | `/api/comparaciones` | Subir nueva comparación |
| DELETE | `/api/comparaciones/:id` | Eliminar comparación |

---

## 🏗️ Arquitectura de caché (Redis)

| Clave | TTL | Contenido |
|-------|-----|-----------|
| `catalogo:tipos:*` | 6 horas | Tipos de maquillaje |
| `catalogo:especialistas` | 6 horas | Lista de especialistas |
| `catalogo:tonos` | 24 horas | Tonos de piel |
| `citas:usuario:{id}` | 5 min | Citas de un usuario |
| `disponibilidad:{esp}:{fecha}` | 2 min | Horarios ocupados |
| `session:{user_id}` | 7 días | Sesión activa |
| `revoked:{token}` | 1 hora | Tokens revocados (logout) |

---

## 🔗 Conectar el frontend HTML

En el archivo `maquillaje-sena.html`, agrega al inicio del `<script>`:

```javascript
const API = 'http://localhost:4000/api';
let TOKEN = localStorage.getItem('sena_token');

// Ejemplo: login
async function login() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  TOKEN = data.token;
  localStorage.setItem('sena_token', TOKEN);
}

// Ejemplo: agendar cita
async function agendarCita(citaData) {
  const res = await fetch(`${API}/citas`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`
    },
    body: JSON.stringify(citaData)
  });
  return res.json();
}
```

---

## 🛠️ Desarrollo local sin Docker

```bash
# Instalar dependencias
npm install

# Necesitas PostgreSQL y Redis corriendo localmente
# Luego:
npm run dev
```

---

## 📁 Estructura del proyecto

```
maquillaje-sena-backend/
├── docker-compose.yml      # Orquestación de servicios
├── Dockerfile              # Imagen de la API
├── .env.example            # Variables de entorno
├── package.json
├── sql/
│   └── init.sql            # Schema + datos iniciales
└── src/
    ├── index.js            # Servidor Express
    ├── config/
    │   ├── db.js           # Pool PostgreSQL
    │   └── redis.js        # Cliente Redis + helpers
    ├── middleware/
    │   └── auth.js         # Verificación JWT
    ├── controllers/
    │   ├── auth.controller.js
    │   ├── citas.controller.js
    │   ├── catalogo.controller.js
    │   └── comparaciones.controller.js
    └── routes/
        ├── auth.routes.js
        ├── citas.routes.js
        └── catalogo.routes.js
```
