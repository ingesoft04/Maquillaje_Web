const router = require('express').Router();
const controller = require('../comparaciones.controller');
const { autenticar, soloAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../core/asyncHandler');

router.get('/publicas', asyncHandler(controller.publicas));
router.get('/admin', autenticar, soloAdmin, asyncHandler(controller.administrar));
router.patch('/admin/:id', autenticar, soloAdmin, asyncHandler(controller.actualizarAdmin));
router.get('/', autenticar, asyncHandler(controller.mis_comparaciones));
router.post('/', autenticar, asyncHandler(controller.crear));
router.patch('/:id', autenticar, asyncHandler(controller.actualizar));
router.delete('/:id', autenticar, asyncHandler(controller.eliminar));

module.exports = router;
