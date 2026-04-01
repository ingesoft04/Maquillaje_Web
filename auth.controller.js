const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { query } = require('../config/db');
const { setCache, delCache, TTL } = require('../config/redis');

// ── REGISTRO ────────────────────────────────────
async function registro(req, res) {
  const { nombre, email, telefono, password } = req.body;

  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son obligatorios.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
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
     RETURNING id, nombre, email, telefono, creado_en`,
    [nombre.trim(), email.toLowerCase(), telefono || null, hash]
  );

  const usuario = rows[0];
  const token   = generarToken(usuario);

  // Guardar sesión en Redis
  await setCache(`session:${usuario.id}`, { id: usuario.id, email: usuario.email }, TTL.SESSION);

  return res.status(201).json({
    mensaje: '¡Cuenta creada exitosamente!',
    token,
    usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email }
  });
}

// ── LOGIN ────────────────────────────────────────
async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Correo y contraseña son requeridos.' });
  }

  const { rows } = await query(
    'SELECT id, nombre, email, password_hash, tono_piel FROM usuarios WHERE email = $1',
    [email.toLowerCase()]
  );

  if (!rows.length) {
    return res.status(401).json({ error: 'Credenciales incorrectas.' });
  }

  const usuario = rows[0];
  const valido  = await bcrypt.compare(password, usuario.password_hash);

  if (!valido) {
    return res.status(401).json({ error: 'Credenciales incorrectas.' });
  }

  const token = generarToken(usuario);
  await setCache(`session:${usuario.id}`, { id: usuario.id, email: usuario.email }, TTL.SESSION);

  return res.json({
    mensaje: '¡Bienvenida!',
    token,
    usuario: {
      id:        usuario.id,
      nombre:    usuario.nombre,
      email:     usuario.email,
      tono_piel: usuario.tono_piel
    }
  });
}

// ── LOGOUT ───────────────────────────────────────
async function logout(req, res) {
  // Revocar token actual en Redis hasta que expire (1h)
  await setCache(`revoked:${req.token}`, 1, 60 * 60);
  await delCache(`session:${req.usuario.id}`);
  return res.json({ mensaje: 'Sesión cerrada correctamente.' });
}

// ── PERFIL ───────────────────────────────────────
async function perfil(req, res) {
  const { rows } = await query(
    'SELECT id, nombre, email, telefono, tono_piel, creado_en FROM usuarios WHERE id = $1',
    [req.usuario.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado.' });
  return res.json(rows[0]);
}

// ── HELPER ───────────────────────────────────────
function generarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, email: usuario.email, nombre: usuario.nombre },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

module.exports = { registro, login, logout, perfil };
