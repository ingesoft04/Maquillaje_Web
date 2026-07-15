const jwt = require('jsonwebtoken');
const { getCache } = require('../redis');

async function autenticar(req, res, next) {
  const header = req.headers.authorization || '';
  const [tipo, token] = header.split(' ');

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token de acceso requerido.' });
  }

  try {
    if (await getCache(`revoked:${token}`)) {
      return res.status(401).json({ error: 'La sesión ya no es válida.' });
    }

    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    req.token = token;
    return next();
  } catch (_) {
    return res.status(401).json({ error: 'Token inválido o vencido.' });
  }
}

async function autenticacionOpcional(req, _res, next) {
  const header = req.headers.authorization || '';
  const [tipo, token] = header.split(' ');
  if (tipo !== 'Bearer' || !token) return next();

  try {
    if (!(await getCache(`revoked:${token}`))) {
      req.usuario = jwt.verify(token, process.env.JWT_SECRET);
      req.token = token;
    }
  } catch (_) {}
  return next();
}

module.exports = { autenticar, autenticacionOpcional };
