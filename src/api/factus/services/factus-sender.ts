/**
 * Servicio de Envío a Factus API - VERSIÓN DEBUG MEJORADA
 * Ubicación: src/api/factus/services/factus-sender.ts
 * 
 * ✅ Logging detallado de errores de Factus
 */

import axios, { AxiosError, AxiosResponse } from 'axios';
import type { FactusConfig } from '../types/factus.types';

interface FactusInvoicePayload {
  numbering_range_id: number;
  reference_code: string;
  observation: string;
  payment_form: string;
  payment_due_date: string;
  payment_method_code: string;
  operation_type: number;
  send_email: boolean;
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

interface FactusApiResponse {
  id?: number;
  document_id?: string;
  uuid?: string;
  status?: string;
  cufe?: string;
  cude?: string;
  qr_code?: string;
  pdf_url?: string;
  xml_url?: string;
  pdf_base64?: string;
  xml_base64?: string;
  message?: string;
  created_at?: string;
  updated_at?: string;
  error?: string;
  errors?: Array<{
    field?: string;
    message: string;
    code?: string;
  }>;
}

interface SendOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export default {
  async sendInvoice(
    payload: FactusInvoicePayload,
    options: SendOptions = {}
  ): Promise<{
    success: boolean;
    data?: FactusApiResponse;
    error?: string;
    statusCode?: number;
  }> {
    const {
      timeout = 30000,
      retries = 2,
      retryDelay = 2000,
    } = options;

    let lastError: any;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt > 0) {
          strapi.log.warn(`🔄 Reintento ${attempt}/${retries}...`);
          await this.sleep(retryDelay * attempt);
        }

        strapi.log.info('🚀 Enviando factura a Factus API...');

        const { token, config } = await this.getAuthConfig();
        const url = `${config.api_url}/v1/bills/validate`;

        // ✅ LOG DETALLADO DEL PAYLOAD
        strapi.log.info('═══════════════════════════════════════════════');
        strapi.log.info('📦 PAYLOAD COMPLETO A ENVIAR:');
        strapi.log.info('═══════════════════════════════════════════════');
        strapi.log.info(JSON.stringify(payload, null, 2));
        strapi.log.info('═══════════════════════════════════════════════');

        const response: AxiosResponse<FactusApiResponse> = await axios.post(
          url,
          payload,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            timeout,
            validateStatus: (status) => status < 500,
          }
        );

        strapi.log.info(`📥 Respuesta recibida: HTTP ${response.status}`);

        if (response.status >= 200 && response.status < 300) {
          strapi.log.info('✅ Factura enviada exitosamente');
          
          // 📋 LOG DETALLADO DE LA RESPUESTA EXITOSA
          strapi.log.info('═══════════════════════════════════════════════');
          strapi.log.info('📥 RESPUESTA EXITOSA COMPLETA:');
          strapi.log.info('═══════════════════════════════════════════════');
          strapi.log.info(JSON.stringify(response.data, null, 2));
          strapi.log.info('═══════════════════════════════════════════════');
          
          // Extractar document_id para verificar
          const docId = response.data?.document_id || 
                       response.data?.id ||
                       response.data?.uuid;
          strapi.log.info(`🔑 Document ID identificado: ${docId || 'NO ENCONTRADO'}`);
          
          return {
            success: true,
            data: response.data,
            statusCode: response.status,
          };
        }

        if (response.status >= 200 && response.status < 300) {
  strapi.log.info('✅ Respuesta exitosa de Factus');
  
  // 🔍 LOG TEMPORAL PARA DEBUGGING
  strapi.log.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  strapi.log.error('🔍 RESPUESTA COMPLETA DE FACTUS:');
  strapi.log.error(JSON.stringify(response.data, null, 2));
  strapi.log.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  return {
    success: true,
    data: response.data,
    statusCode: response.status,
  };
}

