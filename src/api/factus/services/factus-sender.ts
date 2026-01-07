/**
 * Servicio de Envío a Factus API - VERSIÓN DEBUG MEJORADA
 * Ubicación: src/api/factus/services/factus-sender.ts
 * 
 * ✅ Logging detallado de errores de Factus
 */

import axios, { AxiosError, AxiosResponse } from 'axios';
import type { FactusConfig } from '../types/factus.types';

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
  items: Array<any>;
}

interface FactusApiResponse {
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
  message?: string;
  created_at?: string;
  updated_at?: string;
  error?: string;
  errors?: Array<{
    field?: string;
    message: string;
    code?: string;
  }>;
}

interface SendOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export default {
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
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt > 0) {
          strapi.log.warn(`🔄 Reintento ${attempt}/${retries}...`);
          await this.sleep(retryDelay * attempt);
        }

        strapi.log.info('🚀 Enviando factura a Factus API...');

        const { token, config } = await this.getAuthConfig();
        const url = `${config.api_url}/v1/bills/validate`;

        // ✅ LOG DETALLADO DEL PAYLOAD
        strapi.log.info('═══════════════════════════════════════════════');
        strapi.log.info('📦 PAYLOAD COMPLETO A ENVIAR:');
        strapi.log.info('═══════════════════════════════════════════════');
        strapi.log.info(JSON.stringify(payload, null, 2));
        strapi.log.info('═══════════════════════════════════════════════');

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
            validateStatus: (status) => status < 500,
          }
        );

        strapi.log.info(`📥 Respuesta recibida: HTTP ${response.status}`);

        if (response.status >= 200 && response.status < 300) {
          strapi.log.info('✅ Factura enviada exitosamente');
          return {
            success: true,
            data: response.data,
            statusCode: response.status,
          };
        }

        // ✅ ERROR 4xx - LOG SUPER DETALLADO
        if (response.status >= 400 && response.status < 500) {
          const errorData = response.data;
          
          strapi.log.error('\n╔═══════════════════════════════════════════════════════╗');
          strapi.log.error('║  ❌ ERROR DE FACTUS API - ANÁLISIS DETALLADO         ║');
          strapi.log.error('╚═══════════════════════════════════════════════════════╝\n');
          
          strapi.log.error(`📍 Status: ${response.status} ${response.statusText}`);
          strapi.log.error(`🔗 URL: ${url}\n`);

          // Analizar estructura del error
          strapi.log.error('📋 ESTRUCTURA DEL ERROR:');
          strapi.log.error(`   Tipo: ${typeof errorData}`);
          strapi.log.error(`   Keys: ${Object.keys(errorData).join(', ')}\n`);

          // Mostrar error completo formateado
          strapi.log.error('📄 RESPUESTA COMPLETA:');
          strapi.log.error(JSON.stringify(errorData, null, 2));
          strapi.log.error('\n');

          // Extraer mensaje específico
          const errorMessage = this.parseErrorMessage(errorData);
          strapi.log.error('💬 MENSAJE PARSEADO:');
          strapi.log.error(`   "${errorMessage}"\n`);

          // Si hay errores de validación, mostrarlos en detalle
          if (errorData.errors && Array.isArray(errorData.errors)) {
            strapi.log.error('🔍 ERRORES DE VALIDACIÓN DETALLADOS:');
            errorData.errors.forEach((err, index) => {
              strapi.log.error(`   ${index + 1}. Campo: ${err.field || 'N/A'}`);
              strapi.log.error(`      Mensaje: ${err.message}`);
              strapi.log.error(`      Código: ${err.code || 'N/A'}\n`);
            });
          }

          // Analizar campos del payload que podrían estar fallando
          strapi.log.error('🔎 ANÁLISIS DEL PAYLOAD ENVIADO:');
          strapi.log.error('   Customer (Cliente):');
          strapi.log.error(`      - identification: ${payload.customer.identification}`);
          strapi.log.error(`      - names: ${payload.customer.names}`);
          strapi.log.error(`      - email: ${payload.customer.email}`);
          strapi.log.error(`      - municipality_id: ${payload.customer.municipality_id}`);
          strapi.log.error(`      - phone: ${payload.customer.phone}`);
          strapi.log.error(`      - address: ${payload.customer.address}`);
          strapi.log.error('   Establishment (Empresa):');
          strapi.log.error(`      - name: ${payload.establishment.name}`);
          strapi.log.error(`      - municipality_id: ${payload.establishment.municipality_id}`);
          strapi.log.error('   General:');
          strapi.log.error(`      - numbering_range_id: ${payload.numbering_range_id}`);
          strapi.log.error(`      - reference_code: ${payload.reference_code}`);
          strapi.log.error(`      - items count: ${payload.items?.length || 0}\n`);

          strapi.log.error('╔═══════════════════════════════════════════════════════╗');
          strapi.log.error('║  FIN DEL ANÁLISIS DE ERROR                           ║');
          strapi.log.error('╚═══════════════════════════════════════════════════════╝\n');

          return {
            success: false,
            data: errorData,
            error: errorMessage,
            statusCode: response.status,
          };
        }

        throw new Error(`Server error: ${response.status}`);

      } catch (error) {
        lastError = error;
        const axiosError = error as AxiosError<FactusApiResponse>;

        if (axiosError.response) {
          const status = axiosError.response.status;
          const errorData = axiosError.response.data;

          strapi.log.error(`❌ Error HTTP ${status}`);

          if (status >= 400 && status < 500) {
            return {
              success: false,
              data: errorData,
              error: this.parseErrorMessage(errorData),
              statusCode: status,
            };
          }

          if (attempt < retries) {
            strapi.log.warn(`⚠️ Error ${status}, reintentando...`);
            continue;
          }

        } else if (axiosError.request) {
          strapi.log.error('❌ Sin respuesta de Factus:', {
            message: axiosError.message,
            code: axiosError.code,
          });

          if (attempt < retries) {
            strapi.log.warn('⚠️ Timeout, reintentando...');
            continue;
          }
        } else {
          strapi.log.error('❌ Error configurando petición:', axiosError.message);
        }
      }
    }

    return {
      success: false,
      error: `Error después de ${retries + 1} intentos: ${this.getErrorMessage(lastError)}`,
    };
  },

  async getAuthConfig(): Promise<{
    token: string;
    config: FactusConfig;
  }> {
    const authService = strapi.service('api::factus.factus-auth');
    const token = await authService.getToken();

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

  async getDocumentStatus(documentId: string | number): Promise<{
    success: boolean;
    data?: FactusApiResponse;
    error?: string;
  }> {
    try {
      const { token, config } = await this.getAuthConfig();

      const response = await axios.get<FactusApiResponse>(
        `${config.api_url}/v1/bills/${documentId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
          timeout: 10000,
        }
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: this.getErrorMessage(error),
      };
    }
  },

  async downloadPDF(documentId: string | number): Promise<{
    success: boolean;
    data?: {
      pdf_url?: string;
      pdf_base64?: string;
    };
    error?: string;
  }> {
    try {
      const { token, config } = await this.getAuthConfig();

      const response = await axios.get(
        `${config.api_url}/v1/bills/${documentId}/pdf`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
          timeout: 15000,
        }
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: this.getErrorMessage(error),
      };
    }
  },

  async listDocuments(filters?: {
    desde?: string;
    hasta?: string;
    estado?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      const { token, config } = await this.getAuthConfig();

      const params = new URLSearchParams();
      if (filters?.desde) params.append('from_date', filters.desde);
      if (filters?.hasta) params.append('to_date', filters.hasta);
      if (filters?.estado) params.append('status', filters.estado);
      if (filters?.page) params.append('page', filters.page.toString());
      if (filters?.limit) params.append('limit', filters.limit.toString());

      const response = await axios.get(
        `${config.api_url}/v1/bills?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
          timeout: 15000,
        }
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: this.getErrorMessage(error),
      };
    }
  },

  parseErrorMessage(data: any): string {
    if (!data) return 'Error desconocido';

    if (data.error && typeof data.error === 'string') {
      return data.error;
    }

    if (data.error && typeof data.error === 'object') {
      if (data.error.message) return data.error.message;
      return JSON.stringify(data.error);
    }

    if (data.message && typeof data.message === 'string') {
      return data.message;
    }

    if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
      return data.errors
        .map((err: any) => {
          const field = err.field ? `[${err.field}] ` : '';
          const msg = err.message || JSON.stringify(err);
          return `${field}${msg}`;
        })
        .join(', ');
    }

    if (data.validation_errors && typeof data.validation_errors === 'object') {
      const errors = Object.entries(data.validation_errors)
        .map(([field, messages]) => {
          if (Array.isArray(messages)) {
            return `${field}: ${(messages as string[]).join(', ')}`;
          }
          return `${field}: ${messages}`;
        })
        .join('; ');
      return `Errores de validación: ${errors}`;
    }

    if (data.detail && typeof data.detail === 'string') {
      return data.detail;
    }

    if (data.details && Array.isArray(data.details) && data.details.length > 0) {
      return data.details
        .map((detail: any) => {
          if (typeof detail === 'string') return detail;
          if (detail.msg) return `[${detail.loc?.join('.')}] ${detail.msg}`;
          return JSON.stringify(detail);
        })
        .join('; ');
    }

    if (data.code && data.description) {
      return `${data.code}: ${data.description}`;
    }

    if (typeof data === 'object') {
      try {
        return JSON.stringify(data, null, 2);
      } catch (e) {
        return 'Error desconocido (no serializable)';
      }
    }

    return 'Error desconocido';
  },

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

  sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  validatePayload(payload: FactusInvoicePayload): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

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

    if (!payload.customer?.municipality_id) {
      errors.push('customer.municipality_id es requerido');
    }

    if (!payload.items || payload.items.length === 0) {
      errors.push('Debe haber al menos un item');
    }

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