

export default {
  routes: [
   
    // EMISIÓN DE FACTURAS
    
    
    {
      method: 'POST',
      path: '/factus/emit-invoice',
      handler: 'factus.emitInvoice',
      config: {
        policies: [],
        middlewares: [],
      },
    },

    {
      method: 'POST',
      path: '/factus/validate-invoice',
      handler: 'factus.validateInvoice',
      config: {
        policies: [],
        middlewares: [],
      },
    },

    {
      method: 'GET',
      path: '/factus/invoice-status/:documentId',
      handler: 'factus.getInvoiceStatus',
      config: {
        policies: [],
        middlewares: [],
      },
    },

    {
      method: 'GET',
      path: '/factus/download-pdf/:documentId',
      handler: 'factus.downloadPDF',
      config: {
        policies: [],
        middlewares: [],
      },
    },

 
    // MUNICIPIOS
    
    
    {
      method: 'GET',
      path: '/factus/municipalities',
      handler: 'factus.getMunicipalities',
      config: {
        policies: [],
        middlewares: [],
      },
    },

    {
      method: 'GET',
      path: '/factus/municipalities/search',
      handler: 'factus.searchMunicipality',
      config: {
        policies: [],
        middlewares: [],
      },
    },

    {
      method: 'GET',
      path: '/factus/municipalities/autocomplete',
      handler: 'factus.autocompleteMunicipality',
      config: {
        auth: false, // Permitir acceso sin autenticación para autocompletado
        policies: [],
        middlewares: [],
      },
    },

    {
      method: 'GET',
      path: '/factus/municipalities/generate-mapping',
      handler: 'factus.generateMapping',
      config: {
        policies: [],
        middlewares: [],
      },
    },

   
    // RANGOS DE NUMERACIÓN
   
    
    {
      method: 'GET',
      path: '/factus/numbering-ranges',
      handler: 'factus.listNumberingRanges',
      config: {
        policies: [],
        middlewares: [],
      },
    },

    {
      method: 'GET',
      path: '/factus/numbering-range/:id/stats',
      handler: 'factus.getRangeStats',
      config: {
        policies: [],
        middlewares: [],
      },
    },

    {
      method: 'GET',
      path: '/factus/get-factus-ranges',
      handler: 'factus.getFactusRanges',
      config: {
        policies: [],
        middlewares: [],
      },
    },

    {
      method: 'POST',
      path: '/factus/sync-numbering-ranges',
      handler: 'factus.syncNumberingRanges',
      config: {
        policies: [],
        middlewares: [],
      },
    },

   
    // UTILIDADES
   
    
    {
      method: 'POST',
      path: '/factus/test-connection',
      handler: 'factus.testConnection',
      config: {
        policies: [],
        middlewares: [],
      },
    },

    {
      method: 'GET',
      path: '/factus/token-info',
      handler: 'factus.getTokenInfo',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};