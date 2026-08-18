const router=require('express').Router();
const c=require('../pro.controller');
const {autenticar,soloAdmin}=require('../middleware/auth');

router.get('/perfil-cosmetico',autenticar,c.obtenerPerfil);
router.put('/perfil-cosmetico',autenticar,c.guardarPerfil);
router.get('/pagos/mis',autenticar,c.misPagos);
router.get('/pagos/opciones',c.opcionesPago);
router.get('/admin/pagos',autenticar,soloAdmin,c.listarPagos);
router.post('/admin/pagos',autenticar,soloAdmin,c.registrarPago);
router.get('/admin/inventario',autenticar,soloAdmin,c.listarInventario);
router.post('/admin/inventario',autenticar,soloAdmin,c.crearProducto);
router.post('/admin/inventario/:id/movimientos',autenticar,soloAdmin,c.movimientoInventario);
router.get('/admin/inventario-recetas',autenticar,soloAdmin,c.recetas);
router.post('/admin/inventario-recetas',autenticar,soloAdmin,c.guardarReceta);
router.delete('/admin/inventario-recetas/:id',autenticar,soloAdmin,c.eliminarReceta);
router.get('/admin/proveedores',autenticar,soloAdmin,c.proveedores);
router.post('/admin/proveedores',autenticar,soloAdmin,c.crearProveedor);
router.get('/admin/horarios',autenticar,soloAdmin,c.horarios);
router.post('/admin/horarios',autenticar,soloAdmin,c.guardarHorario);
router.delete('/admin/horarios/:id',autenticar,soloAdmin,c.eliminarHorario);
router.get('/admin/bloqueos',autenticar,soloAdmin,c.bloqueos);
router.post('/admin/bloqueos',autenticar,soloAdmin,c.crearBloqueo);
router.delete('/admin/bloqueos/:id',autenticar,soloAdmin,c.eliminarBloqueo);
router.get('/admin/analitica',autenticar,soloAdmin,c.analitica);

module.exports=router;
