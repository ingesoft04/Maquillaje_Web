const router = require('express').Router();
const controller = require('../comparaciones.controller');
const { autenticar } = require('../middleware/auth');

router.get('/publicas', controller.publicas);
router.get('/', autenticar, controller.mis_comparaciones);
router.post('/', autenticar, controller.crear);
router.delete('/:id', autenticar, controller.eliminar);

module.exports = router;
