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
  return { status: response.status, data, headers:response.headers };
}

let clienteToken;
let adminToken;
let citaId;
let citaDatos;
let productoId;
let servicioPagadoId;
let especialistaToken;
let citaProfesionalId;
let citaPagadaId;

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
  let nuevaFecha;
  let nuevaHora;
  for (let desplazamiento=31; desplazamiento<45 && !nuevaHora; desplazamiento++) {
    nuevaFecha = new Date(Date.now() + desplazamiento * 86400000).toISOString().slice(0,10);
    const disponibilidad = await request(
      `/api/citas/disponibilidad?especialista_id=${citaDatos.especialista_id}&tipo_id=${citaDatos.tipo_id}&fecha=${nuevaFecha}`,
      { token: clienteToken }
    );
    nuevaHora = disponibilidad.data.disponibles?.[0];
  }
  assert.ok(nuevaHora, 'Debe existir un horario alternativo para reprogramar');
  const resultado = await request(`/api/citas/${citaId}/reprogramar`, {
    method: 'PATCH', token: clienteToken,
    body: JSON.stringify({ ...citaDatos, fecha:nuevaFecha, hora:nuevaHora, notas:'Reprogramada por prueba automatizada' })
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

test('autenticación web usa cookie HttpOnly y rechaza orígenes no autorizados', async () => {
  const login = await request('/api/auth/login', {
    method:'POST', body:JSON.stringify({ email:ADMIN_EMAIL, password:ADMIN_PASSWORD })
  });
  const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /sena_session=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);

  const perfil = await fetch(BASE + '/api/auth/perfil', {
    headers:{ Cookie:cookie.split(';')[0] }
  });
  assert.equal(perfil.status, 200);
  assert.equal((await perfil.json()).rol, 'admin');

  const origenExterno = await fetch(BASE + '/api/auth/recuperacion/solicitar', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Origin:'https://sitio-malicioso.example' },
    body:JSON.stringify({ email:ADMIN_EMAIL })
  });
  assert.equal(origenExterno.status, 403);
});

test('fotografías se administran manualmente y exigen consentimiento para publicar', async () => {
  const sinConsentimiento = await request('/api/comparaciones', {
    method:'POST', token:clienteToken,
    body:JSON.stringify({ titulo:'Look de prueba', antes_url:'https://example.com/antes.jpg', despues_url:'https://example.com/despues.jpg', publica:true })
  });
  assert.equal(sinConsentimiento.status,409);
  await request('/api/perfil-cosmetico', {
    method:'PUT', token:clienteToken,
    body:JSON.stringify({ tipo_piel:'mixta', consentimiento_datos:true, consentimiento_imagen:true })
  });
  const creada = await request('/api/comparaciones', {
    method:'POST', token:clienteToken,
    body:JSON.stringify({ titulo:'Look autorizado', antes_url:'https://example.com/antes.jpg', despues_url:'https://example.com/despues.jpg', publica:true })
  });
  assert.equal(creada.status,201);
  assert.equal(creada.data.comparacion.publica,true);
  const admin = await request('/api/comparaciones/admin',{token:adminToken});
  assert.equal(admin.status,200);
  assert.ok(admin.data.comparaciones.some(x=>x.id===creada.data.comparacion.id && x.consentimiento_fecha));
  const archivada = await request(`/api/comparaciones/admin/${creada.data.comparacion.id}`,{
    method:'PATCH',token:adminToken,body:JSON.stringify({estado:'archivada',publica:false,descripcion:'Archivada manualmente'})
  });
  assert.equal(archivada.status,200);
  assert.equal(archivada.data.comparacion.estado,'archivada');
});

test('administrador actualiza estado de cita', async () => {
  const { status, data } = await request(`/api/admin/citas/${citaId}/estado`, {
    method: 'PATCH', token: adminToken, body: JSON.stringify({ estado: 'completada' })
  });
  assert.equal(status, 200);
  assert.equal(data.cita.estado, 'completada');
});

test('administrador crea cuenta profesional y la especialista accede solo a su agenda', async () => {
  const nueva=await request('/api/admin/especialistas',{
    method:'POST',token:adminToken,body:JSON.stringify({nombre:`Profesional Portal ${Date.now()}`,bio:'Cuenta de prueba del portal'})
  });
  assert.equal(nueva.status,201);
  const email=`especialista.${Date.now()}@example.com`;
  const cuenta=await request('/api/admin/especialistas/cuenta',{
    method:'POST',token:adminToken,
    body:JSON.stringify({especialista_id:nueva.data.especialista.id,email,password:'EspecialistaSegura123!'})
  });
  assert.equal(cuenta.status,201);
  assert.equal(cuenta.data.usuario.rol,'especialista');
  const login=await request('/api/auth/login',{method:'POST',body:JSON.stringify({email,password:'EspecialistaSegura123!'})});
  assert.equal(login.status,200);
  especialistaToken=login.data.token;
  const fecha=new Date(Date.now()+60*86400000).toISOString().slice(0,10);
  const disp=await request(`/api/citas/disponibilidad?especialista_id=${nueva.data.especialista.id}&tipo_id=${citaDatos.tipo_id}&fecha=${fecha}`,{token:clienteToken});
  assert.ok(disp.data.disponibles.length);
  const cita=await request('/api/citas',{method:'POST',token:clienteToken,body:JSON.stringify({
    especialista_id:nueva.data.especialista.id,tipo_id:citaDatos.tipo_id,fecha,hora:disp.data.disponibles[0]
  })});
  assert.equal(cita.status,201);
  citaProfesionalId=cita.data.cita.id;
  const panel=await request('/api/profesional/resumen',{token:especialistaToken});
  assert.equal(panel.status,200);
  assert.equal(panel.data.especialista_id,nueva.data.especialista.id);
  assert.ok(panel.data.citas.some(c=>c.id===citaProfesionalId));
  const adminDenegado=await request('/api/admin/usuarios',{token:especialistaToken});
  assert.equal(adminDenegado.status,403);
});

