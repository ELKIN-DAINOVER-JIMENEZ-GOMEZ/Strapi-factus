/**
 * Rutas personalizadas para facturas
 * Permite acceso autenticado a las facturas
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/invoices/list',
      handler: 'invoice.findAll',
      config: {
        auth: false, // Permitir acceso público (la autenticación se verifica en el controlador)
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/invoices/detail/:id',
      handler: 'invoice.findById',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
