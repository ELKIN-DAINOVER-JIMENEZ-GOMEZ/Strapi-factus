/**
 * Índice de servicios de Factus
 * Ubicación: src/api/factus/services/index.ts
 */

import factusAuth from './factus.auth';
import factusConfig from './factus-config';
import factusNumering from './factus-numering';
import factusMapper from './factus-mapper';
import factusSender from './factus-sender';
import factusEmission from './factus-emission';

export default {
  'factus-auth': factusAuth,
  'factus-config': factusConfig,
  'factus-numering': factusNumering,
  'factus-mapper': factusMapper,
  'factus-sender': factusSender,
  'factus-emission': factusEmission,
  

};