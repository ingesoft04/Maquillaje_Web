const router = require('express').Router();
const controller = require('../admin.controller');
const { autenticar, soloAdmin } = require('../middleware/auth');

router.use(autenticar, soloAdmin);
router.get('/resumen', controller.resumen);
router.get('/usuarios', controller.usuarios);
router.get('/citas', controller.citas);
router.patch('/citas/:id/estado', controller.cambiarEstado);
router.get('/especialistas', controller.listarEspecialistasAdmin);
router.post('/especialistas', controller.crearEspecialista);
router.patch('/especialistas/:id', controller.editarEspecialista);
router.get('/servicios', controller.listarServiciosAdmin);
router.post('/servicios', controller.crearServicio);
router.patch('/servicios/:id', controller.editarServicio);
router.get('/auditoria', controller.auditoria);

module.exports = router;
