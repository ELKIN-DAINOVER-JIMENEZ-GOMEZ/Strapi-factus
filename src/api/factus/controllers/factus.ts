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

      strapi.log.info(`📤 Solicitud de emisión de factura ${invoiceId}`);

      // Llamar al servicio de emisión
      const emissionService = strapi.service('api::factus.factus-emission');
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
        };
      }
    } catch (error) {
      strapi.log.error('❌ Error en emitInvoice controller:', error);
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
      const authService = strapi.service('api::factus.factus-auth');
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
      strapi.log.info('🏙️ Consultando municipios de Factus...');

      // Obtener token de autenticación
      const authService = strapi.service('api::factus.factus-auth');
      const token = await authService.getToken();

      // Obtener configuración
      const configResult = await strapi.entityService.findMany(
        'api::factus-config.factus-config'
      );
      const config = Array.isArray(configResult) ? configResult[0] : configResult;

      if (!config) {
        ctx.status = 500;
        ctx.body = {
          success: false,
          error: 'Configuración de Factus no encontrada'
        };
        return;
      }

      strapi.log.info(`📡 Consultando: ${config.api_url}/v1/municipalities`);

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

      strapi.log.info(`✅ ${response.data?.data?.length || 0} municipios obtenidos`);

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
      strapi.log.error('❌ Error consultando municipios:', error);
      
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

      strapi.log.info(`🔍 Buscando municipio: ${name}`);

      // Obtener token
      const authService = strapi.service('api::factus.factus-auth');
      const token = await authService.getToken();

      // Obtener configuración
      const configResult = await strapi.entityService.findMany(
        'api::factus-config.factus-config'
      );
      const config = Array.isArray(configResult) ? configResult[0] : configResult;

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

      strapi.log.info(`✅ ${matches.length} coincidencias encontradas`);

      ctx.body = {
        success: true,
        search: name,
        matches,
        total: matches.length,
      };

    } catch (error: any) {
      strapi.log.error('❌ Error buscando municipio:', error);
      
      ctx.status = error.response?.status || 500;
      ctx.body = {
        success: false,
        error: error.message,
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
      strapi.log.info('🗺️ Generando mapeo DANE → Factus...');

      // Obtener municipios
      const authService = strapi.service('api::factus.factus-auth');
      const token = await authService.getToken();

      const configResult = await strapi.entityService.findMany(
        'api::factus-config.factus-config'
      );
      const config = Array.isArray(configResult) ? configResult[0] : configResult;

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
          strapi.log.warn(`⚠️ No se encontró: ${city.name}`);
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
      strapi.log.error('❌ Error generando mapeo:', error);
      
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

      const emissionService = strapi.service('api::factus.factus-emission');
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
  async downloadPDF(ctx) {
    try {
      const { documentId } = ctx.params;
      const { returnBlob } = ctx.query;

      if (!documentId) {
        return ctx.badRequest('documentId es requerido');
      }

      const emissionService = strapi.service('api::factus.factus-emission');
      const result = await emissionService.downloadPDF(documentId);

      if (!result.success) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          error: result.error,
        };
        return;
      }

      // Si solicita blob o si existe PDF en base64, descargar como archivo
      if (returnBlob === 'true' && result.data?.pdf_base64) {
        try {
          // Convertir base64 a buffer
          const buffer = Buffer.from(result.data.pdf_base64, 'base64');
          
          ctx.type = 'application/pdf';
          ctx.set('Content-Disposition', `attachment; filename="factura-${documentId}.pdf"`);
          ctx.body = buffer;
          ctx.status = 200;
          return;
        } catch (error) {
          strapi.log.error('❌ Error convirtiendo base64 a PDF:', error);
        }
      }

      // Si existe URL, redirigir o devolverla
      if (result.data?.pdf_url) {
        ctx.status = 200;
        ctx.body = {
          success: true,
          pdf_url: result.data.pdf_url,
          pdf_base64: result.data.pdf_base64 || null,
          message: 'URL del PDF disponible'
        };
        return;
      }

      // Fallback: devolver respuesta JSON
      ctx.status = 200;
      ctx.body = {
        success: true,
        data: result.data,
        message: 'Datos del PDF disponibles'
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

      const numberingService = strapi.service('api::factus.factus-numbering');
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

      const numberingService = strapi.service('api::factus.factus-numbering');
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
      strapi.log.info('📝 Consultando rangos de numeración en Factus API...');

      const authService = strapi.service('api::factus.factus-auth');

      // Obtener configuración y token
      const config = await strapi.db.query('api::factus-config.factus-config').findOne({
        where: {},
      });

      if (!config) {
        return ctx.badRequest('Configuración de Factus no encontrada');
      }

      // Obtener token
      const token = await authService.getToken();

      strapi.log.info('🔑 Token obtenido, consultando rangos...');

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

      strapi.log.info('✅ Rangos obtenidos de Factus:');
      strapi.log.info(JSON.stringify(response.data, null, 2));

      ctx.status = 200;
      ctx.body = {
        success: true,
        message: 'Rangos obtenidos exitosamente',
        data: response.data,
      };
    } catch (error: any) {
      strapi.log.error('❌ Error consultando rangos:', error);
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

      const mapperService = strapi.service('api::factus.factus-mapper');
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
      const authService = strapi.service('api::factus.factus-auth');
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
      strapi.log.info('🔄 Sincronizando rangos de numeración...');

      const numberingService = strapi.service('api::factus.factus-numbering');
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