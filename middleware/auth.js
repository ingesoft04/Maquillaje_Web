const jwt = require('jsonwebtoken');
const { getCache } = require('../redis');

function cookieToken(req) {
  const cookies = String(req.headers.cookie || '').split(';');
  for (const cookie of cookies) {
    const separator = cookie.indexOf('=');
    if (separator < 0) continue;
    if (cookie.slice(0, separator).trim() === 'sena_session') {
      return decodeURIComponent(cookie.slice(separator + 1).trim());
    }
  }
  return '';
}

function requestToken(req) {
  const [type, bearer] = String(req.headers.authorization || '').split(' ');
  return type === 'Bearer' && bearer ? bearer : cookieToken(req);
}

async function autenticar(req, res, next) {
  const token = requestToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido.' });
  }

  try {
    if (await getCache(`revoked:${token}`)) {
      return res.status(401).json({ error: 'La sesión ya no es válida.' });
    }
    const usuario = jwt.verify(token, process.env.JWT_SECRET);
    if (!await getCache(`session:${usuario.id}`)) {
      return res.status(401).json({ error: 'La sesión venció o fue cerrada.' });
    }
    req.usuario = usuario;
    req.token = token;
    return next();
  } catch (_) {
    return res.status(401).json({ error: 'Token inválido o vencido.' });
  }
}

async function autenticacionOpcional(req, _res, next) {
  const token = requestToken(req);
  if (!token) return next();

  try {
    if (!(await getCache(`revoked:${token}`))) {
      const usuario = jwt.verify(token, process.env.JWT_SECRET);
      if (await getCache(`session:${usuario.id}`)) {
        req.usuario = usuario;
        req.token = token;
      }
    }
  } catch (_) {}
  return next();
}

function soloAdmin(req, res, next) {
  if (req.usuario?.rol !== 'admin') {
    return res.status(403).json({ error: 'Se requieren permisos de administrador.' });
  }
  return next();
}

module.exports = { autenticar, autenticacionOpcional, soloAdmin, requestToken };
