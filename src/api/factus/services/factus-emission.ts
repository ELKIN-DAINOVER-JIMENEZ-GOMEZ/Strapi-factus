/**
 * Servicio de Emisión de Facturas a Factus API
 * Ubicación: src/api/factus/services/factus-emission.ts
 * 
 * Responsabilidades:
 * - Coordinar el proceso de emisión
 * - Manejar respuestas de la DIAN
 * - Actualizar estado en Strapi
 * - Guardar CUFE/CUDE
 */

import type {FactusConfig, FactusOperationResult } from '../types/factus.types';

// Tipo de respuesta de Factus al crear documento
interface FactusEmissionResponse {
  id?: number;
  document_id?: string;
  status?: string;
  cufe?: string;
  cude?: string;
  qr_code?: string;
  pdf_url?: string;
  xml_url?: string;
  pdf_base64?: string;
  xml_base64?: string;
  message?: string;
  errors?: Array<{
    field?: string;
    message: string;
  }>;
}

export default {
  /**
   * 📤 Emitir factura a Factus API
   * 
   * @param invoiceId - ID de la factura en Strapi
   * @returns Resultado de la emisión
   */
  async emitInvoice(invoiceId: number): Promise<FactusOperationResult<FactusEmissionResponse>> {
    try {
      strapi.log.info(`📤 [EMISSION] Iniciando emisión de factura ${invoiceId}`);

      // 1. Validar factura
      const mapperService = strapi.service('api::factus.factus-mapper');
      const validation = await mapperService.validateInvoice(invoiceId);

      if (!validation.valid) {
        return {
          success: false,
          message: '❌ Factura inválida',
          error: validation.errors.join(', '),
          timestamp: new Date().toISOString(),
        };
      }

      // 2. Mapear factura al formato Factus
      const payload = await mapperService.mapInvoiceToFactus(invoiceId);

      strapi.log.info('✅ Factura mapeada exitosamente');
      strapi.log.debug('Payload a enviar:', JSON.stringify(payload, null, 2));

      // 3. Obtener token de autenticación
      const authService = strapi.service('api::factus.factus-auth');
      const token = await authService.getToken();

      // 4. Obtener configuración para URL base
      const configResult = await strapi.entityService.findMany(
  'api::factus-config.factus-config'
) as any;
const config: FactusConfig = Array.isArray(configResult) 
  ? configResult[0] 
  : configResult;

      if (!config) {
        throw new Error('Configuración de Factus no encontrada');
      }

      // 5. Enviar factura a Factus usando factus-sender
      strapi.log.info('🚀 Enviando factura a Factus API...');

      const senderService = strapi.service('api::factus.factus-sender');
      const sendResult = await senderService.sendInvoice(payload, {
        timeout: 30000,
        retries: 2,
        retryDelay: 2000,
      });

      if (!sendResult.success) {
        throw new Error(sendResult.error || 'Error enviando factura');
      }

      strapi.log.info('✅ Respuesta recibida de Factus');
      strapi.log.debug('Respuesta:', JSON.stringify(sendResult.data, null, 2));

      // 6. Actualizar factura en Strapi con la respuesta
      await this.updateInvoiceStatus(invoiceId, sendResult.data, 'exitosa');

      return {
        success: true,
        message: '✅ Factura emitida exitosamente',
        data: sendResult.data,
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      strapi.log.error('❌ Error emitiendo factura:', error);

      // El error ya fue manejado por factus-sender
      const errorMessage = (error as Error).message;

      // Actualizar factura con el error
      await this.updateInvoiceStatus(
        invoiceId,
        {},
        'fallida',
        [{ message: errorMessage }]
      );

      return {
        success: false,
        message: '❌ Error al emitir factura',
        error: errorMessage,
        timestamp: new Date().toISOString(),
      };
    }
  },

  /**
   * 🔄 Actualizar estado de factura en Strapi
   * 
   * @param invoiceId - ID de la factura
   * @param factusResponse - Respuesta de Factus
   * @param status - Estado: 'exitosa' | 'fallida'
   * @param errors - Errores si los hay
   */
  async updateInvoiceStatus(
    invoiceId: number,
    factusResponse: FactusEmissionResponse,
    status: 'exitosa' | 'fallida',
    errors?: Array<{ field?: string; message: string }>
  ): Promise<void> {
    try {
      const updateData: any = {
        fecha_envio_dian: new Date(),
        respuesta_factus: factusResponse,
      };

      // Incrementar intentos de envío
      const currentInvoice = await strapi.entityService.findOne(
        'api::invoice.invoice',
        invoiceId
      ) as any;

      updateData.intentos_envio = (currentInvoice.intentos_envio || 0) + 1;

      if (status === 'exitosa') {
        // Actualizar con datos de éxito
        updateData.estado_local = 'Enviada';
        updateData.estado_dian = factusResponse.status || 'Enviado';
        updateData.factus_id = factusResponse.document_id || factusResponse.id?.toString();
        updateData.factus_cude = factusResponse.cufe || factusResponse.cude;
        updateData.factus_qr = factusResponse.qr_code;
        updateData.url_pdf = factusResponse.pdf_url;
        updateData.url_xml = factusResponse.xml_url;
        updateData.errores_factus = null;
      } else {
        // Actualizar con datos de error
        updateData.estado_local = 'Rechazada';
        updateData.errores_factus = errors || [{ message: 'Error desconocido' }];
      }

      await strapi.entityService.update(
        'api::invoice.invoice',
        invoiceId,
        { data: updateData }
      );

      strapi.log.info(`✅ Factura ${invoiceId} actualizada con estado: ${status}`);
    } catch (error) {
      strapi.log.error('❌ Error actualizando estado de factura:', error);
      // No lanzar error para no afectar el flujo principal
    }
  },

  /**
   * 🔍 Consultar estado de una factura en Factus
   * 
   * @param factusId - ID del documento en Factus
   * @returns Estado del documento
   */
  async getInvoiceStatus(factusId: string): Promise<FactusOperationResult<any>> {
    try {
      strapi.log.info(`🔍 Consultando estado de documento ${factusId}`);

      const senderService = strapi.service('api::factus.factus-sender');
      const result = await senderService.getDocumentStatus(factusId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return {
        success: true,
        message: '✅ Estado obtenido',
        data: result.data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      strapi.log.error('❌ Error consultando estado:', error);
      return {
        success: false,
        message: '❌ Error consultando estado',
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      };
    }
  },

  /**
   * 📄 Descargar PDF de una factura
   * 
   * @param factusId - ID del documento en Factus
   * @returns URL del PDF
   */
  async downloadPDF(factusId: string): Promise<FactusOperationResult<string>> {
    try {
      const senderService = strapi.service('api::factus.factus-sender');
      const result = await senderService.downloadPDF(factusId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return {
        success: true,
        message: '✅ PDF obtenido',
        data: result.data?.pdf_url || result.data?.pdf_base64,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: '❌ Error descargando PDF',
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      };
    }
  },

  /**
   * 📋 Listar facturas emitidas
   * 
   * @param filters - Filtros de búsqueda
   * @returns Lista de facturas
   */
  async listInvoices(filters?: {
    desde?: string;
    hasta?: string;
    estado?: string;
  }): Promise<FactusOperationResult<any>> {
    try {
      const senderService = strapi.service('api::factus.factus-sender');
      const result = await senderService.listDocuments(filters);

      if (!result.success) {
        throw new Error(result.error);
      }

      return {
        success: true,
        message: '✅ Facturas obtenidas',
        data: result.data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: '❌ Error listando facturas',
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      };
    }
  },
};