const { query, withTransaction } = require('./db');
const { delPattern } = require('./redis');

async function obtenerPerfil(req, res) {
  const { rows } = await query('SELECT * FROM perfiles_cosmeticos WHERE usuario_id=$1', [req.usuario.id]);
  return res.json({ perfil: rows[0] || null });
}

async function guardarPerfil(req, res) {
  const b = req.body;
  const permitidos = ['seca','grasa','mixta','sensible','normal','madura',null,''];
  if (!permitidos.includes(b.tipo_piel ?? null)) return res.status(400).json({ error:'Tipo de piel inválido.' });
  const { rows } = await query(`
    INSERT INTO perfiles_cosmeticos(usuario_id,tipo_piel,subtono,sensibilidad,alergias,condiciones,
      productos_evitar,preferencias,consentimiento_datos,consentimiento_imagen,actualizado_en)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
    ON CONFLICT(usuario_id) DO UPDATE SET tipo_piel=EXCLUDED.tipo_piel,subtono=EXCLUDED.subtono,
      sensibilidad=EXCLUDED.sensibilidad,alergias=EXCLUDED.alergias,condiciones=EXCLUDED.condiciones,
      productos_evitar=EXCLUDED.productos_evitar,preferencias=EXCLUDED.preferencias,
      consentimiento_datos=EXCLUDED.consentimiento_datos,consentimiento_imagen=EXCLUDED.consentimiento_imagen,
      actualizado_en=NOW() RETURNING *`,
    [req.usuario.id,b.tipo_piel||null,b.subtono||null,b.sensibilidad||null,b.alergias||null,b.condiciones||null,
     b.productos_evitar||null,b.preferencias||null,Boolean(b.consentimiento_datos),Boolean(b.consentimiento_imagen)]
  );
  return res.json({ perfil:rows[0] });
}

async function misPagos(req, res) {
  const { rows } = await query(`SELECT p.*,c.fecha,c.hora,tm.nombre AS servicio
    FROM pagos p JOIN citas c ON c.id=p.cita_id LEFT JOIN tipos_maquillaje tm ON tm.id=c.tipo_id
    WHERE c.usuario_id=$1 ORDER BY p.creado_en DESC`,[req.usuario.id]);
  return res.json({ pagos:rows });
}

async function listarPagos(_req,res) {
  const { rows } = await query(`SELECT p.*,u.nombre AS cliente,u.email,tm.nombre AS servicio,c.fecha
    FROM pagos p JOIN citas c ON c.id=p.cita_id JOIN usuarios u ON u.id=c.usuario_id
    LEFT JOIN tipos_maquillaje tm ON tm.id=c.tipo_id ORDER BY p.creado_en DESC LIMIT 300`);
  return res.json({ pagos:rows });
}

async function registrarPago(req,res) {
  const { cita_id,monto,metodo,referencia }=req.body;
  const valor=Number(monto); const metodos=['efectivo','transferencia','tarjeta','otro'];
  if(!cita_id||!Number.isFinite(valor)||valor<=0||!metodos.includes(metodo)) return res.status(400).json({error:'Datos de pago inválidos.'});
  const cita=await query('SELECT id,precio_total FROM citas WHERE id=$1',[cita_id]);
  if(!cita.rows.length) return res.status(404).json({error:'Cita no encontrada.'});
  const acumulado=await query(`SELECT COALESCE(SUM(CASE WHEN estado='registrado' THEN monto ELSE -monto END),0) total FROM pagos WHERE cita_id=$1`,[cita_id]);
  if(Number(acumulado.rows[0].total)+valor>Number(cita.rows[0].precio_total)) return res.status(409).json({error:'El pago supera el saldo pendiente.'});
  const {rows}=await query(`INSERT INTO pagos(cita_id,monto,metodo,referencia,registrado_por)
    VALUES($1,$2,$3,$4,$5) RETURNING *`,[cita_id,valor,metodo,referencia||null,req.usuario.id]);
  return res.status(201).json({pago:rows[0]});
}

async function listarInventario(_req,res) {
  const {rows}=await query(`SELECT *, cantidad<=stock_minimo AS stock_bajo,
    vence_en IS NOT NULL AND vence_en<=CURRENT_DATE+INTERVAL '60 days' AS por_vencer
    FROM inventario_productos ORDER BY activo DESC,nombre`);
  return res.json({productos:rows});
}

async function crearProducto(req,res) {
  const b=req.body; const cantidad=Number(b.cantidad||0);
  if(!b.nombre||!Number.isFinite(cantidad)||cantidad<0) return res.status(400).json({error:'Producto o cantidad inválidos.'});
  const {rows}=await query(`INSERT INTO inventario_productos(nombre,marca,categoria,tono,lote,vence_en,cantidad,unidad,stock_minimo,costo_unitario)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [b.nombre.trim(),b.marca||null,b.categoria||null,b.tono||null,b.lote||null,b.vence_en||null,cantidad,b.unidad||'unidad',Number(b.stock_minimo||0),Number(b.costo_unitario||0)]);
  return res.status(201).json({producto:rows[0]});
}

async function movimientoInventario(req,res) {
  const {tipo,motivo,cita_id}=req.body; const cantidad=Number(req.body.cantidad);
  if(!['entrada','salida','ajuste'].includes(tipo)||!Number.isFinite(cantidad)||cantidad<=0) return res.status(400).json({error:'Movimiento inválido.'});
  try {
    const resultado=await withTransaction(async client=>{
      const actual=await client.query('SELECT * FROM inventario_productos WHERE id=$1 FOR UPDATE',[req.params.id]);
      if(!actual.rows.length){const e=new Error('Producto no encontrado.');e.status=404;throw e;}
      const stock=Number(actual.rows[0].cantidad); const nuevo=tipo==='entrada'?stock+cantidad:tipo==='salida'?stock-cantidad:cantidad;
      if(nuevo<0){const e=new Error('Stock insuficiente.');e.status=409;throw e;}
      const producto=await client.query('UPDATE inventario_productos SET cantidad=$1,actualizado_en=NOW() WHERE id=$2 RETURNING *',[nuevo,req.params.id]);
      const movimiento=await client.query(`INSERT INTO inventario_movimientos(producto_id,tipo,cantidad,motivo,cita_id,usuario_id)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[req.params.id,tipo,cantidad,motivo||null,cita_id||null,req.usuario.id]);
      return {producto:producto.rows[0],movimiento:movimiento.rows[0]};
    });
    return res.json(resultado);
  } catch(e){if(e.status)return res.status(e.status).json({error:e.message});throw e;}
}

