const bcrypt = require('bcryptjs');
const { query } = require('./db');

async function prepararBaseDeDatos() {
  await query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS rol VARCHAR(20) NOT NULL DEFAULT 'cliente'
  `);
  await query(`ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check`);
  await query(`ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN ('cliente','especialista','admin'))`);
  await query(`ALTER TABLE especialistas ADD COLUMN IF NOT EXISTS usuario_id UUID UNIQUE REFERENCES usuarios(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS intentos_fallidos INT NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS bloqueado_hasta TIMESTAMPTZ`);
  await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_actualizado_en TIMESTAMPTZ DEFAULT NOW()`);
  await query(`CREATE TABLE IF NOT EXISTS recuperacion_password (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expira_en TIMESTAMPTZ NOT NULL,
    usado_en TIMESTAMPTZ,
    creado_en TIMESTAMPTZ DEFAULT NOW()
  )`);
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
  await query(`ALTER TABLE citas ADD COLUMN IF NOT EXISTS modalidad_pago VARCHAR(20) NOT NULL DEFAULT 'sesion'`);
  await query(`ALTER TABLE citas ADD COLUMN IF NOT EXISTS metodo_pago_preferido VARCHAR(30) NOT NULL DEFAULT 'efectivo'`);
  await query(`ALTER TABLE citas DROP CONSTRAINT IF EXISTS citas_modalidad_pago_check`);
  await query(`ALTER TABLE citas ADD CONSTRAINT citas_modalidad_pago_check CHECK(modalidad_pago IN ('anticipo','sesion'))`);
  await query(`ALTER TABLE citas ADD COLUMN IF NOT EXISTS asistencia VARCHAR(20) DEFAULT 'pendiente'`);
  await query(`ALTER TABLE citas ADD COLUMN IF NOT EXISTS google_event_id TEXT`);
  await query(`ALTER TABLE citas ADD COLUMN IF NOT EXISTS google_event_url TEXT`);
  await query(`ALTER TABLE citas ADD COLUMN IF NOT EXISTS google_calendar_id TEXT`);
  await query(`ALTER TABLE citas ADD COLUMN IF NOT EXISTS google_sync_estado VARCHAR(30) DEFAULT 'no_configurado'`);
  await query(`ALTER TABLE citas ADD COLUMN IF NOT EXISTS google_sync_error TEXT`);
  await query(`ALTER TABLE citas ADD COLUMN IF NOT EXISTS google_sincronizado_en TIMESTAMPTZ`);
  await query(`ALTER TABLE especialistas ADD COLUMN IF NOT EXISTS google_calendar_id TEXT`);

  await query(`CREATE TABLE IF NOT EXISTS google_oauth (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id=1),
    cuenta_email VARCHAR(255),
    refresh_token_cifrado TEXT NOT NULL,
    scopes TEXT,
    conectado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    conectado_en TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS google_sync_jobs (
    id BIGSERIAL PRIMARY KEY,
    cita_id UUID NOT NULL REFERENCES citas(id) ON DELETE CASCADE,
    accion VARCHAR(20) NOT NULL CHECK (accion IN ('crear','actualizar','eliminar')),
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','procesando','completado','fallido')),
    intentos INT NOT NULL DEFAULT 0,
    proximo_intento TIMESTAMPTZ DEFAULT NOW(),
    ultimo_error TEXT,
    creado_en TIMESTAMPTZ DEFAULT NOW(),
    procesado_en TIMESTAMPTZ
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_google_sync_pendientes ON google_sync_jobs(estado,proximo_intento)`);

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
    metodo VARCHAR(30) NOT NULL CHECK (metodo IN ('efectivo','transferencia','tarjeta_debito','tarjeta_credito','nequi','daviplata','otro')),
    estado VARCHAR(30) NOT NULL DEFAULT 'registrado' CHECK (estado IN ('registrado','devuelto','anulado')),
    referencia VARCHAR(120),
    registrado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`ALTER TABLE pagos ADD COLUMN IF NOT EXISTS concepto VARCHAR(20) NOT NULL DEFAULT 'abono'`);
  await query(`ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_metodo_check`);
  await query(`UPDATE pagos SET metodo='tarjeta_credito' WHERE metodo='tarjeta'`);
  await query(`ALTER TABLE pagos ADD CONSTRAINT pagos_metodo_check CHECK(metodo IN ('efectivo','transferencia','tarjeta_debito','tarjeta_credito','nequi','daviplata','otro'))`);
  await query(`ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_concepto_check`);
  await query(`ALTER TABLE pagos ADD CONSTRAINT pagos_concepto_check CHECK(concepto IN ('anticipo','abono','saldo'))`);
  await query(`ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_estado_check`);
  await query(`ALTER TABLE pagos ADD CONSTRAINT pagos_estado_check CHECK(estado IN ('registrado','retenido','devuelto','anulado'))`);
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
  await query(`ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS origen VARCHAR(30) DEFAULT 'manual'`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_consumo_cita_producto ON inventario_movimientos(producto_id,cita_id) WHERE origen='servicio'`);
  await query(`CREATE TABLE IF NOT EXISTS inventario_recetas (
    id BIGSERIAL PRIMARY KEY,
    tipo_id INT NOT NULL REFERENCES tipos_maquillaje(id) ON DELETE CASCADE,
    producto_id UUID NOT NULL REFERENCES inventario_productos(id) ON DELETE CASCADE,
    cantidad NUMERIC(12,3) NOT NULL CHECK(cantidad>0),
    UNIQUE(tipo_id,producto_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS proveedores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(160) NOT NULL,
    contacto VARCHAR(160),
    telefono VARCHAR(40),
    email VARCHAR(255),
    activo BOOLEAN DEFAULT TRUE,
    creado_en TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS compras_inventario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proveedor_id UUID REFERENCES proveedores(id) ON DELETE SET NULL,
    referencia VARCHAR(100),
    total NUMERIC(14,2) DEFAULT 0,
    estado VARCHAR(30) DEFAULT 'recibida',
    registrado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en TIMESTAMPTZ DEFAULT NOW()
  )`);
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
  await query(`ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS asunto VARCHAR(250)`);
  await query(`ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS contenido TEXT`);

  await query(`CREATE TABLE IF NOT EXISTS configuracion_negocio (
    clave VARCHAR(100) PRIMARY KEY,
    valor JSONB NOT NULL,
    descripcion VARCHAR(250),
    actualizado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    actualizado_en TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`INSERT INTO configuracion_negocio(clave,valor,descripcion) VALUES
    ('identidad','{"nombre":"Arte & Belleza SENA","moneda":"COP","zona_horaria":"America/Bogota"}','Identidad del negocio'),
    ('reservas','{"anticipo_porcentaje":0,"cancelacion_horas":24,"tolerancia_minutos":15,"intervalo_minutos":0,"bloquear_con_deuda":false}','Políticas de reserva'),
    ('privacidad','{"retencion_auditoria_dias":730,"retencion_fotos_dias":365,"version_aviso":"1.0"}','Retención y consentimiento'),
    ('notificaciones','{"recordatorio_horas":[24,2],"seguimiento_horas":24,"solicitar_resena":true}','Programación de avisos')
    ON CONFLICT(clave) DO NOTHING`);
  await query(`UPDATE configuracion_negocio SET valor=valor||
    '{"anticipo_porcentaje":20,"anticipo_reembolsable":false,"cancelacion_horas":12,"tolerancia_minutos":15,"intervalo_minutos":10,"bloquear_con_deuda":false}'::jsonb
    WHERE clave='reservas'`);
  await query(`INSERT INTO configuracion_negocio(clave,valor,descripcion) VALUES
    ('pagos','{"metodos":["efectivo","transferencia","tarjeta_debito","tarjeta_credito","nequi","daviplata","otro"],"modalidades":["anticipo","sesion"],"pasarela_en_linea":false}','Opciones de pago')
    ON CONFLICT(clave) DO NOTHING`);
  await query(`UPDATE configuracion_negocio SET valor=(valor-'retencion_fotos_dias')||
    '{"gestion_fotografias":"manual","eliminacion_automatica_fotografias":false,"version_aviso":"1.0"}'::jsonb WHERE clave='privacidad'`);
  await query(`INSERT INTO configuracion_negocio(clave,valor,descripcion) VALUES
    ('seguridad_pendiente','{"segundo_factor":"pausado","recordar_mas_adelante":true}','Mejoras de seguridad aplazadas por decisión del proyecto')
    ON CONFLICT(clave) DO UPDATE SET valor=EXCLUDED.valor,descripcion=EXCLUDED.descripcion`);

  await query(`CREATE TABLE IF NOT EXISTS expedientes_servicio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cita_id UUID NOT NULL UNIQUE REFERENCES citas(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    especialista_id INT NOT NULL REFERENCES especialistas(id) ON DELETE RESTRICT,
    productos_usados TEXT,
    tonos_tecnicas TEXT,
    observaciones_previas TEXT,
    observaciones_posteriores TEXT,
    recomendaciones TEXT,
    reaccion_adversa BOOLEAN DEFAULT FALSE,
    detalle_reaccion TEXT,
    creado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    actualizado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_expedientes_cliente ON expedientes_servicio(usuario_id,creado_en DESC)`);

  await query(`CREATE TABLE IF NOT EXISTS consentimientos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo VARCHAR(40) NOT NULL CHECK(tipo IN ('datos','imagenes','comunicaciones')),
    version VARCHAR(30) NOT NULL,
    aceptado BOOLEAN NOT NULL,
    ip VARCHAR(80),
    evidencia JSONB,
    creado_en TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_consentimientos_usuario ON consentimientos(usuario_id,tipo,creado_en DESC)`);

  await query(`ALTER TABLE comparaciones ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'activa'`);
  await query(`ALTER TABLE comparaciones ADD COLUMN IF NOT EXISTS consentimiento_id UUID REFERENCES consentimientos(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE comparaciones ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ DEFAULT NOW()`);
  await query(`DO $$ BEGIN
    ALTER TABLE comparaciones ADD CONSTRAINT comparaciones_consentimiento_fk
      FOREIGN KEY(consentimiento_id) REFERENCES consentimientos(id) ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await query(`UPDATE comparaciones SET estado='activa' WHERE estado IS NULL`);
  await query(`DO $$ BEGIN
    ALTER TABLE comparaciones ADD CONSTRAINT comparaciones_estado_check CHECK(estado IN ('activa','archivada'));
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

  await query(`CREATE TABLE IF NOT EXISTS resenas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cita_id UUID NOT NULL UNIQUE REFERENCES citas(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    especialista_id INT NOT NULL REFERENCES especialistas(id) ON DELETE CASCADE,
    calificacion SMALLINT NOT NULL CHECK(calificacion BETWEEN 1 AND 5),
    puntualidad SMALLINT CHECK(puntualidad BETWEEN 1 AND 5),
    atencion SMALLINT CHECK(atencion BETWEEN 1 AND 5),
    resultado SMALLINT CHECK(resultado BETWEEN 1 AND 5),
    comentario TEXT,
    visible BOOLEAN DEFAULT TRUE,
    respuesta TEXT,
    respondida_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_resenas_especialista ON resenas(especialista_id,visible)`);

  await query(`CREATE TABLE IF NOT EXISTS lista_espera (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo_id INT REFERENCES tipos_maquillaje(id) ON DELETE SET NULL,
    especialista_id INT REFERENCES especialistas(id) ON DELETE SET NULL,
    fecha_desde DATE NOT NULL,
    fecha_hasta DATE NOT NULL,
    hora_desde TIME,
    hora_hasta TIME,
    estado VARCHAR(30) NOT NULL DEFAULT 'activa' CHECK(estado IN ('activa','ofrecida','aceptada','vencida','cancelada')),
    ofrecida_hasta TIMESTAMPTZ,
    cita_id UUID REFERENCES citas(id) ON DELETE SET NULL,
    creado_en TIMESTAMPTZ DEFAULT NOW(),
    CHECK(fecha_hasta>=fecha_desde)
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_espera_activa ON lista_espera(estado,fecha_desde,fecha_hasta)`);

  await query(`CREATE TABLE IF NOT EXISTS seguimiento_citas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cita_id UUID NOT NULL REFERENCES citas(id) ON DELETE CASCADE,
    tipo VARCHAR(40) NOT NULL CHECK(tipo IN ('preparacion','cuidados','incidencia','seguimiento')),
    contenido TEXT NOT NULL,
    creado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    visible_cliente BOOLEAN DEFAULT TRUE,
    creado_en TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS solicitudes_privacidad (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo VARCHAR(30) NOT NULL CHECK(tipo IN ('exportacion','correccion','eliminacion')),
    detalle TEXT,
    estado VARCHAR(30) NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','en_proceso','completada','rechazada')),
    respuesta TEXT,
    resuelta_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en TIMESTAMPTZ DEFAULT NOW(),
    resuelta_en TIMESTAMPTZ
  )`);

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
