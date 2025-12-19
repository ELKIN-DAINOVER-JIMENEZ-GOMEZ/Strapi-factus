/**
 * Tipos TypeScript para Factus API
 * Ubicación: src/api/factus/types/factus.types.ts
 * 
 * Estos tipos coinciden EXACTAMENTE con el schema de Strapi
 * y la documentación de Factus API
 */

// ============================================
// TIPOS DE STRAPI (Content Types)
// ============================================

/**
 * Single Type: factus-config
 * Configuración de la integración con Factus
 */
export interface FactusConfig {
  id: number;
  
  // Configuración API
  api_url: string;
  api_username: string;
  api_password: string;
  token_acceso?: string;              // Opcional al inicio
  token_expiracion?: Date | string;   // Opcional al inicio
  refresh_token?: string;             // Opcional al inicio
  ambiente: 'Produccion' | 'Habilitacion' | 'Pruebas';
  
  // Datos de la empresa
  empresa_nit: string;
  empresa_nombre: string;
  empresa_direccion?: string;
  empresa_telefono?: string;
  empresa_email?: string;
  
  // Configuración de facturación
  prefijo_factura?: string;
  resolucion_dian?: string;
  resolucion_desde?: number;
  resolucion_hasta?: number;
  consecutivo_actual?: number;
  numbering_range_id?: number; // ✨ AGREGADO
  
  // Campos automáticos de Strapi
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
}

/**
 * Collection Type: numbering-range
 * Rangos de numeración DIAN
 */
export interface NumberingRange {
  id: number;
  factus_id: number;                  // ID del rango en Factus
  nombre: string;                      // Ej: "Facturación 2025"
  prefijo: string;                     // Ej: "FV"
  resolucion_dian: string;            // Número de resolución DIAN
  desde: number;                       // Consecutivo inicial
  hasta: number;                       // Consecutivo final
  consecutivo_actual: number;         // Consecutivo actual
  tipo_documento: 'factura' | 'nota_credito' | 'nota_debito' | 'factura_exportacion';
  activo: boolean;                    // Si está activo para usar
  fecha_resolucion?: Date | string;   // Fecha resolución DIAN
  fecha_vencimiento?: Date | string;  // Fecha vencimiento resolución
  observaciones?: string;
  
  // Campos automáticos de Strapi
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
}

// ============================================
// TIPOS DE FACTUS API (OAuth)
// ============================================

/**
 * Respuesta del endpoint OAuth de Factus
 * POST /oauth/token
 */
export interface FactusTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

/**
 * Request para obtener token OAuth
 */
export interface FactusTokenRequest {
  grant_type: 'password' | 'refresh_token';
  client_id: string;
  client_secret: string;
  username?: string;
  password?: string;
  refresh_token?: string;
}

// ============================================
// TIPOS DE FACTUS API (Facturación)
// ============================================

/**
 * Estructura de una factura para enviar a Factus
 * POST /api/v1/documentos/factura
 */
export interface FactusInvoiceRequest {
  ambiente: number; // 1 = producción, 2 = pruebas
  tipo_documento: number; // 1 = Factura de venta
  prefijo: string;
  consecutivo: number;
  fecha_emision: string; // YYYY-MM-DD
  hora_emision: string; // HH:mm:ss
  fecha_vencimiento?: string;
  emisor: FactusEmisor;
  adquiriente: FactusAdquiriente;
  forma_pago: FactusFormaPago;
  items: FactusItem[];
  totales: FactusTotales;
  observaciones?: string;
}

/**
 * Datos del emisor (tu empresa)
 */
export interface FactusEmisor {
  nit: string;
  razon_social: string;
  direccion?: string;
  telefono?: string;
  email?: string;
}

/**
 * Datos del cliente (adquiriente)
 */
export interface FactusAdquiriente {
  tipo_documento: string; // '13' = CC, '31' = NIT, etc.
  numero_documento: string;
  digito_verificacion?: string;
  razon_social: string;
  nombre_comercial?: string;
  direccion: string;
  ciudad: string;
  departamento: string;
  codigo_postal?: string;
  email: string;
  telefono?: string;
  tipo_persona: number; // 1 = Natural, 2 = Jurídica
  regimen_fiscal: string;
  responsabilidades_fiscales: string[];
}

/**
 * Forma de pago
 */
export interface FactusFormaPago {
  medio_pago: string; // '10' = Efectivo, '48' = Tarjeta, etc.
  metodo_pago: number; // 1 = Contado, 2 = Crédito
  fecha_vencimiento?: string;
}

/**
 * Item de factura
 */
export interface FactusItem {
  numero_linea: number;
  codigo: string;
  descripcion: string;
  cantidad: number;
  unidad_medida: string; // 'UND', 'KG', 'LT', etc.
  precio_unitario: number;
  precio_total: number;
  descuento: number;
  subtotal: number;
  impuestos: FactusImpuesto[];
  total_item: number;
}

