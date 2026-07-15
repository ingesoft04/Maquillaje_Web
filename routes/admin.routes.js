const router = require('express').Router();
const controller = require('../admin.controller');
const { autenticar, soloAdmin } = require('../middleware/auth');

router.use(autenticar, soloAdmin);
router.get('/resumen', controller.resumen);
router.get('/usuarios', controller.usuarios);
router.get('/citas', controller.citas);
router.patch('/citas/:id/estado', controller.cambiarEstado);

module.exports = router;
