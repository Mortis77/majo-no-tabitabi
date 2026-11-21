// "Press E" registry. NPCs, lanterns, chests, shop stalls… all register here; the core picks the best one each
// frame, shows the prompt through G.ui.prompt(), and fires onInteract when the player presses 互动 (E).
import * as THREE from 'three';
import { keyLabel } from './input.js';
import { t } from './i18n.js';

export function createInteract(G) {
  const list = [];
  let current = null;
  let shown = null;
  const _p = new THREE.Vector3();

  const api = {
    list,
    /** The interactable currently offered to the player (or null). */
    get current() { return current; },
    /**
     * Register an interactable.
     * @param {object} o
     *   pos: THREE.Vector3 (live reference; move it and the hotspot moves)  — or getPos: () => Vector3
     *   radius: number = 2.6        reach in metres (horizontal distance; |dy| must be < 3)
     *   prompt: string | () => string     verb shown after the key (already translated with t())
     *   onInteract: (G) => void
     *   enabled: () => boolean      optional gate, checked every frame
     *   priority: number = 0        higher wins when several are in reach
     *   broom: boolean = false      if true it can also be used while riding the broom
     * @returns handle { remove(), o }
     */
    add(o) {
      const it = { radius: 2.6, priority: 0, broom: false, ...o };
      list.push(it);
      return { o: it, remove() { const i = list.indexOf(it); if (i >= 0) list.splice(i, 1); if (current === it) current = null; } };
    },
    update() {
      const pl = G.player;
      let best = null, bestScore = Infinity;
      if (pl && G.mode === 'play' && !pl.dead) {
        const px = pl.pos.x, py = pl.pos.y, pz = pl.pos.z;
        for (let i = 0; i < list.length; i++) {
          const it = list[i];
          const p = it.getPos ? it.getPos(_p) : it.pos;
          if (!p) continue;
          const dx = p.x - px, dz = p.z - pz;
          const d2 = dx * dx + dz * dz;
          if (d2 > it.radius * it.radius || Math.abs(p.y - py) > 3.2) continue;
          if (pl.onBroom && !it.broom) continue;
          if (it.enabled && !it.enabled()) continue;
          const score = d2 - it.priority * 100;
          if (score < bestScore) { bestScore = score; best = it; }
        }
      }
      current = best;
      const text = best ? `${keyLabel('interact')}  ${typeof best.prompt === 'function' ? best.prompt() : (best.prompt || t('core.interact.default'))}` : null;
      if (text !== shown) { shown = text; G.ui?.prompt?.(text); }
      if (best && G.input.pressed('interact')) {
        G.input.consume('interact');
        try { best.onInteract?.(G); } catch (e) { G.reportError('interact', e); }
      }
    },
  };
  return api;
}
