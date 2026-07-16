const {query}=require('./db');

async function datos(){
  const [finanzas,servicios,especialistas,horas,clientes,inventario]=await Promise.all([
    query(`SELECT TO_CHAR(DATE_TRUNC('month',c.fecha),'YYYY-MM') mes,COUNT(*)::int citas,
      COALESCE(SUM(c.precio_total),0) agendado,COALESCE(SUM(p.pagado),0) cobrado,
      COALESCE(SUM(GREATEST(c.precio_total-COALESCE(p.pagado,0),0)),0) pendiente,
      COUNT(*) FILTER(WHERE c.estado='cancelada')::int canceladas,
      COUNT(*) FILTER(WHERE c.asistencia='no_asistio')::int inasistencias
      FROM citas c LEFT JOIN (SELECT cita_id,SUM(monto) FILTER(WHERE estado IN ('registrado','retenido')) pagado FROM pagos GROUP BY cita_id) p ON p.cita_id=c.id
      GROUP BY 1 ORDER BY 1 DESC LIMIT 24`),
    query(`SELECT tm.nombre,COUNT(*)::int citas,COALESCE(SUM(c.precio_total),0) valor,
      COALESCE(AVG(r.calificacion),0)::numeric(3,2) satisfaccion FROM citas c LEFT JOIN tipos_maquillaje tm ON tm.id=c.tipo_id
      LEFT JOIN resenas r ON r.cita_id=c.id GROUP BY tm.nombre ORDER BY citas DESC`),
    query(`SELECT e.nombre,COUNT(*)::int citas,COUNT(*) FILTER(WHERE c.estado='completada')::int completadas,
      COALESCE(SUM(c.precio_total) FILTER(WHERE c.estado='completada'),0) valor,
      COALESCE(AVG(r.calificacion),0)::numeric(3,2) satisfaccion FROM especialistas e LEFT JOIN citas c ON c.especialista_id=e.id
      LEFT JOIN resenas r ON r.especialista_id=e.id GROUP BY e.id,e.nombre ORDER BY completadas DESC`),
    query(`SELECT EXTRACT(HOUR FROM hora)::int hora,COUNT(*)::int total FROM citas GROUP BY 1 ORDER BY total DESC`),
    query(`SELECT u.nombre,u.email,COUNT(c.id)::int citas,MAX(c.fecha) ultima_cita,
      COALESCE(SUM(c.precio_total),0) valor FROM usuarios u JOIN citas c ON c.usuario_id=u.id
      GROUP BY u.id,u.nombre,u.email ORDER BY citas DESC LIMIT 100`),
    query(`SELECT p.nombre,p.cantidad,p.unidad,p.stock_minimo,p.costo_unitario,
      COALESCE(SUM(m.cantidad) FILTER(WHERE m.tipo='salida'),0) consumo
      FROM inventario_productos p LEFT JOIN inventario_movimientos m ON m.producto_id=p.id
      GROUP BY p.id ORDER BY consumo DESC`)
  ]);
  return {finanzas:finanzas.rows,servicios:servicios.rows,especialistas:especialistas.rows,horas:horas.rows,clientes:clientes.rows,inventario:inventario.rows};
}
function csv(rows){if(!rows.length)return'';const cols=Object.keys(rows[0]);const esc=v=>`"${String(v??'').replaceAll('"','""')}"`;return [cols.map(esc).join(','),...rows.map(r=>cols.map(c=>esc(r[c])).join(','))].join('\r\n');}
async function reporte(_req,res){return res.json(await datos());}
async function exportar(req,res){const d=await datos(),seccion=req.params.seccion;if(!Object.hasOwn(d,seccion))return res.status(404).json({error:'Reporte no encontrado.'});res.set('Content-Type','text/csv; charset=utf-8');res.set('Content-Disposition',`attachment; filename="reporte-${seccion}.csv"`);return res.send('\uFEFF'+csv(d[seccion]));}
module.exports={reporte,exportar};
