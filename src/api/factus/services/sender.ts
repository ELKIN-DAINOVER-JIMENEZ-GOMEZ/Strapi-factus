
import axios, { AxiosError, AxiosResponse } from 'axios';
import type { FactusConfig } from '../types/factus.types';

export interface FactusInvoicePayload {
  numbering_range_id: number;
  reference_code: string;
  observation: string;
  payment_form: string;
  payment_due_date: string;
  payment_method_code: string;
  operation_type: number;
  send_email: boolean;
  order_reference?: {
    reference_code: string;
    issue_date: string;
  };
  billing_period?: {
    start_date: string;
    start_time: string;
    end_date: string;
    end_time: string;
  };
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
          await this.sleep(retryDelay * attempt);
        }

        const { token, config } = await this.getAuthConfig();
        const url = `${config.api_url}/v1/bills/validate`;

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

        if (response.status >= 200 && response.status < 300) {
          return {
            success: true,
            data: response.data,
            statusCode: response.status,
          };
        }

        if (response.status >= 400 && response.status < 500) {
          const errorData = response.data;
          const errorMessage = this.parseErrorMessage(errorData);

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

          if (status >= 400 && status < 500) {
            return {
              success: false,
              data: errorData,
              error: this.parseErrorMessage(errorData),
              statusCode: status,
            };
          }

          if (attempt < retries) {
            continue;
          }

        } else if (axiosError.request) {
          if (attempt < retries) {
            continue;
          }
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

  async downloadPDF(factusNumber: string): Promise<{
    success: boolean;
    data?: {
      file_name?: string;
      pdf_base_64_encoded?: string;
      pdf_base64?: string;
      pdf_url?: string;
    };
    error?: string;
  }> {
    try {
      const { token, config } = await this.getAuthConfig();
      const url = `${config.api_url}/v1/bills/download-pdf/${factusNumber}`;

      const response = await axios.get(
        url,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      const pdfData = response.data?.data || response.data;
      
      if (pdfData?.pdf_base_64_encoded || pdfData?.pdf_base64 || pdfData?.pdf_url) {
        return {
          success: true,
          data: {
            file_name: pdfData.file_name,
            pdf_base_64_encoded: pdfData.pdf_base_64_encoded,
            pdf_base64: pdfData.pdf_base64,
            pdf_url: pdfData.pdf_url,
          },
        };
      } else {
        return {
          success: false,
          error: 'La respuesta de Factus no contiene el PDF',
        };
      }
    } catch (error: any) {
      if (error.response?.status === 400) {
        const errorMsg = error.response.data?.message || 
                        error.response.data?.error ||
                        'Número de factura inválido o no encontrado en Factus';
        return {
          success: false,
          error: `Error 400: ${errorMsg}. El número de factura "${factusNumber}" no es válido para Factus API.`,
        };
      }
      
      return {
        success: false,
        error: this.getErrorMessage(error),
      };
    }
  },

  async downloadPDFController(ctx) {
    try {
      const { documentId } = ctx.params;
      const { returnBlob } = ctx.query;

      if (!documentId) {
        return ctx.badRequest('documentId es requerido');
      }

      let invoice = null;
      let factusDocumentId = null;

      try {
        invoice = await strapi.db.query('api::invoice.invoice').findOne({
          where: { id: parseInt(documentId) },
          select: ['*'],
        });
        
        if (invoice?.factus_id) {
          factusDocumentId = invoice.factus_id;
        } else if (invoice?.respuesta_factus) {
          const extracted = this.extractFactusId(invoice.respuesta_factus);
          
          if (extracted) {
            factusDocumentId = extracted;
            
            await strapi.db.query('api::invoice.invoice').update({
              where: { id: parseInt(documentId) },
              data: { factus_id: extracted }
            });
          }
        }
      } catch (e) {
        // Error buscando factura en DB
      }

      if (!factusDocumentId) {
        return ctx.badRequest({
          success: false,
          message: 'No se puede descargar el PDF',
          details: invoice 
            ? 'La factura existe pero no tiene un factus_id asociado.'
            : 'Factura no encontrada en el sistema.',
        });
      }

      const publicUrl = invoice?.url_pdf || 
                       invoice?.respuesta_factus?.data?.bill?.public_url;
      
      if (publicUrl) {
        if (returnBlob === 'true') {
          try {
            const pdfResponse = await axios.get(publicUrl, {
              responseType: 'arraybuffer',
              timeout: 30000,
              headers: { 'Accept': 'application/pdf,text/html,*/*' },
            });

            const contentType = pdfResponse.headers['content-type'] || '';
            
            if (contentType.includes('text/html')) {
              return ctx.send({
                success: true,
                redirect: true,
                url: publicUrl,
                message: 'Abrir en navegador para ver la factura'
              });
            }

            ctx.set('Content-Type', 'application/pdf');
            ctx.set('Content-Disposition', `attachment; filename="factura-${invoice?.numero_factura || factusDocumentId}.pdf"`);
            ctx.body = Buffer.from(pdfResponse.data);
            return;
          } catch (urlError) {
            // Fallback a API de Factus
          }
        } else {
          return ctx.send({ success: true, redirect: true, url: publicUrl });
        }
      }

      const emissionService = strapi.service('api::factus.factus-emission');
      const result = await emissionService.downloadPDF(factusDocumentId);

      if (!result.success) {
        return ctx.badRequest({
          success: false,
          message: 'Error descargando PDF desde Factus',
          error: result.error,
        });
      }

      const pdfData = result.data?.data || result.data;
      const pdfBase64 = pdfData?.pdf_base_64_encoded || pdfData?.pdf_base64;
      const fileName = pdfData?.file_name || `factura-${factusDocumentId}`;

      if (pdfBase64) {
        if (returnBlob === 'true') {
          const pdfBuffer = Buffer.from(pdfBase64, 'base64');
          ctx.set('Content-Type', 'application/pdf');
          ctx.set('Content-Disposition', `attachment; filename="${fileName}.pdf"`);
          ctx.body = pdfBuffer;
          return;
        } else {
          return ctx.send({
            success: true,
            data: { file_name: fileName, pdf_base64: pdfBase64 },
          });
        }
      } else if (pdfData?.pdf_url) {
        const pdfResponse = await axios.get(pdfData.pdf_url, {
          responseType: 'arraybuffer',
          timeout: 30000,
        });
        ctx.set('Content-Type', 'application/pdf');
        ctx.set('Content-Disposition', `attachment; filename="${fileName}.pdf"`);
        ctx.body = Buffer.from(pdfResponse.data);
        return;
      } else {
        return ctx.badRequest({
          success: false,
          message: 'La respuesta de Factus no contiene el PDF',
        });
      }

    } catch (error: any) {
      return ctx.internalServerError({
        success: false,
        message: 'Error interno del servidor',
        error: error.message,
      });
    }
  },

  extractFactusId(response: any): string | null {
    if (!response) return null;
    
    if (response.number && typeof response.number === 'string') {
      return String(response.number).trim();
    }
    
    if (response?.data?.bill?.number && typeof response.data.bill.number === 'string') {
      return String(response.data.bill.number).trim();
    }
    
    if (response?.data?.bill?.id) {
      return String(response.data.bill.id).trim();
    }
    
    if (response.id && (typeof response.id === 'string' || typeof response.id === 'number')) {
      return String(response.id).trim();
    }
    
    if (response.document_id && typeof response.document_id === 'string') {
      return response.document_id.trim();
    }
    
    if (response.uuid && typeof response.uuid === 'string') {
      return response.uuid.trim();
    }
    
    return null;
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

    if (data.error && typeof data.error === 'string') return data.error;
    if (data.error?.message) return data.error.message;
    if (data.message && typeof data.message === 'string') return data.message;

    if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
      return data.errors
        .map((err: any) => `${err.field ? `[${err.field}] ` : ''}${err.message || JSON.stringify(err)}`)
        .join(', ');
    }

    if (data.validation_errors && typeof data.validation_errors === 'object') {
      return `Errores de validación: ${Object.entries(data.validation_errors)
        .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`)
        .join('; ')}`;
    }

    if (data.detail) return data.detail;
    if (data.code && data.description) return `${data.code}: ${data.description}`;

    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return 'Error desconocido';
    }
  },

  getErrorMessage(error: any): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    if (error?.message) return error.message;
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

    if (!payload.numbering_range_id) errors.push('numbering_range_id es requerido');
    if (!payload.reference_code) errors.push('reference_code es requerido');
    if (!payload.establishment?.name) errors.push('establishment.name es requerido');
    if (!payload.customer?.identification) errors.push('customer.identification es requerido');
    if (!payload.customer?.email) errors.push('customer.email es requerido');
    if (!payload.customer?.municipality_id) errors.push('customer.municipality_id es requerido');
    if (!payload.items || payload.items.length === 0) errors.push('Debe haber al menos un item');

    payload.items?.forEach((item, index) => {
      if (!item.name) errors.push(`Item ${index + 1}: nombre es requerido`);
      if (!item.code_reference) errors.push(`Item ${index + 1}: código es requerido`);
      if (item.quantity <= 0) errors.push(`Item ${index + 1}: cantidad debe ser mayor a 0`);
      if (item.price <= 0) errors.push(`Item ${index + 1}: precio debe ser mayor a 0`);
    });

    return { valid: errors.length === 0, errors };
  },
};
