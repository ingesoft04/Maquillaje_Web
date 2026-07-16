const router = require('express').Router();
const controller = require('../auth.controller');
const { autenticar } = require('../middleware/auth');

router.post('/registro', controller.registro);
router.post('/login', controller.login);
router.post('/recuperacion/solicitar',controller.solicitarRecuperacion);
router.post('/recuperacion/restablecer',controller.restablecerPassword);
router.post('/logout', autenticar, controller.logout);
router.get('/perfil', autenticar, controller.perfil);

module.exports = router;
