const crypto = require('node:crypto');
const { google } = require('googleapis');
const { query } = require('./db');
const { delPattern } = require('./redis');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email'
];
const TZ = process.env.GOOGLE_TIMEZONE || 'America/Bogota';

function configurado() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI && process.env.GOOGLE_TOKEN_ENCRYPTION_KEY);
}

function oauth() {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
}

function clave() {
  if (!process.env.GOOGLE_TOKEN_ENCRYPTION_KEY) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY no configurada.');
  return crypto.createHash('sha256').update(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY).digest();
}

function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', clave(), iv);
  const encrypted = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
}

function descifrar(valor) {
  const [iv, tag, encrypted] = String(valor).split('.').map(v => Buffer.from(v, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', clave(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

async function conexion() {
  if (!configurado()) return null;
  const { rows } = await query('SELECT * FROM google_oauth WHERE id=1');
  if (!rows.length) return null;
  const client = oauth();
  client.setCredentials({ refresh_token: descifrar(rows[0].refresh_token_cifrado) });
  return { client, datos: rows[0] };
}

function urlAutorizacion(state) {
  if (!configurado()) throw Object.assign(new Error('Primero configure las credenciales OAuth de Google.'), { status: 503 });
  return oauth().generateAuthUrl({ access_type:'offline', prompt:'consent', include_granted_scopes:true, scope:SCOPES, state });
}

async function guardarCodigo(code, usuarioId) {
  const client = oauth();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) throw new Error('Google no entregó refresh token; revoque el acceso anterior y vuelva a conectar.');
  client.setCredentials(tokens);
  const perfil = await google.oauth2({ version:'v2', auth:client }).userinfo.get();
  await query(`INSERT INTO google_oauth(id,cuenta_email,refresh_token_cifrado,scopes,conectado_por)
    VALUES(1,$1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET cuenta_email=EXCLUDED.cuenta_email,
    refresh_token_cifrado=EXCLUDED.refresh_token_cifrado,scopes=EXCLUDED.scopes,
    conectado_por=EXCLUDED.conectado_por,actualizado_en=NOW()`,
    [perfil.data.email || null, cifrar(tokens.refresh_token), tokens.scope || SCOPES.join(' '), usuarioId]);
  return perfil.data.email;
}

async function estado() {
  const { rows } = await query(`SELECT cuenta_email,scopes,conectado_en,actualizado_en FROM google_oauth WHERE id=1`);
  const jobs = await query(`SELECT COUNT(*) FILTER(WHERE estado='pendiente')::int pendientes,
    COUNT(*) FILTER(WHERE estado='fallido')::int fallidos FROM google_sync_jobs`);
  return { configurado:configurado(), conectado:rows.length>0, cuenta:rows[0] || null, cola:jobs.rows[0] };
}

async function desconectar() {
  const c = await conexion();
  if (c) { try { await c.client.revokeCredentials(); } catch (_) {} }
  await query('DELETE FROM google_oauth WHERE id=1');
  await query(`UPDATE citas SET google_sync_estado='no_configurado',google_sync_error=NULL`);
}

async function encolar(citaId, accion) {
  const conectado = await query('SELECT 1 FROM google_oauth WHERE id=1');
  if (!conectado.rows.length) return false;
  await query(`INSERT INTO google_sync_jobs(cita_id,accion) VALUES($1,$2)`,[citaId,accion]);
  await query(`UPDATE citas SET google_sync_estado='pendiente',google_sync_error=NULL WHERE id=$1`,[citaId]);
  return true;
}

async function datosCita(citaId) {
  const { rows } = await query(`SELECT c.*,u.nombre cliente,u.email cliente_email,e.nombre especialista,
    COALESCE(e.google_calendar_id,'primary') calendar_id,tm.nombre servicio,COALESCE(tm.duracion_minutos,60) duracion
    FROM citas c JOIN usuarios u ON u.id=c.usuario_id JOIN especialistas e ON e.id=c.especialista_id
    LEFT JOIN tipos_maquillaje tm ON tm.id=c.tipo_id WHERE c.id=$1`,[citaId]);
  return rows[0];
}

function inicioFin(cita) {
  const hora=String(cita.hora).slice(0,8);
  const inicio=new Date(`${String(cita.fecha).slice(0,10)}T${hora}-05:00`);
  return { inicio:inicio.toISOString(), fin:new Date(inicio.getTime()+Number(cita.duracion)*60000).toISOString() };
}

async function procesarJob(job) {
  const cx = await conexion();
  if (!cx) throw new Error('Google Calendar no está conectado.');
  const cita = await datosCita(job.cita_id);
  if (!cita) return;
  const calendar = google.calendar({ version:'v3', auth:cx.client });
  let calendarId=cita.google_calendar_id || cita.calendar_id || 'primary';
  if (job.accion==='eliminar') {
    if(cita.google_event_id) await calendar.events.delete({calendarId,eventId:cita.google_event_id,sendUpdates:'all'}).catch(e=>{if(e.code!==404)throw e;});
    await query(`UPDATE citas SET google_event_id=NULL,google_event_url=NULL,google_sync_estado='sincronizado',google_sync_error=NULL,google_sincronizado_en=NOW() WHERE id=$1`,[cita.id]);
  } else {
    const tiempos=inicioFin(cita);
    const resource={summary:`${cita.servicio || 'Servicio de maquillaje'} · ${cita.cliente}`,
      description:`Cita Arte & Belleza\nEspecialista: ${cita.especialista}\nReferencia: ${cita.id}`,
      start:{dateTime:tiempos.inicio,timeZone:TZ},end:{dateTime:tiempos.fin,timeZone:TZ},
      attendees:process.env.GOOGLE_INVITE_CLIENTS==='true'&&cita.cliente_email?[{email:cita.cliente_email}]:[],visibility:'private',
      reminders:{useDefault:false,overrides:[{method:'email',minutes:1440},{method:'popup',minutes:60}]},
      extendedProperties:{private:{arteBellezaCitaId:cita.id}}};
    let respuesta;
    if(cita.google_event_id) {
      try { respuesta=await calendar.events.update({calendarId,eventId:cita.google_event_id,requestBody:resource,sendUpdates:'all'}); }
      catch(e) { if(![403,404].includes(Number(e.code)))throw e; calendarId=cita.calendar_id||'primary'; respuesta=await calendar.events.insert({calendarId,requestBody:resource,sendUpdates:'all'}); }
    } else respuesta=await calendar.events.insert({calendarId,requestBody:resource,sendUpdates:'all'});
    await query(`UPDATE citas SET google_event_id=$1,google_event_url=$2,google_calendar_id=$3,google_sync_estado='sincronizado',
      google_sync_error=NULL,google_sincronizado_en=NOW() WHERE id=$4`,[respuesta.data.id,respuesta.data.htmlLink,calendarId,cita.id]);
  }
  await delPattern(`disponibilidad:${cita.especialista_id}:*`);
}

let ejecutando=false;
async function procesarCola() {
  if(ejecutando)return; ejecutando=true;
  try {
    const {rows}=await query(`UPDATE google_sync_jobs SET estado='procesando',intentos=intentos+1 WHERE id=(
      SELECT id FROM google_sync_jobs WHERE estado IN ('pendiente','fallido') AND proximo_intento<=NOW()
      ORDER BY creado_en FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`);
    if(!rows.length)return;
    const job=rows[0];
    try { await procesarJob(job); await query(`UPDATE google_sync_jobs SET estado='completado',procesado_en=NOW() WHERE id=$1`,[job.id]); }
    catch(e){const definitivo=job.intentos>=5;await query(`UPDATE google_sync_jobs SET estado=$1,ultimo_error=$2,
      proximo_intento=NOW()+make_interval(secs=>$3) WHERE id=$4`,[definitivo?'fallido':'pendiente',String(e.message).slice(0,1000),Math.min(300,15*2**job.intentos),job.id]);
      await query(`UPDATE citas SET google_sync_estado=$1,google_sync_error=$2 WHERE id=$3`,[definitivo?'error':'pendiente',String(e.message).slice(0,1000),job.cita_id]);}
  } finally {ejecutando=false;}
}

function iniciarSincronizacion(){const ms=Math.max(5000,Number(process.env.GOOGLE_SYNC_INTERVAL_MS)||15000);const timer=setInterval(()=>procesarCola().catch(e=>console.error('[Google Calendar]',e.message)),ms);timer.unref();procesarCola().catch(()=>{});}

async function intervalosOcupados(especialistaId,fecha){
  try {const cx=await conexion();if(!cx)return[];const e=await query(`SELECT COALESCE(google_calendar_id,'primary') id FROM especialistas WHERE id=$1`,[especialistaId]);if(!e.rows.length)return[];
    const calendar=google.calendar({version:'v3',auth:cx.client});const min=`${fecha}T00:00:00-05:00`,max=`${fecha}T23:59:59-05:00`;
    const r=await calendar.freebusy.query({requestBody:{timeMin:min,timeMax:max,timeZone:TZ,items:[{id:e.rows[0].id}]}});
    return r.data.calendars?.[e.rows[0].id]?.busy || [];
  }catch(e){console.warn('[Google Calendar] FreeBusy:',e.message);return[];}
}

module.exports={SCOPES,configurado,urlAutorizacion,guardarCodigo,estado,desconectar,encolar,iniciarSincronizacion,intervalosOcupados,procesarCola,
  _internals:{cifrar,descifrar,inicioFin}};