        // ✅ ERROR 4xx - LOG SUPER DETALLADO
        if (response.status >= 400 && response.status < 500) {
          const errorData = response.data;
          
          strapi.log.error('\n╔═══════════════════════════════════════════════════════╗');
          strapi.log.error('║  ❌ ERROR DE FACTUS API - ANÁLISIS DETALLADO         ║');
          strapi.log.error('╚═══════════════════════════════════════════════════════╝\n');
          
          strapi.log.error(`📍 Status: ${response.status} ${response.statusText}`);
          strapi.log.error(`🔗 URL: ${url}\n`);

          // Analizar estructura del error
          strapi.log.error('📋 ESTRUCTURA DEL ERROR:');
          strapi.log.error(`   Tipo: ${typeof errorData}`);
          strapi.log.error(`   Keys: ${Object.keys(errorData).join(', ')}\n`);

          // Mostrar error completo formateado
          strapi.log.error('📄 RESPUESTA COMPLETA:');
          strapi.log.error(JSON.stringify(errorData, null, 2));
          strapi.log.error('\n');

          // Extraer mensaje específico
          const errorMessage = this.parseErrorMessage(errorData);
          strapi.log.error('💬 MENSAJE PARSEADO:');
          strapi.log.error(`   "${errorMessage}"\n`);

          // Si hay errores de validación, mostrarlos en detalle
          if (errorData.errors && Array.isArray(errorData.errors)) {
            strapi.log.error('🔍 ERRORES DE VALIDACIÓN DETALLADOS:');
            errorData.errors.forEach((err, index) => {
              strapi.log.error(`   ${index + 1}. Campo: ${err.field || 'N/A'}`);
              strapi.log.error(`      Mensaje: ${err.message}`);
              strapi.log.error(`      Código: ${err.code || 'N/A'}\n`);
            });
          }

          // Analizar campos del payload que podrían estar fallando
          strapi.log.error('🔎 ANÁLISIS DEL PAYLOAD ENVIADO:');
          strapi.log.error('   Customer (Cliente):');
          strapi.log.error(`      - identification: ${payload.customer.identification}`);
          strapi.log.error(`      - names: ${payload.customer.names}`);
          strapi.log.error(`      - email: ${payload.customer.email}`);
          strapi.log.error(`      - municipality_id: ${payload.customer.municipality_id}`);
          strapi.log.error(`      - phone: ${payload.customer.phone}`);
          strapi.log.error(`      - address: ${payload.customer.address}`);
          strapi.log.error('   Establishment (Empresa):');
          strapi.log.error(`      - name: ${payload.establishment.name}`);
          strapi.log.error(`      - municipality_id: ${payload.establishment.municipality_id}`);
          strapi.log.error('   General:');
          strapi.log.error(`      - numbering_range_id: ${payload.numbering_range_id}`);
          strapi.log.error(`      - reference_code: ${payload.reference_code}`);
          strapi.log.error(`      - items count: ${payload.items?.length || 0}\n`);

          strapi.log.error('╔═══════════════════════════════════════════════════════╗');
          strapi.log.error('║  FIN DEL ANÁLISIS DE ERROR                           ║');
          strapi.log.error('╚═══════════════════════════════════════════════════════╝\n');

          return {
            success: false,
            data: errorData,
            error: errorMessage,
            statusCode: response.status,
          };
        }

