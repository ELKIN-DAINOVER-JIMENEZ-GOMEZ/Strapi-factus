/**
 * Servicio de Autenticación con Factus API
 * Ubicación: src/api/factus/services/factus-auth.ts
 * 
 * Responsabilidades:
 * - Obtener token OAuth2 de Factus
 * - Renovar token usando refresh_token
 * - Cachear tokens en la base de datos
 * - Manejar expiración automática
 */

import axios, { AxiosError } from 'axios';
import qs from 'qs';
import type { 
  FactusConfig, 
  FactusTokenResponse, 
  FactusOperationResult 
} from '../types/factus.types';

export default {
  /**
   * 🔑 Obtener token de acceso de Factus
   * 
   * Flujo:
   * 1. Buscar configuración en DB
   * 2. Verificar si hay token válido en caché
   * 3. Si no hay o está por expirar, solicitar uno nuevo
   * 4. Guardar nuevo token en DB
   * 5. Retornar token
   * 
   * @returns {Promise<string>} Access token válido
   * @throws {Error} Si falla la autenticación o no hay configuración
   */
  async getToken(): Promise<string> {
    try {
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // PASO 1: Buscar configuración en Strapi DB
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      strapi.log.info('📋 Buscando configuración de Factus...');

      const result = await strapi.entityService.findMany(
        'api::factus-config.factus-config',
        { 
          populate: '*',
          publicationState: 'live' // Solo registros publicados
        }
      );

      // Manejar resultado (puede ser objeto o array según versión de Strapi)
      const config: FactusConfig = Array.isArray(result) ? result[0] : result;

      if (!config) {
        throw new Error(
          'Configuración de Factus no encontrada. ' +
          'Ve a Content Manager → Factus Config y crea un registro.'
        );
      }

      strapi.log.info(`Configuración encontrada (ID: ${config.id})`);

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // PASO 2: Verificar si hay token válido
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (config.token_acceso && config.token_expiracion) {
        const now = new Date();
        const expiration = new Date(config.token_expiracion);
        
        // Renovar si expira en menos de 5 minutos (seguridad)
        const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60000);

        if (expiration > fiveMinutesFromNow) {
          const secondsLeft = Math.floor((expiration.getTime() - now.getTime()) / 1000);
          strapi.log.info(`✅ Token válido encontrado (expira en ${secondsLeft}s)`);
          return config.token_acceso;
        } else {
          strapi.log.warn('⚠️  Token cerca de expirar, renovando...');
        }
      } else {
        strapi.log.info('🔄 No hay token guardado, solicitando uno nuevo...');
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // PASO 3: Solicitar nuevo token a Factus
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      strapi.log.info(' Conectando con Factus API...');

      // Preparar datos OAuth en formato x-www-form-urlencoded
      const data = qs.stringify({
        grant_type: 'password',
        client_id: process.env.FACTUS_CLIENT_ID,
        client_secret: process.env.FACTUS_CLIENT_SECRET,
        username: config.api_username || process.env.FACTUS_USERNAME,
        password: config.api_password || process.env.FACTUS_PASSWORD,
      });

      strapi.log.debug('📤 Enviando petición OAuth a Factus...', {
        url: `${config.api_url}/oauth/token`,
        grant_type: 'password',
        client_id: process.env.FACTUS_CLIENT_ID?.substring(0, 10) + '...',
        username: config.api_username,
      });

      // Petición OAuth2 a Factus
      const response = await axios.post<FactusTokenResponse>(
        `${config.api_url}/oauth/token`,
        data,
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 15000, // 15 segundos
        }
      );

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // PASO 4: Validar respuesta
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (!response.data || !response.data.access_token) {
        throw new Error('❌ Respuesta inválida: no se recibió access_token');
      }

      strapi.log.info('✅ Token recibido de Factus');
      strapi.log.debug('Token details:', {
        token_type: response.data.token_type,
        expires_in: response.data.expires_in,
        has_refresh_token: !!response.data.refresh_token,
      });

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // PASO 5: Calcular fecha de expiración
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const expiresIn = response.data.expires_in || 3600; // Default: 1 hora
      const expirationDate = new Date(Date.now() + expiresIn * 1000);

      strapi.log.info(`⏰ Token expira en: ${expiresIn}s (${expirationDate.toISOString()})`);

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // PASO 6: Guardar token en la base de datos
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      await strapi.entityService.update(
        'api::factus-config.factus-config',
        config.id,
        {
          data: {
            token_acceso: response.data.access_token,
            token_expiracion: expirationDate,
            refresh_token: response.data.refresh_token || config.refresh_token,
          },
        }
      );

      strapi.log.info('💾 Token guardado en base de datos');

      return response.data.access_token;

    } catch (error) {
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // MANEJO DE ERRORES DETALLADO
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const axiosError = error as AxiosError;

      if (axiosError.response) {
        // Error de respuesta del servidor (4xx, 5xx)
        const errorData: any = axiosError.response.data;
        
        strapi.log.error('❌ Error de Factus API:', {
          status: axiosError.response.status,
          statusText: axiosError.response.statusText,
          error: errorData.error,
          error_description: errorData.error_description,
          message: errorData.message,
        });

        // Errores comunes y sus causas
        if (axiosError.response.status === 401) {
          throw new Error(
            '🔐 Error de autenticación con Factus: ' +
            'Verifica tus credenciales (client_id, client_secret, username, password)'
          );
        } else if (axiosError.response.status === 400) {
          throw new Error(
            `⚠️  Petición inválida a Factus: ${errorData.error_description || errorData.message}`
          );
        } else if (axiosError.response.status >= 500) {
          throw new Error(
            '🔥 Error del servidor de Factus. Intenta nuevamente en unos minutos.'
          );
        } else {
          throw new Error(
            `❌ Error ${axiosError.response.status}: ${
              errorData.error_description || 
              errorData.message || 
              'Error desconocido'
            }`
          );
        }
      } else if (axiosError.request) {
        // No se recibió respuesta (timeout, red caída, etc.)
        strapi.log.error('❌ No hay respuesta de Factus:', {
          message: axiosError.message,
          code: axiosError.code,
        });

        throw new Error(
          '🌐 No se pudo conectar con Factus API. ' +
          'Verifica tu conexión a internet y que la URL sea correcta: ' +
          process.env.FACTUS_API_URL
        );
      } else {
        // Error en la configuración de la petición
        strapi.log.error('❌ Error en configuración:', axiosError.message);
        throw error;
      }
    }
  },

  /**
   * 🔄 Renovar token usando refresh_token
   * 
   * Más rápido que solicitar un token completamente nuevo.
   * Si falla, hace fallback a getToken().
   * 
   * @returns {Promise<string>} Access token renovado
   */
  async refreshToken(): Promise<string> {
    try {
      strapi.log.info('🔄 Intentando renovar token con refresh_token...');

      // Buscar configuración
      const result = await strapi.entityService.findMany(
        'api::factus-config.factus-config',
        { populate: '*' }
      );

      const config: FactusConfig = Array.isArray(result) ? result[0] : result;

      if (!config.refresh_token) {
        strapi.log.warn('⚠️  No hay refresh_token disponible');
        return await this.getToken(); // Fallback
      }

      // Preparar petición de refresh
      const data = qs.stringify({
        grant_type: 'refresh_token',
        refresh_token: config.refresh_token,
        client_id: process.env.FACTUS_CLIENT_ID,
        client_secret: process.env.FACTUS_CLIENT_SECRET,
      });

      const response = await axios.post<FactusTokenResponse>(
        `${config.api_url}/oauth/token`,
        data,
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 10000,
        }
      );

      // Calcular expiración
      const expiresIn = response.data.expires_in || 3600;
      const expirationDate = new Date(Date.now() + expiresIn * 1000);

      // Guardar nuevo token
      await strapi.entityService.update(
        'api::factus-config.factus-config',
        config.id,
        {
          data: {
            token_acceso: response.data.access_token,
            token_expiracion: expirationDate,
            refresh_token: response.data.refresh_token || config.refresh_token,
          },
        }
      );

      strapi.log.info('✅ Token renovado exitosamente');
      return response.data.access_token;

    } catch (error) {
      strapi.log.error('❌ Error renovando token:', (error as Error).message);
      strapi.log.info('🔄 Fallback: solicitando token nuevo...');
      
      // Si falla el refresh, intentar obtener token nuevo
      return await this.getToken();
    }
  },

  /**
   * 🧪 Verificar conexión con Factus
   * 
   * Útil para:
   * - Testing en desarrollo
   * - Health checks
   * - Debugging
   * 
   * @returns {Promise<FactusOperationResult>} Resultado de la prueba
   */
  async testConnection(): Promise<FactusOperationResult<{ token_preview: string }>> {
    try {
      strapi.log.info('🧪 Probando conexión con Factus...');
      
      const token = await this.getToken();

      return {
        success: true,
        message: '✅ Conexión exitosa con Factus API',
        data: {
          token_preview: token.substring(0, 30) + '...',
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: '❌ Error conectando con Factus API',
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      };
    }
  },

  /**
   * 📊 Obtener información del token actual
   * 
   * @returns {Promise<object>} Estado del token
   */
  async getTokenInfo(): Promise<{
    has_token: boolean;
    is_expired: boolean;
    expires_at: Date | string | null;
    seconds_until_expiry: number;
    ambiente: string;
    api_url: string;
  }> {
    try {
      const result = await strapi.entityService.findMany(
        'api::factus-config.factus-config'
      );

      const config: FactusConfig = Array.isArray(result) ? result[0] : result;

      if (!config) {
        throw new Error('Configuración no encontrada');
      }

      const now = new Date();
      const expiration = config.token_expiracion 
        ? new Date(config.token_expiracion) 
        : null;
      
      const isExpired = expiration ? now > expiration : true;
      const timeUntilExpiry = expiration 
        ? Math.floor((expiration.getTime() - now.getTime()) / 1000) 
        : 0;

      return {
        has_token: !!config.token_acceso,
        is_expired: isExpired,
        expires_at: expiration,
        seconds_until_expiry: timeUntilExpiry > 0 ? timeUntilExpiry : 0,
        ambiente: config.ambiente,
        api_url: config.api_url,
      };
    } catch (error) {
      throw new Error(`Error obteniendo información del token: ${(error as Error).message}`);
    }
  },
};