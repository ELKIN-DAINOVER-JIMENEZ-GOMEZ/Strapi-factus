/**
 * Servicio de Mapeo para Notas Crédito - Factus API
 * Ubicación: src/api/credit-note/services/credit-note-mapper.ts
 * 
 * Mapea notas crédito del formato Strapi al formato requerido por Factus API
 * 
 * Documentación oficial: https://developers.factus.com.co/notas-credito/crear-y-validar/
 */

/**
 * Formato de payload para Factus API de Notas Crédito
 * Según documentación oficial: https://developers.factus.com.co/notas-credito/crear-y-validar/
 */
interface FactusCreditNotePayload {
  numbering_range_id?: number;           // ID del rango de numeración (opcional si solo hay uno activo)
  correction_concept_code: number;        // Código del concepto de corrección (1-5)
  customization_id: number;               // 20: Con referencia a factura, 22: Sin referencia
  bill_id?: number;                       // ID de la factura en Factus (requerido si customization_id != 22)
  reference_code: string;                 // Código único para evitar duplicados
  payment_method_code: string;            // Código de método de pago (ej: "10" = efectivo)
  send_email?: boolean;                   // Enviar email al cliente (default: true)
  observation?: string;                   // Observaciones (max 250 caracteres)
  
  // Periodo de facturación (requerido si customization_id = 22)
  billing_period?: {
    start_date: string;                   // Formato YYYY-MM-DD
    start_time?: string;                  // Formato HH:mm:ss
    end_date: string;                     // Formato YYYY-MM-DD
    end_time?: string;                    // Formato HH:mm:ss
  };
  
  // Establecimiento (opcional)
  establishment?: {
    name: string;
    address: string;
    phone_number: string;
    email: string;
    municipality_id: number;
  };
  
  // Cliente (opcional si se usa bill_id, se toman datos de la factura)
  customer?: {
    identification_document_id: number;   // ID del tipo de documento
    identification: string;               // Número de identificación
    dv?: string;                          // Dígito de verificación (solo NIT)
    company?: string;                     // Razón social (persona jurídica)
    trade_name?: string;                  // Nombre comercial
    names?: string;                       // Nombre completo (persona natural)
    address?: string;                     // Dirección
    email?: string;                       // Email
    phone?: string;                       // Teléfono
    legal_organization_id: string;        // "1" = Jurídica, "2" = Natural
    tribute_id: string;                   // ID del tributo
    municipality_id?: string;             // ID del municipio (solo Colombia)
  };
  
  // Items de la nota crédito
  items: Array<{
    code_reference: string;               // Código del producto
    name: string;                         // Nombre del producto
    quantity: number;                     // Cantidad (entero)
    discount_rate: number;                // % de descuento (max 2 decimales)
    price: number;                        // Precio con IVA incluido (max 2 decimales)
    tax_rate: string;                     // % de impuesto (ej: "19.00")
    unit_measure_id: number;              // ID unidad de medida
    standard_code_id: number;             // ID código estándar
    is_excluded: number;                  // 0: No, 1: Sí (excluido de IVA)
    tribute_id: number;                   // ID del tributo del item
    note?: string;                        // Información adicional
    withholding_taxes?: Array<{           // Autorretenciones (opcional)
      code: number;
      withholding_tax_rate: number;
    }>;
  }>;
  
  // Descuentos o recargos globales (opcional)
  allowance_charges?: Array<{
    concept_type: string;                 // Código del tipo
    is_surcharge: boolean;                // true = recargo, false = descuento
    reason: string;                       // Razón
    base_amount: number;                  // Base de cálculo
    amount: number;                       // Valor del descuento/recargo
  }>;
}

