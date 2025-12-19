/**
 * Servicio de Mapeo para Factus API
 * Ubicación: src/api/factus/services/factus-mapper.ts
 * 
 * Convierte facturas de Strapi al formato requerido por Factus
 */
/**
 * Servicio de Mapeo para Factus API
 * Ubicación: src/api/factus/services/factus-mapper.ts
 * 
 * Convierte facturas de Strapi al formato requerido por Factus
 * Versión: 2.0 - Con soporte para rangos de numeración
 */

import type { 
  FactusConfig, 
  Invoice, 
  InvoiceItem, 
  Client, 
  Product
} from '../types/factus.types';

/**
 * Tipo para factura de Factus (según workspace de Postman)
 */
interface FactusInvoicePayload {
  numbering_range_id: number;
  reference_code: string;
  observation: string;
  payment_form: string;
  payment_due_date: string;
  payment_method_code: string;
  operation_type: number;
  send_email: boolean;
  order_reference?: {
    reference_code: string;
    issue_date: string;
  };
  billing_period?: {
    start_date: string;
    start_time: string;
    end_date: string;
    end_time: string;
  };
  establishment: {
    name: string;
    address: string;
    phone_number: string;
    email: string;
    municipality_id: string;
  };
  customer: {
    identification: string;
    dv?: string;
    company?: string;
    trade_name?: string;
    names: string;
    address: string;
    email: string;
    phone: string;
    legal_organization_id: string;
    tribute_id: string;
    identification_document_id: string;
    municipality_id: string;
  };
  items: Array<{
    scheme_id: string;
    note: string;
    code_reference: string;
    name: string;
    quantity: number;
    discount_rate: number;
    price: number;
    tax_rate: string;
    unit_measure_id: number;
    standard_code_id: number;
    is_excluded: number;
    tribute_id: number;
    withholding_taxes?: Array<{
      code: string;
      withholding_tax_rate: string;
    }>;
  }>;
}

