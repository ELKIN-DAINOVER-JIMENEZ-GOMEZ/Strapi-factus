/**
 * Servicio de Envío a Factus API
 * Ubicación: src/api/factus/services/factus-sender.ts
 * 
 * Responsabilidades:
 * - Enviar facturas a Factus API
 * - Manejar respuestas y errores
 * - Reintentos automáticos
 * - Logging detallado
 */

import axios, { AxiosError, AxiosResponse } from 'axios';
import type { FactusConfig } from '../types/factus.types';

/**
 * Payload que se envía a Factus
 * (Basado en tu factus-mapper.ts)
 */
interface FactusInvoicePayload {
  numbering_range_id: number;
  reference_code: string;
  observation: string;
  payment_form: string;
  payment_due_date: string;
  payment_method_code: string;
  operation_type: number;
  send_email: boolean;
  establishment: {
    name: string;
    address: string;
    phone_number: string;
    email: string;
    municipality_id: string;
  };
  customer: {
    identification: string;
    dv?: string;
    company?: string;
    trade_name?: string;
    names: string;
    address: string;
    email: string;
    phone: string;
    legal_organization_id: string;
    tribute_id: string;
    identification_document_id: string;
    municipality_id: string;
  };
  items: Array<{
    scheme_id: string;
    note: string;
    code_reference: string;
    name: string;
    quantity: number;
    discount_rate: number;
    price: number;
    tax_rate: string;
    unit_measure_id: number;
    standard_code_id: number;
    is_excluded: number;
    tribute_id: number;
    withholding_taxes?: Array<{
      code: string;
      withholding_tax_rate: string;
    }>;
  }>;
}

/**
 * Respuesta de Factus API
 */
interface FactusApiResponse {
  // Respuesta exitosa
  id?: number;
  document_id?: string;
  uuid?: string;
  status?: string;
  cufe?: string;
  cude?: string;
  qr_code?: string;
  pdf_url?: string;
  xml_url?: string;
  pdf_base64?: string;
  xml_base64?: string;
  
  // Información adicional
  message?: string;
  created_at?: string;
  updated_at?: string;
  
  // Respuesta de error
  error?: string;
  errors?: Array<{
    field?: string;
    message: string;
    code?: string;
  }>;
}

/**
 * Opciones de envío
 */
interface SendOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export default {
  /**
   * 🚀 Enviar factura a Factus API
   * 
   * @param payload - Factura mapeada
   * @param options - Opciones de envío
   * @returns Respuesta de Factus
   */
  async sendInvoice(
    payload: FactusInvoicePayload,
    options: SendOptions = {}
  ): Promise<{
    success: boolean;
    data?: FactusApiResponse;
    error?: string;
    statusCode?: number;
  }> {
    const {
      timeout = 30000,
      retries = 2,
      retryDelay = 2000,
    } = options;

    let lastError: any;
    
    // Intentar envío con reintentos
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt > 0) {
          strapi.log.warn(`🔄 Reintento ${attempt}/${retries}...`);
          await this.sleep(retryDelay * attempt); // Backoff exponencial
        }

        strapi.log.info('🚀 Enviando factura a Factus API...');
        strapi.log.debug('📦 Payload:', JSON.stringify(payload, null, 2));

        // Obtener token y configuración
        const { token, config } = await this.getAuthConfig();

        // Construir URL del endpoint
        const url = `${config.api_url}/v1/bills/validate`;//endpint para enviar facturas  

        strapi.log.info(`📍 Endpoint: ${url}`);

