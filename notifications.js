const nodemailer=require('nodemailer');
const {query}=require('./db');

let ejecutando=false;
function transporte(){
  if(!process.env.SMTP_HOST)return null;
  return nodemailer.createTransport({
    host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),
    secure:String(process.env.SMTP_SECURE)==='true',
    auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}:undefined
  });
}

function contenido(tipo,nombre,fecha,hora){
  const asuntos={confirmacion:'Cita confirmada',recordatorio:'Recordatorio de cita',reprogramacion:'Cita reprogramada',cancelacion:'Cita cancelada',turno_disponible:'Se liberó un turno compatible',cuidados:'Recomendaciones posteriores',solicitar_resena:'¿Cómo fue tu experiencia?'};
  return {subject:`Arte & Belleza · ${asuntos[tipo]||'Notificación'}`,
    text:`Hola ${nombre}. ${asuntos[tipo]||'Tenemos una actualización'}${fecha?` para el ${String(fecha).slice(0,10)} a las ${String(hora).slice(0,5)}`:''}. Arte & Belleza SENA.`};
}

async function procesarNotificaciones(){
  if(ejecutando)return; ejecutando=true;
  try{
    const {rows}=await query(`SELECT n.*,u.nombre,c.fecha,c.hora FROM notificaciones n
      LEFT JOIN usuarios u ON u.id=n.usuario_id LEFT JOIN citas c ON c.id=n.cita_id
      WHERE n.estado='pendiente' AND COALESCE(n.programada_para,NOW())<=NOW()
      ORDER BY n.programada_para NULLS FIRST LIMIT 20`);
    const tx=transporte();
    for(const item of rows){
      try{
        const mensaje=item.asunto?{subject:item.asunto,text:item.contenido}:contenido(item.tipo,item.nombre,item.fecha,item.hora);
        if(tx)await tx.sendMail({from:process.env.SMTP_FROM||'Arte & Belleza <no-reply@localhost>',to:item.destino,...mensaje});
        else console.log(`[Notificación simulada] ${item.destino}: ${mensaje.subject}`);
        await query(`UPDATE notificaciones SET estado=$1,enviado_en=NOW(),intentos=intentos+1 WHERE id=$2`,[tx?'enviada':'simulada',item.id]);
      }catch(error){
        await query(`UPDATE notificaciones SET intentos=intentos+1,ultimo_error=$1,
          estado=CASE WHEN intentos>=4 THEN 'fallida' ELSE 'pendiente' END WHERE id=$2`,[error.message,item.id]);
      }
    }
  }finally{ejecutando=false;}
}

function iniciarNotificaciones(){
  const intervalo=Number(process.env.NOTIFICATION_INTERVAL_MS||60000);
  setInterval(()=>procesarNotificaciones().catch(e=>console.error('[Notificaciones]',e.message)),intervalo).unref();
  procesarNotificaciones().catch(e=>console.error('[Notificaciones]',e.message));
}

module.exports={iniciarNotificaciones,procesarNotificaciones};
