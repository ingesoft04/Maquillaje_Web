const {withTransaction}=require('./db');

async function consumirPorCita(citaId){
  return withTransaction(async client=>{
    const cita=await client.query(`SELECT id,tipo_id FROM citas WHERE id=$1 FOR UPDATE`,[citaId]);
    if(!cita.rows.length)return {consumidos:0};
    const recetas=await client.query(`SELECT r.producto_id,r.cantidad,p.nombre,p.cantidad stock
      FROM inventario_recetas r JOIN inventario_productos p ON p.id=r.producto_id
      WHERE r.tipo_id=$1 AND p.activo FOR UPDATE OF p`,[cita.rows[0].tipo_id]);
    for(const r of recetas.rows){
      const existe=await client.query(`SELECT 1 FROM inventario_movimientos WHERE producto_id=$1 AND cita_id=$2 AND origen='servicio'`,[r.producto_id,citaId]);
      if(existe.rows.length)continue;
      if(Number(r.stock)<Number(r.cantidad)){const e=new Error(`Stock insuficiente para ${r.nombre}.`);e.status=409;throw e;}
      await client.query('UPDATE inventario_productos SET cantidad=cantidad-$1,actualizado_en=NOW() WHERE id=$2',[r.cantidad,r.producto_id]);
      await client.query(`INSERT INTO inventario_movimientos(producto_id,tipo,cantidad,motivo,cita_id,origen)
        VALUES($1,'salida',$2,'Consumo automático por servicio',$3,'servicio')`,[r.producto_id,r.cantidad,citaId]);
    }
    return {consumidos:recetas.rows.length};
  });
}
module.exports={consumirPorCita};
