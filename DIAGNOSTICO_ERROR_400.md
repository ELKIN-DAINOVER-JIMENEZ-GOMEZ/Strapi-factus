# 🔍 DIAGNÓSTICO: Error 400 en POST /api/factus/emit-invoice

## Resumen del Problema
Estás recibiendo un error **HTTP 400 (Bad Request)** cuando intentas emitir una factura a través del endpoint `POST /api/factus/emit-invoice`.

---

## 🎯 Causas Más Probables (En Orden de Probabilidad)

### 1. ❌ **LA FACTURA NO TIENE CLIENTE ASOCIADO** (60% probable)
**Dónde falla:** En `factus-mapper.ts` línea 147

**Síntoma:** La factura se crea exitosamente, pero al emitir falla.

**Solución:**
```typescript
// ✅ Asegúrate que al crear la factura, asocíes un cliente
// En el frontend (invoice.component.ts):
const invoiceData = {
  // ... otros campos ...
  client: selectedClient.id,  // ⬅️ OBLIGATORIO
  invoice_items: [...],
};

// En el backend, verifica que la relación esté correcta en invoice.entity.json
```

---

### 2. ❌ **LA FACTURA NO TIENE ITEMS** (25% probable)
**Dónde falla:** En `factus-mapper.ts` línea 153

**Síntoma:** Guardaste la factura pero sin agregar productos.

**Solución:**
- Ve al formulario y asegúrate de agregar al menos **1 producto** antes de emitir
- Cada item debe tener:
  - ✅ Producto seleccionado
  - ✅ Cantidad > 0
  - ✅ Precio unitario > 0

---

### 3. ❌ **ITEMS SIN PRODUCTO ASOCIADO** (10% probable)
**Dónde falla:** En `factus-mapper.ts` línea 161

**Síntoma:** Agregaste items pero el producto no se guardó correctamente.

**Solución:**
```typescript
// En el componente, al agregar item:
const item = {
  // ... campos ...
  product: productSeleccionado.id,  // ⬅️ DEBE EXISTIR EL PRODUCTO
  cantidad: 1,
  precio_unitario: 100,
};
```

---

### 4. ❌ **CONFIGURACIÓN DE FACTUS INCOMPLETA** (3% probable)
**Dónde falla:** En `factus-mapper.ts` línea 171

**Solución:**
1. Entra al **Content Manager de Strapi**
2. Ve a **Factus Config**
3. Verifica que tenga:
   - ✅ Nombre de empresa
   - ✅ Email de empresa
   - ✅ Teléfono de empresa
   - ✅ Dirección de empresa
   - ✅ Numbering Range ID

---

### 5. ❌ **NO HAY RANGO DE NUMERACIÓN ACTIVO** (2% probable)
**Dónde falla:** En `factus-mapper.ts` línea 184

**Solución:**
1. Ve a **Content Manager → Numering Ranges**
2. Crea un rango con:
   - Prefijo: `FV` (o el que uses)
   - Rango inicial: `1`
   - Rango final: `999999`
   - Tipo: `factura`
   - Activo: `true`

---

## 🔧 PASOS PARA DEBUGUEAR

### Paso 1: Ver logs del servidor
```bash
# En la terminal de Strapi, busca logs como:
# 🔍 Verificando datos obtenidos:
# ├─ Factura encontrada: ✅ SÍ o ❌ NO
# ├─ Cliente: ✅ SÍ o ❌ NO
# ├─ Items: X
```

### Paso 2: Verificar estructura en BD
```bash
# En Strapi Admin → Invoices
# Abre la factura que intentas emitir y verifica:
1. ¿Tiene cliente?
2. ¿Tiene items?
3. ¿Cada item tiene producto?
```

### Paso 3: Agregar logs adicionales
En `invoice.component.ts`, modifica `saveAndEmit()`:

```typescript
saveAndEmit(): void {
  const invoiceData = this.prepareInvoiceData();
  
  console.log('🔍 DATOS ANTES DE GUARDAR:', JSON.stringify(invoiceData, null, 2));
  console.log('   ├─ Cliente ID:', invoiceData.client?.id);
  console.log('   ├─ Items:', invoiceData.invoice_items?.length);
  invoiceData.invoice_items?.forEach((item, idx) => {
    console.log(`   │  └─ Item ${idx+1}:`, item.product?.id);
  });
  console.log('   └─ Total:', invoiceData.total);
  
  // ... resto del código
}
```

---

## 📋 CHECKLIST ANTES DE EMITIR

Antes de hacer click en **"Guardar y Emitir"**, verifica:

- [ ] ✅ Cliente seleccionado en el dropdown
- [ ] ✅ Al menos 1 producto agregado a la factura
- [ ] ✅ Cada producto tiene cantidad > 0
- [ ] ✅ Cada producto tiene precio > 0
- [ ] ✅ La configuración de Factus está completa en el admin
- [ ] ✅ Existe un rango de numeración activo

---

## 🚀 COMANDO PARA EMITIR DESDE POSTMAN (para testing)

```bash
POST http://localhost:1337/api/factus/emit-invoice
Content-Type: application/json

{
  "invoiceId": 5  // Reemplaza con el ID de tu factura
}
```

---

## 📞 Si Nada de Esto Funciona

1. **Revisa los logs de Strapi** en la terminal
2. **Busca el patrón** `❌ PROBLEMA:` o `❌ Error`
3. **Copia el mensaje completo** y comparte para debugging más profundo

