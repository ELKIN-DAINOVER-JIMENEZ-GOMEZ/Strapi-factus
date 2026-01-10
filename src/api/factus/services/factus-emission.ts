/**
 * Servicio de Emisión de Facturas - VERSIÓN CORREGIDA
 * Ubicación: src/api/factus/services/factus-emission.ts
 * 
 * ✅ FIX: Retornar document_id de Factus para descarga de PDF
 */

import type {FactusConfig, FactusOperationResult } from '../types/factus.types';

// Función para extraer factus_id de respuesta
function extractFactusId(response: any): string | null {
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
}

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
        invoice.client.ciudad_codigo = '11001';
      }

      if (!invoice.client.ciudad) {
        invoice.client.ciudad = 'Bogotá';
      }

      if (!invoice.client.departamento) {
        invoice.client.departamento = 'Bogotá D.C.';
      }

      if (!invoice.client.telefono) {
        invoice.client.telefono = '0000000';
      }

      // 3. Mapear factura al formato Factus
      const payload = await mapperService.mapInvoiceToFactus(invoiceId);

      // 4. Validar payload antes de enviar
      const senderService = strapi.service('api::factus.factus-sender');
      const payloadValidation = senderService.validatePayload(payload);

      if (!payloadValidation.valid) {
        return {
          success: false,
          message: '❌ Payload inválido',
          error: payloadValidation.errors.join(', '),
          timestamp: new Date().toISOString(),
        };
      }

      // 5. Obtener token y enviar
      const authService = strapi.service('api::factus.factus-auth');
      const token = await authService.getToken();

      const sendResult = await senderService.sendInvoice(payload, {
        timeout: 30000,
        retries: 2,
        retryDelay: 2000,
      });

      if (!sendResult.success) {
        // ✅ Manejo especial para error 409 - Factura pendiente
        const is409Conflict = sendResult.statusCode === 409;
        const isPendingInvoice = sendResult.error?.includes('factura pendiente') || 
                                 sendResult.data?.message?.includes('factura pendiente');
        
        let userFriendlyMessage = sendResult.error || 'Error enviando factura';
        let userFriendlyError = sendResult.error || 'Error enviando factura';
        
        if (is409Conflict || isPendingInvoice) {
          userFriendlyMessage = '⚠️ Hay una factura pendiente por enviar a la DIAN';
          userFriendlyError = 'Existe una factura anterior pendiente de envío a la DIAN. ' +
                             'Por favor, ingrese al panel de Factus (sandbox.factus.com.co) y ' +
                             'envíe o cancele la factura pendiente antes de crear una nueva.';
        }
        
        await this.updateInvoiceStatus(
          invoiceId,
          sendResult.data || {},
          'fallida',
          [{ message: userFriendlyError }]
        );

        return {
          success: false,
          message: userFriendlyMessage,
          error: userFriendlyError,
          statusCode: sendResult.statusCode,
          timestamp: new Date().toISOString(),
        };
      }

      // ✅ CRÍTICO: Extraer el "number" correcto de la respuesta de Factus
      // Usamos la función extractFactusId de utils para consistencia
      const factusNumber = extractFactusId(sendResult.data);

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
      try {
        const errorMessage = (error as Error).message || 'Error desconocido';
        await this.updateInvoiceStatus(
          invoiceId,
          {},
          'fallida',
          [{ message: errorMessage }]
        );
      } catch (updateError) {
        // Error actualizando factura con error
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
      
      // 🔑 EXTRACCIÓN DEL factus_id usando función compartida
      const factusDocumentId = extractFactusId(factusResponse);
      const factusBillId = factusResponse?.data?.bill?.id 
        ? Number(factusResponse.data.bill.id) 
        : undefined;

      if (factusDocumentId || factusBillId) {
        // ✅ IMPORTANTE: Guardar el bill.id único de Factus (factusBillId)
        // Este ID es único para cada factura incluso en sandbox
        updateData.factus_id = factusDocumentId;
        updateData.factus_bill_id = factusBillId; // ID único de Factus
        
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
    
  } catch (error) {
    throw error;
  }
},

  async getInvoiceStatus(factusId: string): Promise<FactusOperationResult<any>> {
    try {
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
      const senderService = strapi.service('api::factus.factus-sender');
      const result = await senderService.downloadPDF(factusId);

      if (!result.success) {
        return {
          success: false,
          message: '❌ Error descargando PDF',
          error: result.error,
          timestamp: new Date().toISOString(),
        };
      }

      return {
        success: true,
        message: '✅ PDF obtenido',
        data: result.data, // Devuelve el objeto completo con file_name, pdf_base_64_encoded, etc.
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