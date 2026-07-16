const router=require('express').Router();
const c=require('../profesional.controller');
const {autenticar,soloAdmin}=require('../middleware/auth');

router.get('/profesional/resumen',autenticar,c.miResumen);
router.patch('/profesional/citas/:id/estado',autenticar,c.cambiarEstadoProfesional);
router.get('/profesional/citas/:citaId/expediente',autenticar,c.obtenerExpediente);
router.put('/profesional/citas/:citaId/expediente',autenticar,c.guardarExpediente);
router.post('/profesional/citas/:citaId/seguimiento',autenticar,c.agregarSeguimiento);
router.get('/historial-profesional',autenticar,c.miHistorial);
router.post('/citas/:citaId/resena',autenticar,c.crearResena);
router.get('/resenas/mis',autenticar,c.misResenas);
router.post('/lista-espera',autenticar,c.crearEspera);
router.get('/lista-espera/mis',autenticar,c.miEspera);
router.patch('/lista-espera/:id/cancelar',autenticar,c.cancelarEspera);
router.get('/configuracion/publica',autenticar,c.configuracion);
router.get('/privacidad/exportar',autenticar,c.exportarMisDatos);
router.post('/privacidad/solicitudes',autenticar,c.solicitarPrivacidad);
router.get('/privacidad/solicitudes/mis',autenticar,c.misSolicitudesPrivacidad);

router.post('/admin/especialistas/cuenta',autenticar,soloAdmin,c.crearCuentaEspecialista);
router.get('/admin/resenas',autenticar,soloAdmin,c.listarResenas);
router.patch('/admin/resenas/:id',autenticar,soloAdmin,c.moderarResena);
router.get('/admin/lista-espera',autenticar,soloAdmin,c.listarEspera);
router.get('/admin/configuracion',autenticar,soloAdmin,c.configuracion);
router.put('/admin/configuracion/:clave',autenticar,soloAdmin,c.guardarConfiguracion);
router.get('/admin/privacidad/solicitudes',autenticar,soloAdmin,c.solicitudesPrivacidad);
router.patch('/admin/privacidad/solicitudes/:id',autenticar,soloAdmin,c.resolverPrivacidad);
module.exports=router;