        throw new Error(`Server error: ${response.status}`);

      } catch (error) {
        lastError = error;
        const axiosError = error as AxiosError<FactusApiResponse>;

        if (axiosError.response) {
          const status = axiosError.response.status;
          const errorData = axiosError.response.data;

          strapi.log.error(`❌ Error HTTP ${status}`);

          if (status >= 400 && status < 500) {
            return {
              success: false,
              data: errorData,
              error: this.parseErrorMessage(errorData),
              statusCode: status,
            };
          }

          if (attempt < retries) {
            strapi.log.warn(`⚠️ Error ${status}, reintentando...`);
            continue;
          }

        } else if (axiosError.request) {
          strapi.log.error('❌ Sin respuesta de Factus:', {
            message: axiosError.message,
            code: axiosError.code,
          });

          if (attempt < retries) {
            strapi.log.warn('⚠️ Timeout, reintentando...');
            continue;
          }
        } else {
          strapi.log.error('❌ Error configurando petición:', axiosError.message);
        }
      }
    }

    return {
      success: false,
      error: `Error después de ${retries + 1} intentos: ${this.getErrorMessage(lastError)}`,
    };
  },

  async getAuthConfig(): Promise<{
    token: string;
    config: FactusConfig;
  }> {
    const authService = strapi.service('api::factus.factus-auth');
    const token = await authService.getToken();

    const configResult = await strapi.entityService.findMany(
      'api::factus-config.factus-config'
    );
    const config: FactusConfig = Array.isArray(configResult) 
      ? configResult[0] 
      : configResult;

    if (!config) {
      throw new Error('Configuración de Factus no encontrada');
    }

    return { token, config };
  },

  async getDocumentStatus(documentId: string | number): Promise<{
    success: boolean;
    data?: FactusApiResponse;
    error?: string;
  }> {
    try {
      const { token, config } = await this.getAuthConfig();

      const response = await axios.get<FactusApiResponse>(
        `${config.api_url}/v1/bills/${documentId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
          timeout: 10000,
        }
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: this.getErrorMessage(error),
      };
    }
  },

  /**
   * ✅ MÉTODO DE SERVICIO REAL para descargar PDF desde Factus API
   * Endpoint de Factus: GET /v1/bills/download-pdf/:number
   * 
   * @param factusNumber - El número de factura de Factus (ej: fv09017242540002400000032)
   *                       o el ID de documento (ej: SETP990020123)
   */
  async downloadPDF(factusNumber: string): Promise<{
    success: boolean;
    data?: {
      file_name?: string;
      pdf_base_64_encoded?: string;
      pdf_base64?: string;
      pdf_url?: string;
    };
    error?: string;
  }> {
    try {
      strapi.log.info(`📥 [SENDER] Descargando PDF desde Factus API para: ${factusNumber}`);
      
      const { token, config } = await this.getAuthConfig();
      const url = `${config.api_url}/v1/bills/download-pdf/${factusNumber}`;
      
      strapi.log.info(`📡 URL de descarga: ${url}`);

      const response = await axios.get(
        url,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      strapi.log.info(`✅ Respuesta de Factus recibida - Status: ${response.status}`);
      strapi.log.debug('📦 Datos recibidos:', JSON.stringify(response.data, null, 2));

      // La respuesta de Factus viene en formato:
      // { status: "OK", message: "...", data: { file_name: "...", pdf_base_64_encoded: "..." } }
      const pdfData = response.data?.data || response.data;
      
      if (pdfData?.pdf_base_64_encoded || pdfData?.pdf_base64 || pdfData?.pdf_url) {
        strapi.log.info('✅ PDF obtenido correctamente de Factus');
        return {
          success: true,
          data: {
            file_name: pdfData.file_name,
            pdf_base_64_encoded: pdfData.pdf_base_64_encoded,
            pdf_base64: pdfData.pdf_base64,
            pdf_url: pdfData.pdf_url,
          },
        };
      } else {
        strapi.log.error('❌ La respuesta de Factus no contiene datos del PDF');
        strapi.log.error('Respuesta completa:', JSON.stringify(response.data, null, 2));
        return {
          success: false,
          error: 'La respuesta de Factus no contiene el PDF',
        };
      }
    } catch (error: any) {
      strapi.log.error('❌ Error descargando PDF desde Factus:', error.message);
      
      if (error.response) {
        strapi.log.error(`   Status: ${error.response.status}`);
        strapi.log.error(`   Data: ${JSON.stringify(error.response.data, null, 2)}`);
        
        // Si es 400, puede ser que el número de factura no sea válido
        if (error.response.status === 400) {
          const errorMsg = error.response.data?.message || 
                          error.response.data?.error ||
                          'Número de factura inválido o no encontrado en Factus';
          return {
            success: false,
            error: `Error 400: ${errorMsg}. El número de factura "${factusNumber}" no es válido para Factus API. El formato esperado es similar a: fv09017242540002400000032`,
          };
        }
      }
      
      return {
        success: false,
        error: this.getErrorMessage(error),
      };
    }
  },

  // ═══════════════════════════════════════════════════════════
  // CONTROLADOR downloadPDF (para rutas HTTP - NO usar como servicio)
  // ═══════════════════════════════════════════════════════════
  async downloadPDFController(ctx) {
    try {
      const { documentId } = ctx.params;
      const { returnBlob } = ctx.query;

      if (!documentId) {
        return ctx.badRequest('documentId es requerido');
      }

      strapi.log.info(`📥 [DOWNLOAD-PDF] Iniciando descarga para documento: ${documentId}`);

      // ✅ PASO 1: Buscar la factura en Strapi usando db.query
      let invoice = null;
      let factusDocumentId = null;

      try {
        // ✅ CORRECCIÓN: Usar db.query para traer TODOS los campos
        invoice = await strapi.db.query('api::invoice.invoice').findOne({
          where: { id: parseInt(documentId) },
          select: ['*'],  // ✅ Todos los campos
        });
        
        if (!invoice) {
          strapi.log.error(`❌ Factura ${documentId} NO encontrada en DB`);
        } else {
          strapi.log.info(`📊 Factura ${documentId} encontrada en DB:`);
          strapi.log.info(`   - factus_id: ${invoice?.factus_id || '❌ NO EXISTE'}`);
          strapi.log.info(`   - estado_local: ${invoice?.estado_local}`);
          strapi.log.info(`   - estado_dian: ${invoice?.estado_dian || 'N/A'}`);
          
          if (invoice?.factus_id) {
            factusDocumentId = invoice.factus_id;
            strapi.log.info(`✅ Usando factus_id: ${factusDocumentId}`);
          } else {
            strapi.log.warn('⚠️ La factura NO tiene factus_id guardado');
            
            // ✅ Intentar extraer de respuesta_factus si existe
            if (invoice?.respuesta_factus) {
              strapi.log.info('🔍 Intentando extraer de respuesta_factus...');
              
              const extracted = this.extractFactusId(invoice.respuesta_factus);
              
              if (extracted) {
                factusDocumentId = extracted;
                strapi.log.info(`✅ ID extraído de respuesta: ${factusDocumentId}`);
                
                // Guardar para futuras referencias
                await strapi.db.query('api::invoice.invoice').update({
                  where: { id: parseInt(documentId) },
                  data: { factus_id: extracted }
                });
                strapi.log.info('💾 factus_id guardado en DB para futuras descargas');
              } else {
                strapi.log.error('❌ No se pudo extraer factus_id de respuesta_factus');
              }
            }
          }
        }
      } catch (e) {
        strapi.log.error('❌ Error buscando factura en DB:', e.message);
        strapi.log.error('Stack:', e.stack);
      }

      // ✅ VALIDACIÓN: ¿Tenemos un factus_id válido?
      if (!factusDocumentId) {
        strapi.log.error('❌ CRÍTICO: No se pudo determinar el factus_id');
        
        return ctx.badRequest({
          success: false,
          message: 'No se puede descargar el PDF',
          details: invoice 
            ? 'La factura existe pero no tiene un factus_id asociado. Esto significa que la emisión a Factus falló o no se completó correctamente. Por favor, verifica el estado de la factura e intenta emitirla nuevamente.'
            : 'Factura no encontrada en el sistema.',
          debug: {
            invoiceId: documentId,
            has_invoice: !!invoice,
            has_factus_id: !!invoice?.factus_id,
            has_respuesta_factus: !!invoice?.respuesta_factus,
          }
        });
      }

      // ✅ PASO 2: PRIORIZAR public_url si está disponible (es único en sandbox)
      // La public_url es única para cada factura incluso en sandbox
      const publicUrl = invoice?.url_pdf || 
                       invoice?.respuesta_factus?.data?.bill?.public_url;
      
      if (publicUrl) {
        strapi.log.info(`📥 Usando URL pública única: ${publicUrl}`);
        
        // Redirigir al usuario a la URL pública
        if (returnBlob === 'true') {
          try {
            // Descargar desde la URL pública
            const pdfResponse = await axios.get(publicUrl, {
              responseType: 'arraybuffer',
              timeout: 30000,
              headers: {
                'Accept': 'application/pdf,text/html,*/*',
              },
            });

            // Verificar si recibimos HTML (página web) o PDF
            const contentType = pdfResponse.headers['content-type'] || '';
            
            if (contentType.includes('text/html')) {
              // Es una página web, redirigir al usuario
              strapi.log.info('📄 La URL es una página web, redirigiendo...');
              return ctx.send({
                success: true,
                redirect: true,
                url: publicUrl,
                message: 'Abrir en navegador para ver la factura'
              });
            }

            ctx.set('Content-Type', 'application/pdf');
            ctx.set('Content-Disposition', `attachment; filename="factura-${invoice?.numero_factura || factusDocumentId}.pdf"`);
            ctx.body = Buffer.from(pdfResponse.data);
            
            strapi.log.info('✅ PDF descargado desde URL pública');
            return;
          } catch (urlError) {
            strapi.log.warn(`⚠️ Error descargando desde URL pública: ${urlError.message}`);
            strapi.log.info('🔄 Intentando con API de Factus...');
          }
        } else {
          // Solo devolver la URL para que el frontend la abra
          return ctx.send({
            success: true,
            redirect: true,
            url: publicUrl,
          });
        }
      }

      // ✅ PASO 3: Fallback - Descargar el PDF desde Factus API
      strapi.log.info(`📥 Descargando PDF desde Factus API con ID: ${factusDocumentId}`);
      
      const emissionService = strapi.service('api::factus.factus-emission');
      const result = await emissionService.downloadPDF(factusDocumentId);

      if (!result.success) {
        strapi.log.error('❌ Error descargando PDF desde Factus:', result.error);
        return ctx.badRequest({
          success: false,
          message: 'Error descargando PDF desde Factus',
          error: result.error,
          factus_id: factusDocumentId,
        });
      }

      // ✅ PASO 3: Procesar y enviar el PDF
      const pdfData = result.data?.data || result.data;
      const pdfBase64 = pdfData?.pdf_base_64_encoded || pdfData?.pdf_base64;
      const fileName = pdfData?.file_name || `factura-${factusDocumentId}`;

      if (pdfBase64) {
        strapi.log.info('✅ PDF obtenido como base64');
        
        if (returnBlob === 'true') {
          // Convertir base64 a buffer y enviar como blob
          const pdfBuffer = Buffer.from(pdfBase64, 'base64');

          ctx.set('Content-Type', 'application/pdf');
          ctx.set('Content-Disposition', `attachment; filename="${fileName}.pdf"`);
          ctx.body = pdfBuffer;
          
          strapi.log.info(`✅ PDF enviado como blob (${pdfBuffer.length} bytes)`);
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
        strapi.log.info(`📥 Descargando PDF desde URL: ${pdfData.pdf_url}`);
        
        const pdfResponse = await axios.get(pdfData.pdf_url, {
          responseType: 'arraybuffer',
          timeout: 30000,
        });

        ctx.set('Content-Type', 'application/pdf');
        ctx.set('Content-Disposition', `attachment; filename="${fileName}.pdf"`);
        ctx.body = Buffer.from(pdfResponse.data);
        
        strapi.log.info('✅ PDF descargado y enviado');
        return;
      } else {
        strapi.log.error('❌ La respuesta de Factus no contiene PDF');
        return ctx.badRequest({
          success: false,
          message: 'La respuesta de Factus no contiene el PDF',
          data: pdfData,
        });
      }

    } catch (error) {
      strapi.log.error('❌ Error en downloadPDF controller:', error);
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
    
    strapi.log.debug('🔍 Analizando respuesta para extraer factus_id...');
    
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
    
    strapi.log.error('❌ No se pudo extraer factus_id de ningún campo conocido');
    return null;
  },

  async listDocuments(filters?: {
    desde?: string;
    hasta?: string;
    estado?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      const { token, config } = await this.getAuthConfig();

      const params = new URLSearchParams();
      if (filters?.desde) params.append('from_date', filters.desde);
      if (filters?.hasta) params.append('to_date', filters.hasta);
      if (filters?.estado) params.append('status', filters.estado);
      if (filters?.page) params.append('page', filters.page.toString());
      if (filters?.limit) params.append('limit', filters.limit.toString());

      const response = await axios.get(
        `${config.api_url}/v1/bills?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
          timeout: 15000,
        }
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: this.getErrorMessage(error),
      };
    }
  },

  parseErrorMessage(data: any): string {
    if (!data) return 'Error desconocido';

    if (data.error && typeof data.error === 'string') {
      return data.error;
    }

    if (data.error && typeof data.error === 'object') {
      if (data.error.message) return data.error.message;
      return JSON.stringify(data.error);
    }

    if (data.message && typeof data.message === 'string') {
      return data.message;
    }

    if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
      return data.errors
        .map((err: any) => {
          const field = err.field ? `[${err.field}] ` : '';
          const msg = err.message || JSON.stringify(err);
          return `${field}${msg}`;
        })
        .join(', ');
    }

    if (data.validation_errors && typeof data.validation_errors === 'object') {
      const errors = Object.entries(data.validation_errors)
        .map(([field, messages]) => {
          if (Array.isArray(messages)) {
            return `${field}: ${(messages as string[]).join(', ')}`;
          }
          return `${field}: ${messages}`;
        })
        .join('; ');
      return `Errores de validación: ${errors}`;
    }

    if (data.detail && typeof data.detail === 'string') {
      return data.detail;
    }

    if (data.details && Array.isArray(data.details) && data.details.length > 0) {
      return data.details
        .map((detail: any) => {
          if (typeof detail === 'string') return detail;
          if (detail.msg) return `[${detail.loc?.join('.')}] ${detail.msg}`;
          return JSON.stringify(detail);
        })
        .join('; ');
    }

    if (data.code && data.description) {
      return `${data.code}: ${data.description}`;
    }

    if (typeof data === 'object') {
      try {
        return JSON.stringify(data, null, 2);
      } catch (e) {
        return 'Error desconocido (no serializable)';
      }
    }

    return 'Error desconocido';
  },

  getErrorMessage(error: any): string {
    if (error instanceof Error) {
      return error.message;
    }
    
    if (typeof error === 'string') {
      return error;
    }

    if (error?.message) {
      return error.message;
    }

    return 'Error desconocido';
  },

  sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  validatePayload(payload: FactusInvoicePayload): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!payload.numbering_range_id) {
      errors.push('numbering_range_id es requerido');
    }

    if (!payload.reference_code) {
      errors.push('reference_code es requerido');
    }

    if (!payload.establishment?.name) {
      errors.push('establishment.name es requerido');
    }

    if (!payload.customer?.identification) {
      errors.push('customer.identification es requerido');
    }

    if (!payload.customer?.email) {
      errors.push('customer.email es requerido');
    }

    if (!payload.customer?.municipality_id) {
      errors.push('customer.municipality_id es requerido');
    }

    if (!payload.items || payload.items.length === 0) {
      errors.push('Debe haber al menos un item');
    }

    payload.items?.forEach((item, index) => {
      if (!item.name) {
        errors.push(`Item ${index + 1}: nombre es requerido`);
      }
      if (!item.code_reference) {
        errors.push(`Item ${index + 1}: código es requerido`);
      }
      if (item.quantity <= 0) {
        errors.push(`Item ${index + 1}: cantidad debe ser mayor a 0`);
      }
      if (item.price <= 0) {
        errors.push(`Item ${index + 1}: precio debe ser mayor a 0`);
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  },
};