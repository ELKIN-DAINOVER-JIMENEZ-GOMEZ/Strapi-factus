/**
 * credit-note router
 * 
 * NOTA: Las rutas core están COMPLETAMENTE deshabilitadas porque usamos 
 * rutas personalizadas en custom-credit-note.ts
 * 
 * El createCoreRouter crea rutas como /credit-notes/:id que capturan
 * /credit-notes/list y /credit-notes/stats interpretando "list" y "stats" como IDs.
 */

// Exportamos un objeto vacío para deshabilitar completamente las rutas core
// Todas las rutas se definen en custom-credit-note.ts
export default {
  routes: []
};
