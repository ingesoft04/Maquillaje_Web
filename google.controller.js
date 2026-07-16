const crypto=require('node:crypto');
const {redis,delPattern}=require('./redis');
const {query}=require('./db');
const googleCalendar=require('./google-calendar');

async function iniciar(req,res){const state=crypto.randomBytes(32).toString('hex');await redis.set(`google:oauth:${state}`,req.usuario.id,'EX',600);return res.json({url:googleCalendar.urlAutorizacion(state)});}
async function callback(req,res){try{if(req.query.error)throw new Error(`Google rechazó la autorización: ${req.query.error}`);const key=`google:oauth:${req.query.state}`;const usuarioId=await redis.get(key);if(!usuarioId)throw new Error('La autorización venció o no es válida.');await redis.del(key);const email=await googleCalendar.guardarCodigo(req.query.code,usuarioId);await query(`UPDATE citas SET google_sync_estado='pendiente' WHERE estado!='cancelada'`);await query(`INSERT INTO google_sync_jobs(cita_id,accion) SELECT id,'crear' FROM citas WHERE estado!='cancelada' AND google_event_id IS NULL`);return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:8088'}/citas?google=conectado&cuenta=${encodeURIComponent(email||'Google')}`);}catch(e){return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:8088'}/citas?google=error&mensaje=${encodeURIComponent(e.message)}`);}}
async function estado(_req,res){return res.json(await googleCalendar.estado());}
async function desconectar(_req,res){await googleCalendar.desconectar();return res.json({mensaje:'Google Calendar desconectado.'});}
async function asignarCalendario(req,res){const id=String(req.body.google_calendar_id||'').trim()||null;const {rows}=await query(`UPDATE especialistas SET google_calendar_id=$1 WHERE id=$2 RETURNING id,nombre,google_calendar_id`,[id,req.params.id]);if(!rows.length)return res.status(404).json({error:'Especialista no encontrada.'});await delPattern(`disponibilidad:${req.params.id}:*`);return res.json({especialista:rows[0]});}
async function reintentar(_req,res){await query(`UPDATE google_sync_jobs SET estado='pendiente',proximo_intento=NOW(),ultimo_error=NULL WHERE estado='fallido'`);await googleCalendar.procesarCola();return res.json({mensaje:'Reintento iniciado.'});}
module.exports={iniciar,callback,estado,desconectar,asignarCalendario,reintentar};
