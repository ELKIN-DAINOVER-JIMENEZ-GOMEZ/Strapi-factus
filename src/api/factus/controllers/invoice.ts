/**
 * Controlador Custom de Facturas
 * Ubicación: src/api/invoice/controllers/invoice.ts
 * 
 * Override del controlador por defecto para manejar
 * la creación de facturas con items
 */

export default {
  /**
   * 📝 Crear factura con items
   * 
   * Override del método create para manejar la relación oneToMany
   * con invoice_items de forma correcta
   */
  async create(ctx) {
    try {
      strapi.log.info('📝 [INVOICE] Creando nueva factura...');

      const { data } = ctx.request.body;

      if (!data) {
        return ctx.badRequest('No se enviaron datos');
      }

      strapi.log.debug('📦 Datos recibidos:', data);

      // ═══════════════════════════════════════════════════════════
      // PASO 1: Validar datos requeridos
      // ═══════════════════════════════════════════════════════════
      const requiredFields = ['client', 'fecha_emision', 'total', 'subtotal'];
      const missingFields = requiredFields.filter(field => !data[field]);

      if (missingFields.length > 0) {
        return ctx.badRequest(`Campos requeridos faltantes: ${missingFields.join(', ')}`);
      }

      // ═══════════════════════════════════════════════════════════
      // PASO 2: Extraer invoice_items si vienen en el payload
      // ═══════════════════════════════════════════════════════════
      const { invoice_items, ...invoiceData } = data;

      strapi.log.info(`📋 Factura con ${invoice_items?.length || 0} items`);

      // ═══════════════════════════════════════════════════════════
      // PASO 3: Crear la factura (sin items aún)
      // ═══════════════════════════════════════════════════════════
      const invoice = await strapi.entityService.create(
        'api::invoice.invoice',
        {
          data: {
            ...invoiceData,
            estado_local: invoiceData.estado_local || 'Borrador',
            publishedAt: new Date(), // Auto-publicar
          },
        }
      );

      strapi.log.info(`✅ Factura creada con ID: ${invoice.id}`);

      // ═══════════════════════════════════════════════════════════
      // PASO 4: Crear los items asociados (si hay)
      // ═══════════════════════════════════════════════════════════
      if (invoice_items && Array.isArray(invoice_items) && invoice_items.length > 0) {
        strapi.log.info(`📦 Creando ${invoice_items.length} items...`);

        const createdItems = [];

        for (const [index, itemData] of invoice_items.entries()) {
          try {
            // Validar que el item tenga los campos requeridos
            if (!itemData.codigo_producto || !itemData.nombre_producto) {
              strapi.log.warn(`⚠️ Item ${index + 1} sin código o nombre, saltando...`);
              continue;
            }

            const item = await strapi.entityService.create(
              'api::invoice-item.invoice-item',
              {
                data: {
                  ...itemData,
                  invoice: invoice.id, // Asociar con la factura
                  orden: itemData.orden || index + 1,
                  publishedAt: new Date(),
                },
              }
            );

            createdItems.push(item);
            strapi.log.debug(`✅ Item ${index + 1} creado: ${item.nombre_producto}`);
          } catch (itemError) {
            strapi.log.error(`❌ Error creando item ${index + 1}:`, itemError);
            // Continuar con los demás items
          }
        }

        strapi.log.info(`✅ ${createdItems.length} items creados`);
      }

      // ═══════════════════════════════════════════════════════════
      // PASO 5: Obtener la factura completa con todas las relaciones
      // ═══════════════════════════════════════════════════════════
      const fullInvoice = await strapi.entityService.findOne(
        'api::invoice.invoice',
        invoice.id,
        {
          populate: {
            client: true,
            invoice_items: {
              populate: {
                product: true,
              },
            },
            numering_range: true,
          },
        }
      );

      strapi.log.info('✅ Factura creada exitosamente con todos sus items');

      // Retornar en formato Strapi
      ctx.send({
        data: fullInvoice,
        meta: {},
      });

    } catch (error) {
      strapi.log.error('❌ Error creando factura:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      
      ctx.badRequest(`Error creando factura: ${errorMessage}`, {
        error: errorMessage,
        details: error,
      });
    }
  },

  /**
   * 📝 Actualizar factura con items
   * 
   * Similar al create, pero para actualización
   */
  async update(ctx) {
    try {
      const { id } = ctx.params;
      const { data } = ctx.request.body;

      if (!data) {
        return ctx.badRequest('No se enviaron datos');
      }

      strapi.log.info(`📝 [INVOICE] Actualizando factura ${id}...`);

      // Extraer items
      const { invoice_items, ...invoiceData } = data;

      // Actualizar factura
      const invoice = await strapi.entityService.update(
        'api::invoice.invoice',
        id,
        {
          data: invoiceData,
        }
      );

      // Si hay items nuevos, crearlos
      if (invoice_items && Array.isArray(invoice_items)) {
        strapi.log.info(`📦 Actualizando items...`);

        // Aquí podrías implementar lógica para:
        // 1. Eliminar items antiguos
        // 2. Crear nuevos items
        // 3. Actualizar items existentes

        // Por simplicidad, solo creamos nuevos
        for (const [index, itemData] of invoice_items.entries()) {
          if (!itemData.id) {
            // Item nuevo
            await strapi.entityService.create(
              'api::invoice-item.invoice-item',
              {
                data: {
                  ...itemData,
                  invoice: id,
                  orden: itemData.orden || index + 1,
                  publishedAt: new Date(),
                },
              }
            );
          }
        }
      }

      // Obtener factura completa
      const fullInvoice = await strapi.entityService.findOne(
        'api::invoice.invoice',
        id,
        {
          populate: {
            client: true,
            invoice_items: {
              populate: {
                product: true,
              },
            },
            numering_range: true,
          },
        }
      );

      ctx.send({
        data: fullInvoice,
        meta: {},
      });

    } catch (error) {
      strapi.log.error('❌ Error actualizando factura:', error);
      ctx.badRequest(`Error actualizando factura: ${(error as Error).message}`);
    }
  },

  /**
   * 🔍 Find con populate correcto
   */
  async find(ctx) {
    try {
      const sanitizedQuery = await strapi.service('plugin::content-manager.uid').sanitizeQuery(
        ctx.query,
        'api::invoice.invoice'
      );

      const { results, pagination } = await strapi.service('api::invoice.invoice').find({
        ...sanitizedQuery,
        populate: {
          client: true,
          invoice_items: {
            populate: {
              product: true,
            },
          },
          numering_range: true,
        },
      });

      ctx.send({
        data: results,
        meta: { pagination },
      });
    } catch (error) {
      ctx.badRequest(`Error listando facturas: ${(error as Error).message}`);
    }
  },

  /**
   * 🔍 FindOne con populate correcto
   */
  async findOne(ctx) {
    try {
      const { id } = ctx.params;

      const invoice = await strapi.entityService.findOne(
        'api::invoice.invoice',
        id,
        {
          populate: {
            client: true,
            invoice_items: {
              populate: {
                product: true,
              },
            },
            numering_range: true,
          },
        }
      );

      if (!invoice) {
        return ctx.notFound('Factura no encontrada');
      }

      ctx.send({
        data: invoice,
        meta: {},
      });
    } catch (error) {
      ctx.badRequest(`Error obteniendo factura: ${(error as Error).message}`);
    }
  },
};