test('especialista registra expediente y seguimiento visible para el cliente',async()=>{
  const expediente=await request(`/api/profesional/citas/${citaProfesionalId}/expediente`,{
    method:'PUT',token:especialistaToken,
    body:JSON.stringify({productos_usados:'Base tono medio y fijador',tonos_tecnicas:'Subtono cálido, técnica natural',recomendaciones:'Hidratar la piel'})
  });
  assert.equal(expediente.status,200);
  const seguimiento=await request(`/api/profesional/citas/${citaProfesionalId}/seguimiento`,{
    method:'POST',token:especialistaToken,
    body:JSON.stringify({tipo:'cuidados',contenido:'Retirar el maquillaje antes de dormir.',visible_cliente:true})
  });
  assert.equal(seguimiento.status,201);
  const historial=await request('/api/historial-profesional',{token:clienteToken});
  assert.equal(historial.status,200);
  assert.ok(historial.data.expedientes.some(x=>x.cita_id===citaProfesionalId));
  assert.ok(historial.data.seguimientos.some(x=>x.cita_id===citaProfesionalId));
});

test('cliente califica una cita completada y administración puede moderarla',async()=>{
  const crear=await request(`/api/citas/${citaId}/resena`,{
    method:'POST',token:clienteToken,
    body:JSON.stringify({calificacion:5,puntualidad:5,atencion:5,resultado:5,comentario:'Excelente atención'})
  });
  assert.equal(crear.status,201);
  const lista=await request('/api/admin/resenas',{token:adminToken});
  assert.equal(lista.status,200);
  assert.ok(lista.data.resenas.some(x=>x.id===crear.data.resena.id));
  const moderar=await request(`/api/admin/resenas/${crear.data.resena.id}`,{
    method:'PATCH',token:adminToken,body:JSON.stringify({visible:true,respuesta:'Gracias por confiar en nosotros.'})
  });
  assert.equal(moderar.status,200);
});

