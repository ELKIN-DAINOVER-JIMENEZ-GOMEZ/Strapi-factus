/**
 * Controlador de Emisión de Facturas a Factus
 * Ubicación: src/api/factus/controllers/factus-emission.ts
 * 
 * Este controlador maneja SOLAMENTE la emisión de facturas ya creadas en Strapi
 */

import type { Context } from 'koa';

export default {
  /**
   * 🚀 Emitir factura a Factus/DIAN
   * 
   * Endpoint: POST /api/factus/emit-invoice
   * Body: { invoiceId: number }
   * 
   * Flujo:
   * 1. Recibe ID de factura existente en Strapi
   * 2. Valida que la factura exista y esté en borrador
   * 3. Llama al servicio de emisión
   * 4. Retorna respuesta
   */
  async emitInvoice(ctx: Context) {
    try {
      // ✅ PASO 1: Validar que venga el invoiceId
      const { invoiceId } = ctx.request.body as { invoiceId?: number };

      if (!invoiceId) {
        ctx.badRequest('❌ invoiceId es requerido en el body');
        return;
      }

      strapi.log.info(`🚀 [API] Solicitud de emisión para factura ${invoiceId}`);

      // ✅ PASO 2: Verificar que la factura exista
      const invoice = await strapi.entityService.findOne(
        'api::invoice.invoice',
        invoiceId,
        { populate: ['client', 'invoice_items'] }
      );

      if (!invoice) {
        ctx.notFound(`❌ Factura ${invoiceId} no encontrada`);
        return;
      }

      // ✅ PASO 3: Validar estado
      const invoiceData = invoice as any;
      
      if (invoiceData.estado_local && invoiceData.estado_local !== 'Borrador') {
        ctx.badRequest(
          `❌ La factura está en estado "${invoiceData.estado_local}". ` +
          'Solo se pueden emitir facturas en estado "Borrador"'
        );
        return;
      }

      // ✅ PASO 4: Llamar al servicio de emisión
      const emissionService = strapi.service('api::factus.factus-emission');
      const result = await emissionService.emitInvoice(invoiceId);

      // ✅ PASO 5: Retornar respuesta
      if (result.success) {
        ctx.send({
          success: true,
          message: result.message,
          data: result.data,
          timestamp: result.timestamp,
        });
      } else {
        ctx.send(
          {
            success: false,
            message: result.message,
            error: result.error,
            timestamp: result.timestamp,
          },
          400
        );
      }
    } catch (error) {
      strapi.log.error('❌ [API] Error en emisión:', error);
      
      ctx.send(
        {
          success: false,
          message: '❌ Error emitiendo factura',
          error: (error as Error).message,
          timestamp: new Date().toISOString(),
        },
        500
      );
    }
  },

  /**
   * 🔍 Consultar estado de factura
   * 
   * Endpoint: GET /api/factus/invoice-status/:documentId
   */
  async getInvoiceStatus(ctx: Context) {
    try {
      const { documentId } = ctx.params;

      if (!documentId) {
        ctx.badRequest('❌ documentId es requerido');
        return;
      }

      strapi.log.info(`🔍 [API] Consultando estado de documento ${documentId}`);

      const emissionService = strapi.service('api::factus.factus-emission');
      const result = await emissionService.getInvoiceStatus(documentId);

      if (result.success) {
        ctx.send({
          success: true,
          data: result.data,
        });
      } else {
        ctx.send(
          {
            success: false,
            error: result.error,
          },
          400
        );
      }
    } catch (error) {
      strapi.log.error('❌ [API] Error consultando estado:', error);
      ctx.internalServerError('Error consultando estado de factura');
    }
  },

  /**
   * 📄 Descargar PDF
   * 
   * Endpoint: GET /api/factus/download-pdf/:documentId
   */
  async downloadPDF(ctx: Context) {
    try {
      const { documentId } = ctx.params;

      if (!documentId) {
        ctx.badRequest('❌ documentId es requerido');
        return;
      }

      const emissionService = strapi.service('api::factus.factus-emission');
      const result = await emissionService.downloadPDF(documentId);

      if (result.success) {
        ctx.send({
          success: true,
          data: result.data,
        });
      } else {
        ctx.send(
          {
            success: false,
            error: result.error,
          },
          400
        );
      }
    } catch (error) {
      strapi.log.error('❌ [API] Error descargando PDF:', error);
      ctx.internalServerError('Error descargando PDF');
    }
  },

  /**
   * 📋 Listar facturas emitidas
   * 
   * Endpoint: GET /api/factus/list-invoices
   */
  async listInvoices(ctx: Context) {
    try {
      const { desde, hasta, estado } = ctx.query;

      const emissionService = strapi.service('api::factus.factus-emission');
      const result = await emissionService.listInvoices({
        desde: desde as string,
        hasta: hasta as string,
        estado: estado as string,
      });

      if (result.success) {
        ctx.send({
          success: true,
          data: result.data,
        });
      } else {
        ctx.send(
          {
            success: false,
            error: result.error,
          },
          400
        );
      }
    } catch (error) {
      strapi.log.error('❌ [API] Error listando facturas:', error);
      ctx.internalServerError('Error listando facturas');
    }
  },
};