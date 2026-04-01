require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const { pool }   = require('./config/db');
const { redis }  = require('./config/redis');

const authRoutes       = require('./routes/auth.routes');
const citasRoutes      = require('./routes/citas.routes');
const catalogoRoutes   = require('./routes/catalogo.routes');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── SEGURIDAD ────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Rate limiting global
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutos
  max: 200,
  standardHeaders: true,
  message: { error: 'Demasiadas solicitudes. Intenta en unos minutos.' }
}));

// Rate limiting estricto para auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiados intentos de autenticación. Intenta más tarde.' }
});

// ── PARSERS ───────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── LOGGING ───────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ── HEALTH CHECK ──────────────────────────────────
app.get('/health', async (req, res) => {
  let dbOk    = false;
  let redisOk = false;

  try { await pool.query('SELECT 1'); dbOk = true; } catch (_) {}
  try { await redis.ping();           redisOk = true; } catch (_) {}

  const status = dbOk && redisOk ? 200 : 503;
  return res.status(status).json({
    status: status === 200 ? 'ok' : 'degraded',
    postgres: dbOk    ? '✔ online' : '✖ offline',
    redis:    redisOk ? '✔ online' : '✖ offline',
    uptime:   process.uptime().toFixed(1) + 's',
    timestamp: new Date().toISOString()
  });
});

// ── RUTAS ─────────────────────────────────────────
app.use('/api/auth',     authLimiter, authRoutes);
app.use('/api/citas',    citasRoutes);
app.use('/api',          catalogoRoutes);

// ── 404 ───────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Ruta ${req.method} ${req.path} no encontrada.` });
});

// ── ERROR GLOBAL ──────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[ERROR]', err);
  const status = err.status || 500;
  res.status(status).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Error interno del servidor.'
      : err.message
  });
});

// ── ARRANQUE ──────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║   🌸 SENA Maquillaje API — v1.0      ║
  ║   Puerto : ${PORT}                       ║
  ║   Entorno: ${(process.env.NODE_ENV || 'development').padEnd(11)}           ║
  ╚══════════════════════════════════════╝
  `);
});

module.exports = app;
