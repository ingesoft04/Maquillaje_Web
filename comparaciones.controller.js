const { query } = require('./db');
const { comparacionService } = require('./container');

function crearControladorComparaciones(service) {
  return {
    async crear(req, res) {
      const comparacion = await service.create(req.usuario.id, req.body);
      return res.status(201).json({ mensaje:'Comparación guardada.', comparacion });
    },

    async misComparaciones(req, res) {
      const result = await service.listMine(req.usuario.id);
      return res.json({ fuente:result.source, comparaciones:result.items });
    },

    async publicas(_req, res) {
      const result = await service.listPublic();
      return res.json({ fuente:result.source, comparaciones:result.items });
    },

    async actualizar(req, res) {
      const comparacion = await service.update(req.usuario.id, req.params.id, req.body);
      return res.json({ mensaje:'Fotografías actualizadas.', comparacion });
    },

    async administrar(_req, res) {
      return res.json({ comparaciones:await service.listForAdministration() });
    },

    async actualizarAdmin(req, res) {
      const comparacion = await service.updateAsAdmin(req.params.id, req.body);
      return res.json({ mensaje:'Fotografías actualizadas.', comparacion });
    },

    async eliminar(req, res) {
      await service.delete(req.usuario.id, req.params.id);
      return res.json({ mensaje:'Comparación eliminada.' });
    }
  };
}

const controller = crearControladorComparaciones(comparacionService);

async function exportarCita(req, res) {
  const { rows } = await query(
    `SELECT c.id,c.fecha,c.hora,c.notas,c.estado,c.creado_en,
      u.nombre AS cliente_nombre,u.email AS cliente_email,u.telefono AS cliente_telefono,
      e.nombre AS especialista,tm.nombre AS servicio,tm.descripcion AS servicio_desc
     FROM citas c JOIN usuarios u ON c.usuario_id=u.id
     JOIN especialistas e ON c.especialista_id=e.id
     LEFT JOIN tipos_maquillaje tm ON c.tipo_id=tm.id
     WHERE c.id=$1 AND c.usuario_id=$2`,
    [req.params.id, req.usuario.id]
  );
  if (!rows.length) return res.status(404).json({ error:'Cita no encontrada.' });
  const cita = rows[0];
  const fecha = new Date(cita.fecha);
  const meses = ['enero','febrero','marzo','abril','mayo','junio',
    'julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return res.json({ comprobante:{
    ...cita,
    fecha_formateada:`${fecha.getUTCDate()} de ${meses[fecha.getUTCMonth()]} de ${fecha.getUTCFullYear()}`,
    generado_en:new Date().toISOString(),
    institucion:'SENA — Arte & Belleza',
    programa:'Cosmetología y Estética Integral'
  }});
}

module.exports = {
  crear:controller.crear,
  mis_comparaciones:controller.misComparaciones,
  publicas:controller.publicas,
  actualizar:controller.actualizar,
  administrar:controller.administrar,
  actualizarAdmin:controller.actualizarAdmin,
  eliminar:controller.eliminar,
  exportarCita,
  crearControladorComparaciones
};
