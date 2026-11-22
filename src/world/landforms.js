// All walkable terrain in this itinerary, including its headlands and alpine peaks,
// belongs to the continuous terrain mesh. Keep the lookup surface shared by tools.
// Map round (2026-11-22): the rock set pieces of the countryside landmarks (tors, crag falls, quarry face, tarn) are
// built here on top of the height field (landforms/setpieces.js); they never change it.
import * as THREE from 'three';
import { buildSetpieces } from './landforms/setpieces.js';
import { LU } from './landforms/lfmats.js';
import { G as GG } from '../core/game.js';

let SP = null;
export const landformsSystem = {
  name: 'landforms',
  pausable: true,
  init(G) {
    const api = G.landforms = {
      enabled: false,
      root: null,
      isles: { ids: new Set(), info: [], has: () => false },
      cliffs: null,
      coast: null,
      horizon: null,
      setpieces: null,
      stats: () => ({ enabled: !!SP, isles: 0, drawables: SP ? SP.pieces.length : 0, triangles: SP ? SP.stats().tris : 0, setpieces: SP?.stats() }),
      show(layer, on = true) { if (api.root && (layer === 'all' || layer === 'setpieces')) api.root.visible = on; },
    };
    if (G.params?.nolandforms === '1') return;
    try {
      const root = new THREE.Group(); root.name = 'landforms';
      SP = buildSetpieces(G, root);
      G.scene.add(root);
      api.root = root; api.setpieces = SP; api.enabled = true;
    } catch (e) { G.reportError('landforms:setpieces', e); }
  },
  update(dt) {
    LU.uTime.value += dt || 0;
    if (!SP) return;
    if ((this._f = (this._f || 0) + 1) % 12) return;
    const cam = GG.camera?.position;
    if (cam) SP.update(cam);
  },
};
