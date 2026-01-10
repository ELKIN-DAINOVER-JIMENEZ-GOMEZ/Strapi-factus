/**
 * Servicio de Emisión de Notas Crédito - Factus API
 * Ubicación: src/api/credit-note/services/credit-note-emission.ts
 * 
 * Emite notas crédito a través de la API de Factus
 */

interface FactusCreditNoteResponse {
  number?: string;
  id?: number;
  document_id?: string;
  uuid?: string;
  status?: string;
  cude?: string;
  qr_code?: string;
  pdf_url?: string;
  xml_url?: string;
  message?: string;
  errors?: Array<{
    field?: string;
    message: string;
  }>;
  data?: {
    credit_note?: {
      number?: string;
      id?: string | number;
      cude?: string;
      qr?: string;
      pdf_url?: string;
      xml_url?: string;
      public_url?: string;
    };
  };
}

interface CreditNoteOperationResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
  timestamp: string;
}

export default {
  /**
   * Emite una nota crédito a Factus API
   */
  async emitCreditNote(creditNoteId: number): Promise<CreditNoteOperationResult> {
    try {
      // 1. Validar nota crédito
      const mapperService = strapi.service('api::credit-note.credit-note-mapper');
      const validation = await mapperService.validateCreditNote(creditNoteId);

      if (!validation.valid) {
        // Validación fallida, devolver errores
        return {
          success: false,
          message: '❌ Nota crédito inválida',
          error: validation.errors.join(', '),
          timestamp: new Date().toISOString(),
        };
      }


      // 2. Obtener nota crédito con relaciones
      const creditNote = await strapi.db.query('api::credit-note.credit-note').findOne({
        where: { id: creditNoteId },
        populate: {
          client: true,
          invoice: true,
          credit_note_items: {
            populate: {
              product: true,
            },
          },
        },
      }) as any;

      // Completar datos por defecto del cliente si es necesario
      if (creditNote.client) {
        if (!creditNote.client.ciudad_codigo) {
          creditNote.client.ciudad_codigo = '11001';
        }
        if (!creditNote.client.telefono) {
          creditNote.client.telefono = '0000000';
        }
      }

      // 3. Mapear nota crédito al formato Factus
      const payload = await mapperService.mapCreditNoteToFactus(creditNoteId);

      // Nota crédito mapeada a payload

      // 4. Validar payload antes de enviar
      const senderService = strapi.service('api::credit-note.credit-note-sender');
      const payloadValidation = senderService.validatePayload(payload);

      if (!payloadValidation.valid) {
        return {
          success: false,
          message: '❌ Payload inválido',
          error: payloadValidation.errors.join(', '),
          timestamp: new Date().toISOString(),
        };
      }
      // 5. Enviar a Factus

      const sendResult = await senderService.sendCreditNote(payload, {
        timeout: 30000,
        retries: 2,
        retryDelay: 2000,
      });

      if (!sendResult.success) {
        await this.updateCreditNoteStatus(
          creditNoteId,
          sendResult.data || {},
          'fallida',
          [{ message: sendResult.error || 'Error enviando nota crédito' }]
        );

        return {
          success: false,
          message: '❌ Error al emitir nota crédito',
          error: sendResult.error || 'Error enviando nota crédito',
          timestamp: new Date().toISOString(),
        };
      }

      // Extraer el número de nota crédito de la respuesta
      const factusNumber = sendResult.data?.data?.credit_note?.number ||
                          sendResult.data?.number ||
                          sendResult.data?.data?.credit_note?.id?.toString() ||
                          sendResult.data?.document_id ||
                          sendResult.data?.id?.toString();

      if (!factusNumber) {
        // No se encontró número en respuesta de Factus
      }

      // 6. Actualizar nota crédito en Strapi
      await this.updateCreditNoteStatus(creditNoteId, sendResult.data, 'exitosa');

      return {
        success: true,
        message: 'Nota crédito emitida exitosamente',
        data: {
          ...sendResult.data,
          number: factusNumber,
        },
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      try {
        const errorMessage = (error as Error).message || 'Error desconocido';
        await this.updateCreditNoteStatus(
          creditNoteId,
          {},
          'fallida',
          [{ message: errorMessage }]
        );
      } catch (_) {
        // Ignorar error en actualización de estado
      }

      return {
        success: false,
        message: 'Error al emitir nota crédito',
        error: (error as Error).message || 'Error desconocido',
        timestamp: new Date().toISOString(),
      };
    }
  },

  /**
   * Actualiza el estado de la nota crédito después de la emisión
   */
  async updateCreditNoteStatus(
    creditNoteId: number,
    factusResponse: FactusCreditNoteResponse,
    status: 'exitosa' | 'fallida',
    errors?: Array<{ field?: string; message: string }>
  ): Promise<void> {
    try {
      const updateData: any = {
        fecha_envio_dian: new Date(),
        respuesta_factus: factusResponse,
      };

      const currentCreditNote = await strapi.entityService.findOne(
        'api::credit-note.credit-note',
        creditNoteId
      ) as any;

      updateData.intentos_envio = (currentCreditNote.intentos_envio || 0) + 1;

      if (status === 'exitosa') {
        updateData.estado_local = 'Enviada';
        updateData.estado_dian = factusResponse.status || 'Enviado';
        
        // Extraer factus_id
        let factusDocumentId: string | undefined;
        let factusBillId: number | undefined;
        
        if (factusResponse?.data?.credit_note?.id) {
          factusBillId = Number(factusResponse.data.credit_note.id);
        }
        
        if (factusResponse?.number) {
          factusDocumentId = String(factusResponse.number).trim();
        } else if (factusResponse?.data?.credit_note?.number) {
          factusDocumentId = String(factusResponse.data.credit_note.number).trim();
        }
        
        if (factusDocumentId) {
          updateData.factus_id = factusDocumentId;
        }
        
        if (factusBillId) {
          updateData.factus_bill_id = factusBillId;
        }
        
        // Guardar CUDE
        if (factusResponse?.data?.credit_note?.cude) {
          updateData.cude = factusResponse.data.credit_note.cude;
        }
        
        // Guardar URL pública
        if (factusResponse?.data?.credit_note?.public_url) {
          updateData.public_url = factusResponse.data.credit_note.public_url;
        }
        
        // Guardar QR
        if (factusResponse?.data?.credit_note?.qr) {
          updateData.qr_code = factusResponse.data.credit_note.qr;
        }

        // Nota crédito actualizada como exitosa

      } else {
        updateData.estado_local = 'Error';
        updateData.estado_dian = 'Rechazado';
        
        if (errors && errors.length > 0) {
          updateData.errores_validacion = errors.map(e => e.message);
        }
        
        // Nota crédito actualizada como fallida
      }

      await strapi.entityService.update(
        'api::credit-note.credit-note',
        creditNoteId,
        { data: updateData }
      );

    } catch (error) {
      throw error;
    }
  },
};
