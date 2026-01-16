/**
 * Controller de Factus - VERSIÓN COMPLETA
 * Ubicación: src/api/factus/controllers/factus.ts
 * 
 * Expone endpoints REST para el frontend y operaciones con Factus API
 */

import axios from 'axios';

export default {
  /**
   * POST /api/factus/emit-invoice
   * Emitir una factura a Factus
   */
  async emitInvoice(ctx) {
    try {
      const { invoiceId } = ctx.request.body;

      if (!invoiceId) {
        return ctx.badRequest('invoiceId es requerido');
      }

      // Llamar al servicio de emisión
      const emissionService = strapi.service('api::factus.emission');
      const result = await emissionService.emitInvoice(invoiceId);

      if (result.success) {
        ctx.status = 200;
        ctx.body = {
          success: true,
          message: result.message,
          data: result.data,
        };
      } else {
        ctx.status = 400;
        ctx.body = {
          success: false,
          message: result.message,
          error: result.error,
          details: result.details || [],
        };
      }
    } catch (error) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        message: 'Error interno del servidor',
        error: (error as Error).message,
      };
    }
  },

  /**
   * POST /api/factus/test-connection
   * Probar conexión con Factus
   */
  async testConnection(ctx) {
    try {
      const authService = strapi.service('api::factus.auth');
      const result = await authService.testConnection();

      ctx.status = result.success ? 200 : 500;
      ctx.body = result;
    } catch (error) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        message: 'Error probando conexión',
        error: (error as Error).message,
      };
    }
  },
  

  // ═══════════════════════════════════════════════════════════
  // ENDPOINTS DE MUNICIPIOS
  // ═══════════════════════════════════════════════════════════

  /**
   * GET /api/factus/municipalities
   * Obtener lista completa de municipios de Factus
   */
  async getMunicipalities(ctx) {
    try {
      // Obtener token de autenticación
      const authService = strapi.service('api::factus.auth');
      const token = await authService.getToken();

      // Obtener configuración
      const config = await strapi.db.query('api::factus-config.factus-config').findOne({ where: {} });

      if (!config) {
        ctx.status = 500;
        ctx.body = {
          success: false,
          error: 'Configuración de Factus no encontrada'
        };
        return;
      }

      // Consultar municipios de Factus
      const response = await axios.get(
        `${config.api_url}/v1/municipalities`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
          timeout: 30000,
        }
      );

      // Formatear respuesta para facilitar búsqueda
      const municipalities = response.data?.data || response.data || [];
      
      // Crear mapeo útil
      const mapping = municipalities.reduce((acc: any, muni: any) => {
        // Intentar identificar el código DANE si existe
        const daneLikeFields = ['code', 'dane_code', 'codigo_dane', 'municipality_code'];
        const daneCode = daneLikeFields.reduce((code, field) => {
          return code || muni[field];
        }, null);

        acc[muni.id] = {
          id: muni.id,
          name: muni.name || muni.nombre,
          department: muni.department || muni.departamento,
          dane_code: daneCode,
          raw: muni,
        };

        return acc;
      }, {});

      ctx.body = {
        success: true,
        total: municipalities.length,
        municipalities,
        mapping,
        // Búsqueda rápida por nombre
        searchHelp: {
          bogota: municipalities.find((m: any) => 
            (m.name || m.nombre)?.toLowerCase().includes('bogota')
          ),
          medellin: municipalities.find((m: any) => 
            (m.name || m.nombre)?.toLowerCase().includes('medellin')
          ),
          cali: municipalities.find((m: any) => 
            (m.name || m.nombre)?.toLowerCase().includes('cali')
          ),
        }
      };

    } catch (error: any) {
      ctx.status = error.response?.status || 500;
      ctx.body = {
        success: false,
        error: error.message,
        details: error.response?.data,
      };
    }
  },

  /**
   * GET /api/factus/municipalities/search
   * Buscar municipio por nombre
   * 
   * Query params:
   * - name: Nombre del municipio a buscar
   */
  async searchMunicipality(ctx) {
    try {
      const { name } = ctx.query;

      if (!name) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          error: 'Parámetro "name" es requerido'
        };
        return;
      }

      // Obtener token
      const authService = strapi.service('api::factus.auth');
      const token = await authService.getToken();

      // Obtener configuración
      const config = await strapi.db.query('api::factus-config.factus-config').findOne({ where: {} });

      // Consultar todos los municipios
      const response = await axios.get(
        `${config.api_url}/v1/municipalities`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
          timeout: 30000,
        }
      );

      const municipalities = response.data?.data || response.data || [];

      // Buscar coincidencias
      const searchTerm = name.toLowerCase();
      const matches = municipalities.filter((muni: any) => {
        const municipalityName = (muni.name || muni.nombre || '').toLowerCase();
        return municipalityName.includes(searchTerm);
      });

      ctx.body = {
        success: true,
        search: name,
        matches,
        total: matches.length,
      };

    } catch (error: any) {
      ctx.status = error.response?.status || 500;
      ctx.body = {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * GET /api/factus/municipalities/autocomplete
   * Autocompletado de municipios usando el endpoint nativo de Factus
   * 
   * Query params:
   * - name: Nombre parcial del municipio a buscar
   * 
   * Usa directamente: GET /v1/municipalities?name={nombre}
   */
  async autocompleteMunicipality(ctx) {
    try {
      const { name } = ctx.query;

      if (!name || name.length < 2) {
        ctx.body = {
          success: true,
          data: [],
          total: 0,
          message: 'Ingrese al menos 2 caracteres para buscar'
        };
        return;
      }

      // Obtener token
      const authService = strapi.service('api::factus.auth');
      const token = await authService.getToken();

      // Obtener configuración
      const config = await strapi.db.query('api::factus-config.factus-config').findOne({ where: {} });

      if (!config) {
        ctx.status = 500;
        ctx.body = {
          success: false,
          error: 'Configuración de Factus no encontrada'
        };
        return;
      }

      // Usar el endpoint de Factus con filtro por nombre
      const url = `${config.api_url}/v1/municipalities?name=${encodeURIComponent(name)}`;

      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        timeout: 15000,
      });

      // La respuesta de Factus puede venir en data.data o directamente en data
      const municipalities = response.data?.data || response.data || [];

      // Formatear respuesta para el frontend
      const formattedMunicipalities = municipalities.map((muni: any) => ({
        id: muni.id,
        name: muni.name || muni.nombre,
        department: muni.department?.name || muni.department || muni.departamento,
        department_id: muni.department?.id || muni.department_id,
        // Para mostrar en el dropdown
        display: `${muni.name || muni.nombre} - ${muni.department?.name || muni.department || muni.departamento || 'Sin departamento'}`
      }));

      ctx.body = {
        success: true,
        data: formattedMunicipalities,
        total: formattedMunicipalities.length,
        search: name
      };

    } catch (error: any) {
      ctx.status = error.response?.status || 500;
      ctx.body = {
        success: false,
        error: error.message,
        details: error.response?.data
      };
    }
  },

  /**
   * GET /api/factus/municipalities/generate-mapping
   * Generar mapeo automático de códigos DANE a IDs de Factus
   * 
   * Este endpoint genera el código TypeScript listo para copiar
   * en factus-mapper.ts
   */
  async generateMapping(ctx) {
    try {
      // Obtener municipios
      const authService = strapi.service('api::factus.auth');
      const token = await authService.getToken();

      const config = await strapi.db.query('api::factus-config.factus-config').findOne({ where: {} });

      const response = await axios.get(
        `${config.api_url}/v1/municipalities`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
          timeout: 30000,
        }
      );

      const municipalities = response.data?.data || response.data || [];

      // Ciudades principales para mapear
      const mainCities = [
        { name: 'Bogotá', dane: '11001', variations: ['bogota', 'bogotá'] },
        { name: 'Medellín', dane: '05001', variations: ['medellin', 'medellín'] },
        { name: 'Cali', dane: '76001', variations: ['cali'] },
        { name: 'Barranquilla', dane: '08001', variations: ['barranquilla'] },
        { name: 'Cartagena', dane: '13001', variations: ['cartagena'] },
        { name: 'Cúcuta', dane: '54001', variations: ['cucuta', 'cúcuta'] },
        { name: 'Bucaramanga', dane: '68001', variations: ['bucaramanga'] },
        { name: 'Pereira', dane: '66001', variations: ['pereira'] },
        { name: 'Santa Marta', dane: '47001', variations: ['santa marta', 'santamarta'] },
        { name: 'Ibagué', dane: '73001', variations: ['ibague', 'ibagué'] },
        { name: 'Pasto', dane: '52001', variations: ['pasto'] },
        { name: 'Manizales', dane: '17001', variations: ['manizales'] },
        { name: 'Villavicencio', dane: '50001', variations: ['villavicencio'] },
        { name: 'Valledupar', dane: '20001', variations: ['valledupar'] },
      ];

      // Generar mapeo
      const mapping: Record<string, any> = {};
      const typeScriptCode: string[] = [];
      const notFound: string[] = [];

      typeScriptCode.push('// Mapeo de códigos DANE a IDs de Factus');
      typeScriptCode.push('// Generado automáticamente desde Factus API');
      typeScriptCode.push('const municipalityMap: Record<string, string> = {');

      for (const city of mainCities) {
        let found = null;

        // Buscar por todas las variaciones del nombre
        for (const variation of city.variations) {
          found = municipalities.find((muni: any) => {
            const name = (muni.name || muni.nombre || '').toLowerCase();
            return name.includes(variation);
          });
          if (found) break;
        }

        if (found) {
          mapping[city.dane] = {
            dane: city.dane,
            factus_id: String(found.id),
            name: city.name,
            factus_name: found.name || found.nombre,
          };

          typeScriptCode.push(`  '${city.dane}': '${found.id}',  // ${city.name}`);
        } else {
          notFound.push(city.name);
        }
      }

      typeScriptCode.push('};');

      // Agregar instrucciones de uso
      const instructions = [
        '',
        '// 📋 INSTRUCCIONES:',
        '// 1. Copia el código anterior',
        '// 2. Abre: src/api/factus/services/factus-mapper.ts',
        '// 3. Busca la función getMunicipalityIdForFactus()',
        '// 4. Reemplaza el objeto municipalityMap con este código',
        '// 5. Guarda y reinicia Strapi',
        '',
      ];

      ctx.body = {
        success: true,
        mapping,
        typescript_code: typeScriptCode.join('\n') + '\n' + instructions.join('\n'),
        not_found: notFound,
        total_mapped: Object.keys(mapping).length,
        instructions: [
          '1. Copia el código TypeScript del campo "typescript_code"',
          '2. Pégalo en factus-mapper.ts en getMunicipalityIdForFactus()',
          '3. Reemplaza el objeto municipalityMap existente',
          '4. Reinicia Strapi con: npm run develop',
        ],
      };

    } catch (error: any) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error.message,
      };
    }
  },

  // ═══════════════════════════════════════════════════════════
  // ENDPOINTS DE FACTURAS
  // ═══════════════════════════════════════════════════════════

  /**
   * GET /api/factus/invoice-status/:documentId
   * Consultar estado de una factura
   */
  async getInvoiceStatus(ctx) {
    try {
      const { documentId } = ctx.params;

      if (!documentId) {
        return ctx.badRequest('documentId es requerido');
      }

      const emissionService = strapi.service('api::factus.emission');
      const result = await emissionService.getInvoiceStatus(documentId);

      ctx.status = result.success ? 200 : 400;
      ctx.body = result;
    } catch (error) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        message: 'Error consultando estado',
        error: (error as Error).message,
      };
    }
  },

  /**
   * GET /api/factus/download-pdf/:documentId
   * Descargar PDF de factura
   */
  /**
   * 📥 Descargar PDF de factura
   * GET /api/factus/download-pdf/:documentId
   */
  async downloadPDF(ctx) {
    try {
      const { documentId } = ctx.params;
      const { returnBlob } = ctx.query;

      if (!documentId) {
        return ctx.badRequest('documentId es requerido');
      }

      // Determinar si es ID de Strapi (número) o factus_id (string con letras)
      let invoice = null;
      let factusDocumentId = null;
      
      // Detectar si es un número puro (ID de Strapi) o un string con letras (factus_id)
      const isNumericId = /^\d+$/.test(documentId);

      try {
        if (isNumericId) {
          // ✅ Es ID de Strapi (105, 106, etc.)
          invoice = await strapi.db.query('api::invoice.invoice').findOne({
            where: { id: parseInt(documentId) },
            select: ['*'],
          });
        } else {
          // ✅ Es factus_id (SETP990000049, etc.)
          invoice = await strapi.db.query('api::invoice.invoice').findOne({
            where: { factus_id: documentId },
            select: ['*'],
          });
          
          // Si lo encontramos por factus_id, ya tenemos el ID
          if (invoice) {
            factusDocumentId = documentId;
          }
        }
        
        if (invoice) {
          // Si buscamos por ID de Strapi, extraer el factus_id
          if (isNumericId) {
            if (invoice?.factus_id) {
              factusDocumentId = invoice.factus_id;
            } else if (invoice?.respuesta_factus) {
              // ✅ Intentar extraer de respuesta_factus si existe
              const extracted = this.extractFactusId(invoice.respuesta_factus);
              
              if (extracted) {
                factusDocumentId = extracted;
                
                // Guardar para futuras referencias
                await strapi.db.query('api::invoice.invoice').update({
                  where: { id: invoice.id },
                  data: { factus_id: extracted }
                });
              }
            }
          }
        }
      } catch (e) {
        // Error buscando factura en DB
      }

      // ✅ VALIDACIÓN: ¿Tenemos un factus_id válido?
      if (!factusDocumentId) {
        return ctx.badRequest({
          success: false,
          message: 'No se puede descargar el PDF',
          details: invoice 
            ? 'La factura existe pero no tiene un factus_id asociado. Esto significa que la emisión a Factus falló o no se completó correctamente. Por favor, verifica el estado de la factura e intenta emitirla nuevamente.'
            : 'Factura no encontrada en el sistema.',
          debug: {
            receivedId: documentId,
            isNumericId: isNumericId,
            has_invoice: !!invoice,
            has_factus_id: !!invoice?.factus_id,
            has_respuesta_factus: !!invoice?.respuesta_factus,
          }
        });
      }

      // Descargar el PDF desde Factus
      const emissionService = strapi.service('api::factus.emission');
      const result = await emissionService.downloadPDF(factusDocumentId);

      if (!result.success) {
        return ctx.badRequest({
          success: false,
          message: 'Error descargando PDF desde Factus',
          error: result.error,
          factus_id: factusDocumentId,
        });
      }

      // Procesar y enviar el PDF
      const pdfData = result.data?.data || result.data;
      const pdfBase64 = pdfData?.pdf_base_64_encoded || pdfData?.pdf_base64;
      const fileName = pdfData?.file_name || `factura-${factusDocumentId}`;

      if (pdfBase64) {
        if (returnBlob === 'true') {
          // Convertir base64 a buffer y enviar como blob
          const pdfBuffer = Buffer.from(pdfBase64, 'base64');

          ctx.set('Content-Type', 'application/pdf');
          ctx.set('Content-Disposition', `attachment; filename="${fileName}.pdf"`);
          ctx.body = pdfBuffer;
          return;
        } else {
          // Enviar como JSON con base64
          return ctx.send({
            success: true,
            data: {
              file_name: fileName,
              pdf_base64: pdfBase64,
            },
          });
        }
      } else if (pdfData?.pdf_url) {
        // Descargar desde URL y enviar
        const pdfResponse = await axios.get(pdfData.pdf_url, {
          responseType: 'arraybuffer',
          timeout: 30000,
        });

        ctx.set('Content-Type', 'application/pdf');
        ctx.set('Content-Disposition', `attachment; filename="${fileName}.pdf"`);
        ctx.body = Buffer.from(pdfResponse.data);
        return;
      } else {
        return ctx.badRequest({
          success: false,
          message: 'La respuesta de Factus no contiene el PDF',
          data: pdfData,
        });
      }

    } catch (error) {
      return ctx.internalServerError({
        success: false,
        message: 'Error interno del servidor',
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });
    }
  },

  /**
   * 🔧 Método auxiliar para extraer factus_id de respuesta
   */
  extractFactusId(response: any): string | null {
    if (!response) return null;
    
    // Prioridad 1: Campo "number" (el más usado para descargas)
    if (response.number && typeof response.number === 'string') {
      return String(response.number).trim();
    }
    
    // Prioridad 2: data.bill.number (respuesta anidada)
    if (response?.data?.bill?.number && typeof response.data.bill.number === 'string') {
      return String(response.data.bill.number).trim();
    }
    
    // Prioridad 3: Otros campos como fallback
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
  },



  /**
   * Método auxiliar para extraer document_id de respuesta de Factus
   */
  extractDocumentId(response: any): string | null {
    if (!response) return null;
    
    // PRIORIDAD 1: Buscar en rutas NESTED (Factus API devuelve: { data: { bill: { number: "SETP..." } } })
    if (response?.data?.bill?.number && typeof response.data.bill.number === 'string') {
      return String(response.data.bill.number).trim();
    }
    
    if (response?.data?.bill?.id && (typeof response.data.bill.id === 'string' || typeof response.data.bill.id === 'number')) {
      return String(response.data.bill.id).trim();
    }
    
    if (response?.data?.bill?.cufe && typeof response.data.bill.cufe === 'string') {
      return String(response.data.bill.cufe).trim();
    }
    
    // PRIORIDAD 2: Campos de nivel superior
    if (response.number && typeof response.number === 'string') {
      return String(response.number).trim();
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
    
    if (response.cufe && typeof response.cufe === 'string') {
      return String(response.cufe).trim();
    }
    
    if (response.cude && typeof response.cude === 'string') {
      return String(response.cude).trim();
    }
    
    return null;
  },
  // ═══════════════════════════════════════════════════════════
  // ENDPOINTS DE RANGOS DE NUMERACIÓN
  // ═══════════════════════════════════════════════════════════

  /**
   * GET /api/factus/numbering-ranges
   * Listar rangos de numeración locales (en Strapi)
   * 
   * Query params:
   * - tipo_documento: Filtrar por tipo de documento
   * - activo: true/false - Solo rangos activos
   */
  async listNumberingRanges(ctx) {
    try {
      const { tipo_documento, activo } = ctx.query;

      const numberingService = strapi.service('api::factus.numering');
      const ranges = await numberingService.listRanges({
        tipo_documento,
        activo: activo === 'true',
      });

      ctx.status = 200;
      ctx.body = {
        success: true,
        data: ranges,
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: (error as Error).message,
      };
    }
  },

  /**
   * GET /api/factus/numbering-range/:id/stats
   * Estadísticas de un rango de numeración
   */
  async getRangeStats(ctx) {
    try {
      const { id } = ctx.params;

      const numberingService = strapi.service('api::factus.numering');
      const stats = await numberingService.getRangeStats(parseInt(id));

      ctx.status = 200;
      ctx.body = {
        success: true,
        data: stats,
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: (error as Error).message,
      };
    }
  },

  /**
   * GET /api/factus/get-factus-ranges
   * Consultar rangos de numeración disponibles en Factus API
   * 
   * Este endpoint obtiene los rangos directamente de Factus,
   * útil para sincronizar con la base de datos local
   */
  async getFactusRanges(ctx) {
    try {
      const authService = strapi.service('api::factus.auth');

      // Obtener configuración y token
      const config = await strapi.db.query('api::factus-config.factus-config').findOne({
        where: {},
      });

      if (!config) {
        return ctx.badRequest('Configuración de Factus no encontrada');
      }

      // Obtener token
      const token = await authService.getToken();

      // Hacer petición a Factus para obtener rangos
      const response = await axios.get(
        `${config.api_url}/v1/numbering-ranges`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      ctx.status = 200;
      ctx.body = {
        success: true,
        message: 'Rangos obtenidos exitosamente',
        data: response.data,
      };
    } catch (error: any) {
      ctx.status = error.response?.status || 500;
      ctx.body = {
        success: false,
        message: 'Error consultando rangos de numeración',
        error: error.message,
        details: error.response?.data,
      };
    }
  },

  // ═══════════════════════════════════════════════════════════
  // ENDPOINTS DE VALIDACIÓN
  // ═══════════════════════════════════════════════════════════

  /**
   * POST /api/factus/validate-invoice
   * Validar factura antes de emitir
   * 
   * Body: { invoiceId: number }
   */
  async validateInvoice(ctx) {
    try {
      const { invoiceId } = ctx.request.body;

      if (!invoiceId) {
        return ctx.badRequest('invoiceId es requerido');
      }

      const mapperService = strapi.service('api::factus.mapper');
      const validation = await mapperService.validateInvoice(invoiceId);

      ctx.status = 200;
      ctx.body = {
        success: validation.valid,
        valid: validation.valid,
        errors: validation.errors,
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: (error as Error).message,
      };
    }
  },

  // ═══════════════════════════════════════════════════════════
  // ENDPOINTS DE UTILIDAD
  // ═══════════════════════════════════════════════════════════

  /**
   * GET /api/factus/token-info
   * Obtener información del token actual
   */
  async getTokenInfo(ctx) {
    try {
      const authService = strapi.service('api::factus.auth');
      const info = await authService.getTokenInfo();

      ctx.status = 200;
      ctx.body = {
        success: true,
        data: info,
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: (error as Error).message,
      };
    }
  },

  /**
   * POST /api/factus/sync-numbering-ranges
   * Sincronizar rangos de numeración desde Factus
   */
  async syncNumberingRanges(ctx) {
    try {
      const numberingService = strapi.service('api::factus.numering');
      const result = await numberingService.syncWithFactus();

      ctx.status = 200;
      ctx.body = {
        success: result.success,
        message: result.success 
          ? `✅ ${result.synced} rangos sincronizados` 
          : '❌ Error en sincronización',
        synced: result.synced,
        errors: result.errors,
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: (error as Error).message,
      };
    }
  },
};
