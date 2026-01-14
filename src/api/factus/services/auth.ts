
import axios, { AxiosError } from 'axios';
import qs from 'qs';
import type { 
  FactusConfig, 
  FactusTokenResponse, 
  FactusOperationResult 
} from '../types/factus.types';

export default {

  async getToken(): Promise<string> {
    try {
      // Buscar config (usando db.query para evitar problemas de tipos)
      const config: FactusConfig = await strapi.db.query('api::factus-config.factus-config').findOne({ where: {} });

      if (!config) {
        throw new Error(
          ' Configuración de Factus no encontrada. ' +
          'Ve a Content Manager → Factus Config y crea un registro.'
        );
      }

      // Verificar si hay token válido en cache
      if (config.token_acceso && config.token_expiracion) {
        const now = new Date();
        const expiration = new Date(config.token_expiracion);
        
        // Renovar si expira en menos de 10 minutos
        const tenMinutesFromNow = new Date(now.getTime() + 10 * 60000);

        if (expiration > tenMinutesFromNow) {
          return config.token_acceso;
        } else {
          // Intentar refresh primero
          if (config.refresh_token) {
            try {
              return await this.refreshToken();
            } catch (refreshError) {
              // Continuar para solicitar token nuevo
            }
          }
        }
      }

      // ═══════════════════════════════════════════════════════════
      // PASO 2: Solicitar nuevo token a Factus
      // ═══════════════════════════════════════════════════════════

      //  CAMBIO: Validar que existan las variables de entorno
      if (!process.env.FACTUS_CLIENT_ID || !process.env.FACTUS_CLIENT_SECRET) {
        throw new Error(
          ' Faltan variables de entorno: FACTUS_CLIENT_ID y FACTUS_CLIENT_SECRET'
        );
      }

      const data = qs.stringify({
        grant_type: 'password',
        client_id: process.env.FACTUS_CLIENT_ID,
        client_secret: process.env.FACTUS_CLIENT_SECRET,
        username: config.api_username || process.env.FACTUS_USERNAME,
        password: config.api_password || process.env.FACTUS_PASSWORD,
      });

      const response = await axios.post<FactusTokenResponse>(
        `${config.api_url}/oauth/token`,
        data,
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 15000,
        }
      );


      // PASO 3: Validar respuesta
   
      if (!response.data || !response.data.access_token) {
        throw new Error('❌ Respuesta inválida: no se recibió access_token');
      }
 
      // PASO 4: Calcular fecha de expiración
 
      const expiresIn = response.data.expires_in || 3600;
      const expirationDate = new Date(Date.now() + expiresIn * 1000);
     
      // PASO 5: Guardar token en la base de datos
      
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

      return response.data.access_token;

    } catch (error) {
      return this.handleAuthError(error);
    }
  },

 
  async refreshToken(): Promise<string> {
    try {
      // Buscar configuración
      const config: FactusConfig = await strapi.db.query('api::factus-config.factus-config').findOne({ where: {} });

      if (!config.refresh_token) {
        throw new Error('❌ No hay refresh_token disponible');
      }

      // 🔄 CAMBIO: Preparar petición según documentación Factus
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

      if (!response.data || !response.data.access_token) {
        throw new Error('❌ Respuesta de refresh inválida');
      }

      // Calcular expiración
      const expiresIn = response.data.expires_in || 3600;
      const expirationDate = new Date(Date.now() + expiresIn * 1000);

    // Factus devuelve un NUEVO refresh_token
      // Hay que actualizar ambos tokens
      await strapi.entityService.update(
        'api::factus-config.factus-config',
        config.id,
        {
          data: {
            token_acceso: response.data.access_token,
            token_expiracion: expirationDate,
            //  Actualizar también el refresh_token
            refresh_token: response.data.refresh_token || config.refresh_token,
          },
        }
      );

      return response.data.access_token;

    } catch (error) {
      throw error;
    }
  },

  
    //Verificar conexión con Factus
   
  async testConnection(): Promise<FactusOperationResult<{ token_preview: string }>> {
    try {
      const token = await this.getToken();

      return {
        success: true,
        message: ' Conexión exitosa con Factus API',
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

  
   // Obtener información del token actual
   
  async getTokenInfo(): Promise<{
    has_token: boolean;
    is_expired: boolean;
    expires_at: Date | string | null;
    minutes_until_expiry: number;
    should_refresh: boolean;
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
      const minutesUntilExpiry = expiration 
        ? Math.floor((expiration.getTime() - now.getTime()) / 60000) 
        : 0;

      //  Indicar si se debe refrescar (menos de 10 minutos)
      const shouldRefresh = minutesUntilExpiry > 0 && minutesUntilExpiry < 10;

      return {
        has_token: !!config.token_acceso,
        is_expired: isExpired,
        expires_at: expiration,
        minutes_until_expiry: minutesUntilExpiry > 0 ? minutesUntilExpiry : 0,
        should_refresh: shouldRefresh,
        ambiente: config.ambiente,
        api_url: config.api_url,
      };
    } catch (error) {
      throw new Error(`Error obteniendo información del token: ${(error as Error).message}`);
    }
  },

  /**
   *  Invalidar token actual (forzar renovación)
   * 
   * Útil para:
   * - Testing
   * - Recuperación de errores
   * - Cambio de credenciales
   */
  async invalidateToken(): Promise<void> {
    try {
      const result = await strapi.entityService.findMany(
        'api::factus-config.factus-config'
      );

      const config: FactusConfig = Array.isArray(result) ? result[0] : result;

      if (!config) {
        throw new Error('Configuración no encontrada');
      }

      // Establecer fecha de expiración en el pasado
      await strapi.entityService.update(
        'api::factus-config.factus-config',
        config.id,
        {
          data: {
            token_acceso: null,
            token_expiracion: new Date(Date.now() - 1000), // 1 segundo en el pasado
          },
        }
      );
    } catch (error) {
      throw error;
    }
  },

    // Manejo centralizado de errores de autenticación
   
  handleAuthError(error: unknown): never {
    const axiosError = error as AxiosError;

    if (axiosError.response) {
      const errorData: any = axiosError.response.data;

      if (axiosError.response.status === 401) {
        throw new Error(
          ' Error de autenticación con Factus: ' +
          'Verifica tus credenciales (client_id, client_secret, username, password)'
        );
      } else if (axiosError.response.status === 400) {
        throw new Error(
          ` Petición inválida a Factus: ${errorData.error_description || errorData.message}`
        );
      } else if (axiosError.response.status >= 500) {
        throw new Error(
          ' Error del servidor de Factus. Intenta nuevamente en unos minutos.'
        );
      } else {
        throw new Error(
          ` Error ${axiosError.response.status}: ${
            errorData.error_description || 
            errorData.message || 
            'Error desconocido'
          }`
        );
      }
    } else if (axiosError.request) {
      throw new Error(
        ' No se pudo conectar con Factus API. ' +
        'Verifica tu conexión a internet y que la URL sea correcta: ' +
        process.env.FACTUS_API_URL
      );
    } else {
      throw error;
    }
  },
};
