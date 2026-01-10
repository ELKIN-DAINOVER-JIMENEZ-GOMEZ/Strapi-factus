/**
 * Rutas personalizadas para notas crédito
 * IMPORTANTE: Las rutas específicas (sin :id) deben ir ANTES de las rutas con :id
 */

export default {
  routes: [
    // Rutas sin parámetro dinámico primero
    {
      method: 'GET',
      path: '/credit-notes/stats',
      handler: 'credit-note.getStats',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/credit-notes/list',
      handler: 'credit-note.findAll',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/credit-notes/create',
      handler: 'credit-note.createCreditNote',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    // Rutas con parámetro dinámico después
    {
      method: 'GET',
      path: '/credit-notes/detail/:id',
      handler: 'credit-note.findById',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/credit-notes/:id/emit',
      handler: 'credit-note.emit',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/credit-notes/:id/download-pdf',
      handler: 'credit-note.downloadPDF',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/credit-notes/:id/repair-client',
      handler: 'credit-note.repairClientAssociation',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
