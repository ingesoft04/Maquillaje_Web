const bcrypt=require('bcryptjs');
const {query,withTransaction}=require('./db');
const {delCache,delPattern}=require('./redis');
const {consumirPorCita}=require('./inventario.service');

async function especialistaDelUsuario(usuarioId){
  const {rows}=await query('SELECT id,nombre FROM especialistas WHERE usuario_id=$1 AND activo=TRUE',[usuarioId]);
  return rows[0]||null;
}
async function exigirEspecialista(req,res){
  if(req.usuario.rol==='admin')return null;
  const especialista=await especialistaDelUsuario(req.usuario.id);
  if(!especialista){res.status(403).json({error:'La cuenta no está vinculada a una especialista activa.'});return false;}
  return especialista;
}

async function crearCuentaEspecialista(req,res){
  const {especialista_id,email,password}=req.body;
  if(!especialista_id||!email||!password||String(password).length<10)return res.status(400).json({error:'Especialista, correo y contraseña de al menos 10 caracteres son obligatorios.'});
  try{
    const resultado=await withTransaction(async client=>{
      const esp=await client.query('SELECT * FROM especialistas WHERE id=$1 FOR UPDATE',[especialista_id]);
      if(!esp.rows.length){const e=new Error('Especialista no encontrada.');e.status=404;throw e;}
      if(esp.rows[0].usuario_id){const e=new Error('La especialista ya tiene una cuenta vinculada.');e.status=409;throw e;}
      const hash=await bcrypt.hash(password,12);
      const usuario=await client.query(`INSERT INTO usuarios(nombre,email,password_hash,rol)
        VALUES($1,$2,$3,'especialista') RETURNING id,nombre,email,rol`,[esp.rows[0].nombre,String(email).trim().toLowerCase(),hash]);
      await client.query('UPDATE especialistas SET usuario_id=$1 WHERE id=$2',[usuario.rows[0].id,especialista_id]);
      return usuario.rows[0];
    });
    return res.status(201).json({usuario:resultado});
  }catch(e){if(e.status)return res.status(e.status).json({error:e.message});if(e.code==='23505')return res.status(409).json({error:'El correo ya está registrado.'});throw e;}
}

async function miResumen(req,res){
  const esp=await exigirEspecialista(req,res);if(esp===false)return;
  const id=esp?.id||Number(req.query.especialista_id);
  if(!id)return res.status(400).json({error:'Seleccione una especialista.'});
  const [general,proximas,resenas]=await Promise.all([
    query(`SELECT COUNT(*) FILTER(WHERE fecha=CURRENT_DATE)::int hoy,
      COUNT(*) FILTER(WHERE fecha>=CURRENT_DATE AND estado!='cancelada')::int proximas,
      COUNT(*) FILTER(WHERE estado='completada')::int completadas,
      COALESCE(SUM(precio_total) FILTER(WHERE estado='completada'),0) valor_completado
      FROM citas WHERE especialista_id=$1`,[id]),
    query(`SELECT c.id,c.fecha,c.hora,c.estado,c.asistencia,u.nombre cliente,u.telefono,tm.nombre servicio,
      c.google_sync_estado FROM citas c JOIN usuarios u ON u.id=c.usuario_id
      LEFT JOIN tipos_maquillaje tm ON tm.id=c.tipo_id
      WHERE c.especialista_id=$1 AND c.fecha>=CURRENT_DATE AND c.estado!='cancelada'
      ORDER BY c.fecha,c.hora LIMIT 100`,[id]),
    query(`SELECT COALESCE(AVG(calificacion),0)::numeric(3,2) promedio,COUNT(*)::int total FROM resenas WHERE especialista_id=$1 AND visible`,[id])
  ]);
  return res.json({especialista_id:id,resumen:{...general.rows[0],...resenas.rows[0]},citas:proximas.rows});
}

async function cambiarEstadoProfesional(req,res){
  const esp=await exigirEspecialista(req,res);if(esp===false)return;
  const estados=['confirmada','en_servicio','completada','no_asistio'];
  const estado=String(req.body.estado||'');
  if(!estados.includes(estado))return res.status(400).json({error:'Estado profesional inválido.'});
  const filtro=esp?'AND especialista_id=$3':'';
  const params=esp?[estado,req.params.id,esp.id]:[estado,req.params.id];
  const {rows}=await query(`UPDATE citas SET estado=CASE WHEN $1='no_asistio' THEN estado ELSE $1 END,
    asistencia=CASE WHEN $1='no_asistio' THEN 'no_asistio' WHEN $1='completada' THEN 'asistio' ELSE asistencia END
    WHERE id=$2 ${filtro} RETURNING *`,params);
  if(!rows.length)return res.status(404).json({error:'Cita no encontrada o no asignada.'});
  let advertenciaInventario=null;
  if(estado==='completada'){
    try{await consumirPorCita(rows[0].id);}catch(e){advertenciaInventario=e.message;}
  }
  await delCache(`citas:usuario:${rows[0].usuario_id}`);
  await delPattern(`disponibilidad:${rows[0].especialista_id}:*`);
  return res.json({cita:rows[0],advertencia_inventario:advertenciaInventario});
}

