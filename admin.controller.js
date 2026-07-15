const { query } = require('./db');
const { delCache } = require('./redis');

async function resumen(_req, res) {
  const { rows } = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM usuarios) AS usuarios,
      (SELECT COUNT(*)::int FROM citas) AS citas_total,
      (SELECT COUNT(*)::int FROM citas WHERE estado = 'confirmada' AND fecha >= CURRENT_DATE) AS citas_proximas,
      (SELECT COUNT(*)::int FROM especialistas WHERE activo = TRUE) AS especialistas
  `);
  return res.json(rows[0]);
}

async function usuarios(_req, res) {
  const { rows } = await query(`
    SELECT id, nombre, email, telefono, rol, tono_piel, creado_en
    FROM usuarios ORDER BY creado_en DESC LIMIT 200
  `);
  return res.json({ usuarios: rows });
}

async function citas(req, res) {
  const estado = req.query.estado;
  const params = [];
  let filtro = '';
  if (estado) {
    params.push(estado);
    filtro = 'WHERE c.estado = $1';
  }
  const { rows } = await query(`
    SELECT c.id, c.fecha, c.hora, c.estado, c.notas, c.creado_en,
           u.nombre AS cliente, u.email AS cliente_email,
           e.nombre AS especialista, tm.nombre AS servicio
    FROM citas c
    JOIN usuarios u ON u.id = c.usuario_id
    JOIN especialistas e ON e.id = c.especialista_id
    LEFT JOIN tipos_maquillaje tm ON tm.id = c.tipo_id
    ${filtro}
    ORDER BY c.fecha DESC, c.hora DESC LIMIT 300
  `, params);
  return res.json({ citas: rows });
}

async function cambiarEstado(req, res) {
  const estados = ['confirmada', 'cancelada', 'completada', 'reprogramada'];
  const estado = String(req.body.estado || '').toLowerCase();
  if (!estados.includes(estado)) {
    return res.status(400).json({ error: 'Estado de cita no permitido.' });
  }

  const { rows } = await query(
    `UPDATE citas SET estado = $1 WHERE id = $2
     RETURNING id, usuario_id, especialista_id, fecha, estado`,
    [estado, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Cita no encontrada.' });

  const cita = rows[0];
  await delCache(`citas:usuario:${cita.usuario_id}`);
  await delCache(`disponibilidad:${cita.especialista_id}:${cita.fecha}`);
  return res.json({ mensaje: 'Estado actualizado.', cita });
}

module.exports = { resumen, usuarios, citas, cambiarEstado };