export default {
  /**
   * Mapea una nota crédito al formato requerido por Factus API
   * Según documentación: https://developers.factus.com.co/notas-credito/crear-y-validar/
   */
  async mapCreditNoteToFactus(creditNoteId: number): Promise<FactusCreditNotePayload> {
    try {
      // Iniciando mapeo de nota crédito

      // PASO 1: Obtener nota crédito con relaciones
      const creditNote = await strapi.db.query('api::credit-note.credit-note').findOne({
        where: { id: creditNoteId },
        populate: {
          client: true,
          invoice: true,  // Factura referenciada
          credit_note_items: {
            populate: {
              product: true,
            },
          },
        },
      }) as any;

      if (!creditNote) {
        throw new Error(`❌ Nota crédito ${creditNoteId} no encontrada`);
      }

      if (!creditNote.invoice) {
        throw new Error(`❌ La nota crédito ${creditNoteId} no tiene factura referenciada`);
      }

      if (!creditNote.credit_note_items || creditNote.credit_note_items.length === 0) {
        throw new Error(`❌ La nota crédito ${creditNoteId} no tiene items`);
      }

      // Validación inicial completada

      // PASO 2: Obtener configuración
      const config = await strapi.db.query('api::factus-config.factus-config').findOne({
        where: {},
      }) as any;

      if (!config) {
        throw new Error('❌ Configuración de Factus no encontrada');
      }

      // PASO 3: Obtener rango de numeración para notas crédito
      let numberingRangeId: number | undefined;

      const hasNumberingService = strapi.service('api::factus.numering');

      if (hasNumberingService) {
        try {
          const numberingService = strapi.service('api::factus.numering');
          const range = await numberingService.getActiveRange('nota_credito');
          numberingRangeId = range.factus_id;
        } catch (error) {
          numberingRangeId = config.numbering_range_id_nc || config.numbering_range_id;
        }
      } else {
        numberingRangeId = config.numbering_range_id_nc || config.numbering_range_id;
      }

      // PASO 4: Obtener el bill_id de Factus (ID interno de la factura en Factus)
      // IMPORTANTE: Este es el ID numérico que Factus devuelve, NO el número de factura
      let billId: number | null = null;
      
      console.log('🔍 Buscando bill_id para factura:', creditNote.invoice.id);
      console.log('   - factus_bill_id:', creditNote.invoice.factus_bill_id);
      console.log('   - factus_id:', creditNote.invoice.factus_id);
      
      // Prioridad 1: factus_bill_id (campo dedicado)
      if (creditNote.invoice.factus_bill_id) {
        billId = creditNote.invoice.factus_bill_id;
        console.log('   ✅ bill_id obtenido de factus_bill_id:', billId);
      }
      // Prioridad 2: Buscar en respuesta_factus
      else if (creditNote.invoice.respuesta_factus) {
        const respuesta = creditNote.invoice.respuesta_factus;
        console.log('   - Buscando en respuesta_factus...');
        billId = respuesta?.data?.bill?.id || 
                 respuesta?.bill?.id || 
                 respuesta?.data?.id ||
                 respuesta?.id;
        if (billId) {
          console.log('   ✅ bill_id obtenido de respuesta_factus:', billId);
        }
      }
      
      if (!billId) {
        console.log('   ❌ No se encontró bill_id');
        throw new Error(`La factura referenciada no tiene ID numérico de Factus (factus_bill_id). Verifique que la factura fue emitida correctamente.`);
      }

      // Factura referenciada - ID Factus y número obtenidos

      // PASO 5: Mapear concepto de corrección
      const correctionConceptCode = this.mapConceptoCorreccion(creditNote.concepto_correccion_id || creditNote.motivo_correccion);
      
      // Concepto de corrección mapeado

      // PASO 6: Mapear items según formato Factus
      const items = creditNote.credit_note_items.map((item: any) => {
        const product = item.product;
        const unitMeasureId = this.mapUnidadMedida(product?.unidad_medida || 'UND');
        const isExcluded = product?.aplica_iva ? 0 : 1;
        const taxRate = parseFloat(String(item.iva_porcentaje || 0)).toFixed(2);

        return {
          code_reference: item.codigo_producto || product?.codigo || 'SIN-CODIGO',
          name: item.nombre_producto || product?.nombre || 'Producto',
          quantity: parseInt(String(item.cantidad)),
          discount_rate: parseFloat(String(item.descuento_porcentaje || 0)),
          price: parseFloat(String(item.precio_unitario)),
          tax_rate: taxRate,
          unit_measure_id: unitMeasureId,
          standard_code_id: product?.codigo_unspsc ? parseInt(product.codigo_unspsc) : 1,
          is_excluded: isExcluded,
          tribute_id: 1,  // 1 = IVA
          note: product?.tipo === 'servicio' ? 'Servicio' : '',
          withholding_taxes: [],
        };
      });

      // Items mapeados

      // PASO 7: Mapear cliente (opcional, Factus usa datos de la factura si no se envía)
      let customer: any = undefined;
      
      if (creditNote.client) {
        const municipalityId = this.getMunicipalityIdForFactus(
          creditNote.client.ciudad_codigo || '11001'
        );

        customer = {
          identification_document_id: parseInt(this.mapTipoDocumento(creditNote.client.tipo_documento)),
          identification: String(creditNote.client.numero_documento),
          dv: creditNote.client.digito_verificacion || undefined,
          company: creditNote.client.razon_social || '',
          trade_name: creditNote.client.nombre_comercial || '',
          names: creditNote.client.nombre_completo,
          address: creditNote.client.direccion || 'Sin dirección',
          email: creditNote.client.email,
          phone: String(creditNote.client.telefono || '0000000'),
          legal_organization_id: this.mapTipoPersona(creditNote.client.tipo_persona),
          tribute_id: this.mapRegimenFiscal(creditNote.client.regimen_fiscal),
          municipality_id: municipalityId,
        };

        // Cliente mapeado
      }

      // PASO 8: Construir payload según formato Factus
      const referenceCode = creditNote.numero_nota || `NC-${creditNoteId}-${Date.now()}`;

      const payload: FactusCreditNotePayload = {
        // Campos requeridos según documentación Factus
        correction_concept_code: correctionConceptCode,
        customization_id: 20,  // 20 = Nota crédito con referencia a factura electrónica
        bill_id: billId,
        reference_code: referenceCode,
        payment_method_code: '10',  // 10 = Efectivo
        
        // Campos opcionales
        numbering_range_id: numberingRangeId,
        send_email: false,
        observation: creditNote.observaciones || '',
        
        // Items
        items,
      };

      // Agregar cliente solo si tenemos datos
      if (customer) {
        payload.customer = customer;
      }

      // Payload de nota crédito construido

      return payload;

    } catch (error) {
      throw error;
    }
  },

  /**
   * Valida que una nota crédito tenga todos los campos requeridos
   */
  async validateCreditNote(creditNoteId: number): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
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

      if (!creditNote) {
        errors.push('Nota crédito no encontrada');
        return { valid: false, errors };
      }

      // Validar factura referenciada (REQUERIDO según Factus)
      if (!creditNote.invoice) {
        errors.push('La nota crédito debe referenciar una factura');
      } else {
        // Verificar que la factura tenga el ID de Factus
        if (!creditNote.invoice.factus_bill_id && !creditNote.invoice.factus_id) {
          errors.push('La factura referenciada no ha sido emitida a Factus (falta factus_bill_id)');
        }
      }

      // Validar items (REQUERIDO)
      if (!creditNote.credit_note_items || creditNote.credit_note_items.length === 0) {
        errors.push('La nota crédito debe tener al menos un item');
      } else {
        creditNote.credit_note_items.forEach((item: any, index: number) => {
          if (!item.cantidad || item.cantidad <= 0) {
            errors.push(`Item ${index + 1}: La cantidad debe ser mayor a 0`);
          }
          if (!item.precio_unitario || item.precio_unitario <= 0) {
            errors.push(`Item ${index + 1}: El precio unitario debe ser mayor a 0`);
          }
        });
      }

      // Validar motivo de corrección (REQUERIDO)
      if (!creditNote.motivo_correccion && !creditNote.concepto_correccion_id) {
        errors.push('Debe especificar un motivo o concepto de corrección');
      }

      // Cliente es opcional según Factus (se usan datos de la factura)
      // pero si hay cliente, validar datos básicos
      if (creditNote.client) {
        if (!creditNote.client.numero_documento) {
          errors.push('El cliente debe tener número de documento');
        }
        if (!creditNote.client.email) {
          errors.push('El cliente debe tener email');
        }
      }

      return { valid: errors.length === 0, errors };

    } catch (error) {
      errors.push(`Error de validación: ${(error as Error).message}`);
      return { valid: false, errors };
    }
  },

  // ═══════════════════════════════════════════════════════════
  // FUNCIONES DE MAPEO AUXILIARES
  // ═══════════════════════════════════════════════════════════

  /**
   * Mapea el concepto de corrección al código de Factus
   * Según documentación oficial:
   * 1 - Devolución de parte de los bienes; no aceptación de partes del servicio
   * 2 - Anulación de factura electrónica
   * 3 - Rebaja o descuento parcial o total
   * 4 - Ajuste de precio
   * 5 - Otros
   */
  mapConceptoCorreccion(concepto: string | number): number {
    if (typeof concepto === 'number' && concepto >= 1 && concepto <= 5) {
      return concepto;
    }
    
    const conceptMap: Record<string, number> = {
      'devolucion': 1,
      'devolución': 1,
      'devolucion_parcial': 1,
      'anulacion': 2,
      'anulación': 2,
      'anulacion_factura': 2,
      'rebaja': 3,
      'descuento': 3,
      'descuento_parcial': 3,
      'descuento_total': 3,
      'ajuste_precio': 4,
      'ajuste': 4,
      'otros': 5,
      'otro': 5,
      '1': 1,
      '2': 2,
      '3': 3,
      '4': 4,
      '5': 5,
    };

    const normalizedConcept = String(concepto || '').toLowerCase().trim();
    return conceptMap[normalizedConcept] || 2; // Default: "Anulación de factura electrónica"
  },

  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  getMunicipalityIdForFactus(codigoDane: string): string {
    const municipalityMap: Record<string, string> = {
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
      '17001': '399',  // Manizales
      '15001': '175',  // Tunja
      '41001': '268',  // Neiva
      '63001': '698',  // Armenia
      '19001': '643',  // Popayán
      '50001': '578',  // Villavicencio
      '23001': '602',  // Montería
      '70001': '993',  // Sincelejo
      '44001': '441',  // Riohacha
      '68679': '980',  // San Gil
    };

    return municipalityMap[codigoDane] || '149'; // Default: Bogotá
  },

  mapTipoPersona(tipoPersona: string): string {
    const tipos: Record<string, string> = {
      'Natural': '2',
      'natural': '2',
      'Jurídica': '1',
      'juridica': '1',
      'Juridica': '1',
    };
    return tipos[tipoPersona] || '2';
  },

  mapRegimenFiscal(regimen: string): string {
    const regimenes: Record<string, string> = {
      'Responsable IVA': '1',
      'No responsable IVA': '21',
      'No Responsable IVA': '21',
      'Régimen Simple': '3',
      'Regimen Simple': '3',
    };
    return regimenes[regimen] || '21'; // Default: "No aplica" = 21
  },

  mapTipoDocumento(tipo: string): string {
    const tipos: Record<string, string> = {
      'RC': '1',      // Registro civil
      'CE': '2',      // Cédula de extranjería
      'CC': '3',      // Cédula de ciudadanía
      'TI': '4',      // Tarjeta de identidad
      'NIT': '6',     // NIT
      'PP': '7',      // Pasaporte
      'DIE': '8',     // Documento de identificación extranjero
    };
    return tipos[tipo] || '3'; // Default: CC
  },

  mapUnidadMedida(unidad: string): number {
    const unidades: Record<string, number> = {
      'UND': 70,
      'KG': 35,
      'LT': 36,
      'MT': 42,
      'PAR': 65,
      'HR': 29,
      'DIA': 18,
      'SRV': 78,
      'GAL': 24,
    };
    return unidades[unidad] || 70; // Default: Unidad
  },
};