        // Realizar petición POST
        const response: AxiosResponse<FactusApiResponse> = await axios.post(
          url,
          payload,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            timeout,
            validateStatus: (status) => status < 500, // No lanzar error en 4xx
          }
        );

        strapi.log.info(`✅ Respuesta recibida: HTTP ${response.status}`);
        strapi.log.debug('📥 Response data:', JSON.stringify(response.data, null, 2));

        // Verificar respuesta exitosa
        if (response.status >= 200 && response.status < 300) {
          strapi.log.info('✅ Factura enviada exitosamente');
          
          return {
            success: true,
            data: response.data,
            statusCode: response.status,
          };
        }

        // Respuesta con error (4xx)
        if (response.status >= 400 && response.status < 500) {
          const errorMessage = this.parseErrorMessage(response.data);
          strapi.log.error(`❌ Error ${response.status}: ${errorMessage}`);
          
          return {
            success: false,
            data: response.data,
            error: errorMessage,
            statusCode: response.status,
          };
        }

        // Error de servidor (5xx) - reintentar
        throw new Error(`Server error: ${response.status}`);

      } catch (error) {
        lastError = error;
        const axiosError = error as AxiosError<FactusApiResponse>;

        if (axiosError.response) {
          // Error con respuesta del servidor
          const status = axiosError.response.status;
          const errorData = axiosError.response.data;

          strapi.log.error(`❌ Error HTTP ${status}:`, errorData);

          // Errores 4xx no se reintentan
          if (status >= 400 && status < 500) {
            return {
              success: false,
              data: errorData,
              error: this.parseErrorMessage(errorData),
              statusCode: status,
            };
          }

          // Errores 5xx se reintentan
          if (attempt < retries) {
            strapi.log.warn(`⚠️ Error de servidor (${status}), reintentando...`);
            continue;
          }

        } else if (axiosError.request) {
          // No hubo respuesta (timeout, red caída)
          strapi.log.error('❌ Sin respuesta de Factus:', {
            message: axiosError.message,
            code: axiosError.code,
          });

          if (attempt < retries) {
            strapi.log.warn('⚠️ Timeout o error de red, reintentando...');
            continue;
          }

        } else {
          // Error en configuración
          strapi.log.error('❌ Error configurando petición:', axiosError.message);
        }
      }
    }

    // Todos los intentos fallaron
    return {
      success: false,
      error: `Error después de ${retries + 1} intentos: ${this.getErrorMessage(lastError)}`,
    };
  },

  /**
   * 🔐 Obtener token y configuración
   */
  async getAuthConfig(): Promise<{
    token: string;
    config: FactusConfig;
  }> {
    // Obtener token OAuth
    const authService = strapi.service('api::factus.factus-auth');
    const token = await authService.getToken();

    // Obtener configuración
    const configResult = await strapi.entityService.findMany(
      'api::factus-config.factus-config'
    );
    const config: FactusConfig = Array.isArray(configResult) 
      ? configResult[0] 
      : configResult;

    if (!config) {
      throw new Error('Configuración de Factus no encontrada');
    }

    return { token, config };
  },

  /**
   * 📄 Descargar PDF de factura
   * 
   * @param documentId - ID del documento en Factus
   * @returns URL o base64 del PDF
   */
  async downloadPDF(documentId: string | number): Promise<{
    success: boolean;
    data?: {
      pdf_url?: string;
      pdf_base64?: string;
    };
    error?: string;
  }> {
    try {
      strapi.log.info(`📄 Descargando PDF del documento ${documentId}...`);

      const { token, config } = await this.getAuthConfig();

      const response = await axios.get(
        `${config.api_url}/v1/bills/download-pdf/${documentId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
          timeout: 15000,
        }
      );

      strapi.log.info('✅ PDF obtenido');

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      strapi.log.error('❌ Error descargando PDF:', error);
      return {
        success: false,
        error: this.getErrorMessage(error),
      };
    }
  },

  /**
   * 📄 Descargar XML de factura
   * 
   * @param documentId - ID del documento en Factus
   * @returns URL o base64 del XML
   */
  async downloadXML(documentId: string | number): Promise<{
    success: boolean;
    data?: {
      xml_url?: string;
      xml_base64?: string;
    };
    error?: string;
  }> {
    try {
      strapi.log.info(`📄 Descargando XML del documento ${documentId}...`);

      const { token, config } = await this.getAuthConfig();

      const response = await axios.get(
        `${config.api_url}/v1/bills/download-xml/${documentId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
          timeout: 15000,
        }
      );

      strapi.log.info('✅ XML obtenido');

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      strapi.log.error('❌ Error descargando XML:', error);
      return {
        success: false,
        error: this.getErrorMessage(error),
      };
    }
  },

  /**
   * 🔍 Consultar estado de documento
   * 
   * @param documentId - ID del documento en Factus
   * @returns Estado actual
   */
  async getDocumentStatus(documentId: string | number): Promise<{
    success: boolean;
    data?: FactusApiResponse;
    error?: string;
  }> {
    try {
      strapi.log.info(`🔍 Consultando estado del documento ${documentId}...`);

      const { token, config } = await this.getAuthConfig();

      const response = await axios.get<FactusApiResponse>(
        `${config.api_url}/api/v1/electronic-documents/${documentId}`,//endpo
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
          timeout: 10000,
        }
      );

      strapi.log.info(`✅ Estado: ${response.data.status}`);

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      strapi.log.error('❌ Error consultando estado:', error);
      return {
        success: false,
        error: this.getErrorMessage(error),
      };
    }
  },

  /**
   * 📋 Listar documentos
   * 
   * @param filters - Filtros de búsqueda
   * @returns Lista de documentos
   */
  async listDocuments(filters?: {
    desde?: string; // YYYY-MM-DD
    hasta?: string; // YYYY-MM-DD
    estado?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    success: boolean;
    data?: {
      documents: FactusApiResponse[];
      total: number;
      page: number;
      pages: number;
    };
    error?: string;
  }> {
    try {
      strapi.log.info('📋 Listando documentos en Factus...');

      const { token, config } = await this.getAuthConfig();

      // Construir query params
      const params = new URLSearchParams();
      if (filters?.desde) params.append('from_date', filters.desde);
      if (filters?.hasta) params.append('to_date', filters.hasta);
      if (filters?.estado) params.append('status', filters.estado);
      if (filters?.page) params.append('page', filters.page.toString());
      if (filters?.limit) params.append('limit', filters.limit.toString());

      const response = await axios.get(
        `${config.api_url}/api/v1/electronic-documents?${params.toString()}`,//
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
          timeout: 15000,
        }
      );

      strapi.log.info(`✅ ${response.data.total || 0} documentos encontrados`);

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      strapi.log.error('❌ Error listando documentos:', error);
      return {
        success: false,
        error: this.getErrorMessage(error),
      };
    }
  },

  /**
   * 🔄 Reenviar email con factura
   * 
   * @param documentId - ID del documento
   * @param email - Email del destinatario
   */
  async resendEmail(
    documentId: string | number,
    email?: string
  ): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    try {
      strapi.log.info(`📧 Reenviando email del documento ${documentId}...`);

      const { token, config } = await this.getAuthConfig();

      const payload = email ? { email } : {};

      const response = await axios.post(
        `${config.api_url}/v1/bills/send-email/${documentId}l`,//endpoint de reenviar email
        payload,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          timeout: 10000,
        }
      );

      strapi.log.info('✅ Email reenviado');

      return {
        success: true,
        message: response.data.message || 'Email enviado',
      };
    } catch (error) {
      strapi.log.error('❌ Error reenviando email:', error);
      return {
        success: false,
        error: this.getErrorMessage(error),
      };
    }
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MÉTODOS DE UTILIDAD
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 📝 Parsear mensaje de error de Factus
   */
  parseErrorMessage(data: any): string {
    if (!data) return 'Error desconocido';

    // Formato: { error: "mensaje" }
    if (data.error && typeof data.error === 'string') {
      return data.error;
    }

    // Formato: { message: "mensaje" }
    if (data.message && typeof data.message === 'string') {
      return data.message;
    }

    // Formato: { errors: [{ message: "..." }] }
    if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
      return data.errors
        .map((err: any) => {
          const field = err.field ? `[${err.field}] ` : '';
          return `${field}${err.message}`;
        })
        .join(', ');
    }

    return 'Error desconocido';
  },

  /**
   * 🔍 Obtener mensaje de error genérico
   */
  getErrorMessage(error: any): string {
    if (error instanceof Error) {
      return error.message;
    }
    
    if (typeof error === 'string') {
      return error;
    }

    if (error?.message) {
      return error.message;
    }

    return 'Error desconocido';
  },

  /**
   * ⏱️ Esperar (sleep)
   */
  sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * 📊 Validar payload antes de enviar
   */
  validatePayload(payload: FactusInvoicePayload): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Validaciones básicas
    if (!payload.numbering_range_id) {
      errors.push('numbering_range_id es requerido');
    }

    if (!payload.reference_code) {
      errors.push('reference_code es requerido');
    }

    if (!payload.establishment?.name) {
      errors.push('establishment.name es requerido');
    }

    if (!payload.customer?.identification) {
      errors.push('customer.identification es requerido');
    }

    if (!payload.customer?.email) {
      errors.push('customer.email es requerido');
    }

    if (!payload.items || payload.items.length === 0) {
      errors.push('Debe haber al menos un item');
    }

    // Validar items
    payload.items?.forEach((item, index) => {
      if (!item.name) {
        errors.push(`Item ${index + 1}: nombre es requerido`);
      }
      if (!item.code_reference) {
        errors.push(`Item ${index + 1}: código es requerido`);
      }
      if (item.quantity <= 0) {
        errors.push(`Item ${index + 1}: cantidad debe ser mayor a 0`);
      }
      if (item.price <= 0) {
        errors.push(`Item ${index + 1}: precio debe ser mayor a 0`);
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  },
};