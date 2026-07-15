const bcrypt = require('bcryptjs');
const { query } = require('./db');

async function prepararBaseDeDatos() {
  await query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS rol VARCHAR(20) NOT NULL DEFAULT 'cliente'
  `);

  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  if (!adminEmail || !adminPassword) {
    console.warn('[Bootstrap] ADMIN_EMAIL o ADMIN_PASSWORD no configurados; no se creó administrador inicial.');
    return;
  }

  if (adminPassword.length < 10) {
    throw new Error('ADMIN_PASSWORD debe tener al menos 10 caracteres.');
  }

  const hash = await bcrypt.hash(adminPassword, 12);
  await query(
    `INSERT INTO usuarios (nombre, email, telefono, password_hash, rol)
     VALUES ($1, $2, $3, $4, 'admin')
     ON CONFLICT (email) DO UPDATE SET rol = 'admin'`,
    [process.env.ADMIN_NAME || 'Administrador SENA', adminEmail, null, hash]
  );
  console.log(`[Bootstrap] Administrador disponible: ${adminEmail}`);
}

module.exports = { prepararBaseDeDatos };