async function obtenerExpediente(req,res){
  const esp=await exigirEspecialista(req,res);if(esp===false)return;
  const params=[req.params.citaId];let filtro='';
  if(esp){params.push(esp.id);filtro='AND c.especialista_id=$2';}
  const {rows}=await query(`SELECT c.id cita_id,c.usuario_id,c.especialista_id,c.fecha,c.hora,c.estado,
    u.nombre cliente,u.email,u.telefono,p.tipo_piel,p.subtono,p.sensibilidad,p.alergias,p.condiciones,p.productos_evitar,p.preferencias,
    e.* FROM citas c JOIN usuarios u ON u.id=c.usuario_id LEFT JOIN perfiles_cosmeticos p ON p.usuario_id=u.id
    LEFT JOIN expedientes_servicio e ON e.cita_id=c.id WHERE c.id=$1 ${filtro}`,params);
  if(!rows.length)return res.status(404).json({error:'Cita no encontrada o no asignada.'});
  const seguimiento=await query('SELECT * FROM seguimiento_citas WHERE cita_id=$1 ORDER BY creado_en DESC',[req.params.citaId]);
  return res.json({expediente:rows[0],seguimiento:seguimiento.rows});
}

async function guardarExpediente(req,res){
  const esp=await exigirEspecialista(req,res);if(esp===false)return;
  const cita=await query(`SELECT id,usuario_id,especialista_id FROM citas WHERE id=$1 ${esp?'AND especialista_id=$2':''}`,[req.params.citaId,...(esp?[esp.id]:[])]);
  if(!cita.rows.length)return res.status(404).json({error:'Cita no encontrada o no asignada.'});
  const c=cita.rows[0],b=req.body;
  const {rows}=await query(`INSERT INTO expedientes_servicio(cita_id,usuario_id,especialista_id,productos_usados,tonos_tecnicas,
    observaciones_previas,observaciones_posteriores,recomendaciones,reaccion_adversa,detalle_reaccion,creado_por,actualizado_por)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
    ON CONFLICT(cita_id) DO UPDATE SET productos_usados=EXCLUDED.productos_usados,tonos_tecnicas=EXCLUDED.tonos_tecnicas,
    observaciones_previas=EXCLUDED.observaciones_previas,observaciones_posteriores=EXCLUDED.observaciones_posteriores,
    recomendaciones=EXCLUDED.recomendaciones,reaccion_adversa=EXCLUDED.reaccion_adversa,
    detalle_reaccion=EXCLUDED.detalle_reaccion,actualizado_por=EXCLUDED.actualizado_por,actualizado_en=NOW() RETURNING *`,
    [c.id,c.usuario_id,c.especialista_id,b.productos_usados||null,b.tonos_tecnicas||null,b.observaciones_previas||null,
      b.observaciones_posteriores||null,b.recomendaciones||null,Boolean(b.reaccion_adversa),b.detalle_reaccion||null,req.usuario.id]);
  return res.json({expediente:rows[0]});
}

async function agregarSeguimiento(req,res){
  const esp=await exigirEspecialista(req,res);if(esp===false)return;
  const tipos=['preparacion','cuidados','incidencia','seguimiento'];
  if(!tipos.includes(req.body.tipo)||!String(req.body.contenido||'').trim())return res.status(400).json({error:'Tipo o contenido inválido.'});
  const cita=await query(`SELECT id FROM citas WHERE id=$1 ${esp?'AND especialista_id=$2':''}`,[req.params.citaId,...(esp?[esp.id]:[])]);
  if(!cita.rows.length)return res.status(404).json({error:'Cita no encontrada o no asignada.'});
  const {rows}=await query(`INSERT INTO seguimiento_citas(cita_id,tipo,contenido,creado_por,visible_cliente)
    VALUES($1,$2,$3,$4,$5) RETURNING *`,[req.params.citaId,req.body.tipo,req.body.contenido.trim(),req.usuario.id,req.body.visible_cliente!==false]);
  return res.status(201).json({seguimiento:rows[0]});
}

