const test=require('node:test');
const assert=require('node:assert/strict');

process.env.GOOGLE_TOKEN_ENCRYPTION_KEY='prueba-unitaria-no-usar-en-produccion-0123456789';
const { _internals }=require('../google-calendar');
const { redis }=require('../redis');
test.after(async()=>{await redis.quit();});

test('refresh token se cifra y puede recuperarse sin guardarlo en texto plano',()=>{
  const original='refresh-token-secreto';
  const cifrado=_internals.cifrar(original);
  assert.notEqual(cifrado,original);
  assert.equal(_internals.descifrar(cifrado),original);
});

test('cifrado autenticado rechaza datos manipulados',()=>{
  const partes=_internals.cifrar('token').split('.');
  partes[2]=Buffer.from('contenido-alterado').toString('base64');
  assert.throws(()=>_internals.descifrar(partes.join('.')));
});

test('intervalo de evento respeta hora Colombia y duración del servicio',()=>{
  const {inicio,fin}=_internals.inicioFin({fecha:'2026-08-20',hora:'09:30:00',duracion:90});
  assert.equal(inicio,'2026-08-20T14:30:00.000Z');
  assert.equal(fin,'2026-08-20T16:00:00.000Z');
});
