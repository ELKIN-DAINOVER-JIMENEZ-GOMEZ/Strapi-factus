/**
 * Servicio de Mapeo para Factus API - VERSIÓN CORREGIDA FINAL
 * Ubicación: src/api/factus/services/factus-mapper.ts
 * 
 * ✅ FIX 1: Fechas no pueden ser futuras
 * ✅ FIX 2: municipality_id usa IDs de Factus, no códigos DANE
 */

import type { 
  FactusConfig, 
  Invoice, 
  InvoiceItem, 
  Client, 
  Product
} from '../types/factus.types';

interface FactusInvoicePayload {
  numbering_range_id: number;
  reference_code: string;
  observation: string;
  payment_form: string;
  payment_due_date: string;
  payment_method_code: string;
  operation_type: number;
  send_email: boolean;
  order_reference: {
    reference_code: string;
    issue_date: string;
  };
  billing_period: {
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
  items: Array<any>;
}

export default {
  async mapInvoiceToFactus(invoiceId: number): Promise<FactusInvoicePayload> {
    try {
      strapi.log.info(`🗺️ [MAPPER] Iniciando mapeo de factura ${invoiceId}...`);

      // PASO 1: Obtener factura
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

      if (!invoice) {
        throw new Error(`❌ Factura ${invoiceId} no encontrada`);
      }

      if (!invoice.client) {
        throw new Error(`❌ La factura ${invoiceId} no tiene cliente asociado`);
      }

      if (!invoice.invoice_items || invoice.invoice_items.length === 0) {
        throw new Error(`❌ La factura ${invoiceId} no tiene items`);
      }

      strapi.log.info('✅ Validación inicial completada');

      // PASO 2: Obtener configuración
      const config = await strapi.db.query('api::factus-config.factus-config').findOne({
        where: {},
      }) as any as FactusConfig;

      if (!config) {
        throw new Error('❌ Configuración de Factus no encontrada');
      }

      // PASO 3: Obtener rango de numeración
      let numberingRangeId: number;
      let consecutivo: number;
      let prefijo: string;

      const hasNumberingService = strapi.service('api::factus.factus-numbering');

      if (hasNumberingService) {
        try {
          const numberingService = strapi.service('api::factus.factus-numbering');
          const range = await numberingService.getActiveRange('factura');
          
          numberingRangeId = range.factus_id;
          consecutivo = await numberingService.getNextConsecutive(range.id);
          prefijo = range.prefijo;
        } catch (error) {
          strapi.log.warn('⚠️ No se pudo obtener rango, usando config');
          numberingRangeId = config.numbering_range_id || 8;
          consecutivo = config.consecutivo_actual || 8;
          prefijo = config.prefijo_factura || 'FV';
        }
      } else {
        numberingRangeId = config.numbering_range_id || 8;
        consecutivo = config.consecutivo_actual || 8;
        prefijo = config.prefijo_factura || 'FV';
      }

      // PASO 4: Mapear establecimiento
      const establishment = {
        name: config.empresa_nombre || 'Mi Empresa',
        address: config.empresa_direccion || 'Dirección no especificada',
        phone_number: config.empresa_telefono || '0000000',
        email: config.empresa_email || 'contacto@empresa.com',
        municipality_id: '980', // Bogotá en Factus
      };

      // ═══════════════════════════════════════════════════════════
      // ✅ FIX 2: MAPEAR municipality_id A IDs DE FACTUS
      // ═══════════════════════════════════════════════════════════
      
      // Obtener ID de municipio de Factus (no código DANE)
      const municipalityId = this.getMunicipalityIdForFactus(
        invoice.client.ciudad_codigo || '11001'
      );

      strapi.log.info(`📍 Mapeando ciudad: DANE ${invoice.client.ciudad_codigo} → Factus ${municipalityId}`);

      // PASO 5: Mapear cliente
      const customer = {
        identification: String(invoice.client.numero_documento),
        dv: invoice.client.digito_verificacion || '',
        company: invoice.client.razon_social || '',
        trade_name: invoice.client.nombre_comercial || '',
        names: invoice.client.nombre_completo,
        address: invoice.client.direccion,
        email: invoice.client.email,
        phone: String(invoice.client.telefono || '0000000'),
        legal_organization_id: this.mapTipoPersona(invoice.client.tipo_persona),
        tribute_id: this.mapRegimenFiscal(invoice.client.regimen_fiscal),
        identification_document_id: this.mapTipoDocumento(invoice.client.tipo_documento),
        municipality_id: municipalityId, // ✅ Usar ID de Factus
      };

      strapi.log.info('✅ Cliente mapeado:');
      strapi.log.info(`   ├─ Nombre: ${customer.names}`);
      strapi.log.info(`   ├─ Documento: ${customer.identification_document_id}-${customer.identification}`);
      strapi.log.info(`   └─ 🏙️  Municipio Factus: ${customer.municipality_id}`);

      // PASO 6: Mapear items
      const items = invoice.invoice_items.map((item: any, index: number) => {
        const product = item.product;
        const unitMeasureId = this.mapUnidadMedida(product.unidad_medida || 'UND');
        const isExcluded = product.aplica_iva ? 0 : 1;

        const mappedItem: any = {
          scheme_id: product.tipo === 'servicio' ? '0' : '1',
          note: product.tipo === 'servicio' ? 'Servicio' : '',
          code_reference: product.codigo,
          name: product.nombre,
          quantity: parseFloat(String(item.cantidad)),
          discount_rate: parseFloat(String(item.descuento_porcentaje || 0)),
          price: parseFloat(String(item.precio_unitario)),
          tax_rate: parseFloat(String(item.iva_porcentaje || 0)).toFixed(2),
          unit_measure_id: unitMeasureId,
          standard_code_id: product.codigo_unspsc ? parseInt(product.codigo_unspsc) : 1,
          is_excluded: isExcluded,
          tribute_id: 1,
          withholding_taxes: [],
        };

        if (invoice.client) {
          mappedItem.mandate = {
            identification_document_id: this.mapTipoDocumento(invoice.client.tipo_documento),
            identification: String(invoice.client.numero_documento),
          };
        }

        return mappedItem;
      });

      // ═══════════════════════════════════════════════════════════
      // ✅ FIX 1: VALIDAR Y AJUSTAR FECHAS
      // ═══════════════════════════════════════════════════════════
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let invoiceDate = new Date(invoice.fecha_emision);
      invoiceDate.setHours(0, 0, 0, 0);

      // Si la fecha es futura, usar hoy
      if (invoiceDate > today) {
        strapi.log.warn(`⚠️ Fecha de emisión es futura (${this.formatDate(invoiceDate)}), usando fecha actual`);
        invoiceDate = today;
      }

      let dueDate = invoice.fecha_vencimiento 
        ? new Date(invoice.fecha_vencimiento) 
        : new Date(invoiceDate);
      dueDate.setHours(0, 0, 0, 0);

      // Si la fecha de vencimiento es anterior a la de emisión, ajustar
      if (dueDate < invoiceDate) {
        strapi.log.warn('⚠️ Fecha de vencimiento anterior a emisión, ajustando...');
        dueDate = new Date(invoiceDate);
        dueDate.setDate(dueDate.getDate() + 30); // +30 días
      }

      const invoiceDateStr = this.formatDate(invoiceDate);
      const dueDateStr = this.formatDate(dueDate);

      strapi.log.info(`📅 Fechas ajustadas:`);
      strapi.log.info(`   ├─ Emisión: ${invoiceDateStr}`);
      strapi.log.info(`   └─ Vencimiento: ${dueDateStr}`);

      // PASO 7: Construir payload
      const referenceCode = invoice.numero_factura || `${prefijo}-${consecutivo}`;

      const payload: FactusInvoicePayload = {
        numbering_range_id: numberingRangeId,
        reference_code: referenceCode,
        observation: invoice.observaciones || '',
        payment_form: this.mapFormaPago(invoice.forma_pago || 'Efectivo'),
        payment_due_date: dueDateStr,
        payment_method_code: this.mapMedioPago(invoice.medio_pago || invoice.forma_pago || 'Efectivo'),
        operation_type: this.mapTipoOperacion(invoice.tipo_operacion),
        send_email: false,
        order_reference: {
          reference_code: referenceCode,
          issue_date: invoiceDateStr, // ✅ Usar fecha validada
        },
        billing_period: {
          start_date: invoiceDateStr, // ✅ Usar fecha validada
          start_time: '00:00:00',
          end_date: dueDateStr,
          end_time: '23:59:59',
        },
        establishment,
        customer,
        items,
      };

      strapi.log.info('✅ Payload construido exitosamente');

      return payload;

    } catch (error) {
      strapi.log.error('❌ [MAPPER] Error mapeando factura:', error);
      throw error;
    }
  },

  // ═══════════════════════════════════════════════════════════
  // ✅ NUEVO: Mapear código DANE a ID de municipio de Factus
  // ═══════════════════════════════════════════════════════════
  
  getMunicipalityIdForFactus(codigoDane: string): string {
    /**
     * Mapeo de códigos DANE a IDs internos de Factus
     * 
     * IMPORTANTE: Estos IDs son internos de Factus, NO son códigos DANE.
     * Debes consultar la documentación de Factus o hacer una petición GET
     * a su endpoint de municipios para obtener los IDs correctos.
     * 
     * Endpoint: GET /v1/municipalities
     */
    
    const municipalityMap: Record<string, string> = {
      // Principales ciudades (VERIFICAR CON FACTUS API)
      '11001': '149',  // Bogotá D.C.
      '05001': '19',   // Medellín
      '76001': '1096', // Cali
      '08001': '78',   // Barranquilla
      '13001': '150',  // Cartagena
      '54001': '223',  // Cúcuta
      '68001': '689',  // Bucaramanga
      '66001': '624',  // Pereira
      '47001': '520',  // Santa Marta
      '73001': '838',  // Ibagué
      '52001': '207',  // Pasto
      '17001': '483',  // Manizales
      '50001': '568',  // Villavicencio
      '20001': '1095', // Valledupar
    };

    const factusMunicipalityId = municipalityMap[codigoDane];

    if (!factusMunicipalityId) {
      strapi.log.warn(
        `⚠️ Código DANE ${codigoDane} no encontrado en mapeo, usando Bogotá (149) por defecto`
      );
      return '149'; // Bogotá por defecto
    }

    return factusMunicipalityId;
  },

  // ═══════════════════════════════════════════════════════════
  // MÉTODOS DE MAPEO (sin cambios)
  // ═══════════════════════════════════════════════════════════

  mapTipoDocumento(tipo: string): string {
    const map: Record<string, string> = {
      'CC': '3',
      'NIT': '6',
      'CE': '5',
      'TI': '2',
      'PP': '4',
      'PEP': '7',
    };
    return map[tipo] || '3';
  },

  mapTipoPersona(tipo?: string): string {
    const normalized = tipo?.toLowerCase();
    return normalized === 'juridica' ? '1' : '2';
  },

  mapRegimenFiscal(regimen?: string): string {
    return '21';
  },

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

  mapUnidadMedida(unidad: string): number {
    const normalized = unidad.toUpperCase();
    const map: Record<string, number> = {
      'UND': 70,
      'KG': 28,
      'LB': 14,
      'MT': 59,
      'M2': 26,
      'M3': 11,
      'LT': 94,
      'GL': 21,
      'HR': 57,
      'DIA': 404,
    };
    return map[normalized] || 70;
  },

  formatDate(date: Date | string): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  async validateInvoice(invoiceId: number): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    try {
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

      if (!invoice) {
        errors.push('❌ Factura no encontrada');
        return { valid: false, errors };
      }

      if (!invoice.client) {
        errors.push('❌ La factura debe tener un cliente asociado');
      }

      if (!invoice.invoice_items || invoice.invoice_items.length === 0) {
        errors.push('❌ La factura debe tener al menos un ítem');
      }

      // Validar fecha no es futura
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const invoiceDate = new Date(invoice.fecha_emision);
      invoiceDate.setHours(0, 0, 0, 0);

      if (invoiceDate > today) {
        errors.push(`⚠️ La fecha de emisión (${this.formatDate(invoiceDate)}) es futura. Se ajustará a la fecha actual.`);
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      errors.push(`❌ Error validando: ${(error as Error).message}`);
      return { valid: false, errors };
    }
  },
};