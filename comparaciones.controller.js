const { query } = require('../config/db');
const { getCache, setCache, delCache, TTL } = require('../config/redis');

// ── CREAR COMPARACIÓN ANTES/DESPUÉS ─────────────
async function crear(req, res) {
  const uid = req.usuario.id;
  const { titulo, tipo_id, antes_url, despues_url, descripcion, publica } = req.body;

  if (!antes_url || !despues_url) {
    return res.status(400).json({ error: 'Las URLs de antes y después son requeridas.' });
  }

  const { rows } = await query(
    `INSERT INTO comparaciones (usuario_id, titulo, tipo_id, antes_url, despues_url, descripcion, publica)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [uid, titulo || null, tipo_id || null, antes_url, despues_url, descripcion || null, publica || false]
  );

  await delCache(`comparaciones:usuario:${uid}`);
  return res.status(201).json({ mensaje: 'Comparación guardada.', comparacion: rows[0] });
}

// ── MIS COMPARACIONES ────────────────────────────
async function mis_comparaciones(req, res) {
  const uid = req.usuario.id;
  const cacheKey = `comparaciones:usuario:${uid}`;

  const cached = await getCache(cacheKey);
  if (cached) return res.json({ fuente: 'cache', comparaciones: cached });

  const { rows } = await query(
    `SELECT c.*, tm.nombre AS tipo_nombre, tm.icon
     FROM comparaciones c
     LEFT JOIN tipos_maquillaje tm ON c.tipo_id = tm.id
     WHERE c.usuario_id = $1
     ORDER BY c.creado_en DESC`,
    [uid]
  );

  await setCache(cacheKey, rows, TTL.CITAS_USUARIO);
  return res.json({ fuente: 'db', comparaciones: rows });
}

// ── COMPARACIONES PÚBLICAS (galería) ─────────────
async function publicas(req, res) {
  const cacheKey = 'comparaciones:publicas';
  const cached = await getCache(cacheKey);
  if (cached) return res.json({ fuente: 'cache', comparaciones: cached });

  const { rows } = await query(
    `SELECT c.id, c.titulo, c.antes_url, c.despues_url, c.descripcion, c.creado_en,
            tm.nombre AS tipo_nombre, tm.icon
     FROM comparaciones c
     LEFT JOIN tipos_maquillaje tm ON c.tipo_id = tm.id
     WHERE c.publica = TRUE
     ORDER BY c.creado_en DESC
     LIMIT 50`
  );

  await setCache(cacheKey, rows, TTL.CATALOGO);
  return res.json({ fuente: 'db', comparaciones: rows });
}

// ── ELIMINAR COMPARACIÓN ─────────────────────────
async function eliminar(req, res) {
  const uid = req.usuario.id;
  const { id } = req.params;

  const { rowCount } = await query(
    'DELETE FROM comparaciones WHERE id = $1 AND usuario_id = $2',
    [id, uid]
  );

  if (!rowCount) {
    return res.status(404).json({ error: 'Comparación no encontrada.' });
  }

  await delCache(`comparaciones:usuario:${uid}`);
  await delCache('comparaciones:publicas');
  return res.json({ mensaje: 'Comparación eliminada.' });
}

// ── EXPORTAR CITA COMO DATOS JSON (para PDF en frontend) ─
async function exportarCita(req, res) {
  const uid    = req.usuario.id;
  const citaId = req.params.id;

  const { rows } = await query(
    `SELECT
       c.id, c.fecha, c.hora, c.notas, c.estado, c.creado_en,
       u.nombre  AS cliente_nombre,
       u.email   AS cliente_email,
       u.telefono AS cliente_telefono,
       e.nombre  AS especialista,
       tm.nombre AS servicio,
       tm.descripcion AS servicio_desc
     FROM citas c
     JOIN usuarios         u  ON c.usuario_id = u.id
     JOIN especialistas    e  ON c.especialista_id = e.id
     LEFT JOIN tipos_maquillaje tm ON c.tipo_id = tm.id
     WHERE c.id = $1 AND c.usuario_id = $2`,
    [citaId, uid]
  );

  if (!rows.length) {
    return res.status(404).json({ error: 'Cita no encontrada.' });
  }

  const cita = rows[0];

  // Formatear fecha en español
  const fecha = new Date(cita.fecha);
  const meses = ['enero','febrero','marzo','abril','mayo','junio',
                  'julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const fechaFormateada = `${fecha.getUTCDate()} de ${meses[fecha.getUTCMonth()]} de ${fecha.getUTCFullYear()}`;

  return res.json({
    comprobante: {
      ...cita,
      fecha_formateada: fechaFormateada,
      generado_en: new Date().toISOString(),
      institucion: 'SENA — Arte & Belleza',
      programa: 'Cosmetología y Estética Integral'
    }
  });
}

module.exports = { crear, mis_comparaciones, publicas, eliminar, exportarCita };