export default {
  /**
   * 🗺️ Mapear factura de Strapi a formato Factus
   * 
   * @param invoiceId - ID de la factura en Strapi
   * @returns Objeto formateado para Factus API
   */
  async mapInvoiceToFactus(invoiceId: number): Promise<FactusInvoicePayload> {
    try {
      strapi.log.info(`🗺️ Mapeando factura ${invoiceId}...`);

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // PASO 1: Obtener factura con todas sus relaciones
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const result = await strapi.entityService.findOne(
        'api::invoice.invoice',
        invoiceId,
        {
          populate: {
            client: true,
            invoice_items: {
              populate: {
                product: true,
              },
            },
          },
        }
      );

      const invoice = result as any as Invoice;

      if (!invoice) {
        throw new Error(`Factura ${invoiceId} no encontrada`);
      }

      if (!invoice.client) {
        throw new Error(`La factura ${invoiceId} no tiene cliente asociado`);
      }

      if (!invoice.invoice_items || invoice.invoice_items.length === 0) {
        throw new Error(`La factura ${invoiceId} no tiene items`);
      }

      strapi.log.info(`✅ Factura obtenida: ${invoice.numero_factura || 'Sin número'}`);

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // PASO 2: Obtener configuración de empresa
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const configResult = await strapi.entityService.findMany(
        'api::factus-config.factus-config'
      );
      const config: FactusConfig = Array.isArray(configResult) 
        ? configResult[0] 
        : configResult;

      if (!config) {
        throw new Error('Configuración de Factus no encontrada');
      }

      strapi.log.info(`✅ Configuración obtenida: ${config.empresa_nombre}`);

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // PASO 3: Obtener rango de numeración activo
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      let numberingRangeId: number;
      let consecutivo: number;
      let prefijo: string;

      // Verificar si existe el servicio de numbering
      const hasNumberingService = strapi.service('api::factus.factus-numbering');

      if (hasNumberingService) {
        try {
          const numberingService = strapi.service('api::factus.factus-numbering');
          const range = await numberingService.getActiveRange('factura');
          
          numberingRangeId = range.factus_id;
          consecutivo = await numberingService.getNextConsecutive(range.id);
          prefijo = range.prefijo;

          strapi.log.info(`✅ Rango activo: ${prefijo} (ID: ${numberingRangeId})`);
        } catch (error) {
          strapi.log.warn('⚠️ No se pudo obtener rango de numeración, usando config por defecto');
          
          // Fallback a configuración
          numberingRangeId = config.numbering_range_id || 1;
          consecutivo = config.consecutivo_actual || 1;
          prefijo = config.prefijo_factura || 'FV';
        }
      } else {
        // Si no existe el servicio, usar configuración
        strapi.log.warn('⚠️ Servicio de numeración no disponible, usando config');
        
        numberingRangeId = config.numbering_range_id || 1;
        consecutivo = config.consecutivo_actual || 1;
        prefijo = config.prefijo_factura || 'FV';
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // PASO 4: Mapear establecimiento (tu empresa)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const establishment = {
        name: config.empresa_nombre || 'Mi Empresa',
        address: config.empresa_direccion || 'Dirección no especificada',
        phone_number: config.empresa_telefono || '0000000',
        email: config.empresa_email || 'contacto@empresa.com',
        municipality_id: '980', // Bogotá por defecto
      };

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // PASO 5: Mapear cliente (adquiriente)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const customer = {
        identification: invoice.client.numero_documento,
        dv: invoice.client.digito_verificacion || '',
        company: invoice.client.razon_social || '',
        trade_name: invoice.client.nombre_comercial || '',
        names: invoice.client.nombre_completo,
        address: invoice.client.direccion,
        email: invoice.client.email,
        phone: invoice.client.telefono || '0000000',
        legal_organization_id: this.mapTipoPersona(invoice.client.tipo_persona),
        tribute_id: this.mapRegimenFiscal(invoice.client.regimen_fiscal),
        identification_document_id: this.mapTipoDocumento(invoice.client.tipo_documento),
        municipality_id: invoice.client.ciudad_codigo || '980', // Usar ciudad_codigo si existe
      };

      strapi.log.info(`✅ Cliente mapeado: ${customer.names}`);

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // PASO 6: Mapear items de la factura
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const items = invoice.invoice_items.map((item: InvoiceItem, index: number) => {
        const product = item.product as Product;

        if (!product) {
          throw new Error(`Item ${index + 1} no tiene producto asociado`);
        }

        // Usar unidad_medida_id del item si existe, sino mapear desde product
        const unitMeasureId = item.unidad_medida_id 
          ? parseInt(String(item.unidad_medida_id))
          : this.mapUnidadMedida(product.unidad_medida || 'UND');

        // Determinar si el producto está excluido de IVA
        const isExcluded = product.aplica_iva ? 0 : 1;

        return {
          scheme_id: '1', // 1 = Estándar
          note: product.tipo === 'servicio' ? 'Servicio' : '', // Agregar nota para servicios
          code_reference: product.codigo,
          name: product.nombre,
          quantity: parseFloat(String(item.cantidad)),
          discount_rate: parseFloat(String(item.descuento_porcentaje || 0)),
          price: parseFloat(String(item.precio_unitario)),
          tax_rate: parseFloat(String(item.iva_porcentaje || 0)).toFixed(2),
          unit_measure_id: unitMeasureId,
          standard_code_id: product.codigo_unspsc ? parseInt(product.codigo_unspsc) : 1,
          is_excluded: isExcluded,
          tribute_id: 1, // 1 = IVA
          withholding_taxes: [],
        };
      });

      strapi.log.info(`✅ ${items.length} items mapeados`);

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // PASO 7: Construir payload completo
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const payload: FactusInvoicePayload = {
        numbering_range_id: numberingRangeId,
        reference_code: invoice.numero_factura || `${prefijo}-${consecutivo}`,
        observation: invoice.observaciones || '',
        payment_form: this.mapFormaPago(invoice.forma_pago || 'Efectivo'),
        payment_due_date: this.formatDate(invoice.fecha_vencimiento || invoice.fecha_emision),
        payment_method_code: this.mapMedioPago(invoice.medio_pago || invoice.forma_pago || 'Efectivo'),
        operation_type: this.mapTipoOperacion(invoice.tipo_operacion),
        send_email: false,
        establishment,
        customer,
        items,
      };

      strapi.log.info(`✅ Factura mapeada exitosamente`);
      strapi.log.debug('📦 Payload:', JSON.stringify(payload, null, 2));

      return payload;
    } catch (error) {
      strapi.log.error('❌ Error mapeando factura:', error);
      throw error;
    }
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MÉTODOS DE MAPEO DE CÓDIGOS DIAN
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 📋 Mapear tipo de documento según Factus
   */
  mapTipoDocumento(tipo: string): string {
    const map: Record<string, string> = {
      'CC': '3',   // Cédula de Ciudadanía
      'NIT': '6',  // NIT
      'CE': '5',   // Cédula de Extranjería
      'TI': '2',   // Tarjeta de Identidad
      'PP': '4',   // Pasaporte
      'PEP': '7',  // PEP
    };
    return map[tipo] || '3';
  },

  /**
   * 👤 Mapear tipo de persona
   */
  mapTipoPersona(tipo?: string): string {
    // 1 = Jurídica, 2 = Natural
    return tipo === 'juridica' ? '1' : '2';
  },

  /**
   * 💰 Mapear régimen fiscal
   */
  mapRegimenFiscal(regimen?: string): string {
    const map: Record<string, string> = {
      'responsable_iva': '21',
      'no_responsable_iva': '21',
      'gran_contribuyente': '21',
      'simple': '21',
    };
    return map[regimen || ''] || '21';
  },

  /**
   * 💳 Mapear forma de pago
   */
  mapFormaPago(formaPago: string): string {
    const normalized = formaPago.toLowerCase();
    const map: Record<string, string> = {
      'contado': '1',
      'credito': '2',
      'efectivo': '1',
      'tarjeta': '1',
      'transferencia': '1',
    };
    return map[normalized] || '1';
  },

  /**
   * 💵 Mapear medio de pago
   */
  mapMedioPago(medioPago: string): string {
    const normalized = medioPago.toLowerCase();
    const map: Record<string, string> = {
      'efectivo': '10',
      'credito': '1',
      'tarjeta': '48',
      'transferencia': '42',
      'cheque': '20',
    };
    return map[normalized] || '10';
  },

  /**
   * 📊 Mapear tipo de operación (se reciben en mayúscula: 'Venta', 'Credito', 'Contado', 'Exportacion')
   */
  mapTipoOperacion(tipo: string): number {
    const normalized = tipo.toLowerCase();
    const map: Record<string, number> = {
      'venta': 10,
      'exportacion': 20,
      'credito': 10,
      'contado': 10,
    };
    return map[normalized] || 10;
  },

  /**
   * 📦 Mapear unidad de medida
   */
  mapUnidadMedida(unidad: string): number {
    const normalized = unidad.toUpperCase();
    const map: Record<string, number> = {
      'UND': 70,   // Unidad
      'KG': 28,    // Kilogramo
      'LB': 14,    // Libra
      'MT': 59,    // Metro
      'M2': 26,    // Metro cuadrado
      'M3': 11,    // Metro cúbico
      'LT': 94,    // Litro
      'GL': 21,    // Galón
      'HR': 57,    // Hora
      'DIA': 404,  // Día
    };
    return map[normalized] || 70;
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MÉTODOS DE FORMATO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 📅 Formatear fecha (YYYY-MM-DD)
   */
  formatDate(date: Date | string): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /**
   * ⏰ Formatear hora (HH:mm:ss)
   */
  formatTime(date: Date | string): string {
    const d = new Date(date);
    return d.toTimeString().split(' ')[0];
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // VALIDACIÓN DE FACTURA
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * ✅ Validar factura antes de mapear
   */
  async validateInvoice(invoiceId: number): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    try {
      const result = await strapi.entityService.findOne(
        'api::invoice.invoice',
        invoiceId,
        {
          populate: {
            client: true,
            invoice_items: {
              populate: {
                product: true,
              },
            },
          },
        }
      );

        const invoice = result as any as Invoice;

      if (!invoice) {
        errors.push('Factura no encontrada');
        return { valid: false, errors };
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // VALIDACIONES GENERALES
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      if (!invoice.client) {
        errors.push('❌ La factura debe tener un cliente asociado');
      }

      if (!invoice.invoice_items || invoice.invoice_items.length === 0) {
        errors.push('❌ La factura debe tener al menos un ítem');
      }

      if (invoice.estado_local && invoice.estado_local.toLowerCase() !== 'borrador') {
        errors.push(`❌ La factura está en estado: ${invoice.estado_local}. Solo se pueden emitir facturas en borrador`);
      }

      if (!invoice.fecha_emision) {
        errors.push('❌ La factura debe tener fecha de emisión');
      }

      if (!invoice.total || invoice.total <= 0) {
        errors.push('❌ La factura debe tener un total mayor a 0');
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // VALIDACIONES DEL CLIENTE
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      if (invoice.client) {
        const client = invoice.client as Client;

        if (!client.numero_documento) {
          errors.push('❌ El cliente debe tener número de documento');
        }

        if (!client.email) {
          errors.push('❌ El cliente debe tener email');
        }

        if (!client.direccion) {
          errors.push('❌ El cliente debe tener dirección');
        }

        if (!client.nombre_completo) {
          errors.push('❌ El cliente debe tener nombre completo');
        }
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // VALIDACIONES DE ITEMS
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      if (invoice.invoice_items) {
        invoice.invoice_items.forEach((item: InvoiceItem, index: number) => {
          if (!item.product) {
            errors.push(`❌ El ítem ${index + 1} no tiene producto asociado`);
          }

          if (!item.cantidad || item.cantidad <= 0) {
            errors.push(`❌ El ítem ${index + 1} debe tener cantidad mayor a 0`);
          }

          if (!item.precio_unitario || item.precio_unitario <= 0) {
            errors.push(`❌ El ítem ${index + 1} debe tener precio mayor a 0`);
          }

          if (item.product) {
            const product = item.product as Product;

            if (!product.codigo) {
              errors.push(`❌ El producto del ítem ${index + 1} debe tener código`);
            }

            if (!product.nombre) {
              errors.push(`❌ El producto del ítem ${index + 1} debe tener nombre`);
            }
          }
        });
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // RESULTADO
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      if (errors.length > 0) {
        strapi.log.error('❌ Errores de validación:', errors);
      } else {
        strapi.log.info('✅ Factura válida para envío');
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      errors.push(`❌ Error validando factura: ${(error as Error).message}`);
      return { valid: false, errors };
    }
  },
};