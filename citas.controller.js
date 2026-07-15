const { query } = require('./db');
const { getCache, setCache, delCache, delPattern, TTL } = require('./redis');

async function validarHorario({ especialista_id, tipo_id, fecha, hora, excluirId = null }) {
  const duracionResult = await query(
    'SELECT duracion_minutos,precio FROM tipos_maquillaje WHERE id=$1 AND activo=TRUE', [tipo_id]
  );
  if (!duracionResult.rows.length) return { valido:false, error:'Servicio no disponible.' };
  const duracion = Number(duracionResult.rows[0].duracion_minutos || 60);
  const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  const horario = await query(
    `SELECT 1 FROM horarios_especialista WHERE especialista_id=$1 AND dia_semana=$2 AND activo=TRUE
     AND $3::time >= hora_inicio AND $3::time + make_interval(mins=>$4) <= hora_fin LIMIT 1`,
    [especialista_id, dia, hora, duracion]
  );
  if (!horario.rows.length) return { valido:false, error:'El horario está fuera de la jornada de la especialista.' };
  const conflicto = await query(
    `SELECT 1 FROM citas c LEFT JOIN tipos_maquillaje tm ON tm.id=c.tipo_id
     WHERE c.especialista_id=$1 AND c.fecha=$2 AND c.estado!='cancelada'
       AND ($3::uuid IS NULL OR c.id!=$3::uuid)
       AND $4::time < c.hora + make_interval(mins=>COALESCE(tm.duracion_minutos,60))
       AND $4::time + make_interval(mins=>$5) > c.hora LIMIT 1`,
    [especialista_id, fecha, excluirId, hora, duracion]
  );
  if (conflicto.rows.length) return { valido:false, error:'El horario se cruza con otra cita.' };
  const bloqueo = await query(
    `SELECT 1 FROM bloqueos_agenda WHERE especialista_id=$1
     AND ($2::date+$3::time) < fin
     AND ($2::date+$3::time+make_interval(mins=>$4)) > inicio LIMIT 1`,
    [especialista_id, fecha, hora, duracion]
  );
  if (bloqueo.rows.length) return { valido:false, error:'La especialista tiene un bloqueo en ese horario.' };
  return { valido:true, duracion, precio:Number(duracionResult.rows[0].precio || 0) };
}

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
       c.especialista_id, c.tipo_id,
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

  const validacion = await validarHorario({ especialista_id, tipo_id, fecha, hora });
  if (!validacion.valido) return res.status(409).json({ error: validacion.error });

  // Insertar cita
  let rows;
  try {
    ({ rows } = await query(
      `INSERT INTO citas (usuario_id, especialista_id, tipo_id, fecha, hora, notas, precio_total)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, fecha, hora, estado, notas, precio_total, creado_en`,
      [uid, especialista_id, tipo_id || null, fecha, hora, notas || null, validacion.precio]
    ));
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'El horario acaba de ser reservado. Elige otro disponible.' });
    }
    throw error;
  }

  const cita = rows[0];

  await query(`INSERT INTO notificaciones(usuario_id,cita_id,canal,tipo,destino,programada_para)
    SELECT u.id,$1,'email','confirmacion',u.email,NOW() FROM usuarios u WHERE u.id=$2`,[cita.id,uid]);
  await query(`INSERT INTO notificaciones(usuario_id,cita_id,canal,tipo,destino,programada_para)
    SELECT u.id,$1,'email','recordatorio',u.email,($3::date+$4::time-INTERVAL '24 hours')
    FROM usuarios u WHERE u.id=$2`,[cita.id,uid,fecha,hora]);

  // Invalidar caché afectada
  await delCache(`citas:usuario:${uid}`);
  await delPattern(`disponibilidad:${especialista_id}:${fecha}:*`);

  return res.status(201).json({
    mensaje: '¡Cita agendada exitosamente!',
    cita: { ...cita, especialista_id, tipo_id }
  });
}