/**
 * Impuesto de un item
 */
export interface FactusImpuesto {
  tipo: string; // '01' = IVA, '04' = ICO, etc.
  porcentaje: number;
  base: number;
  valor: number;
}

/**
 * Totales de la factura
 */
export interface FactusTotales {
  subtotal: number;
  descuentos: number;
  total_impuestos: number;
  total: number;
}

/**
 * Respuesta de Factus al enviar una factura
 */
export interface FactusInvoiceResponse {
  success?: boolean;
  id?: string;
  documento_id?: string;
  estado: string;
  cude?: string;
  cufe?: string;
  qr?: string;
  url_pdf?: string;
  pdf?: string;
  url_xml?: string;
  xml?: string;
  mensaje?: string;
  errors?: FactusError[];
}

/**
 * Error de Factus
 */
export interface FactusError {
  code?: string;
  message: string;
  field?: string;
}

// ============================================
// TIPOS DE UTILIDAD
// ============================================

/**
 * Resultado de una operación con Factus
 */
export interface FactusOperationResult<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string | FactusError[];
  timestamp?: string;
}

/**
 * Opciones de configuración para operaciones de Factus
 */
export interface FactusOptions {
  timeout?: number;
  retry?: boolean;
  maxRetries?: number;
}

// ============================================
// ENUMS Y CONSTANTES
// ============================================

/**
 * Códigos de tipo de documento según DIAN
 */
export enum TipoDocumentoDIAN {
  CC = '13',
  NIT = '31',
  CE = '22',
  TI = '12',
  PP = '41',
  PEP = '47'
}

/**
 * Códigos de medio de pago según DIAN
 */
export enum MedioPagoDIAN {
  EFECTIVO = '10',
  CREDITO = '1',
  TARJETA = '48',
  TRANSFERENCIA = '42',
  CHEQUE = '20'
}

/**
 * Códigos de impuestos según DIAN
 */
export enum TipoImpuestoDIAN {
  IVA = '01',
  ICO = '04',
  ICA = '03'
}

// ============================================
// TIPOS DE STRAPI COLLECTIONS
// ============================================

/**
 * Collection Type: client
 */
export interface Client {
  id: number;
  nombre_completo: string;
  tipo_documento: string;
  numero_documento: string;
  digito_verificacion?: string;
  razon_social?: string;
  nombre_comercial?: string;
  email: string;
  telefono?: string;
  direccion: string;
  ciudad?: string;
  ciudad_codigo?: string;  // Código DIAN de ciudad (ej: '980' para Bogotá)
  departamento?: string;
  codigo_postal?: string;
  tipo_persona?: 'natural' | 'juridica';
  regimen_fiscal?: string;
  activo?: boolean;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
}

/**
 * Collection Type: product
 */
export interface Product {
  id: number;
  codigo: string;
  nombre: string;
  descripcion?: string;
  tipo?: 'producto' | 'servicio';
  precio_unitario: number;
  unidad_medida?: string;
  codigo_unspsc?: string;
  iva_porcentaje?: number;
  aplica_iva?: boolean;
  ico_porcentaje?: number;
  aplica_ico?: boolean;
  stock_actual?: number;
  activo?: boolean;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
}

/**
 * Collection Type: invoice-item
 */
export interface InvoiceItem {
  id: number;
  cantidad: number;
  precio_unitario: number;
  descuento_porcentaje?: number;
  descuento_valor?: number;
  subtotal: number;
  iva_porcentaje?: number;
  iva_valor?: number;
  ico_porcentaje?: number;
  ico_valor?: number;
  total_item: number;
  orden?: number;
  unidad_medida_id?: number;  // ID de unidad de medida DIAN (ej: 70 para Unidad)
  product?: Product;  // Relación con product
  invoice?: number;   // ID de la factura
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
}

/**
 * Collection Type: invoice
 */
export interface Invoice {
  id: number;
  numero_factura?: string;
  prefijo?: string;
  consecutivo?: number;
  fecha_emision: Date | string;
  fecha_vencimiento?: Date | string;
  tipo_operacion: string;
  forma_pago?: string;
  medio_pago?: string;
  subtotal: number;
  total_iva?: number;
  total_ico?: number;
  total_descuentos?: number;
  total: number;
  observaciones?: string;
  estado_local?: 'Borrador' | 'Enviada' | 'Aceptada' | 'Rechazada' | 'Anulada';
  estado_dian?: string;
  factus_id?: string;
  factus_cude?: string;
  factus_qr?: string;
  url_pdf?: string;
  url_xml?: string;
  respuesta_factus?: any;
  errores_factus?: any;
  fecha_envio_dian?: Date | string;
  intentos_envio?: number;
  client?: Client;           // Relación con client
  invoice_items?: InvoiceItem[];  // Relación con invoice-items
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
}