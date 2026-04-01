const { query } = require('../config/db');
const { getCache, setCache, TTL } = require('../config/redis');

// ── TIPOS DE MAQUILLAJE (con filtro por categoría) ──
async function tipos(req, res) {
  const { categoria } = req.query;
  const cacheKey = `catalogo:tipos:${categoria || 'all'}`;

  const cached = await getCache(cacheKey);
  if (cached) return res.json({ fuente: 'cache', tipos: cached });

  let sql    = 'SELECT * FROM tipos_maquillaje WHERE activo = TRUE';
  let params = [];

  if (categoria) {
    sql += ' AND categoria = $1';
    params = [categoria.toLowerCase()];
  }
  sql += ' ORDER BY id';

  const { rows } = await query(sql, params);
  await setCache(cacheKey, rows, TTL.CATALOGO);

  return res.json({ fuente: 'db', tipos: rows });
}

// ── ESPECIALISTAS ────────────────────────────────
async function especialistas(req, res) {
  const cacheKey = 'catalogo:especialistas';

  const cached = await getCache(cacheKey);
  if (cached) return res.json({ fuente: 'cache', especialistas: cached });

  const { rows } = await query(
    'SELECT id, nombre, bio, foto_url FROM especialistas WHERE activo = TRUE ORDER BY id'
  );
  await setCache(cacheKey, rows, TTL.CATALOGO);

  return res.json({ fuente: 'db', especialistas: rows });
}

// ── TONOS DE PIEL ────────────────────────────────
async function tonos(req, res) {
  const cacheKey = 'catalogo:tonos';

  const cached = await getCache(cacheKey);
  if (cached) return res.json({ fuente: 'cache', tonos: cached });

  const { rows } = await query('SELECT * FROM tonos_piel ORDER BY id');
  await setCache(cacheKey, rows, TTL.TONOS);

  return res.json({ fuente: 'db', tonos: rows });
}

// ── CALCULADORA DE TONO DE PIEL ─────────────────
async function calcularTono(req, res) {
  /**
   * Recibe: { subtono: 'frio'|'calido'|'neutro', luminosidad: 1-4 }
   * Retorna: el tono recomendado con sus productos sugeridos
   */
  const { subtono, luminosidad } = req.body;

  if (!subtono || !luminosidad) {
    return res.status(400).json({ error: 'Subtono y luminosidad son requeridos.' });
  }

  const lum = parseInt(luminosidad);
  if (lum < 1 || lum > 4) {
    return res.status(400).json({ error: 'Luminosidad debe estar entre 1 (muy claro) y 4 (oscuro).' });
  }

  // Mapear luminosidad + subtono al código de tono
  const prefijos = { 1: 'muy-claro', 2: 'claro', 3: 'medio', 4: 'oscuro' };
  const sub = subtono.toLowerCase() === 'neutro' ? 'calido' : subtono.toLowerCase();
  const codigo = `${prefijos[lum]}-${sub}`;

  const cacheKey = `tono:calc:${codigo}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json({ fuente: 'cache', resultado: cached });

  const { rows } = await query(
    'SELECT * FROM tonos_piel WHERE codigo = $1',
    [codigo]
  );

  if (!rows.length) {
    return res.status(404).json({ error: 'No se encontró un tono para esa combinación.' });
  }

  await setCache(cacheKey, rows[0], TTL.TONOS);

  // Si el usuario está autenticado, guardar su tono en perfil
  if (req.usuario) {
    await query(
      'UPDATE usuarios SET tono_piel = $1 WHERE id = $2',
      [rows[0].nombre, req.usuario.id]
    );
  }

  return res.json({ fuente: 'db', resultado: rows[0] });
}

module.exports = { tipos, especialistas, tonos, calcularTono };
