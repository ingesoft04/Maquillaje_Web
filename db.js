const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  user:     process.env.DB_USER || 'sena',
  password: process.env.DB_PASS || 'sena1234',
  database: process.env.DB_NAME || 'maquillaje_sena',
  max: 20,                  // máximo de conexiones simultáneas
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Error inesperado en cliente inactivo:', err);
});

// Helper: ejecutar query con log en dev
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  if (process.env.NODE_ENV === 'development') {
    console.log('[PG]', { text, duration: Date.now() - start, rows: res.rowCount });
  }
  return res;
}

// Helper: transacciones
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { query, withTransaction, pool };
