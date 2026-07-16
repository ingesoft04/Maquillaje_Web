const { query } = require('./db');
const { delCache, delPattern } = require('./redis');
const googleCalendar = require('./google-calendar');
const {consumirPorCita}=require('./inventario.service');

async function auditar(req, accion, entidad, entidadId, datos = {}) {
  await query(
    `INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, datos, ip)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [req.usuario.id, accion, entidad, String(entidadId || ''), JSON.stringify(datos), req.ip]
  );
}

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
    SELECT c.id, c.fecha, c.hora, c.estado, c.notas, c.creado_en,c.especialista_id,c.tipo_id,
           u.nombre AS cliente, u.email AS cliente_email,
           e.nombre AS especialista, tm.nombre AS servicio,c.google_sync_estado,c.google_event_url,c.google_sync_error
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
  const estados = ['confirmada', 'en_servicio', 'cancelada', 'completada', 'reprogramada'];
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
  let advertenciaInventario=null;
  let anticipoRetenido=0;
  if(estado==='completada'){
    try{await consumirPorCita(cita.id);}catch(e){advertenciaInventario=e.message;}
  }
  if(estado==='cancelada'){
    const retenidos=await query(`UPDATE pagos SET estado='retenido'
      WHERE cita_id=$1 AND concepto='anticipo' AND estado='registrado' RETURNING monto`,[cita.id]);
    anticipoRetenido=retenidos.rows.reduce((total,p)=>total+Number(p.monto),0);
  }
  await delCache(`citas:usuario:${cita.usuario_id}`);
  await delPattern(`disponibilidad:${cita.especialista_id}:${cita.fecha}:*`);
  if (estado === 'cancelada') await googleCalendar.encolar(cita.id, 'eliminar');
  else if (estado !== 'completada') await googleCalendar.encolar(cita.id, 'actualizar');
  await auditar(req, 'cambiar_estado', 'cita', cita.id, { estado });
  return res.json({
    mensaje: anticipoRetenido>0
      ? `Estado actualizado. El anticipo de $${anticipoRetenido.toLocaleString('es-CO')} quedó retenido.`
      : 'Estado actualizado.',
    cita,advertencia_inventario:advertenciaInventario,anticipo_retenido:anticipoRetenido
  });
}

async function listarEspecialistasAdmin(_req, res) {
  const { rows } = await query('SELECT id, nombre, bio, foto_url, activo,google_calendar_id,usuario_id FROM especialistas ORDER BY id');
  return res.json({ especialistas: rows });
}

async function crearEspecialista(req, res) {
  const { nombre, bio, foto_url } = req.body;
  if (!nombre || nombre.trim().length < 3) return res.status(400).json({ error: 'Nombre de especialista inválido.' });
  const { rows } = await query(
    `INSERT INTO especialistas(nombre,bio,foto_url) VALUES($1,$2,$3) RETURNING *`,
    [nombre.trim(), bio || null, foto_url || null]
  );
  await query(`INSERT INTO horarios_especialista(especialista_id,dia_semana,hora_inicio,hora_fin)
    SELECT $1,dia,'08:00','18:00' FROM (VALUES(1),(2),(3),(4),(5),(6)) d(dia) ON CONFLICT DO NOTHING`,[rows[0].id]);
  await delCache('catalogo:especialistas');
  await auditar(req, 'crear', 'especialista', rows[0].id, rows[0]);
  return res.status(201).json({ especialista: rows[0] });
}

async function editarEspecialista(req, res) {
  const { nombre, bio, foto_url, activo } = req.body;
  if (!nombre || nombre.trim().length < 3) return res.status(400).json({ error: 'Nombre de especialista inválido.' });
  const { rows } = await query(
    `UPDATE especialistas SET nombre=$1,bio=$2,foto_url=$3,activo=$4 WHERE id=$5 RETURNING *`,
    [nombre.trim(), bio || null, foto_url || null, activo !== false, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Especialista no encontrada.' });
  await delCache('catalogo:especialistas');
  await auditar(req, 'editar', 'especialista', rows[0].id, rows[0]);
  return res.json({ especialista: rows[0] });
}

async function listarServiciosAdmin(_req, res) {
  const { rows } = await query(`SELECT id,nombre,slug,descripcion,icon,categoria,precio,duracion_minutos,activo
                                FROM tipos_maquillaje ORDER BY id`);
  return res.json({ servicios: rows });
}

function validarServicio(body) {
  const precio = Number(body.precio);
  const duracion = Number(body.duracion_minutos);
  if (!body.nombre || body.nombre.trim().length < 3) return 'Nombre de servicio inválido.';
  if (!body.slug || !/^[a-z0-9-]+$/.test(body.slug)) return 'Slug inválido; usa minúsculas, números y guiones.';
  if (!Number.isFinite(precio) || precio < 0) return 'Precio inválido.';
  if (!Number.isInteger(duracion) || duracion < 15 || duracion > 480) return 'Duración inválida (15 a 480 minutos).';
  return null;
}

async function crearServicio(req, res) {
  const error = validarServicio(req.body);
  if (error) return res.status(400).json({ error });
  const b = req.body;
  try {
    const { rows } = await query(
      `INSERT INTO tipos_maquillaje(nombre,slug,descripcion,icon,categoria,precio,duracion_minutos)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [b.nombre.trim(), b.slug, b.descripcion || null, b.icon || '💄', b.categoria || 'social', Number(b.precio), Number(b.duracion_minutos)]
    );
    await delPattern('catalogo:tipos:*');
    await auditar(req, 'crear', 'servicio', rows[0].id, rows[0]);
    return res.status(201).json({ servicio: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'El slug ya existe.' });
    throw e;
  }
}

async function editarServicio(req, res) {
  const error = validarServicio(req.body);
  if (error) return res.status(400).json({ error });
  const b = req.body;
  try {
    const { rows } = await query(
      `UPDATE tipos_maquillaje SET nombre=$1,slug=$2,descripcion=$3,icon=$4,categoria=$5,
       precio=$6,duracion_minutos=$7,activo=$8 WHERE id=$9 RETURNING *`,
      [b.nombre.trim(), b.slug, b.descripcion || null, b.icon || '💄', b.categoria || 'social',
       Number(b.precio), Number(b.duracion_minutos), b.activo !== false, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Servicio no encontrado.' });
    await delPattern('catalogo:tipos:*');
    await auditar(req, 'editar', 'servicio', rows[0].id, rows[0]);
    return res.json({ servicio: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'El slug ya existe.' });
    throw e;
  }
}

async function auditoria(_req, res) {
  const { rows } = await query(`
    SELECT a.id,a.accion,a.entidad,a.entidad_id,a.datos,a.ip,a.creado_en,
           u.nombre AS usuario,u.email
    FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id
    ORDER BY a.creado_en DESC LIMIT 300
  `);
  return res.json({ auditoria: rows });
}

module.exports = {
  resumen, usuarios, citas, cambiarEstado,
  listarEspecialistasAdmin, crearEspecialista, editarEspecialista,
  listarServiciosAdmin, crearServicio, editarServicio, auditoria
};
