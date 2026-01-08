/**
 * Servicio de Emisión de Facturas - VERSIÓN CORREGIDA
 * Ubicación: src/api/factus/services/factus-emission.ts
 * 
 * ✅ FIX: Retornar document_id de Factus para descarga de PDF
 */

import type {FactusConfig, FactusOperationResult } from '../types/factus.types';

interface FactusEmissionResponse {
  number?: string;           // ← IMPORTANTE: Número de factura para descargas
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
  errors?: Array<{
    field?: string;
    message: string;
  }>;
  data?: {
    bill?: {
      number?: string;
      id?: string | number;
      cufe?: string;
      qr?: string;
      pdf_url?: string;
      xml_url?: string;
      public_url?: string;  // ← URL pública única para cada factura
    };
  };
}

export default {
  async emitInvoice(invoiceId: number): Promise<FactusOperationResult<FactusEmissionResponse>> {
    try {
      strapi.log.info(`📤 [EMISSION] Iniciando emisión de factura ${invoiceId}`);

      // 1. Validar factura
      const mapperService = strapi.service('api::factus.factus-mapper');
      const validation = await mapperService.validateInvoice(invoiceId);

      if (!validation.valid) {
        strapi.log.error('❌ Validación fallida:', validation.errors);
        return {
          success: false,
          message: '❌ Factura inválida',
          error: validation.errors.join(', '),
          timestamp: new Date().toISOString(),
        };
      }

      strapi.log.info('✅ Factura validada correctamente');

      // 2. Obtener factura con relaciones completas
      const invoice = await strapi.db.query('api::invoice.invoice').findOne({
        where: { id: invoiceId },
        populate: {
          client: true,
          invoice_items: {
            populate: {
              product: true,
            },
          },
        },
      }) as any;

      if (!invoice.client) {
        return {
          success: false,
          message: '❌ Factura sin cliente',
          error: 'La factura no tiene cliente asociado',
          timestamp: new Date().toISOString(),
        };
      }

      // Completar datos del cliente si faltan
      if (!invoice.client.ciudad_codigo) {
        strapi.log.warn('⚠️ Cliente sin ciudad_codigo, usando por defecto: 11001');
        invoice.client.ciudad_codigo = '11001';
      }

      if (!invoice.client.ciudad) {
        strapi.log.warn('⚠️ Cliente sin ciudad, usando por defecto: Bogotá');
        invoice.client.ciudad = 'Bogotá';
      }

      if (!invoice.client.departamento) {
        strapi.log.warn('⚠️ Cliente sin departamento, usando por defecto: Bogotá D.C.');
        invoice.client.departamento = 'Bogotá D.C.';
      }

      if (!invoice.client.telefono) {
        strapi.log.warn('⚠️ Cliente sin teléfono, usando por defecto: 0000000');
        invoice.client.telefono = '0000000';
      }

      // 3. Mapear factura al formato Factus
      const payload = await mapperService.mapInvoiceToFactus(invoiceId);

      strapi.log.info('✅ Factura mapeada exitosamente');

      // 4. Validar payload antes de enviar
      const senderService = strapi.service('api::factus.factus-sender');
      const payloadValidation = senderService.validatePayload(payload);

      if (!payloadValidation.valid) {
        strapi.log.error('❌ Payload inválido:', payloadValidation.errors);
        return {
          success: false,
          message: '❌ Payload inválido',
          error: payloadValidation.errors.join(', '),
          timestamp: new Date().toISOString(),
        };
      }

      strapi.log.info('✅ Payload validado correctamente');

      // 5. Obtener token y enviar
      const authService = strapi.service('api::factus.factus-auth');
      const token = await authService.getToken();

      strapi.log.info('🚀 Enviando factura a Factus API...');

      const sendResult = await senderService.sendInvoice(payload, {
        timeout: 30000,
        retries: 2,
        retryDelay: 2000,
      });

      if (!sendResult.success) {
        strapi.log.error('❌ Error en respuesta de Factus:', sendResult);
        
        await this.updateInvoiceStatus(
          invoiceId,
          sendResult.data || {},
          'fallida',
          [{ message: sendResult.error || 'Error enviando factura' }]
        );

        return {
          success: false,
          message: '❌ Error al emitir factura',
          error: sendResult.error || 'Error enviando factura',
          timestamp: new Date().toISOString(),
        };
      }

      strapi.log.info('✅ Respuesta recibida de Factus');

      // ✅ CRÍTICO: Extraer el "number" correcto de la respuesta de Factus
      // La estructura de respuesta de Factus es: { data: { bill: { number: "SETP990000493" } } }
      // Este "number" es el que se usa para descargar el PDF con el endpoint /v1/bills/download-pdf/:number
      const factusNumber = sendResult.data?.data?.bill?.number ||  // Prioridad 1: data.bill.number (correcto)
                          sendResult.data?.number ||               // Prioridad 2: number en nivel superior
                          sendResult.data?.data?.bill?.id?.toString() || // Fallback: bill.id
                          sendResult.data?.document_id ||          // Fallback: document_id
                          sendResult.data?.id?.toString();         // Último fallback: id

      if (!factusNumber) {
        strapi.log.error('❌ CRÍTICO: No se encontró el número de factura (bill.number) en la respuesta de Factus');
        strapi.log.error('📋 Respuesta completa:', JSON.stringify(sendResult.data, null, 2));
      } else {
        strapi.log.info(`✅ Número de factura Factus (para PDF): ${factusNumber}`);
      }

      // 6. Actualizar factura en Strapi con la respuesta
      await this.updateInvoiceStatus(invoiceId, sendResult.data, 'exitosa');

      return {
        success: true,
        message: '✅ Factura emitida exitosamente',
        data: {
          ...sendResult.data,
          number: factusNumber, // ✅ IMPORTANTE: Incluir el número correcto para descarga de PDF
        },
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      strapi.log.error('❌ Error inesperado emitiendo factura:', error);

      try {
        const errorMessage = (error as Error).message || 'Error desconocido';
        await this.updateInvoiceStatus(
          invoiceId,
          {},
          'fallida',
          [{ message: errorMessage }]
        );
      } catch (updateError) {
        strapi.log.error('❌ Error actualizando factura con error:', updateError);
      }

      return {
        success: false,
        message: '❌ Error al emitir factura',
        error: (error as Error).message || 'Error desconocido',
        timestamp: new Date().toISOString(),
      };
    }
  },

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

    const currentInvoice = await strapi.entityService.findOne(
      'api::invoice.invoice',
      invoiceId
    ) as any;

    updateData.intentos_envio = (currentInvoice.intentos_envio || 0) + 1;

    if (status === 'exitosa') {
      updateData.estado_local = 'Enviada';
      updateData.estado_dian = factusResponse.status || 'Enviado';
      
      // 🔑 EXTRACCIÓN CORREGIDA DEL factus_id
      strapi.log.info('📋 Analizando respuesta de Factus para extraer ID...');
      strapi.log.debug('Respuesta completa:', JSON.stringify(factusResponse, null, 2));
      
      let factusDocumentId: string | undefined;
      let factusBillId: number | undefined;
      
      // ✅ PRIORIDAD 1: Campo "bill.id" (ID único de Factus para cada factura, incluso en sandbox)
      if (factusResponse?.data?.bill?.id) {
        factusBillId = Number(factusResponse.data.bill.id);
        strapi.log.info(`✅ bill_id único de Factus: ${factusBillId}`);
      }
      
      // PRIORIDAD 2: Campo "number" (número de factura DIAN - puede repetirse en sandbox)
      if (factusResponse?.number && typeof factusResponse.number === 'string') {
        factusDocumentId = String(factusResponse.number).trim();
        strapi.log.info(`✅ factus_number obtenido de 'number': ${factusDocumentId}`);
      }
      // PRIORIDAD 3: data.bill.number (respuesta anidada)
      else if (factusResponse?.data?.bill?.number && typeof factusResponse.data.bill.number === 'string') {
        factusDocumentId = String(factusResponse.data.bill.number).trim();
        strapi.log.info(`✅ factus_number obtenido de 'data.bill.number': ${factusDocumentId}`);
      }
      // PRIORIDAD 4: Otros campos como fallback
      else if (factusResponse?.data?.bill?.id) {
        factusDocumentId = String(factusResponse.data.bill.id).trim();
        strapi.log.info(`✅ factus_id obtenido de 'data.bill.id': ${factusDocumentId}`);
      }
      else if (factusResponse?.id) {
        factusDocumentId = String(factusResponse.id).trim();
        strapi.log.info(`✅ factus_id obtenido de 'id': ${factusDocumentId}`);
      }
      else if (factusResponse?.document_id) {
        factusDocumentId = String(factusResponse.document_id).trim();
        strapi.log.info(`✅ factus_id obtenido de 'document_id': ${factusDocumentId}`);
      }

      if (factusDocumentId || factusBillId) {
        // ✅ IMPORTANTE: Guardar el bill.id único de Factus (factusBillId)
        // Este ID es único para cada factura incluso en sandbox
        updateData.factus_id = factusDocumentId;
        updateData.factus_bill_id = factusBillId; // ID único de Factus
        strapi.log.info(`✅ FACTUS_ID GUARDADO: ${factusDocumentId}`);
        strapi.log.info(`✅ FACTUS_BILL_ID GUARDADO: ${factusBillId}`);
        
        // Guardar también otros datos útiles
        updateData.factus_cude = factusResponse?.data?.bill?.cufe || 
                                 factusResponse?.cufe || 
                                 factusResponse?.cude;
        updateData.factus_qr = factusResponse?.data?.bill?.qr || 
                              factusResponse?.qr_code;
        updateData.url_pdf = factusResponse?.data?.bill?.public_url ||
                            factusResponse?.data?.bill?.pdf_url || 
                            factusResponse?.pdf_url;
        updateData.url_xml = factusResponse?.data?.bill?.xml_url || 
                            factusResponse?.xml_url;
        updateData.errores_factus = null;
      } else {
        // ❌ NO SE PUDO EXTRAER EL ID
        strapi.log.error('❌ CRÍTICO: No se pudo extraer factus_id de la respuesta');
        strapi.log.error('📋 Campos buscados: number, data.bill.number, data.bill.id, id, document_id');
        strapi.log.error('📋 Respuesta recibida:', JSON.stringify(factusResponse));
        
        // Marcar como rechazada si no se puede obtener el ID
        updateData.factus_id = null;
        updateData.estado_local = 'Rechazada';
        updateData.errores_factus = [{ 
          message: 'No se pudo extraer el ID de documento de Factus. La factura puede estar creada en Factus pero no se puede descargar desde el sistema.' 
        }];
      }
    } else {
      updateData.estado_local = 'Rechazada';
      updateData.errores_factus = errors || [{ message: 'Error desconocido' }];
    }

    // Guardar en base de datos
    await strapi.entityService.update(
      'api::invoice.invoice',
      invoiceId,
      { data: updateData }
    );

    strapi.log.info(`✅ Factura ${invoiceId} actualizada - Estado: ${status}, factus_id: ${updateData.factus_id || 'N/A'}`);
    
  } catch (error) {
    strapi.log.error('❌ Error actualizando estado de factura:', error);
    throw error; // Re-lanzar para que se maneje arriba
  }
},

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

  async downloadPDF(factusId: string): Promise<FactusOperationResult<any>> {
    try {
      strapi.log.info(`📥 [EMISSION] Solicitando descarga de PDF para: ${factusId}`);
      
      const senderService = strapi.service('api::factus.factus-sender');
      const result = await senderService.downloadPDF(factusId);

      if (!result.success) {
        strapi.log.error(`❌ Error descargando PDF: ${result.error}`);
        return {
          success: false,
          message: '❌ Error descargando PDF',
          error: result.error,
          timestamp: new Date().toISOString(),
        };
      }

      strapi.log.info('✅ PDF descargado correctamente desde Factus');

      return {
        success: true,
        message: '✅ PDF obtenido',
        data: result.data, // Devuelve el objeto completo con file_name, pdf_base_64_encoded, etc.
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      strapi.log.error('❌ Error inesperado descargando PDF:', error);
      return {
        success: false,
        message: '❌ Error descargando PDF',
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      };
    }
  },

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