async function miHistorial(req,res){
  const {rows}=await query(`SELECT e.*,c.fecha,c.hora,tm.nombre servicio,es.nombre especialista
    FROM expedientes_servicio e JOIN citas c ON c.id=e.cita_id LEFT JOIN tipos_maquillaje tm ON tm.id=c.tipo_id
    JOIN especialistas es ON es.id=c.especialista_id WHERE e.usuario_id=$1 ORDER BY c.fecha DESC`,[req.usuario.id]);
  const seguimientos=await query(`SELECT s.*,c.fecha FROM seguimiento_citas s JOIN citas c ON c.id=s.cita_id
    WHERE c.usuario_id=$1 AND s.visible_cliente ORDER BY s.creado_en DESC`,[req.usuario.id]);
  return res.json({expedientes:rows,seguimientos:seguimientos.rows});
}

async function crearResena(req,res){
  const b=req.body,cal=Number(b.calificacion);
  if(!Number.isInteger(cal)||cal<1||cal>5)return res.status(400).json({error:'La calificación debe estar entre 1 y 5.'});
  const cita=await query(`SELECT id,especialista_id FROM citas WHERE id=$1 AND usuario_id=$2 AND estado='completada'`,[req.params.citaId,req.usuario.id]);
  if(!cita.rows.length)return res.status(409).json({error:'Solo puede calificar una cita propia completada.'});
  try{const {rows}=await query(`INSERT INTO resenas(cita_id,usuario_id,especialista_id,calificacion,puntualidad,atencion,resultado,comentario)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[req.params.citaId,req.usuario.id,cita.rows[0].especialista_id,cal,b.puntualidad||null,b.atencion||null,b.resultado||null,b.comentario||null]);
    return res.status(201).json({resena:rows[0]});}catch(e){if(e.code==='23505')return res.status(409).json({error:'Esta cita ya fue calificada.'});throw e;}
}
async function misResenas(req,res){const {rows}=await query('SELECT * FROM resenas WHERE usuario_id=$1 ORDER BY creado_en DESC',[req.usuario.id]);return res.json({resenas:rows});}
async function listarResenas(_req,res){const {rows}=await query(`SELECT r.*,u.nombre cliente,e.nombre especialista FROM resenas r JOIN usuarios u ON u.id=r.usuario_id JOIN especialistas e ON e.id=r.especialista_id ORDER BY r.creado_en DESC`);return res.json({resenas:rows});}
async function moderarResena(req,res){const {rows}=await query(`UPDATE resenas SET visible=$1,respuesta=$2,respondida_por=$3,actualizado_en=NOW() WHERE id=$4 RETURNING *`,[req.body.visible!==false,req.body.respuesta||null,req.usuario.id,req.params.id]);if(!rows.length)return res.status(404).json({error:'Reseña no encontrada.'});return res.json({resena:rows[0]});}

async function crearEspera(req,res){const b=req.body;if(!b.fecha_desde||!b.fecha_hasta)return res.status(400).json({error:'Rango de fechas obligatorio.'});const {rows}=await query(`INSERT INTO lista_espera(usuario_id,tipo_id,especialista_id,fecha_desde,fecha_hasta,hora_desde,hora_hasta)
  VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[req.usuario.id,b.tipo_id||null,b.especialista_id||null,b.fecha_desde,b.fecha_hasta,b.hora_desde||null,b.hora_hasta||null]);return res.status(201).json({espera:rows[0]});}
async function miEspera(req,res){const {rows}=await query('SELECT * FROM lista_espera WHERE usuario_id=$1 ORDER BY creado_en DESC',[req.usuario.id]);return res.json({espera:rows});}
async function cancelarEspera(req,res){const {rows}=await query(`UPDATE lista_espera SET estado='cancelada' WHERE id=$1 AND usuario_id=$2 AND estado IN ('activa','ofrecida') RETURNING *`,[req.params.id,req.usuario.id]);if(!rows.length)return res.status(404).json({error:'Solicitud no encontrada o no cancelable.'});return res.json({espera:rows[0]});}
async function listarEspera(_req,res){const {rows}=await query(`SELECT l.*,u.nombre cliente,u.email,tm.nombre servicio,e.nombre especialista FROM lista_espera l JOIN usuarios u ON u.id=l.usuario_id LEFT JOIN tipos_maquillaje tm ON tm.id=l.tipo_id LEFT JOIN especialistas e ON e.id=l.especialista_id ORDER BY l.estado,l.creado_en`);return res.json({espera:rows});}

async function configuracion(_req,res){const {rows}=await query('SELECT clave,valor,descripcion,actualizado_en FROM configuracion_negocio ORDER BY clave');return res.json({configuracion:Object.fromEntries(rows.map(x=>[x.clave,x.valor])),detalle:rows});}
async function guardarConfiguracion(req,res){const permitidas=['identidad','reservas','privacidad','notificaciones'];if(!permitidas.includes(req.params.clave)||typeof req.body.valor!=='object')return res.status(400).json({error:'Configuración inválida.'});const {rows}=await query(`UPDATE configuracion_negocio SET valor=$1,actualizado_por=$2,actualizado_en=NOW() WHERE clave=$3 RETURNING *`,[JSON.stringify(req.body.valor),req.usuario.id,req.params.clave]);return res.json({configuracion:rows[0]});}

async function exportarMisDatos(req,res){
  const uid=req.usuario.id;
  const [usuario,citas,perfil,pagos,expedientes,resenas,espera,consentimientos]=await Promise.all([
    query('SELECT id,nombre,email,telefono,tono_piel,rol,creado_en FROM usuarios WHERE id=$1',[uid]),
    query('SELECT * FROM citas WHERE usuario_id=$1 ORDER BY fecha',[uid]),query('SELECT * FROM perfiles_cosmeticos WHERE usuario_id=$1',[uid]),
    query(`SELECT p.* FROM pagos p JOIN citas c ON c.id=p.cita_id WHERE c.usuario_id=$1`,[uid]),
    query('SELECT * FROM expedientes_servicio WHERE usuario_id=$1',[uid]),query('SELECT * FROM resenas WHERE usuario_id=$1',[uid]),
    query('SELECT * FROM lista_espera WHERE usuario_id=$1',[uid]),query('SELECT * FROM consentimientos WHERE usuario_id=$1',[uid])
  ]);
  res.set('Content-Disposition','attachment; filename="mis-datos-arte-belleza.json"');
  return res.json({exportado_en:new Date().toISOString(),usuario:usuario.rows[0],citas:citas.rows,perfil:perfil.rows[0]||null,pagos:pagos.rows,expedientes:expedientes.rows,resenas:resenas.rows,lista_espera:espera.rows,consentimientos:consentimientos.rows});
}
async function solicitarPrivacidad(req,res){const tipos=['exportacion','correccion','eliminacion'];if(!tipos.includes(req.body.tipo))return res.status(400).json({error:'Tipo de solicitud inválido.'});const {rows}=await query(`INSERT INTO solicitudes_privacidad(usuario_id,tipo,detalle) VALUES($1,$2,$3) RETURNING *`,[req.usuario.id,req.body.tipo,req.body.detalle||null]);return res.status(201).json({solicitud:rows[0]});}
async function misSolicitudesPrivacidad(req,res){const {rows}=await query('SELECT * FROM solicitudes_privacidad WHERE usuario_id=$1 ORDER BY creado_en DESC',[req.usuario.id]);return res.json({solicitudes:rows});}
async function solicitudesPrivacidad(_req,res){const {rows}=await query(`SELECT s.*,u.nombre,u.email FROM solicitudes_privacidad s JOIN usuarios u ON u.id=s.usuario_id ORDER BY s.estado,s.creado_en`);return res.json({solicitudes:rows});}
async function resolverPrivacidad(req,res){const estados=['en_proceso','completada','rechazada'];if(!estados.includes(req.body.estado))return res.status(400).json({error:'Estado inválido.'});const {rows}=await query(`UPDATE solicitudes_privacidad SET estado=$1,respuesta=$2,resuelta_por=$3,resuelta_en=CASE WHEN $1 IN ('completada','rechazada') THEN NOW() ELSE NULL END WHERE id=$4 RETURNING *`,[req.body.estado,req.body.respuesta||null,req.usuario.id,req.params.id]);if(!rows.length)return res.status(404).json({error:'Solicitud no encontrada.'});return res.json({solicitud:rows[0]});}

module.exports={crearCuentaEspecialista,miResumen,cambiarEstadoProfesional,obtenerExpediente,guardarExpediente,agregarSeguimiento,
  miHistorial,crearResena,misResenas,listarResenas,moderarResena,crearEspera,miEspera,cancelarEspera,listarEspera,configuracion,guardarConfiguracion,
  exportarMisDatos,solicitarPrivacidad,misSolicitudesPrivacidad,solicitudesPrivacidad,resolverPrivacidad};
