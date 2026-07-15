const router = require('express').Router();
const controller = require('../catalogo.controller');
const { autenticacionOpcional } = require('../middleware/auth');

router.get('/tipos', controller.tipos);
router.get('/especialistas', controller.especialistas);
router.get('/tonos', controller.tonos);
router.post('/tonos/calcular', autenticacionOpcional, controller.calcularTono);

module.exports = router;
