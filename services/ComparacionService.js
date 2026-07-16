const { AppError } = require('../core/AppError');

class ComparacionService {
  constructor(repository, cache, ttl) {
    this.repository = repository;
    this.cache = cache;
    this.ttl = ttl;
  }

  async create(userId, input) {
    if (!input.antes_url || !input.despues_url) {
      throw new AppError('Las URLs de antes y después son requeridas.', 400, 'PHOTO_URLS_REQUIRED');
    }
    const consentId = await this.resolveConsent(userId, Boolean(input.publica));
    const result = await this.repository.create({
      userId,
      title: input.titulo || null,
      typeId: input.tipo_id || null,
      beforeUrl: input.antes_url,
      afterUrl: input.despues_url,
      description: input.descripcion || null,
      isPublic: Boolean(input.publica),
      consentId
    });
    await this.invalidate(userId);
    return result;
  }

  async listMine(userId) {
    const key = `comparaciones:usuario:${userId}`;
    const cached = await this.cache.get(key);
    if (cached) return { source:'cache', items:cached };
    const items = await this.repository.listByUser(userId);
    await this.cache.set(key, items, this.ttl);
    return { source:'db', items };
  }

  async listPublic() {
    const key = 'comparaciones:publicas';
    const cached = await this.cache.get(key);
    if (cached) return { source:'cache', items:cached };
    const items = await this.repository.listPublic();
    await this.cache.set(key, items, this.ttl);
    return { source:'db', items };
  }

  listForAdministration() {
    return this.repository.listForAdministration();
  }

  async update(userId, id, input) {
    const current = await this.repository.findOwned(id, userId);
    if (!current) throw new AppError('Comparación no encontrada.', 404, 'PHOTO_NOT_FOUND');
    const status = input.estado || current.estado;
    if (!['activa','archivada'].includes(status)) {
      throw new AppError('Estado de fotografía inválido.', 400, 'INVALID_PHOTO_STATUS');
    }
    const requestedPublic = input.publica === undefined ? current.publica : Boolean(input.publica);
    const consentId = await this.resolveConsent(userId, requestedPublic);
    const result = await this.repository.update(id, userId, {
      title: input.titulo ?? current.titulo,
      typeId: input.tipo_id ?? current.tipo_id,
      beforeUrl: input.antes_url ?? current.antes_url,
      afterUrl: input.despues_url ?? current.despues_url,
      description: input.descripcion ?? current.descripcion,
      isPublic: requestedPublic && status === 'activa',
      status,
      consentId: requestedPublic ? consentId : current.consentimiento_id
    });
    await this.invalidate(userId);
    return result;
  }

  async updateAsAdmin(id, input) {
    const item = (await this.repository.listForAdministration()).find(photo => photo.id === id);
    if (!item) throw new AppError('Comparación no encontrada.', 404, 'PHOTO_NOT_FOUND');
    return this.update(item.usuario_id, id, input);
  }

  async delete(userId, id) {
    if (!await this.repository.deleteOwned(id, userId)) {
      throw new AppError('Comparación no encontrada.', 404, 'PHOTO_NOT_FOUND');
    }
    await this.invalidate(userId);
  }

  async resolveConsent(userId, isPublic) {
    if (!isPublic) return null;
    const consentId = await this.repository.latestAcceptedImageConsent(userId);
    if (!consentId) {
      throw new AppError(
        'Para publicar fotografías se requiere un consentimiento de imágenes vigente.',
        409,
        'IMAGE_CONSENT_REQUIRED'
      );
    }
    return consentId;
  }

  async invalidate(userId) {
    await Promise.all([
      this.cache.delete(`comparaciones:usuario:${userId}`),
      this.cache.delete('comparaciones:publicas')
    ]);
  }
}

module.exports = { ComparacionService };
