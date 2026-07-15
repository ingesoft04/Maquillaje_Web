const test = require('node:test');
const assert = require('node:assert/strict');

const BASE = process.env.TEST_BASE_URL || 'http://localhost:8088';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@sena.edu.co';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'CambieEstaClave2026!';

async function request(path, options = {}) {
  const response = await fetch(BASE + path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

let clienteToken;
let adminToken;
let citaId;

test('health check confirma PostgreSQL y Redis', async () => {
  const { status, data } = await request('/health');
  assert.equal(status, 200);
  assert.equal(data.status, 'ok');
  assert.match(data.postgres, /online/);
  assert.match(data.redis, /online/);
});

test('catálogos públicos contienen servicios y especialistas', async () => {
  const [tipos, especialistas] = await Promise.all([
    request('/api/tipos'), request('/api/especialistas')
  ]);
  assert.equal(tipos.status, 200);
  assert.equal(especialistas.status, 200);
  assert.ok(tipos.data.tipos.length >= 1);
  assert.ok(especialistas.data.especialistas.length >= 1);
});

test('registro crea cliente y entrega JWT', async () => {
  const email = `automatizada.${Date.now()}@example.com`;
  const { status, data } = await request('/api/auth/registro', {
    method: 'POST',
    body: JSON.stringify({
      nombre: 'Prueba Automatizada SENA', email,
      telefono: '3007654321', password: 'PruebaSegura123'
    })
  });
  assert.equal(status, 201);
  assert.equal(data.usuario.rol, 'cliente');
  assert.ok(data.token);
  clienteToken = data.token;
});

test('cliente no puede entrar al módulo administrativo', async () => {
  const { status } = await request('/api/admin/resumen', { token: clienteToken });
  assert.equal(status, 403);
});

test('cliente consulta disponibilidad y agenda cita', async () => {
  const fecha = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const especialistas = (await request('/api/especialistas')).data.especialistas;
  const tipos = (await request('/api/tipos')).data.tipos;
  let seleccion;

  for (const especialista of especialistas) {
    const disponibilidad = await request(`/api/citas/disponibilidad?especialista_id=${especialista.id}&fecha=${fecha}`, { token: clienteToken });
    if (disponibilidad.data.disponibles?.length) {
      seleccion = { especialista_id: especialista.id, hora: disponibilidad.data.disponibles[0] };
      break;
    }
  }
  assert.ok(seleccion, 'Debe existir al menos un horario disponible');

  const { status, data } = await request('/api/citas', {
    method: 'POST', token: clienteToken,
    body: JSON.stringify({ ...seleccion, tipo_id: tipos[0].id, fecha, notas: 'Creada por prueba automatizada' })
  });
  assert.equal(status, 201);
  assert.ok(data.cita.id);
  citaId = data.cita.id;
});

test('cita creada aparece en el listado del cliente', async () => {
  const { status, data } = await request('/api/citas', { token: clienteToken });
  assert.equal(status, 200);
  assert.ok(data.citas.some(cita => cita.id === citaId));
});

test('administrador inicia sesión y consulta métricas', async () => {
  const login = await request('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  });
  assert.equal(login.status, 200);
  assert.equal(login.data.usuario.rol, 'admin');
  adminToken = login.data.token;

  const resumen = await request('/api/admin/resumen', { token: adminToken });
  assert.equal(resumen.status, 200);
  assert.ok(resumen.data.usuarios >= 2);
  assert.ok(resumen.data.especialistas >= 1);
});

test('administrador actualiza estado de cita', async () => {
  const { status, data } = await request(`/api/admin/citas/${citaId}/estado`, {
    method: 'PATCH', token: adminToken, body: JSON.stringify({ estado: 'completada' })
  });
  assert.equal(status, 200);
  assert.equal(data.cita.estado, 'completada');
});

test('endpoint inexistente devuelve 404 JSON', async () => {
  const { status, data } = await request('/api/ruta-inexistente');
  assert.equal(status, 404);
  assert.match(data.error, /no encontrada/i);
});
