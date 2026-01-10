/**
 * Controlador de Pruebas para Factus API
 * Ubicación: src/api/factus/controllers/factus-test.ts
 * 
 * Endpoints de testing y debugging
 */

import type { Context } from 'koa';

export default {
  /**
   * 🧪 Test de conexión con Factus
   * 
   * Endpoint: GET /api/factus/test-connection
   * 
   * Propósito:
   * - Verificar que las credenciales funcionan
   * - Probar la conexión con Factus API
   * - Debugging inicial
   * 
   * Ejemplo de uso:
   * curl http://localhost:1337/api/factus/test-connection
   */
  async testConnection(ctx: Context) {
    try {
      const authService = strapi.service('api::factus.factus-auth');
      const result = await authService.testConnection();

      if (result.success) {
        ctx.send({
          success: true,
          message: result.message,
          data: {
            token_preview: result.data?.token_preview,
            timestamp: result.timestamp,
          },
        });
      } else {
        ctx.send(
          {
            success: false,
            message: result.message,
            error: result.error,
            timestamp: result.timestamp,
          },
          500
        );
      }
    } catch (error) {
      ctx.internalServerError('Error probando conexión con Factus');
    }
  },

  /**
   * 📊 Información del token actual
   * 
   * Endpoint: GET /api/factus/token-info
   * 
   * Propósito:
   * - Ver estado del token (válido, expirado, etc.)
   * - Debugging de problemas de autenticación
   * - Monitoring
   * 
   * Ejemplo de uso:
   * curl http://localhost:1337/api/factus/token-info
   */
  async tokenInfo(ctx: Context) {
    try {
      const authService = strapi.service('api::factus.factus-auth');
      const info = await authService.getTokenInfo();

      ctx.send({
        success: true,
        data: info,
      });
    } catch (error) {
      ctx.send(
        {
          success: false,
          message: 'Error obteniendo información del token',
          error: (error as Error).message,
        },
        500
      );
    }
  },

  /**
   * 🔄 Forzar renovación de token
   * 
   * Endpoint: POST /api/factus/refresh-token
   * 
   * Propósito:
   * - Renovar token manualmente
   * - Testing de refresh_token
   * - Recuperación de errores
   * 
   * Ejemplo de uso:
   * curl -X POST http://localhost:1337/api/factus/refresh-token
   */
  async forceRefresh(ctx: Context) {
    try {
      const authService = strapi.service('api::factus.factus-auth');
      const token = await authService.refreshToken();

      ctx.send({
        success: true,
        message: 'Token renovado exitosamente',
        data: {
          token_preview: token.substring(0, 30) + '...',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      ctx.send(
        {
          success: false,
          message: 'Error renovando token',
          error: (error as Error).message,
        },
        500
      );
    }
  },

  /**
   * 🔑 Forzar obtención de nuevo token
   * 
   * Endpoint: POST /api/factus/get-new-token
   * 
   * Propósito:
   * - Obtener token nuevo (no refresh)
   * - Testing completo del flujo OAuth
   * - Debugging
   * 
   * Ejemplo de uso:
   * curl -X POST http://localhost:1337/api/factus/get-new-token
   */
  async getNewToken(ctx: Context) {
    try {
      const authService = strapi.service('api::factus.factus-auth');
      const token = await authService.getToken();

      ctx.send({
        success: true,
        message: 'Token obtenido exitosamente',
        data: {
          token_preview: token.substring(0, 30) + '...',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      ctx.send(
        {
          success: false,
          message: 'Error obteniendo token',
          error: (error as Error).message,
        },
        500
      );
    }
  },

  /**
   * 💊 Health check completo
   * 
   * Endpoint: GET /api/factus/health
   * 
   * Propósito:
   * - Verificar que todo esté configurado correctamente
   * - Monitoring de producción
   * - CI/CD checks
   */
  async health(ctx: Context) {
    try {
      const checks = {
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        checks: {
          env_variables: false,
          database_connection: false,
          factus_config_exists: false,
          factus_api_connection: false,
        },
        details: {} as any,
      };

      // 1. Verificar variables de entorno
      checks.checks.env_variables = !!(
        process.env.FACTUS_API_URL &&
        process.env.FACTUS_CLIENT_ID &&
        process.env.FACTUS_CLIENT_SECRET &&
        process.env.FACTUS_USERNAME &&
        process.env.FACTUS_PASSWORD
      );

      if (!checks.checks.env_variables) {
        checks.details.missing_env = [
          !process.env.FACTUS_API_URL && 'FACTUS_API_URL',
          !process.env.FACTUS_CLIENT_ID && 'FACTUS_CLIENT_ID',
          !process.env.FACTUS_CLIENT_SECRET && 'FACTUS_CLIENT_SECRET',
          !process.env.FACTUS_USERNAME && 'FACTUS_USERNAME',
          !process.env.FACTUS_PASSWORD && 'FACTUS_PASSWORD',
        ].filter(Boolean);
      }

      // 2. Verificar conexión a DB
      try {
        const result = await strapi.entityService.findMany(
          'api::factus-config.factus-config'
        );
        checks.checks.database_connection = true;
        checks.checks.factus_config_exists = !!(
          Array.isArray(result) ? result[0] : result
        );
      } catch (error) {
        checks.details.database_error = (error as Error).message;
      }

      // 3. Verificar conexión con Factus
      if (checks.checks.factus_config_exists) {
        try {
          const authService = strapi.service('api::factus.factus-auth');
          const result = await authService.testConnection();
          checks.checks.factus_api_connection = result.success;
          
          if (!result.success) {
            checks.details.factus_error = result.error;
          }
        } catch (error) {
          checks.details.factus_error = (error as Error).message;
        }
      }

      // Determinar estado general
      const allChecksPass = Object.values(checks.checks).every(check => check === true);

      ctx.send({
        success: allChecksPass,
        message: allChecksPass 
          ? '✅ Todos los checks pasaron' 
          : '⚠️  Algunos checks fallaron',
        data: checks,
      }, allChecksPass ? 200 : 503);

    } catch (error) {
      ctx.send(
        {
          success: false,
          message: 'Error en health check',
          error: (error as Error).message,
        },
        500
      );
    }
  },
};