const Redis = require('ioredis');

const redis = new Redis({
  host:     process.env.REDIS_HOST || 'localhost',
  port:     parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASS || 'redis1234',
  retryStrategy: (times) => {
    if (times > 10) return null; // dejar de reintentar
    return Math.min(times * 200, 3000);
  },
  lazyConnect: false,
});

redis.on('connect',    () => console.log('[Redis] Conectado ✔'));
redis.on('error',      (e) => console.error('[Redis] Error:', e.message));
redis.on('reconnecting', () => console.log('[Redis] Reconectando...'));

// ── TTLs estándar (en segundos) ──────────────────
const TTL = {
  SESSION:      60 * 60 * 24 * 7,  // 7 días  — sesiones
  CATALOGO:     60 * 60 * 6,       // 6 horas — catálogos (tipos, especialistas)
  TONOS:        60 * 60 * 24,      // 24 horas — tonos de piel
  CITAS_USUARIO: 60 * 5,           // 5 min   — lista de citas del usuario
  DISPONIBILIDAD: 60 * 2,          // 2 min   — horarios disponibles
};

// ── Helpers ──────────────────────────────────────

/** Lee JSON de Redis. Retorna null si no existe. */
async function getCache(key) {
  const val = await redis.get(key);
  return val ? JSON.parse(val) : null;
}

/** Guarda JSON en Redis con TTL opcional. */
async function setCache(key, data, ttl = TTL.CATALOGO) {
  await redis.set(key, JSON.stringify(data), 'EX', ttl);
}

/** Elimina una o varias claves. */
async function delCache(...keys) {
  if (keys.length) await redis.del(...keys);
}

/** Invalida todas las claves que coincidan con un patrón. */
async function delPattern(pattern) {
  const keys = await redis.keys(pattern);
  if (keys.length) await redis.del(...keys);
}

module.exports = { redis, TTL, getCache, setCache, delCache, delPattern };
