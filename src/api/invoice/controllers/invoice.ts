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

      // Obtener facturas con relaciones
      const invoices = await strapi.entityService.findMany('api::invoice.invoice', {
        filters,
        populate: {
          client: true,
          invoice_items: {
            populate: {
              product: true
            }
          }
        },
        sort: { createdAt: 'desc' },
        start: (Number(page) - 1) * Number(pageSize),
        limit: Number(pageSize),
      });

      // Obtener total para paginación
      const total = await strapi.entityService.count('api::invoice.invoice', {
        filters
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

      const invoice = await strapi.entityService.findOne('api::invoice.invoice', id, {
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
  }
}));
