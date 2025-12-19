/**
 * Rutas de API para Factus
 * Ubicación: src/api/factus/routes/factus-config.ts
 * 
 * Endpoints disponibles:
 * - GET  /api/factus/test-connection  → Probar conexión
 * - GET  /api/factus/token-info       → Info del token
 * - POST /api/factus/refresh-token    → Renovar token
 * - POST /api/factus/get-new-token    → Obtener token nuevo
 * - GET  /api/factus/health           → Health check completo
 */

export default {
  routes: [
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ENDPOINTS DE TESTING
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    {
      method: 'GET',
      path: '/factus/test-connection',
      handler: 'factus-test.testConnection',
      config: {
        policies: [],
        middlewares: [],
        auth: false, // Sin autenticación para facilitar testing
        description: 'Probar conexión con Factus API',
        tag: {
          plugin: 'factus',
          name: 'Testing',
        },
      },
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ENDPOINTS DE INFORMACIÓN
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    {
      method: 'GET',
      path: '/factus/token-info',
      handler: 'factus-test.tokenInfo',
      config: {
        policies: [],
        middlewares: [],
        auth: false,
        description: 'Obtener información del token actual',
        tag: {
          plugin: 'factus',
          name: 'Token Management',
        },
      },
    },

    {
      method: 'GET',
      path: '/factus/health',
      handler: 'factus-test.health',
      config: {
        policies: [],
        middlewares: [],
        auth: false,
        description: 'Health check completo del sistema Factus',
        tag: {
          plugin: 'factus',
          name: 'Monitoring',
        },
      },
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ENDPOINTS DE ACCIONES
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    {
      method: 'POST',
      path: '/factus/refresh-token',
      handler: 'factus-test.forceRefresh',
      config: {
        policies: [],
        middlewares: [],
        auth: false,
        description: 'Renovar token usando refresh_token',
        tag: {
          plugin: 'factus',
          name: 'Token Management',
        },
      },
    },

    {
      method: 'POST',
      path: '/factus/get-new-token',
      handler: 'factus-test.getNewToken',
      config: {
        policies: [],
        middlewares: [],
        auth: false,
        description: 'Obtener un nuevo token (OAuth completo)',
        tag: {
          plugin: 'factus',
          name: 'Token Management',
        },
      },
    },
  ],
};