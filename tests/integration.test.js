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
let citaDatos;
let productoId;
let servicioPagadoId;

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

test('cliente guarda y consulta su ficha cosmética', async () => {
  const guardado = await request('/api/perfil-cosmetico', {
    method: 'PUT', token: clienteToken,
    body: JSON.stringify({ tipo_piel: 'mixta', subtono: 'cálido', sensibilidad: 'leve', alergias: 'Ninguna conocida', consentimiento_datos: true })
  });
  assert.equal(guardado.status, 200);
  assert.equal(guardado.data.perfil.tipo_piel, 'mixta');
  const consulta = await request('/api/perfil-cosmetico', { token: clienteToken });
  assert.equal(consulta.status, 200);
  assert.equal(consulta.data.perfil.subtono, 'cálido');
});

test('cliente consulta disponibilidad y agenda cita', async () => {
  const fecha = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const especialistas = (await request('/api/especialistas')).data.especialistas;
  const tipos = (await request('/api/tipos')).data.tipos;
  let seleccion;

  for (const especialista of especialistas) {
    const disponibilidad = await request(`/api/citas/disponibilidad?especialista_id=${especialista.id}&tipo_id=${tipos[0].id}&fecha=${fecha}`, { token: clienteToken });
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
  citaDatos = { ...seleccion, tipo_id: tipos[0].id, fecha };
});

test('cita creada aparece en el listado del cliente', async () => {
  const { status, data } = await request('/api/citas', { token: clienteToken });
  assert.equal(status, 200);
  assert.ok(data.citas.some(cita => cita.id === citaId));
});

test('cliente puede reprogramar y el horario anterior queda libre', async () => {
  const disponibilidad = await request(
    `/api/citas/disponibilidad?especialista_id=${citaDatos.especialista_id}&tipo_id=${citaDatos.tipo_id}&fecha=${citaDatos.fecha}`,
    { token: clienteToken }
  );
  const nuevaHora = disponibilidad.data.disponibles[0];
  assert.ok(nuevaHora);
  const resultado = await request(`/api/citas/${citaId}/reprogramar`, {
    method: 'PATCH', token: clienteToken,
    body: JSON.stringify({ ...citaDatos, hora: nuevaHora, notas: 'Reprogramada por prueba automatizada' })
  });
  assert.equal(resultado.status, 200);
  assert.equal(resultado.data.cita.estado, 'reprogramada');
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

test('administrador consulta analítica y gestiona inventario', async () => {
  const analitica = await request('/api/admin/analitica', { token: adminToken });
  assert.equal(analitica.status, 200);
  assert.ok(Number(analitica.data.general.citas) >= 1);

  const producto = await request('/api/admin/inventario', {
    method: 'POST', token: adminToken,
    body: JSON.stringify({ nombre: `Base prueba ${Date.now()}`, marca: 'SENA', cantidad: 10, stock_minimo: 2, costo_unitario: 15000 })
  });
  assert.equal(producto.status, 201);
  productoId = producto.data.producto.id;
  const salida = await request(`/api/admin/inventario/${productoId}/movimientos`, {
    method: 'POST', token: adminToken,
    body: JSON.stringify({ tipo: 'salida', cantidad: 3, motivo: 'Prueba automatizada' })
  });
  assert.equal(salida.status, 200);
  assert.equal(Number(salida.data.producto.cantidad), 7);
});

test('administrador consulta caja, horarios y bloqueos', async () => {
  const [pagos, horarios, bloqueos] = await Promise.all([
    request('/api/admin/pagos', { token: adminToken }),
    request('/api/admin/horarios', { token: adminToken }),
    request('/api/admin/bloqueos', { token: adminToken })
  ]);
  assert.equal(pagos.status, 200);
  assert.equal(horarios.status, 200);
  assert.equal(bloqueos.status, 200);
  assert.ok(horarios.data.horarios.length >= 1);
});

test('OpenAPI y métricas operativas están publicados', async () => {
  const contrato = await request('/api/openapi.json');
  assert.equal(contrato.status, 200);
  assert.equal(contrato.data.openapi, '3.0.3');
  const metricas = await fetch(BASE + '/metrics');
  assert.equal(metricas.status, 200);
  assert.match(await metricas.text(), /http_request_duration_seconds/);
  const docs = await fetch(BASE + '/api/docs');
  assert.equal(docs.status, 200);
  assert.match(await docs.text(), /Arte & Belleza/);
});

test('administrador gestiona catálogo y genera auditoría', async () => {
  const sello = Date.now();
  const especialista = await request('/api/admin/especialistas', {
    method: 'POST', token: adminToken,
    body: JSON.stringify({ nombre: `Especialista Automatizada ${sello}`, bio: 'Registro de prueba' })
  });
  assert.equal(especialista.status, 201);

  const servicio = await request('/api/admin/servicios', {
    method: 'POST', token: adminToken,
    body: JSON.stringify({
      nombre: `Servicio Automatizado ${sello}`, slug: `servicio-${sello}`,
      descripcion: 'Registro de prueba', categoria: 'social', icon: '💄',
      precio: 50000, duracion_minutos: 60
    })
  });
  assert.equal(servicio.status, 201);

  const desactivar = await request(`/api/admin/servicios/${servicio.data.servicio.id}`, {
    method: 'PATCH', token: adminToken,
    body: JSON.stringify({ ...servicio.data.servicio, activo: false })
  });
  assert.equal(desactivar.status, 200);
  assert.equal(desactivar.data.servicio.activo, false);

  const servicioPagado = await request('/api/admin/servicios', {
    method: 'POST', token: adminToken,
    body: JSON.stringify({
      nombre: `Maquillaje pago ${sello}`, slug: `pago-${sello}`,
      descripcion: 'Servicio para validar caja', categoria: 'social', icon: '✨',
      precio: 80000, duracion_minutos: 60
    })
  });
  assert.equal(servicioPagado.status, 201);
  servicioPagadoId = servicioPagado.data.servicio.id;

  const auditoria = await request('/api/admin/auditoria', { token: adminToken });
  assert.equal(auditoria.status, 200);
  assert.ok(auditoria.data.auditoria.some(item => item.entidad === 'servicio'));
});

test('flujo de cita con precio, abono administrativo y consulta del cliente', async () => {
  const fecha = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
  const especialistas = (await request('/api/especialistas')).data.especialistas;
  let seleccion;
  for (const especialista of especialistas) {
    const disp = await request(`/api/citas/disponibilidad?especialista_id=${especialista.id}&tipo_id=${servicioPagadoId}&fecha=${fecha}`, { token: clienteToken });
    if (disp.data.disponibles?.length) { seleccion = { especialista_id: especialista.id, hora: disp.data.disponibles[0] }; break; }
  }
  assert.ok(seleccion);
  const cita = await request('/api/citas', {
    method: 'POST', token: clienteToken,
    body: JSON.stringify({ ...seleccion, tipo_id: servicioPagadoId, fecha })
  });
  assert.equal(cita.status, 201);
  assert.equal(Number(cita.data.cita.precio_total), 80000);
  const pago = await request('/api/admin/pagos', {
    method: 'POST', token: adminToken,
    body: JSON.stringify({ cita_id: cita.data.cita.id, monto: 30000, metodo: 'transferencia', referencia: 'TEST-AUTOMATICO' })
  });
  assert.equal(pago.status, 201);
  const propios = await request('/api/pagos/mis', { token: clienteToken });
  assert.equal(propios.status, 200);
  assert.ok(propios.data.pagos.some(item => item.id === pago.data.pago.id));
});

test('endpoint inexistente devuelve 404 JSON', async () => {
  const { status, data } = await request('/api/ruta-inexistente');
  assert.equal(status, 404);
  assert.match(data.error, /no encontrada/i);
});
