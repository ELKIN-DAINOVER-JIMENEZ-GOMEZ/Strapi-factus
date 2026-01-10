/**
 * invoice controller
 * Con métodos personalizados para listar facturas
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::invoice.invoice', ({ strapi }) => ({
  /**
   * Listar todas las facturas con paginación
   */
  async findAll(ctx) {
    try {
      const { page = 1, pageSize = 25, estado } = ctx.query;

      // Construir filtros
      const filters: any = {};
      if (estado) {
        filters.estado_local = { $eq: estado };
      }

      // Obtener facturas con relaciones usando db.query para mejor control
      // Esto nos permite traer las relaciones sin importar el estado de publicación
      const invoices = await strapi.db.query('api::invoice.invoice').findMany({
        where: filters,
        populate: {
          client: true,
          invoice_items: {
            populate: {
              product: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        offset: (Number(page) - 1) * Number(pageSize),
        limit: Number(pageSize),
      });

      // Debug: mostrar datos de clientes en consola
      console.log('📋 Facturas encontradas:', invoices.length);
      invoices.forEach((inv: any) => {
        console.log(`  - Factura ID ${inv.id}: client_id en DB =`, inv.client?.id, '| nombre =', inv.client?.nombre_completo || 'SIN CLIENTE');
      });

      // Obtener total para paginación
      const total = await strapi.db.query('api::invoice.invoice').count({
        where: filters
      });

      ctx.body = {
        data: invoices,
        meta: {
          pagination: {
            page: Number(page),
            pageSize: Number(pageSize),
            pageCount: Math.ceil(total / Number(pageSize)),
            total
          }
        }
      };
    } catch (error) {
      console.error('❌ Error listando facturas:', error);
      ctx.throw(500, 'Error al obtener facturas');
    }
  },

  /**
   * Obtener una factura por ID
   */
  async findById(ctx) {
    try {
      const { id } = ctx.params;

      // Usar db.query para mejor control sobre las relaciones
      const invoice = await strapi.db.query('api::invoice.invoice').findOne({
        where: { id },
        populate: {
          client: true,
          invoice_items: {
            populate: {
              product: true
            }
          }
        }
      });

      if (!invoice) {
        return ctx.notFound('Factura no encontrada');
      }

      ctx.body = {
        data: invoice
      };
    } catch (error) {
      console.error('❌ Error obteniendo factura:', error);
      ctx.throw(500, 'Error al obtener factura');
    }
  },

  /**
   * Diagnóstico: Obtener facturas sin cliente asignado
   */
  async findWithoutClient(ctx) {
    try {
      // Buscar facturas donde client es null
      const invoicesWithoutClient = await strapi.db.query('api::invoice.invoice').findMany({
        where: {
          client: null
        },
        populate: {
          client: true
        },
        orderBy: { createdAt: 'desc' }
      });

      // Obtener todos los clientes disponibles para asignación
      const clients = await strapi.db.query('api::client.client').findMany({
        select: ['id', 'nombre_completo', 'numero_documento']
      });

      ctx.body = {
        data: {
          invoicesWithoutClient: invoicesWithoutClient.map((inv: any) => ({
            id: inv.id,
            numero_factura: inv.numero_factura,
            fecha_emision: inv.fecha_emision,
            total: inv.total
          })),
          totalWithoutClient: invoicesWithoutClient.length,
          availableClients: clients
        }
      };
    } catch (error) {
      console.error('❌ Error en diagnóstico:', error);
      ctx.throw(500, 'Error en diagnóstico');
    }
  },

  /**
   * Asignar cliente a una factura existente
   */
  async assignClient(ctx) {
    try {
      const { invoiceId, clientId } = ctx.request.body;

      if (!invoiceId || !clientId) {
        return ctx.badRequest('Se requiere invoiceId y clientId');
      }

      // Verificar que la factura existe
      const invoice = await strapi.db.query('api::invoice.invoice').findOne({
        where: { id: invoiceId }
      });

      if (!invoice) {
        return ctx.notFound('Factura no encontrada');
      }

      // Verificar que el cliente existe
      const client = await strapi.db.query('api::client.client').findOne({
        where: { id: clientId }
      });

      if (!client) {
        return ctx.notFound('Cliente no encontrado');
      }

      // Actualizar la factura con el cliente
      const updatedInvoice = await strapi.db.query('api::invoice.invoice').update({
        where: { id: invoiceId },
        data: {
          client: clientId
        },
        populate: {
          client: true
        }
      });

      console.log(`✅ Cliente ${client.nombre_completo} asignado a factura ${invoiceId}`);

      ctx.body = {
        data: updatedInvoice,
        message: `Cliente "${client.nombre_completo}" asignado correctamente a la factura`
      };
    } catch (error) {
      console.error('❌ Error asignando cliente:', error);
      ctx.throw(500, 'Error asignando cliente');
    }
  }
}));
