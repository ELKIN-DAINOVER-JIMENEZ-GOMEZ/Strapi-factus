/**
 * credit-note controller
 * 
 * Controlador para la gestión de notas crédito
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::credit-note.credit-note', ({ strapi }) => ({
  /**
   * Listar todas las notas crédito con paginación
   */
  async findAll(ctx) {
    try {
      const { page = 1, pageSize = 25, estado } = ctx.query;

      // Construir filtros
      const filters: any = {};
      if (estado) {
        filters.estado_local = estado;
      }

      // Usar db.query para mejor control sobre las relaciones (igual que en facturas)
      const creditNotes = await strapi.db.query('api::credit-note.credit-note').findMany({
        where: filters,
        populate: {
          client: true,
          invoice: true,
          credit_note_items: {
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
      console.log('📋 Notas Crédito encontradas:', creditNotes.length);
      creditNotes.forEach((nc: any) => {
        console.log(`  - NC ID ${nc.id}: client_id =`, nc.client?.id, '| nombre =', nc.client?.nombre_completo || 'SIN CLIENTE');
      });

      const total = await strapi.db.query('api::credit-note.credit-note').count({
        where: filters
      });

      ctx.body = {
        data: creditNotes,
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
      console.error('❌ Error listando notas crédito:', error);
      ctx.throw(500, 'Error al obtener notas crédito');
    }
  },

  /**
   * Obtener una nota crédito por ID
   */
  async findById(ctx) {
    try {
      const { id } = ctx.params;

      // Usar db.query para mejor control sobre las relaciones
      const creditNote = await strapi.db.query('api::credit-note.credit-note').findOne({
        where: { id: Number(id) },
        populate: {
          client: true,
          invoice: true,
          credit_note_items: {
            populate: {
              product: true
            }
          }
        }
      });

      if (!creditNote) {
        return ctx.notFound('Nota crédito no encontrada');
      }

      ctx.body = {
        data: creditNote
      };
    } catch (error) {
      ctx.throw(500, 'Error al obtener nota crédito');
    }
  },

  /**
   * Crear una nueva nota crédito (sin emitir)
   */
  async createCreditNote(ctx) {
    try {
      const { body } = ctx.request;
      
      // Crear nueva nota crédito

      // Validar datos requeridos
      if (!body.invoiceId) {
        return ctx.badRequest('Se requiere la factura a la que se aplica la nota crédito');
      }

      if (!body.motivo_correccion) {
        return ctx.badRequest('Se requiere el motivo de corrección');
      }

      if (!body.items || body.items.length === 0) {
        return ctx.badRequest('Se requiere al menos un item');
      }

      // Obtener la factura referenciada usando db.query (funciona mejor en Strapi v5)
      const invoice = await strapi.db.query('api::invoice.invoice').findOne({
        where: { id: body.invoiceId },
        populate: {
          client: true,
          invoice_items: {
            populate: {
              product: true
            }
          }
        }
      }) as any;

      // Factura referenciada obtenida

      if (!invoice) {
        return ctx.notFound('Factura no encontrada');
      }

      // Validar que la factura tenga cliente
      if (!invoice.client || !invoice.client.id) {
        // La factura no tiene cliente asociado
        return ctx.badRequest('La factura seleccionada no tiene cliente asociado. Por favor, asocie un cliente a la factura primero.');
      }

      // Factura encontrada con cliente

      // Generar número de nota crédito
      const config = await strapi.db.query('api::factus-config.factus-config').findOne({
        where: {}
      }) as any;

      const prefijo = config?.prefijo_nota_credito || 'NC';
      const consecutivo = (config?.consecutivo_actual_nc || 0) + 1;
      const numeroNota = `${prefijo}-${String(consecutivo).padStart(6, '0')}`;

      // Calcular totales
      let subtotal = 0;
      let totalIva = 0;
      let totalDescuentos = 0;

      const itemsData = body.items.map((item: any) => {
        const cantidad = parseFloat(item.cantidad);
        const precioUnitario = parseFloat(item.precio_unitario);
        const descuentoPorcentaje = parseFloat(item.descuento_porcentaje || 0);
        const ivaPorcentaje = parseFloat(item.iva_porcentaje || 0);

        const subtotalItem = cantidad * precioUnitario;
        const descuentoItem = subtotalItem * (descuentoPorcentaje / 100);
        const baseGravable = subtotalItem - descuentoItem;
        const ivaItem = baseGravable * (ivaPorcentaje / 100);
        const totalItem = baseGravable + ivaItem;

        subtotal += baseGravable;
        totalIva += ivaItem;
        totalDescuentos += descuentoItem;

        return {
          codigo_producto: item.codigo_producto,
          nombre_producto: item.nombre_producto,
          cantidad,
          precio_unitario: precioUnitario,
          descuento_porcentaje: descuentoPorcentaje,
          descuento_valor: descuentoItem,
          iva_porcentaje: ivaPorcentaje,
          iva_valor: ivaItem,
          subtotal: subtotalItem,
          total: totalItem,
          product: item.productId || null
        };
      });

      const total = subtotal + totalIva;

      // Crear nota crédito usando db.query para mejor control de relaciones
      console.log('📝 Creando nota crédito con cliente ID:', invoice.client.id, '| Factura ID:', invoice.id);
      
      const creditNote = await strapi.db.query('api::credit-note.credit-note').create({
        data: {
          numero_nota: numeroNota,
          prefijo,
          consecutivo,
          fecha_emision: new Date(),
          motivo_correccion: body.motivo_correccion,
          concepto_correccion_id: body.concepto_correccion_id || 5,
          descripcion_correccion: body.descripcion_correccion || body.motivo_correccion,
          subtotal,
          total_iva: totalIva,
          total_descuentos: totalDescuentos,
          total,
          estado_local: 'Borrador',
          observaciones: body.observaciones || '',
          client: invoice.client.id,
          invoice: invoice.id,
        }
      }) as any;
      
      console.log('✅ Nota crédito creada con ID:', creditNote.id);

      // Crear items de la nota crédito
      for (const itemData of itemsData) {
        await strapi.entityService.create('api::credit-note-item.credit-note-item', {
          data: {
            ...itemData,
            credit_note: creditNote.id
          }
        });
      }

      // Actualizar consecutivo en config
      if (config) {
        await strapi.db.query('api::factus-config.factus-config').update({
          where: { id: config.id },
          data: {
            consecutivo_actual_nc: consecutivo
          } as any
        });
      }

      // Obtener nota crédito con relaciones usando db.query
      const createdCreditNote = await strapi.db.query('api::credit-note.credit-note').findOne({
        where: { id: creditNote.id },
        populate: {
          client: true,
          invoice: true,
          credit_note_items: {
            populate: { product: true }
          }
        }
      });

      console.log('📋 Nota crédito creada - Cliente:', createdCreditNote?.client?.nombre_completo || 'SIN CLIENTE');

      ctx.body = {
        success: true,
        message: 'Nota crédito creada exitosamente',
        data: createdCreditNote
      };

    } catch (error: any) {
      ctx.throw(500, error.message || 'Error al crear nota crédito');
    }
  },

  /**
   * Emitir nota crédito a Factus
   */
  async emit(ctx) {
    try {
      const { id } = ctx.params;

      // Emitir nota crédito

      // Verificar que existe usando db.query para obtener relaciones correctamente
      const creditNote = await strapi.db.query('api::credit-note.credit-note').findOne({
        where: { id: Number(id) },
        populate: {
          client: true,
          invoice: true,
          credit_note_items: { populate: { product: true } }
        }
      }) as any;

      if (!creditNote) {
        return ctx.notFound('Nota crédito no encontrada');
      }

      // Nota crédito encontrada

      if (creditNote.estado_local === 'Enviada') {
        return ctx.badRequest('Esta nota crédito ya fue emitida');
      }

      // Verificar que la factura referenciada fue emitida
      if (!creditNote.invoice?.factus_id) {
        return ctx.badRequest('La factura referenciada no ha sido emitida a Factus');
      }

      // Emitir a Factus
      const emissionService = strapi.service('api::credit-note.credit-note-emission');
      const result = await emissionService.emitCreditNote(Number(id));

      if (!result.success) {
        return ctx.badRequest(result.error || 'Error al emitir nota crédito');
      }

      ctx.body = {
        success: true,
        message: 'Nota crédito emitida exitosamente',
        data: result.data
      };

    } catch (error: any) {
      ctx.throw(500, error.message || 'Error al emitir nota crédito');
    }
  },

  /**
   * Descargar PDF de nota crédito
   */
  async downloadPDF(ctx) {
    try {
      const { id } = ctx.params;

      const creditNote = await strapi.entityService.findOne('api::credit-note.credit-note', id) as any;

      if (!creditNote) {
        return ctx.notFound('Nota crédito no encontrada');
      }

      // Priorizar public_url si existe
      if (creditNote.public_url) {
        ctx.body = {
          success: true,
          redirectUrl: creditNote.public_url
        };
        return;
      }

      if (!creditNote.factus_id) {
        return ctx.badRequest('Esta nota crédito no ha sido emitida a Factus');
      }

      const senderService = strapi.service('api::credit-note.credit-note-sender');
      const result = await senderService.downloadCreditNotePDF(creditNote.factus_id);

      if (!result.success) {
        if (result.redirectUrl) {
          ctx.body = {
            success: true,
            redirectUrl: result.redirectUrl
          };
          return;
        }
        return ctx.badRequest(result.error || 'Error descargando PDF');
      }

      if (result.redirectUrl) {
        ctx.body = {
          success: true,
          redirectUrl: result.redirectUrl
        };
        return;
      }

      // Retornar PDF como blob
      ctx.set('Content-Type', 'application/pdf');
      ctx.set('Content-Disposition', `attachment; filename="NotaCredito_${creditNote.numero_nota}.pdf"`);
      ctx.body = result.data;

    } catch (error: any) {
      ctx.throw(500, error.message || 'Error al descargar PDF');
    }
  },

  /**
   * Obtener estadísticas de notas crédito
   */
  async getStats(ctx) {
    try {
      const creditNotes = await strapi.entityService.findMany('api::credit-note.credit-note', {
        fields: ['estado_local', 'total'],
      }) as any[];

      const stats = {
        total: creditNotes.length,
        borradores: creditNotes.filter(nc => nc.estado_local === 'Borrador').length,
        enviadas: creditNotes.filter(nc => nc.estado_local === 'Enviada').length,
        errores: creditNotes.filter(nc => nc.estado_local === 'Error').length,
        montoTotal: creditNotes
          .filter(nc => nc.estado_local === 'Enviada')
          .reduce((sum, nc) => sum + (nc.total || 0), 0),
      };

      ctx.body = {
        success: true,
        data: stats
      };

    } catch (error: any) {
      ctx.throw(500, 'Error al obtener estadísticas');
    }
  },

  /**
   * Reparar notas crédito sin cliente (asocia cliente de la factura)
   */
  async repairClientAssociation(ctx) {
    try {
      const { id } = ctx.params;

      // Obtener nota crédito con relaciones
      const creditNote = await strapi.entityService.findOne('api::credit-note.credit-note', id, {
        populate: {
          client: true,
          invoice: {
            populate: { client: true }
          }
        }
      }) as any;

      if (!creditNote) {
        return ctx.notFound('Nota crédito no encontrada');
      }

      // Si ya tiene cliente, no hacer nada
      if (creditNote.client?.id) {
        return ctx.body = {
          success: true,
          message: 'La nota crédito ya tiene cliente asociado',
          data: creditNote
        };
      }

      // Verificar que la factura tenga cliente
      if (!creditNote.invoice?.client?.id) {
        return ctx.badRequest('La factura asociada no tiene cliente');
      }

      // Actualizar nota crédito con el cliente de la factura
      const updatedCreditNote = await strapi.entityService.update('api::credit-note.credit-note', id, {
        data: {
          client: creditNote.invoice.client.id
        },
        populate: {
          client: true,
          invoice: true
        }
      });

      // Nota crédito reparada - cliente asociado
      ctx.body = {
        success: true,
        message: 'Cliente asociado exitosamente',
        data: updatedCreditNote
      };

    } catch (error: any) {
      ctx.throw(500, error.message || 'Error al reparar nota crédito');
    }
  }
}));
