const { query, withTransaction } = require('../config/db');
const { getCache, setCache, delCache, delPattern, TTL } = require('../config/redis');

// ── LISTAR CITAS DEL USUARIO ─────────────────────
async function mis_citas(req, res) {
  const uid    = req.usuario.id;
  const cacheKey = `citas:usuario:${uid}`;

  // Intentar desde caché
  const cached = await getCache(cacheKey);
  if (cached) return res.json({ fuente: 'cache', citas: cached });

  const { rows } = await query(
    `SELECT
       c.id, c.fecha, c.hora, c.notas, c.estado, c.creado_en,
       e.nombre  AS especialista,
       tm.nombre AS servicio,
       tm.icon   AS servicio_icon
     FROM citas c
     JOIN especialistas    e  ON c.especialista_id = e.id
     LEFT JOIN tipos_maquillaje tm ON c.tipo_id = tm.id
     WHERE c.usuario_id = $1
     ORDER BY c.fecha DESC, c.hora DESC`,
    [uid]
  );

  await setCache(cacheKey, rows, TTL.CITAS_USUARIO);
  return res.json({ fuente: 'db', citas: rows });
}

// ── AGENDAR CITA ─────────────────────────────────
async function agendar(req, res) {
  const { especialista_id, tipo_id, fecha, hora, notas } = req.body;
  const uid = req.usuario.id;

  if (!especialista_id || !fecha || !hora) {
    return res.status(400).json({ error: 'Especialista, fecha y hora son obligatorios.' });
  }

  // Verificar que la fecha no sea pasada
  const hoy = new Date().toISOString().split('T')[0];
  if (fecha < hoy) {
    return res.status(400).json({ error: 'No puedes agendar citas en fechas pasadas.' });
  }

  // Verificar disponibilidad del especialista
  const dispKey = `disponibilidad:${especialista_id}:${fecha}`;
  let horasOcupadas = await getCache(dispKey);

  if (!horasOcupadas) {
    const { rows } = await query(
      `SELECT hora::text FROM citas
       WHERE especialista_id = $1 AND fecha = $2 AND estado != 'cancelada'`,
      [especialista_id, fecha]
    );
    horasOcupadas = rows.map(r => r.hora.substring(0, 5));
    await setCache(dispKey, horasOcupadas, TTL.DISPONIBILIDAD);
  }

  const horaLimpia = hora.replace(/\s?(AM|PM)/i, '').padStart(5, '0');
  if (horasOcupadas.includes(horaLimpia)) {
    return res.status(409).json({
      error: 'Ese especialista ya tiene una cita a esa hora. Por favor elige otro horario.'
    });
  }

  // Insertar cita
  const { rows } = await query(
    `INSERT INTO citas (usuario_id, especialista_id, tipo_id, fecha, hora, notas)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, fecha, hora, estado, notas, creado_en`,
    [uid, especialista_id, tipo_id || null, fecha, hora, notas || null]
  );

  const cita = rows[0];

  // Invalidar caché afectada
  await delCache(`citas:usuario:${uid}`);
  await delCache(dispKey);

  return res.status(201).json({
    mensaje: '¡Cita agendada exitosamente!',
    cita: { ...cita, especialista_id, tipo_id }
  });
}

// ── CANCELAR CITA ────────────────────────────────
async function cancelar(req, res) {
  const uid    = req.usuario.id;
  const citaId = req.params.id;

  const { rows } = await query(
    `UPDATE citas SET estado = 'cancelada'
     WHERE id = $1 AND usuario_id = $2 AND estado = 'confirmada'
     RETURNING id, especialista_id, fecha`,
    [citaId, uid]
  );

  if (!rows.length) {
    return res.status(404).json({ error: 'Cita no encontrada o no se puede cancelar.' });
  }

  const c = rows[0];
  // Invalidar caché
  await delCache(`citas:usuario:${uid}`);
  await delCache(`disponibilidad:${c.especialista_id}:${c.fecha}`);

  return res.json({ mensaje: 'Cita cancelada correctamente.', id: c.id });
}

// ── DISPONIBILIDAD DE UN ESPECIALISTA ────────────
async function disponibilidad(req, res) {
  const { especialista_id, fecha } = req.query;
  if (!especialista_id || !fecha) {
    return res.status(400).json({ error: 'Parámetros especialista_id y fecha requeridos.' });
  }

  const cacheKey = `disponibilidad:${especialista_id}:${fecha}`;
  let horasOcupadas = await getCache(cacheKey);

  if (!horasOcupadas) {
    const { rows } = await query(
      `SELECT hora::text FROM citas
       WHERE especialista_id = $1 AND fecha = $2 AND estado != 'cancelada'`,
      [especialista_id, fecha]
    );
    horasOcupadas = rows.map(r => r.hora.substring(0, 5));
    await setCache(cacheKey, horasOcupadas, TTL.DISPONIBILIDAD);
  }

  const TODOS_LOS_HORARIOS = [
    '08:00','09:00','10:00','11:00','13:00','14:00','15:00','16:00','17:00'
  ];

  return res.json({
    especialista_id,
    fecha,
    disponibles: TODOS_LOS_HORARIOS.filter(h => !horasOcupadas.includes(h)),
    ocupados:    horasOcupadas
  });
}

module.exports = { mis_citas, agendar, cancelar, disponibilidad };
