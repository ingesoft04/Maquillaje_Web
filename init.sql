-- ═══════════════════════════════════════════════
--  MAQUILLAJE SENA — Schema PostgreSQL
--  Ejecutado automáticamente al iniciar el contenedor
-- ═══════════════════════════════════════════════

-- Extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── USUARIOS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      VARCHAR(120)  NOT NULL,
  email       VARCHAR(255)  NOT NULL UNIQUE,
  telefono    VARCHAR(20),
  password_hash TEXT        NOT NULL,
  tono_piel   VARCHAR(60),          -- resultado guardado de la calculadora
  creado_en   TIMESTAMPTZ   DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

-- ── ESPECIALISTAS ───────────────────────────────
CREATE TABLE IF NOT EXISTS especialistas (
  id        SERIAL PRIMARY KEY,
  nombre    VARCHAR(120) NOT NULL,
  foto_url  TEXT,
  bio       TEXT,
  activo    BOOLEAN DEFAULT TRUE
);

INSERT INTO especialistas (nombre, bio) VALUES
  ('Valentina Ríos',   'Especialista en maquillaje artístico y nupcial con 8 años de experiencia.'),
  ('Camila Moreno',    'Maquilladora profesional certificada, experta en técnicas de contouring.'),
  ('Juliana Ospina',   'Artista de efectos especiales y maquillaje teatral.'),
  ('Andrea Vargas',    'Especialista en cuidado de la piel y maquillaje natural.')
ON CONFLICT DO NOTHING;

-- ── TIPOS DE MAQUILLAJE ─────────────────────────
CREATE TABLE IF NOT EXISTS tipos_maquillaje (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  slug        VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  icon        VARCHAR(10),
  categoria   VARCHAR(60),     -- social, artistico, especial, natural
  activo      BOOLEAN DEFAULT TRUE
);

INSERT INTO tipos_maquillaje (nombre, slug, descripcion, icon, categoria) VALUES
  ('Maquillaje Social',         'social',         'Ideal para eventos cotidianos y reuniones.', '💄', 'social'),
  ('Maquillaje Nupcial',        'nupcial',        'Diseñado para el día más especial.', '💍', 'especial'),
  ('Maquillaje Artístico',      'artistico',      'Expresión creativa sin límites.', '🎨', 'artistico'),
  ('Maquillaje de Fantasía',    'fantasia',       'Transformaciones mágicas y teatrales.', '✨', 'artistico'),
  ('Maquillaje Natural',        'natural',        'Realza tu belleza con sutileza.', '🌿', 'natural'),
  ('Maquillaje de Pasarela',    'pasarela',       'Alta moda y tendencias internacionales.', '👑', 'social'),
  ('Efectos Especiales',        'efectos',        'Caracterización para cine y teatro.', '🎭', 'artistico'),
  ('Maquillaje Airbrush',       'airbrush',       'Acabado perfecto con pistola aerógrafo.', '🌬️', 'especial')
ON CONFLICT DO NOTHING;

-- ── CITAS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS citas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  especialista_id INT  NOT NULL REFERENCES especialistas(id),
  tipo_id         INT  REFERENCES tipos_maquillaje(id),
  fecha           DATE NOT NULL,
  hora            TIME NOT NULL,
  notas           TEXT,
  estado          VARCHAR(30) NOT NULL DEFAULT 'confirmada',
                  -- confirmada | cancelada | completada | reprogramada
  creado_en       TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en  TIMESTAMPTZ DEFAULT NOW(),

  -- Evitar doble reserva del mismo especialista en la misma hora
  CONSTRAINT uq_especialista_horario UNIQUE (especialista_id, fecha, hora)
);

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_citas_usuario    ON citas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_citas_fecha      ON citas(fecha);
CREATE INDEX IF NOT EXISTS idx_citas_estado     ON citas(estado);
CREATE INDEX IF NOT EXISTS idx_citas_especialista ON citas(especialista_id);

-- ── TONOS DE PIEL (resultados calculadora) ───────
CREATE TABLE IF NOT EXISTS tonos_piel (
  id          SERIAL PRIMARY KEY,
  codigo      VARCHAR(30) NOT NULL UNIQUE,   -- p.ej. 'claro-frio'
  nombre      VARCHAR(80) NOT NULL,
  descripcion TEXT,
  hex_color   VARCHAR(7),
  temporadas  TEXT[],                        -- colores recomendados
  productos   JSONB                          -- sugerencias de productos
);

INSERT INTO tonos_piel (codigo, nombre, descripcion, hex_color, temporadas, productos) VALUES
  ('muy-claro-frio',   'Muy Claro Frío',    'Piel porcelana con subtonos rosados o azulados.',   '#F8E8E0', ARRAY['verano','invierno'],
    '{"base": "N10-N15", "corrector": "Y10", "polvo": "Translucent Light"}'),
  ('muy-claro-calido', 'Muy Claro Cálido',  'Piel muy clara con subtonos dorados o melocotón.', '#FAEBD7', ARRAY['primavera','otoño'],
    '{"base": "W10-W15", "corrector": "Y20", "polvo": "Warm Ivory"}'),
  ('claro-frio',       'Claro Frío',        'Piel clara con subtonos rosados.',                 '#F0C8B4', ARRAY['verano','invierno'],
    '{"base": "N20-N25", "corrector": "Y20", "polvo": "Light"}'),
  ('claro-calido',     'Claro Cálido',      'Piel clara con subtonos dorados.',                 '#F0C080', ARRAY['primavera','otoño'],
    '{"base": "W20-W25", "corrector": "Y30", "polvo": "Sand"}'),
  ('medio-frio',       'Medio Frío',        'Piel de tono medio con subtonos rosados.',         '#C89070', ARRAY['verano','invierno'],
    '{"base": "N30-N35", "corrector": "Y25", "polvo": "Medium"}'),
  ('medio-calido',     'Medio Cálido',      'Piel de tono medio con subtonos dorados.',         '#C87840', ARRAY['primavera','otoño'],
    '{"base": "W30-W35", "corrector": "Y35", "polvo": "Golden Medium"}'),
  ('oscuro-frio',      'Oscuro Frío',       'Piel oscura con subtonos azulados o neutros.',     '#805030', ARRAY['invierno'],
    '{"base": "N40-N45", "corrector": "Y40", "polvo": "Deep"}'),
  ('oscuro-calido',    'Oscuro Cálido',     'Piel oscura con subtonos dorados.',                '#804020', ARRAY['otoño'],
    '{"base": "W40-W45", "corrector": "Y45", "polvo": "Warm Deep"}')
ON CONFLICT DO NOTHING;

-- ── COMPARACIONES ANTES/DESPUÉS ─────────────────
CREATE TABLE IF NOT EXISTS comparaciones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  titulo      VARCHAR(200),
  tipo_id     INT REFERENCES tipos_maquillaje(id),
  antes_url   TEXT NOT NULL,
  despues_url TEXT NOT NULL,
  descripcion TEXT,
  publica     BOOLEAN DEFAULT FALSE,
  creado_en   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comparaciones_usuario ON comparaciones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_comparaciones_publicas ON comparaciones(publica) WHERE publica = TRUE;

-- ── TRIGGER: actualizar updated_at automáticamente ─
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trig_usuarios_updated
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trig_citas_updated
  BEFORE UPDATE ON citas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