async function horarios(req,res){const {rows}=await query(`SELECT h.*,e.nombre especialista FROM horarios_especialista h JOIN especialistas e ON e.id=h.especialista_id ORDER BY e.nombre,dia_semana,hora_inicio`);return res.json({horarios:rows});}
async function guardarHorario(req,res){const b=req.body;if(!b.especialista_id||b.dia_semana<0||b.dia_semana>6||!b.hora_inicio||!b.hora_fin)return res.status(400).json({error:'Horario inválido.'});const {rows}=await query(`INSERT INTO horarios_especialista(especialista_id,dia_semana,hora_inicio,hora_fin) VALUES($1,$2,$3,$4) RETURNING *`,[b.especialista_id,b.dia_semana,b.hora_inicio,b.hora_fin]);await delPattern(`disponibilidad:${b.especialista_id}:*`);return res.status(201).json({horario:rows[0]});}
async function eliminarHorario(req,res){const {rows}=await query('DELETE FROM horarios_especialista WHERE id=$1 RETURNING especialista_id',[req.params.id]);if(!rows.length)return res.status(404).json({error:'Horario no encontrado.'});await delPattern(`disponibilidad:${rows[0].especialista_id}:*`);return res.json({mensaje:'Horario eliminado.'});}

async function bloqueos(req,res){const {rows}=await query(`SELECT b.*,e.nombre especialista FROM bloqueos_agenda b JOIN especialistas e ON e.id=b.especialista_id WHERE fin>=NOW() ORDER BY inicio`);return res.json({bloqueos:rows});}
async function crearBloqueo(req,res){const b=req.body;if(!b.especialista_id||!b.inicio||!b.fin||new Date(b.fin)<=new Date(b.inicio))return res.status(400).json({error:'Bloqueo inválido.'});const {rows}=await query(`INSERT INTO bloqueos_agenda(especialista_id,inicio,fin,motivo,creado_por) VALUES($1,$2,$3,$4,$5) RETURNING *`,[b.especialista_id,b.inicio,b.fin,b.motivo||null,req.usuario.id]);await delPattern(`disponibilidad:${b.especialista_id}:*`);return res.status(201).json({bloqueo:rows[0]});}
async function eliminarBloqueo(req,res){const {rows}=await query('DELETE FROM bloqueos_agenda WHERE id=$1 RETURNING especialista_id',[req.params.id]);if(!rows.length)return res.status(404).json({error:'Bloqueo no encontrado.'});await delPattern(`disponibilidad:${rows[0].especialista_id}:*`);return res.json({mensaje:'Bloqueo eliminado.'});}

async function analitica(_req,res){
  const [general,servicios,especialistas,mensual,inventario]=await Promise.all([
    query(`SELECT COUNT(*)::int citas,COALESCE(SUM(precio_total),0) valor_agendado,
      COUNT(*) FILTER(WHERE estado='cancelada')::int canceladas,COUNT(*) FILTER(WHERE asistencia='no_asistio')::int no_asistieron FROM citas`),
    query(`SELECT tm.nombre,COUNT(*)::int total,COALESCE(SUM(c.precio_total),0) ingresos FROM citas c LEFT JOIN tipos_maquillaje tm ON tm.id=c.tipo_id GROUP BY tm.nombre ORDER BY total DESC LIMIT 10`),
    query(`SELECT e.nombre,COUNT(*)::int total FROM citas c JOIN especialistas e ON e.id=c.especialista_id GROUP BY e.nombre ORDER BY total DESC`),
    query(`SELECT TO_CHAR(DATE_TRUNC('month',fecha),'YYYY-MM') mes,COUNT(*)::int total,COALESCE(SUM(precio_total),0) valor FROM citas GROUP BY 1 ORDER BY 1 DESC LIMIT 12`),
    query(`SELECT COUNT(*) FILTER(WHERE cantidad<=stock_minimo)::int stock_bajo,COUNT(*) FILTER(WHERE vence_en<=CURRENT_DATE+INTERVAL '60 days')::int por_vencer FROM inventario_productos WHERE activo`)
  ]);
  return res.json({general:general.rows[0],servicios:servicios.rows,especialistas:especialistas.rows,mensual:mensual.rows,inventario:inventario.rows[0]});
}

module.exports={obtenerPerfil,guardarPerfil,misPagos,listarPagos,registrarPago,listarInventario,crearProducto,movimientoInventario,horarios,guardarHorario,eliminarHorario,bloqueos,crearBloqueo,eliminarBloqueo,analitica};