// ── REPROGRAMAR CITA ────────────────────────────
async function reprogramar(req, res) {
  const uid = req.usuario.id;
  const { especialista_id, tipo_id, fecha, hora, notas } = req.body;
  if (!especialista_id || !fecha || !hora) {
    return res.status(400).json({ error: 'Especialista, fecha y hora son obligatorios.' });
  }
  const hoy = new Date().toISOString().slice(0, 10);
  if (fecha < hoy) return res.status(400).json({ error: 'La nueva fecha no puede estar en el pasado.' });

  const actual = await query(
    `SELECT id, especialista_id, fecha FROM citas
     WHERE id = $1 AND usuario_id = $2 AND estado != 'cancelada'`,
    [req.params.id, uid]
  );
  if (!actual.rows.length) return res.status(404).json({ error: 'Cita no encontrada o cancelada.' });

  const validacion = await validarHorario({ especialista_id, tipo_id, fecha, hora, excluirId:req.params.id });
  if (!validacion.valido) return res.status(409).json({ error: validacion.error });

  try {
    const { rows } = await query(
      `UPDATE citas SET especialista_id=$1, tipo_id=$2, fecha=$3, hora=$4,
       notas=$5, estado='reprogramada', precio_total=$8 WHERE id=$6 AND usuario_id=$7
       RETURNING id, fecha, hora, estado`,
      [especialista_id, tipo_id || null, fecha, hora, notas || null, req.params.id, uid, validacion.precio]
    );
    const anterior = actual.rows[0];
    await query(`UPDATE notificaciones SET estado='cancelada' WHERE cita_id=$1 AND estado='pendiente'`,[req.params.id]);
    await query(`INSERT INTO notificaciones(usuario_id,cita_id,canal,tipo,destino,programada_para)
      SELECT u.id,$1,'email','reprogramacion',u.email,NOW() FROM usuarios u WHERE u.id=$2`,[req.params.id,uid]);
    await query(`INSERT INTO notificaciones(usuario_id,cita_id,canal,tipo,destino,programada_para)
      SELECT u.id,$1,'email','recordatorio',u.email,($3::date+$4::time-INTERVAL '24 hours') FROM usuarios u WHERE u.id=$2`,[req.params.id,uid,fecha,hora]);
    await delCache(`citas:usuario:${uid}`);
    await delCache(`disponibilidad:${anterior.especialista_id}:${anterior.fecha}`);
    await delCache(`disponibilidad:${especialista_id}:${fecha}`);
    return res.json({ mensaje: 'Cita reprogramada correctamente.', cita: rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'El nuevo horario ya no está disponible.' });
    throw error;
  }
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
  await query(`UPDATE notificaciones SET estado='cancelada' WHERE cita_id=$1 AND estado='pendiente'`,[c.id]);
  await query(`INSERT INTO notificaciones(usuario_id,cita_id,canal,tipo,destino,programada_para)
    SELECT u.id,$1,'email','cancelacion',u.email,NOW() FROM usuarios u WHERE u.id=$2`,[c.id,uid]);
  // Invalidar caché
  await delCache(`citas:usuario:${uid}`);
  await delCache(`disponibilidad:${c.especialista_id}:${c.fecha}`);

  return res.json({ mensaje: 'Cita cancelada correctamente.', id: c.id });
}

// ── DISPONIBILIDAD DE UN ESPECIALISTA ────────────
async function disponibilidad(req, res) {
  const { especialista_id, fecha, tipo_id } = req.query;
  if (!especialista_id || !fecha) {
    return res.status(400).json({ error: 'Parámetros especialista_id y fecha requeridos.' });
  }

  const cacheKey = `disponibilidad:${especialista_id}:${fecha}:${tipo_id || 'default'}`;
  let horasOcupadas = await getCache(cacheKey);

  if (!horasOcupadas) {
    const duracionResult = tipo_id
      ? await query('SELECT duracion_minutos FROM tipos_maquillaje WHERE id=$1 AND activo=TRUE', [tipo_id])
      : { rows: [{ duracion_minutos: 60 }] };
    const duracion = Number(duracionResult.rows[0]?.duracion_minutos || 60);
    const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay();
    const horario = await query(
      `SELECT hora_inicio::text,hora_fin::text FROM horarios_especialista
       WHERE especialista_id=$1 AND dia_semana=$2 AND activo=TRUE ORDER BY hora_inicio`,
      [especialista_id, dia]
    );
    const { rows } = await query(
      `SELECT c.hora::text, COALESCE(tm.duracion_minutos,60)::int AS duracion
       FROM citas c LEFT JOIN tipos_maquillaje tm ON tm.id=c.tipo_id
       WHERE c.especialista_id = $1 AND c.fecha = $2 AND c.estado != 'cancelada'`,
      [especialista_id, fecha]
    );
    const bloqueos = await query(
      `SELECT inicio,fin FROM bloqueos_agenda WHERE especialista_id=$1 AND inicio::date <= $2 AND fin::date >= $2`,
      [especialista_id, fecha]
    );
    const aMinutos = valor => { const [h,m] = String(valor).slice(0,5).split(':').map(Number); return h*60+m; };
    const disponibles = [];
    const ocupados = [];
    for (const tramo of horario.rows) {
      const inicio = aMinutos(tramo.hora_inicio); const fin = aMinutos(tramo.hora_fin);
      for (let minuto=inicio; minuto+duracion<=fin; minuto+=30) {
        const conflictoCita = rows.some(c => minuto < aMinutos(c.hora)+Number(c.duracion) && minuto+duracion > aMinutos(c.hora));
        const conflictoBloqueo = bloqueos.rows.some(b => {
          const bi = new Date(b.inicio); const bf = new Date(b.fin);
          return minuto < bf.getUTCHours()*60+bf.getUTCMinutes() && minuto+duracion > bi.getUTCHours()*60+bi.getUTCMinutes();
        });
        const texto = `${String(Math.floor(minuto/60)).padStart(2,'0')}:${String(minuto%60).padStart(2,'0')}`;
        (conflictoCita || conflictoBloqueo ? ocupados : disponibles).push(texto);
      }
    }
    horasOcupadas = { disponibles, ocupados, duracion };
    await setCache(cacheKey, horasOcupadas, TTL.DISPONIBILIDAD);
  }

  return res.json({
    especialista_id,
    fecha,
    disponibles: horasOcupadas.disponibles || [],
    ocupados: horasOcupadas.ocupados || [],
    duracion_minutos: horasOcupadas.duracion || 60
  });
}

module.exports = { mis_citas, agendar, reprogramar, cancelar, disponibilidad };
