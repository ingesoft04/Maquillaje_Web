const test = require('node:test');
const assert = require('node:assert/strict');
const { ComparacionService } = require('../services/ComparacionService');

function dependencies(overrides = {}) {
  const repository = {
    latestAcceptedImageConsent:async()=>null,
    create:async data=>({ id:'foto-1', ...data }),
    findOwned:async()=>null,
    listByUser:async()=>[],
    listPublic:async()=>[],
    listForAdministration:async()=>[],
    update:async()=>null,
    deleteOwned:async()=>false,
    ...overrides.repository
  };
  const deleted = [];
  const cache = {
    get:async()=>null,
    set:async()=>{},
    delete:async key=>deleted.push(key),
    ...overrides.cache
  };
  return { repository, cache, deleted };
}

test('ComparacionService no depende de Express ni de PostgreSQL para validar URLs', async () => {
  const { repository, cache } = dependencies();
  const service = new ComparacionService(repository, cache, 60);
  await assert.rejects(
    service.create('usuario-1', { antes_url:'', despues_url:'' }),
    error => error.status === 400 && error.code === 'PHOTO_URLS_REQUIRED'
  );
});

test('ComparacionService aplica la política de consentimiento mediante un puerto sustituible', async () => {
  const { repository, cache } = dependencies();
  const service = new ComparacionService(repository, cache, 60);
  await assert.rejects(
    service.create('usuario-1', {
      antes_url:'antes.jpg', despues_url:'despues.jpg', publica:true
    }),
    error => error.status === 409 && error.code === 'IMAGE_CONSENT_REQUIRED'
  );
});

test('ComparacionService crea e invalida caché cuando existe consentimiento', async () => {
  const { repository, cache, deleted } = dependencies({
    repository:{ latestAcceptedImageConsent:async()=> 'consentimiento-1' }
  });
  const service = new ComparacionService(repository, cache, 60);
  const result = await service.create('usuario-1', {
    antes_url:'antes.jpg', despues_url:'despues.jpg', publica:true
  });
  assert.equal(result.consentId, 'consentimiento-1');
  assert.deepEqual(deleted.sort(), ['comparaciones:publicas','comparaciones:usuario:usuario-1']);
});

test('ComparacionService puede usar otra implementación de caché sin cambiar el dominio', async () => {
  const cached = [{ id:'foto-cache' }];
  const { repository, cache } = dependencies({ cache:{ get:async()=>cached } });
  const service = new ComparacionService(repository, cache, 60);
  const result = await service.listPublic();
  assert.equal(result.source, 'cache');
  assert.deepEqual(result.items, cached);
});
