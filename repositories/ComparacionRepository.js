class ComparacionRepository {
  constructor(database) {
    this.database = database;
  }

  async latestAcceptedImageConsent(userId) {
    const { rows } = await this.database.query(
      `SELECT id FROM consentimientos
       WHERE usuario_id=$1 AND tipo='imagenes' AND aceptado=TRUE
       ORDER BY creado_en DESC LIMIT 1`,
      [userId]
    );
    return rows[0]?.id || null;
  }

  async create(data) {
    const { rows } = await this.database.query(
      `INSERT INTO comparaciones
       (usuario_id,titulo,tipo_id,antes_url,despues_url,descripcion,publica,consentimiento_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [data.userId, data.title, data.typeId, data.beforeUrl, data.afterUrl,
       data.description, data.isPublic, data.consentId]
    );
    return rows[0];
  }

  async findOwned(id, userId) {
    const { rows } = await this.database.query(
      'SELECT * FROM comparaciones WHERE id=$1 AND usuario_id=$2',
      [id, userId]
    );
    return rows[0] || null;
  }

  async listByUser(userId) {
    const { rows } = await this.database.query(
      `SELECT c.*,tm.nombre AS tipo_nombre,tm.icon FROM comparaciones c
       LEFT JOIN tipos_maquillaje tm ON c.tipo_id=tm.id
       WHERE c.usuario_id=$1 ORDER BY c.creado_en DESC`,
      [userId]
    );
    return rows;
  }

  async listPublic() {
    const { rows } = await this.database.query(
      `SELECT c.id,c.titulo,c.antes_url,c.despues_url,c.descripcion,c.creado_en,
        tm.nombre AS tipo_nombre,tm.icon FROM comparaciones c
       LEFT JOIN tipos_maquillaje tm ON c.tipo_id=tm.id
       WHERE c.publica=TRUE AND c.estado='activa'
       ORDER BY c.creado_en DESC LIMIT 50`
    );
    return rows;
  }

  async listForAdministration() {
    const { rows } = await this.database.query(
      `SELECT c.*,u.nombre AS cliente_nombre,u.email AS cliente_email,tm.nombre AS tipo_nombre,
        con.creado_en AS consentimiento_fecha
       FROM comparaciones c JOIN usuarios u ON u.id=c.usuario_id
       LEFT JOIN tipos_maquillaje tm ON tm.id=c.tipo_id
       LEFT JOIN consentimientos con ON con.id=c.consentimiento_id
       ORDER BY c.creado_en DESC`
    );
    return rows;
  }

  async update(id, userId, data) {
    const { rows } = await this.database.query(
      `UPDATE comparaciones SET titulo=$1,tipo_id=$2,antes_url=$3,despues_url=$4,
       descripcion=$5,publica=$6,estado=$7,consentimiento_id=$8,actualizado_en=NOW()
       WHERE id=$9 AND usuario_id=$10 RETURNING *`,
      [data.title, data.typeId, data.beforeUrl, data.afterUrl, data.description,
       data.isPublic, data.status, data.consentId, id, userId]
    );
    return rows[0] || null;
  }

  async deleteOwned(id, userId) {
    const { rowCount } = await this.database.query(
      'DELETE FROM comparaciones WHERE id=$1 AND usuario_id=$2',
      [id, userId]
    );
    return rowCount > 0;
  }
}

module.exports = { ComparacionRepository };