test('cliente administra lista de espera y admin consulta políticas configurables',async()=>{
  const desde=new Date(Date.now()+50*86400000).toISOString().slice(0,10);
  const hasta=new Date(Date.now()+55*86400000).toISOString().slice(0,10);
  const crear=await request('/api/lista-espera',{method:'POST',token:clienteToken,body:JSON.stringify({
    tipo_id:citaDatos.tipo_id,especialista_id:citaDatos.especialista_id,fecha_desde:desde,fecha_hasta:hasta,hora_desde:'08:00',hora_hasta:'12:00'
  })});
  assert.equal(crear.status,201);
  const propia=await request('/api/lista-espera/mis',{token:clienteToken});
  assert.ok(propia.data.espera.some(x=>x.id===crear.data.espera.id));
  const admin=await request('/api/admin/lista-espera',{token:adminToken});
  assert.ok(admin.data.espera.some(x=>x.id===crear.data.espera.id));
  const config=await request('/api/admin/configuracion',{token:adminToken});
  assert.equal(config.status,200);
  assert.ok(config.data.configuracion.reservas);
  const cancelar=await request(`/api/lista-espera/${crear.data.espera.id}/cancelar`,{method:'PATCH',token:clienteToken});
  assert.equal(cancelar.data.espera.estado,'cancelada');
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
  const receta=await request('/api/admin/inventario-recetas',{method:'POST',token:adminToken,body:JSON.stringify({
    tipo_id:citaDatos.tipo_id,producto_id:productoId,cantidad:1
  })});
  assert.equal(receta.status,201);
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

test('integración Google Calendar expone estado y asignación por especialista', async () => {
  const estado = await request('/api/admin/google/estado', { token: adminToken });
  assert.equal(estado.status, 200);
  assert.equal(typeof estado.data.configurado, 'boolean');
  assert.equal(typeof estado.data.conectado, 'boolean');
  const especialista = (await request('/api/admin/especialistas', { token: adminToken })).data.especialistas[0];
  const asignar = await request(`/api/admin/google/especialistas/${especialista.id}`, {
    method: 'PATCH', token: adminToken, body: JSON.stringify({ google_calendar_id:'primary' })
  });
  assert.equal(asignar.status, 200);
  assert.equal(asignar.data.especialista.google_calendar_id, 'primary');
  if (!estado.data.configurado) {
    const inicio = await request('/api/google/oauth/iniciar', { token: adminToken });
    assert.equal(inicio.status, 503);
  }
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
  const opcionesPago = await request('/api/pagos/opciones');
  assert.equal(opcionesPago.status, 200);
  assert.ok(opcionesPago.data.metodos.includes('nequi'));
  assert.equal(opcionesPago.data.anticipo_reembolsable, false);
  const especialistas = (await request('/api/especialistas')).data.especialistas;
  let seleccion;
  let fecha;
  for (let desplazamiento=45; desplazamiento<52 && !seleccion; desplazamiento++) {
    fecha = new Date(Date.now() + desplazamiento * 86400000).toISOString().slice(0, 10);
    for (const especialista of especialistas) {
      const disp = await request(`/api/citas/disponibilidad?especialista_id=${especialista.id}&tipo_id=${servicioPagadoId}&fecha=${fecha}`, { token: clienteToken });
      if (disp.data.disponibles?.length) { seleccion = { especialista_id: especialista.id, hora: disp.data.disponibles[0] }; break; }
    }
  }
  assert.ok(seleccion);
  const cita = await request('/api/citas', {
    method: 'POST', token: clienteToken,
    body: JSON.stringify({ ...seleccion, tipo_id: servicioPagadoId, fecha,modalidad_pago:'anticipo',metodo_pago_preferido:'nequi' })
  });
  assert.equal(cita.status, 201);
  citaPagadaId=cita.data.cita.id;
  assert.equal(Number(cita.data.cita.precio_total), 80000);
  assert.equal(cita.data.cita.modalidad_pago, 'anticipo');
  assert.equal(cita.data.cita.metodo_pago_preferido, 'nequi');
  assert.equal(Number(cita.data.pago.anticipo_requerido), 16000);
  assert.equal(cita.data.pago.anticipo_reembolsable, false);
  const pago = await request('/api/admin/pagos', {
    method: 'POST', token: adminToken,
    body: JSON.stringify({ cita_id: cita.data.cita.id, monto: 30000, metodo: 'transferencia', concepto:'anticipo', referencia: 'TEST-AUTOMATICO' })
  });
  assert.equal(pago.status, 201);
  const propios = await request('/api/pagos/mis', { token: clienteToken });
  assert.equal(propios.status, 200);
  assert.ok(propios.data.pagos.some(item => item.id === pago.data.pago.id));
});

test('el anticipo queda retenido cuando administración cancela la cita',async()=>{
  const cancelada=await request(`/api/admin/citas/${citaPagadaId}/estado`,{
    method:'PATCH',token:adminToken,body:JSON.stringify({estado:'cancelada'})
  });
  assert.equal(cancelada.status,200);
  assert.equal(Number(cancelada.data.anticipo_retenido),30000);
  const propios=await request('/api/pagos/mis',{token:clienteToken});
  const anticipo=propios.data.pagos.find(x=>x.cita_id===citaPagadaId && x.concepto==='anticipo');
  assert.equal(anticipo.estado,'retenido');
});

test('reportes, privacidad y configuración operan con control de acceso',async()=>{
  const reporte=await request('/api/admin/reportes',{token:adminToken});
  assert.equal(reporte.status,200);
  assert.ok(Array.isArray(reporte.data.finanzas));
  const csv=await fetch(BASE+'/api/admin/reportes/servicios.csv',{headers:{Authorization:`Bearer ${adminToken}`}});
  assert.equal(csv.status,200);
  assert.match(csv.headers.get('content-type'),/text\/csv/);
  const exportacion=await request('/api/privacidad/exportar',{token:clienteToken});
  assert.equal(exportacion.status,200);
  assert.equal(exportacion.data.usuario.rol,'cliente');
  const solicitud=await request('/api/privacidad/solicitudes',{method:'POST',token:clienteToken,body:JSON.stringify({tipo:'correccion',detalle:'Actualizar información de contacto'})});
  assert.equal(solicitud.status,201);
  const admin=await request('/api/admin/privacidad/solicitudes',{token:adminToken});
  assert.ok(admin.data.solicitudes.some(x=>x.id===solicitud.data.solicitud.id));
  const config=await request('/api/admin/configuracion/reservas',{method:'PUT',token:adminToken,body:JSON.stringify({valor:{anticipo_porcentaje:20,cancelacion_horas:12,tolerancia_minutos:15,intervalo_minutos:10,bloquear_con_deuda:false}})});
  assert.equal(config.status,200);
});

test('endpoint inexistente devuelve 404 JSON', async () => {
  const { status, data } = await request('/api/ruta-inexistente');
  assert.equal(status, 404);
  assert.match(data.error, /no encontrada/i);
});
