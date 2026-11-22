// Still pools held in rock (map round, 2026-11-22): the tarn and the plunge pool under the crag falls.
// Shared by landforms/setpieces.js (rim, water) and the flora planting (reeds, lily pads), so both agree on the level.
// The water surface is flat at `level` (just above the highest ground under the disc); the rock rim is built tall enough
// all round to hold it, so no water ever hangs in the air on a slope.
import { LANDMARKS } from '../../data/landmarks.js';

const cache = new Map();
/** { x, z, r, level, rim: [{ x, z, ground }] } for a landmark with a pool (tarn, cragFalls), else null. */
export function poolOf(W, l) {
  if (cache.has(l.id)) return cache.get(l.id);
  let p = null;
  if (l.kind === 'tarn' || l.kind === 'cragFalls') {
    let x = l.x, z = l.z, r = l.kind === 'tarn' ? 7.5 : 5.5;
    if (l.kind === 'cragFalls') {
      // downhill from the crag foot
      const e = 6, gx = W.heightAt(l.x + e, l.z) - W.heightAt(l.x - e, l.z), gz = W.heightAt(l.x, l.z + e) - W.heightAt(l.x, l.z - e);
      const gl = Math.hypot(gx, gz) || 1;
      x = l.x - gx / gl * 17; z = l.z - gz / gl * 17;
    }
    let hi = -1e9;
    const rim = [];
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2;
      for (const f of [0, 0.5, 0.9]) hi = Math.max(hi, W.heightAt(x + Math.sin(a) * r * f, z + Math.cos(a) * r * f));
      const rx = x + Math.sin(a) * (r + 0.9), rz = z + Math.cos(a) * (r + 0.9);
      rim.push({ x: rx, z: rz, a, ground: W.heightAt(rx, rz) });
    }
    p = { x, z, r, level: hi + 0.22, rim };
  }
  cache.set(l.id, p);
  return p;
}
export const POOL_LANDMARKS = () => LANDMARKS.filter((l) => l.kind === 'tarn' || l.kind === 'cragFalls');
