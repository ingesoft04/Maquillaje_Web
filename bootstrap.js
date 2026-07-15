const bcrypt = require('bcryptjs');
const { query } = require('./db');

async function prepararBaseDeDatos() {
  await query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS rol VARCHAR(20) NOT NULL DEFAULT 'cliente'
  `);
  await query(`ALTER TABLE tipos_maquillaje ADD COLUMN IF NOT EXISTS precio NUMERIC(12,2) DEFAULT 0`);
  await query(`ALTER TABLE tipos_maquillaje ADD COLUMN IF NOT EXISTS duracion_minutos INT DEFAULT 60`);
  await query(`ALTER TABLE citas DROP CONSTRAINT IF EXISTS uq_especialista_horario`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_especialista_horario_activo
               ON citas(especialista_id, fecha, hora) WHERE estado != 'cancelada'`);
  await query(`CREATE TABLE IF NOT EXISTS auditoria (
    id BIGSERIAL PRIMARY KEY,
    usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    accion VARCHAR(80) NOT NULL,
    entidad VARCHAR(80) NOT NULL,
    entidad_id TEXT,
    datos JSONB,
    ip VARCHAR(80),
    creado_en TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`ALTER TABLE citas ADD COLUMN IF NOT EXISTS precio_total NUMERIC(12,2) DEFAULT 0`);
  await query(`ALTER TABLE citas ADD COLUMN IF NOT EXISTS asistencia VARCHAR(20) DEFAULT 'pendiente'`);

  await query(`CREATE TABLE IF NOT EXISTS horarios_especialista (
    id SERIAL PRIMARY KEY,
    especialista_id INT NOT NULL REFERENCES especialistas(id) ON DELETE CASCADE,
    dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    UNIQUE(especialista_id, dia_semana, hora_inicio, hora_fin)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS bloqueos_agenda (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    especialista_id INT NOT NULL REFERENCES especialistas(id) ON DELETE CASCADE,
    inicio TIMESTAMPTZ NOT NULL,
    fin TIMESTAMPTZ NOT NULL,
    motivo VARCHAR(250),
    creado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en TIMESTAMPTZ DEFAULT NOW(),
    CHECK (fin > inicio)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS perfiles_cosmeticos (
    usuario_id UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo_piel VARCHAR(40),
    subtono VARCHAR(40),
    sensibilidad VARCHAR(40),
    alergias TEXT,
    condiciones TEXT,
    productos_evitar TEXT,
    preferencias TEXT,
    consentimiento_datos BOOLEAN DEFAULT FALSE,
    consentimiento_imagen BOOLEAN DEFAULT FALSE,
    actualizado_en TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS pagos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cita_id UUID NOT NULL REFERENCES citas(id) ON DELETE CASCADE,
    monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
    metodo VARCHAR(30) NOT NULL CHECK (metodo IN ('efectivo','transferencia','tarjeta','otro')),
    estado VARCHAR(30) NOT NULL DEFAULT 'registrado' CHECK (estado IN ('registrado','devuelto','anulado')),
    referencia VARCHAR(120),
    registrado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_pagos_cita ON pagos(cita_id)`);
  await query(`CREATE TABLE IF NOT EXISTS inventario_productos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(160) NOT NULL,
    marca VARCHAR(120),
    categoria VARCHAR(80),
    tono VARCHAR(80),
    lote VARCHAR(80),
    vence_en DATE,
    cantidad NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
    unidad VARCHAR(30) NOT NULL DEFAULT 'unidad',
    stock_minimo NUMERIC(12,2) NOT NULL DEFAULT 0,
    costo_unitario NUMERIC(12,2) DEFAULT 0,
    activo BOOLEAN DEFAULT TRUE,
    creado_en TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS inventario_movimientos (
    id BIGSERIAL PRIMARY KEY,
    producto_id UUID NOT NULL REFERENCES inventario_productos(id) ON DELETE RESTRICT,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('entrada','salida','ajuste')),
    cantidad NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
    motivo VARCHAR(250),
    cita_id UUID REFERENCES citas(id) ON DELETE SET NULL,
    usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_movimientos_producto ON inventario_movimientos(producto_id, creado_en DESC)`);
  await query(`CREATE TABLE IF NOT EXISTS notificaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
    cita_id UUID REFERENCES citas(id) ON DELETE CASCADE,
    canal VARCHAR(20) NOT NULL DEFAULT 'email',
    tipo VARCHAR(50) NOT NULL,
    destino VARCHAR(255),
    programada_para TIMESTAMPTZ,
    estado VARCHAR(30) NOT NULL DEFAULT 'pendiente',
    intentos INT DEFAULT 0,
    ultimo_error TEXT,
    enviado_en TIMESTAMPTZ,
    creado_en TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_notificaciones_pendientes ON notificaciones(estado, programada_para)`);

  await query(`INSERT INTO horarios_especialista(especialista_id,dia_semana,hora_inicio,hora_fin)
    SELECT e.id, d.dia, '08:00'::time, '18:00'::time
    FROM especialistas e CROSS JOIN (VALUES (1),(2),(3),(4),(5),(6)) AS d(dia)
    ON CONFLICT DO NOTHING`);

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
