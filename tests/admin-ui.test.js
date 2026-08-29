const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'maquillaje-sena-v3.html'), 'utf8');

test('navegación administrativa conserva todos los módulos y una vista móvil', () => {
  const modulos = [...html.matchAll(/data-admin-vista="([^"]+)"/g)].map(resultado => resultado[1]);
  assert.equal(modulos.length, 16);
  assert.equal(new Set(modulos).size, 16);
  assert.match(html, /id="adminVistaSelect"/);
  assert.match(html, /id="adminContenido"[^>]+role="tabpanel"[^>]+aria-busy="false"/);
});

test('panel administrativo incluye búsqueda, recarga y estado de carga accesible', () => {
  assert.match(html, /id="adminFiltro"[^>]+type="search"/);
  assert.match(html, /function filtrarAdminContenido\(\)/);
  assert.match(html, /async function recargarAdmin\(\)/);
  assert.match(html, /class="admin-loading" aria-label="Cargando datos"/);
});

test('selección de módulo solo modifica los controles de navegación', () => {
  assert.match(html, /querySelectorAll\('#adminNavegacion \[data-admin-vista\]'\)/);
  assert.doesNotMatch(html, /querySelectorAll\('\.admin-tab'\)/);
});

test('formulario de cita informa valores, modalidad y política de anticipo', () => {
  assert.match(html, /id="cita-modalidad-pago"/);
  assert.match(html, /id="cita-metodo-pago"/);
  assert.match(html, /value="nequi"/);
  assert.match(html, /function actualizarResumenPago\(\)/);
  assert.match(html, /anticipo no es reembolsable/i);
  assert.match(html, /async function cargarOpcionesPago\(\)/);
  assert.doesNotMatch(html, /Promise\.all\(\[\s*apiFetch\('\/tipos'\), apiFetch\('\/especialistas'\), apiFetch\('\/pagos\/opciones'\)/);
});

test('catálogo de reservas es público y muestra precio y duración antes del acceso', () => {
  const catalogo = html.indexOf('id="catalogoPublico"');
  const acceso = html.indexOf('id="authTabs"');
  assert.ok(catalogo > -1 && catalogo < acceso);
  assert.match(html, /id="catalogoPublicoServicios"/);
  assert.match(html, /function renderCatalogoPublico\(servicios,especialistas\)/);
  assert.match(html, /Number\(item\.precio\|\|0\).*COP/);
  assert.match(html, /duracion_minutos/);
});

test('frontend conserva rutas locales y admite publicación bajo /maquillaje', () => {
  assert.match(html, /const API = new URL\('\.\/api', location\.href\)/);
  assert.match(html, /href="\.\/manifest\.webmanifest"/);
  assert.match(html, /href="\.\/citas"/);
  assert.match(html, /new URL\('\.\/sw\.js', location\.href\)/);
  assert.doesNotMatch(html, /const API = '\/api'/);
});
