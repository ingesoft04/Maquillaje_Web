function errorHandler(err, _req, res, _next) {
  const status = Number(err.status) || 500;
  const operational = status < 500;
  if (!operational) console.error('[ERROR]', err);

  return res.status(status).json({
    error: operational || process.env.NODE_ENV !== 'production'
      ? err.message
      : 'Error interno del servidor.',
    ...(err.code ? { codigo:err.code } : {})
  });
}

module.exports = { errorHandler };
