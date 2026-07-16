require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const { pool }   = require('./db');
const { errorHandler } = require('./middleware/errorHandler');
const { redis }  = require('./redis');

const authRoutes       = require('./routes/auth.routes');
const citasRoutes      = require('./routes/citas.routes');
const catalogoRoutes   = require('./routes/catalogo.routes');
const comparacionesRoutes = require('./routes/comparaciones.routes');
const adminRoutes = require('./routes/admin.routes');
const proRoutes = require('./routes/pro.routes');
const googleRoutes = require('./routes/google.routes');
const profesionalRoutes = require('./routes/profesional.routes');
const { prepararBaseDeDatos } = require('./bootstrap');
const { iniciarNotificaciones } = require('./notifications');
const { iniciarSincronizacion } = require('./google-calendar');
const { middlewareMetricas, endpointMetricas } = require('./metrics');
const openapi = require('./openapi');

const app  = express();
const PORT = process.env.PORT || 4000;
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

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
app.use(middlewareMetricas);

// ── LOGGING ───────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ── HEALTH CHECK ──────────────────────────────────
app.get('/health', async (req, res) => {
  let dbOk    = false;
  let redisOk = false;
  let googleConectado = false;

  try { const g=await pool.query('SELECT EXISTS(SELECT 1 FROM google_oauth WHERE id=1) conectado'); dbOk = true; googleConectado=g.rows[0].conectado; } catch (_) {}
  try { await redis.ping();           redisOk = true; } catch (_) {}

  const status = dbOk && redisOk ? 200 : 503;
  return res.status(status).json({
    status: status === 200 ? 'ok' : 'degraded',
    postgres: dbOk    ? '✔ online' : '✖ offline',
    redis:    redisOk ? '✔ online' : '✖ offline',
    google_calendar: googleConectado ? '✔ conectado' : '○ no conectado',
    uptime:   process.uptime().toFixed(1) + 's',
    timestamp: new Date().toISOString()
  });
});
app.get('/metrics', endpointMetricas);
app.get('/api/openapi.json', (_req,res)=>res.json(openapi));
app.get('/api/docs', (_req, res) => res.type('html').send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Arte & Belleza API</title><style>
body{font:16px system-ui;max-width:920px;margin:40px auto;padding:0 20px;color:#27222a}h1{color:#8d3c68}
pre{background:#f7f2f5;padding:18px;border-radius:12px;overflow:auto}a{color:#8d3c68}
</style></head><body><h1>Arte & Belleza · API OpenAPI</h1>
<p>Contrato navegable de la API. <a href="/api/openapi.json">Descargar OpenAPI JSON</a></p>
<div id="contenido">Cargando…</div><script>
fetch('/api/openapi.json').then(r=>r.json()).then(api=>{
 const rutas=Object.entries(api.paths||{}).flatMap(([ruta,metodos])=>Object.entries(metodos).map(([metodo,d])=>
   '<h3>'+metodo.toUpperCase()+' '+ruta+'</h3><p>'+(d.summary||'')+'</p>'));
 document.querySelector('#contenido').innerHTML='<p><strong>Versión:</strong> '+api.info.version+'</p>'+rutas.join('');
}).catch(()=>document.querySelector('#contenido').textContent='No fue posible cargar el contrato.');
</script></body></html>`));

// ── RUTAS ─────────────────────────────────────────
app.use('/api/auth',     authLimiter, authRoutes);
app.use('/api/citas',    citasRoutes);
app.use('/api',          catalogoRoutes);
app.use('/api/comparaciones', comparacionesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', proRoutes);
app.use('/api', googleRoutes);
app.use('/api', profesionalRoutes);

// ── 404 ───────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Ruta ${req.method} ${req.path} no encontrada.` });
});

// ── ERROR GLOBAL ──────────────────────────────────
app.use(errorHandler);

// ── ARRANQUE ──────────────────────────────────────
async function iniciar() {
  await prepararBaseDeDatos();
  iniciarNotificaciones();
  iniciarSincronizacion();
  return app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║   🌸 SENA Maquillaje API — v1.0      ║
  ║   Puerto : ${PORT}                       ║
  ║   Entorno: ${(process.env.NODE_ENV || 'development').padEnd(11)}           ║
  ╚══════════════════════════════════════╝
  `);
  });
}

if (require.main === module) {
  iniciar().catch((error) => {
    console.error('[ARRANQUE]', error);
    process.exit(1);
  });
}

module.exports = { app, iniciar };
