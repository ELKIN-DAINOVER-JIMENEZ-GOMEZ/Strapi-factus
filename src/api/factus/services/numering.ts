
import type { NumberingRange } from '../types/factus.types';

export default {
 
  async getActiveRange(
    tipoDocumento: 'factura' | 'nota_credito' | 'nota_debito' | 'factura_exportacion' = 'factura'
  ): Promise<NumberingRange> {
    try {

      const ranges = await strapi.entityService.findMany(
        'api::numering-range.numering-range',
        {
          filters: {
            tipo_documento: tipoDocumento,
            activo: true,
          },
          sort: { id: 'desc' }, // Más reciente primero
          limit: 1,
        }
      ) as  NumberingRange[];

      if (!ranges || ranges.length === 0) {
        throw new Error(
          ` No hay rangos de numeración activos para ${tipoDocumento}. ` +
          'Ve a Content Manager → Numbering Range y crea uno.'
        );
      }

      const range = Array.isArray(ranges) ? ranges[0] : ranges;

      // Validar que aún hay números disponibles
      if (range.consecutivo_actual >= range.hasta) {
        throw new Error(
          ` Rango de numeración agotado. ` +
          `${range.prefijo}: ${range.desde} - ${range.hasta}. ` +
          `Actual: ${range.consecutivo_actual}. Crea un nuevo rango.`
        );
      }

      return range;
    } catch (error) {
      throw error;
    }
  },

  
  async getNextConsecutive(rangeId: number): Promise<number> {
    try {

      const range = await strapi.entityService.findOne(
        'api::numering-range.numering-range',
        rangeId
      ) as NumberingRange;

      if (!range) {
        throw new Error(`Rango ${rangeId} no encontrado`);
      }

      const nextConsecutive = range.consecutivo_actual;

      // Validar que no exceda el límite
      if (nextConsecutive > range.hasta) {
        throw new Error(
          `Consecutivo ${nextConsecutive} excede el límite del rango (${range.hasta})`
        );
      }

      return nextConsecutive;
    } catch (error) {
      throw error;
    }
  },

  
  async incrementConsecutive(rangeId: number): Promise<number> {
    try {

      const range = await strapi.entityService.findOne(
        'api::numering-range.numering-range',
        rangeId
      ) as NumberingRange;

      if (!range) {
        throw new Error(`Rango ${rangeId} no encontrado`);
      }

      const newConsecutive = range.consecutivo_actual + 1;

      // Verificar que no exceda el límite
      if (newConsecutive > range.hasta) {
        // El rango está llegando al límite
      }

      // Actualizar en base de datos
      await strapi.entityService.update(
        'api::numering-range.numering-range',
        rangeId,
        {
          data: {
            consecutivo_actual: newConsecutive,
          },
        }
      );

      return newConsecutive;
    } catch (error) {
      throw error;
    }
  },

  
  async listRanges(filters?: {
    tipo_documento?: string;
    activo?: boolean;
  }): Promise<NumberingRange[]> {
    try {
      const queryFilters: any = {};

      if (filters?.tipo_documento) {
        queryFilters.tipo_documento = filters.tipo_documento;
      }

      if (filters?.activo !== undefined) {
        queryFilters.activo = filters.activo;
      }

      const ranges = await strapi.entityService.findMany(
        'api::numering-range.numering-range',
        {
          filters: queryFilters,
          sort: { id: 'desc' },
        }
      ) as NumberingRange[];

      return Array.isArray(ranges) ? ranges : [ranges];
    } catch (error) {
      throw error;
    }
  },

 
  async getRangeStats(rangeId: number): Promise<{
    range: NumberingRange;
    disponibles: number;
    utilizados: number;
    porcentaje_uso: string;
    estado: 'OK' | 'ADVERTENCIA' | 'CRÍTICO';
  }> {
    try {
      const range = await strapi.entityService.findOne(
        'api::numering-range.numering-range',
        rangeId
      ) as NumberingRange;

      if (!range) {
        throw new Error(`Rango ${rangeId} no encontrado`);
      }

      const total = range.hasta - range.desde + 1;
      const utilizados = range.consecutivo_actual - range.desde;
      const disponibles = range.hasta - range.consecutivo_actual + 1;
      const porcentajeUso = ((utilizados / total) * 100).toFixed(2);

      // Determinar estado
      let estado: 'OK' | 'ADVERTENCIA' | 'CRÍTICO' = 'OK';
      if (disponibles < 100) {
        estado = 'CRÍTICO';
      } else if (disponibles < 500) {
        estado = 'ADVERTENCIA';
      }

      return {
        range,
        disponibles,
        utilizados,
        porcentaje_uso: `${porcentajeUso}%`,
        estado,
      };
    } catch (error) {
      throw error;
    }
  },

  async validateInvoiceNumber(
    prefijo: string,
    consecutivo: number
  ): Promise<{
    valid: boolean;
    message: string;
    range?: NumberingRange;
  }> {
    try {
      // Buscar rango con ese prefijo
      const ranges = await strapi.entityService.findMany(
        'api::numering-range.numering-range',
        {
          filters: {
            prefijo: prefijo,
            activo: true,
          },
        }
      ) as NumberingRange[];

      if (!ranges || ranges.length === 0) {
        return {
          valid: false,
          message: `No existe rango activo con prefijo ${prefijo}`,
        };
      }

      const range = Array.isArray(ranges) ? ranges[0] : ranges;

      // Validar que el consecutivo esté dentro del rango
      if (consecutivo < range.desde || consecutivo > range.hasta) {
        return {
          valid: false,
          message: `Consecutivo ${consecutivo} fuera del rango ${range.desde}-${range.hasta}`,
          range,
        };
      }

      return {
        valid: true,
        message: 'Número válido',
        range,
      };
    } catch (error) {
      return {
        valid: false,
        message: `Error validando: ${(error as Error).message}`,
      };
    }
  },

 
  async syncWithFactus(): Promise<{
    success: boolean;
    synced: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let synced = 0;

    try {
      // Obtener token
      const authService = strapi.service('api::factus.auth');
      const token = await authService.getToken();

      // Obtener configuración
      const config = await strapi.db.query('api::factus-config.factus-config').findOne({ where: {} });


      return {
        success: true,
        synced,
        errors,
      };
    } catch (error) {
      errors.push((error as Error).message);
      return {
        success: false,
        synced,
        errors,
      };
    }
  },

 
  async createRange(data: {
    factus_id: number;
    nombre: string;
    prefijo: string;
    resolucion_dian: string;
    desde: number;
    hasta: number;
    tipo_documento?: 'factura' | 'nota_credito' | 'nota_debito' | 'factura_exportacion';
    fecha_resolucion?: Date | string;
    fecha_vencimiento?: Date | string;
  }): Promise<NumberingRange> {
    try {
      const range = await strapi.entityService.create(
        'api::numering-range.numering-range',
        {
          data: {
            ...data,
            consecutivo_actual: data.desde,
            tipo_documento: data.tipo_documento || 'factura',
            activo: true,
            publishedAt: new Date(),
          },
        }
      ) as NumberingRange;

      return range;
    } catch (error) {
      throw error;
    }
  },

  
  async deactivateRange(rangeId: number): Promise<void> {
    try {
      await strapi.entityService.update(
        'api::numering-range.numering-range',
        rangeId,
        {
          data: {
            activo: false,
          },
        }
      );

    } catch (error) {
      throw error;
    }
  },
};
