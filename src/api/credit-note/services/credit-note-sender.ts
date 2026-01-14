/**
 * Servicio de Envío de Notas Crédito a Factus API (limpio de logs)
 */

import axios, { AxiosResponse } from 'axios';

interface FactusCreditNotePayload {
  numbering_range_id?: number;
  correction_concept_code: number;
  customization_id: number;
  bill_id?: number;
  reference_code: string;
  payment_method_code: string;
  send_email?: boolean;
  observation?: string;
  billing_period?: {
    start_date: string;
    end_date: string;
  };
  customer?: any;
  items: any[];
}

interface FactusApiResponse {
  id?: number;
  number?: string;
  document_id?: string;
  uuid?: string;
  status?: string;
  cude?: string;
  qr_code?: string;
  pdf_url?: string;
  xml_url?: string;
  message?: string;
  error?: string;
  errors?: Array<{ field?: string; message: string }>;
  data?: { credit_note?: { number?: string; id?: string | number; cude?: string; qr?: string; pdf_url?: string; xml_url?: string; public_url?: string } };
}

interface SendOptions { timeout?: number; retries?: number; retryDelay?: number }

export default {
  async sendCreditNote(payload: FactusCreditNotePayload, options: SendOptions = {}) {
    const { timeout = 30000, retries = 2, retryDelay = 2000 } = options;
    let lastError: any;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt > 0) await this.sleep(retryDelay * attempt);

        const { token, config } = await this.getAuthConfig();
        const url = `${config.api_url}/v1/credit-notes/validate`;

        const response: AxiosResponse<FactusApiResponse> = await axios.post(url, payload, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          timeout,
          validateStatus: (status) => status < 500,
        });

        if (response.status >= 200 && response.status < 300) {
          return { success: true, data: response.data, statusCode: response.status };
        }

        const errorMessage = this.extractErrorMessage(response.data);
        return { success: false, data: response.data, error: errorMessage, statusCode: response.status };
      } catch (error: any) {
        lastError = error;
        if (error.response) {
          if (error.response.status < 500) {
            return { success: false, data: error.response.data, error: this.extractErrorMessage(error.response.data), statusCode: error.response.status };
          }
        }

        if (attempt === retries) break;
      }
    }

    return { success: false, error: lastError?.message || 'Error desconocido después de reintentos', statusCode: lastError?.response?.status || 500 };
  },

  async downloadCreditNotePDF(creditNoteNumber: string) {
    try {
      const { token, config } = await this.getAuthConfig();
      const url = `${config.api_url}/v1/credit-notes/download-pdf/${creditNoteNumber}`;

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf,application/json,*/*' },
        responseType: 'arraybuffer',
        timeout: 60000,
        maxRedirects: 0,
        validateStatus: (status) => status < 400 || status === 302,
      });

      if (response.status === 302 || response.headers.location) {
        return { success: true, redirectUrl: response.headers.location };
      }

      const contentType = response.headers['content-type'] || '';
      if (contentType.includes('application/pdf')) {
        return { success: true, data: Buffer.from(response.data), contentType: 'application/pdf' };
      }

      const textResponse = response.data.toString('utf8');
      try {
        const jsonResponse = JSON.parse(textResponse);
        if (jsonResponse.data?.credit_note?.public_url) return { success: true, redirectUrl: jsonResponse.data.credit_note.public_url };
        return { success: false, error: jsonResponse.message || 'Respuesta no es un PDF' };
      } catch {
        return { success: false, error: 'Formato de respuesta no reconocido' };
      }
    } catch (error: any) {
      return { success: false, error: error.message || 'Error descargando PDF' };
    }
  },

  validatePayload(payload: FactusCreditNotePayload) {
    const errors: string[] = [];
    if (!payload.correction_concept_code || payload.correction_concept_code < 1 || payload.correction_concept_code > 5) errors.push('correction_concept_code debe ser un número entre 1 y 5');
    if (!payload.customization_id) errors.push('customization_id es requerido (20 = con referencia, 22 = sin referencia)');
    if (!payload.reference_code) errors.push('reference_code es requerido (código único para evitar duplicados)');
    if (!payload.payment_method_code) errors.push('payment_method_code es requerido');
    if (payload.customization_id === 20 && !payload.bill_id) errors.push('bill_id es requerido cuando customization_id = 20 (nota crédito con referencia a factura)');
    if (payload.customization_id === 22 && !payload.billing_period) errors.push('billing_period es requerido cuando customization_id = 22 (nota crédito sin referencia)');
    if (!payload.items || payload.items.length === 0) errors.push('items debe tener al menos un elemento');
    else payload.items.forEach((item, index) => {
      if (!item.name) errors.push(`items[${index}].name es requerido`);
      if (!item.code_reference) errors.push(`items[${index}].code_reference es requerido`);
      if (!item.quantity || item.quantity <= 0) errors.push(`items[${index}].quantity debe ser mayor a 0`);
      if (item.price === undefined || item.price === null || item.price <= 0) errors.push(`items[${index}].price debe ser mayor a 0`);
      if (item.tax_rate === undefined || item.tax_rate === null) errors.push(`items[${index}].tax_rate es requerido`);
      if (!item.unit_measure_id) errors.push(`items[${index}].unit_measure_id es requerido`);
    });

    return { valid: errors.length === 0, errors };
  },

  extractErrorMessage(response: any): string {
    if (!response) return 'Error desconocido';
    if (response.message) return response.message;
    if (response.errors && Array.isArray(response.errors)) return response.errors.map((e: any) => e.message || JSON.stringify(e)).join('; ');
    if (response.error) return response.error;
    return JSON.stringify(response);
  },

  async getAuthConfig() {
    const authService = strapi.service('api::factus.auth');
    const token = await authService.getToken();
    const config = await strapi.db.query('api::factus-config.factus-config').findOne({ where: {} }) as any;
    if (!config) throw new Error('Configuración de Factus no encontrada');
    return { token, config };
  },

  sleep(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)); },
};
