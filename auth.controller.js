const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { query } = require('./db');
const { setCache, delCache, TTL } = require('./redis');
const crypto=require('node:crypto');

function establecerCookieSesion(res, token) {
  const secure = String(process.env.FRONTEND_URL || '').startsWith('https://');
  res.cookie('sena_session', token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

// ── REGISTRO ────────────────────────────────────
async function registro(req, res) {
  const { nombre, email, telefono, password } = req.body;

  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son obligatorios.' });
  }
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 10 caracteres, letras y números.' });
  }

  // Verificar duplicado
  const existe = await query('SELECT id FROM usuarios WHERE email = $1', [email.toLowerCase()]);
  if (existe.rows.length) {
    return res.status(409).json({ error: 'Este correo ya está registrado.' });
  }

  const hash = await bcrypt.hash(password, 12);

  const { rows } = await query(
    `INSERT INTO usuarios (nombre, email, telefono, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, nombre, email, telefono, rol, creado_en`,
    [nombre.trim(), email.toLowerCase(), telefono || null, hash]
  );

  const usuario = rows[0];
  const token   = generarToken(usuario);

  // Guardar sesión en Redis
  await setCache(`session:${usuario.id}`, { id: usuario.id, email: usuario.email }, TTL.SESSION);
  establecerCookieSesion(res, token);

  return res.status(201).json({
    mensaje: '¡Cuenta creada exitosamente!',
    token,
    usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol }
  });
}

// ── LOGIN ────────────────────────────────────────
async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Correo y contraseña son requeridos.' });
  }

  const { rows } = await query(
    'SELECT id, nombre, email, password_hash, tono_piel, rol,intentos_fallidos,bloqueado_hasta FROM usuarios WHERE email = $1',
    [email.toLowerCase()]
  );

  if (!rows.length) {
    return res.status(401).json({ error: 'Credenciales incorrectas.' });
  }

  const usuario = rows[0];
  if(usuario.bloqueado_hasta&&new Date(usuario.bloqueado_hasta)>new Date())return res.status(423).json({error:'Cuenta bloqueada temporalmente por varios intentos fallidos.'});
  const valido  = await bcrypt.compare(password, usuario.password_hash);

  if (!valido) {
    await query(`UPDATE usuarios SET intentos_fallidos=intentos_fallidos+1,
      bloqueado_hasta=CASE WHEN intentos_fallidos+1>=5 THEN NOW()+INTERVAL '15 minutes' ELSE bloqueado_hasta END WHERE id=$1`,[usuario.id]);
    return res.status(401).json({ error: 'Credenciales incorrectas.' });
  }
  await query('UPDATE usuarios SET intentos_fallidos=0,bloqueado_hasta=NULL WHERE id=$1',[usuario.id]);

  const token = generarToken(usuario);
  await setCache(`session:${usuario.id}`, { id: usuario.id, email: usuario.email }, TTL.SESSION);
  establecerCookieSesion(res, token);

  return res.json({
    mensaje: '¡Bienvenida!',
    token,
    usuario: {
      id:        usuario.id,
      nombre:    usuario.nombre,
      email:     usuario.email,
      tono_piel: usuario.tono_piel,
      rol:       usuario.rol
    }
  });
}

// ── LOGOUT ───────────────────────────────────────
async function logout(req, res) {
  const segundosRestantes = Math.max(1, Number(req.usuario.exp || 0) - Math.floor(Date.now() / 1000));
  await setCache(`revoked:${req.token}`, 1, segundosRestantes);
  await delCache(`session:${req.usuario.id}`);
  res.clearCookie('sena_session', { httpOnly:true, sameSite:'lax', path:'/' });
  return res.json({ mensaje: 'Sesión cerrada correctamente.' });
}

// ── PERFIL ───────────────────────────────────────
async function perfil(req, res) {
  const { rows } = await query(
    'SELECT id, nombre, email, telefono, tono_piel, rol, creado_en FROM usuarios WHERE id = $1',
    [req.usuario.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado.' });
  return res.json(rows[0]);
}

// ── HELPER ───────────────────────────────────────
function generarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

async function solicitarRecuperacion(req,res){
  const email=String(req.body.email||'').trim().toLowerCase();
  const usuario=await query('SELECT id,email FROM usuarios WHERE email=$1',[email]);
  if(usuario.rows.length){
    const token=crypto.randomBytes(32).toString('hex'),hash=crypto.createHash('sha256').update(token).digest('hex');
    await query(`INSERT INTO recuperacion_password(usuario_id,token_hash,expira_en) VALUES($1,$2,NOW()+INTERVAL '30 minutes')`,[usuario.rows[0].id,hash]);
    const enlace=`${process.env.FRONTEND_URL||'http://localhost:8088'}/citas?recuperar=${token}`;
    await query(`INSERT INTO notificaciones(usuario_id,canal,tipo,destino,programada_para,asunto,contenido)
      VALUES($1,'email','recuperacion_password',$2,NOW(),'Restablecer contraseña · Arte & Belleza',$3)`,
      [usuario.rows[0].id,email,`Solicitaste restablecer tu contraseña. Este enlace vence en 30 minutos: ${enlace}`]);
  }
  return res.json({mensaje:'Si el correo está registrado, se generó una instrucción de recuperación.'});
}
async function restablecerPassword(req,res){
  const {token,password}=req.body;
  if(!token||!password||password.length<10||!/[A-Za-z]/.test(password)||!/\d/.test(password))return res.status(400).json({error:'Token o contraseña no válidos.'});
  const hashToken=crypto.createHash('sha256').update(token).digest('hex');
  const registro=await query(`SELECT * FROM recuperacion_password WHERE token_hash=$1 AND usado_en IS NULL AND expira_en>NOW()`,[hashToken]);
  if(!registro.rows.length)return res.status(400).json({error:'El enlace venció o ya fue utilizado.'});
  const hash=await bcrypt.hash(password,12);
  await withTransactionPassword(registro.rows[0],hash);
  await delCache(`session:${registro.rows[0].usuario_id}`);
  return res.json({mensaje:'Contraseña actualizada. Inicie sesión nuevamente.'});
}
async function withTransactionPassword(registro,hash){
  const {withTransaction}=require('./db');
  return withTransaction(async client=>{await client.query(`UPDATE usuarios SET password_hash=$1,password_actualizado_en=NOW(),intentos_fallidos=0,bloqueado_hasta=NULL WHERE id=$2`,[hash,registro.usuario_id]);await client.query('UPDATE recuperacion_password SET usado_en=NOW() WHERE id=$1',[registro.id]);});
}

module.exports = { registro, login, logout, perfil,solicitarRecuperacion,restablecerPassword, establecerCookieSesion };
