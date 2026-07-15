const router = require('express').Router();
const controller = require('../citas.controller');
const comparaciones = require('../comparaciones.controller');
const { autenticar } = require('../middleware/auth');

router.use(autenticar);
router.get('/', controller.mis_citas);
router.post('/', controller.agendar);
router.get('/disponibilidad', controller.disponibilidad);
router.patch('/:id/reprogramar', controller.reprogramar);
router.patch('/:id/cancelar', controller.cancelar);
router.get('/:id/exportar', comparaciones.exportarCita);

module.exports = router;
