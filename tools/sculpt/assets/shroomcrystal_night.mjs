// Night sheet for the glowing growths (part of shroomcrystal_lib's set; not an asset). The kit's sheets show daylight
// only; the game draws these at night with an emissive glow per material (src/world/flora/material.js FRAG_EMIT):
//   glow colour = instance hue x rule glow, optionally x (vertex shade)^3 x 1.45 when the part sets glowShade.
// This renders the written GLB the way the flora batch would: a tinted part's vertex colours turned into a value
// relative to its mean (x 0.85, batches.js), the cap / crystal drawn as emission (dim moonlit albedo + glow), the
// stem / rock lit by a dim blue moon plus their small glow. Columns: glowShade off (the game today) / on (proposed).
//   node tools/sculpt/assets/shroomcrystal_night.mjs <name> [lod]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const R = await import('../preview.mjs');
const { NodeIO } = await import('@gltf-transform/core');

const [name, lodArg] = process.argv.slice(2);
const kind = name.startsWith('crystal') ? 'crystal' : name.startsWith('shroom_small') ? 'small' : 'shroom';
const HUE = kind === 'crystal' ? [0.25, 0.55, 1.0] : kind === 'small' ? [1.0, 0.3, 0.75] : [0.85, 0.25, 1.0];
const GLOW = { cap: kind === 'small' ? 1.0 : 1.2, crystal: 1.0, stem: 0.22, stalk: 0, rock: 0 };
const MOON = { dir: [-0.3, 0.8, 0.5].map((v, _, a) => v / Math.hypot(...a)), key: [0.16, 0.2, 0.36], sky: [0.05, 0.06, 0.12], bounce: [0.02, 0.02, 0.03], rim: 0.2, bg0: [0.03, 0.04, 0.09], bg1: [0.07, 0.08, 0.14] };
const STEM_BASE = kind === 'crystal' ? [0.09, 0.087, 0.115] : [0.159, 0.144, 0.337];   // 0x55525f / 0x6f6a9c linear

const doc = await new NodeIO().read(path.join(ROOT, 'assets/models/sculpt', name + '.glb'));
const lodN = lodArg != null ? +lodArg : 1;
const node = doc.getRoot().listNodes().find((n) => n.getName() === `${name}_LOD${lodN}`);
const prims = node.getMesh().listPrimitives();
function meshes(shade) {
  const out = [];
  for (const p of prims) {
    const mat = p.getMaterial().getName();
    const pos = p.getAttribute('POSITION').getArray(), nrm = p.getAttribute('NORMAL').getArray(), idx = Uint32Array.from(p.getIndices().getArray());
    const ca = p.getAttribute('COLOR_0'), n = pos.length / 3, es = ca.getElementSize(), c = ca.getArray();
    const col = new Float32Array(n * 3);
    const glowing = mat === 'cap' || mat === 'crystal';
    if (glowing) {
      const mean = [0, 0, 0]; for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) mean[k] += c[i * es + k] / n;
      for (let i = 0; i < n; i++) {
        const v = 0.85 * ((c[i * es] / mean[0]) + (c[i * es + 1] / mean[1]) + (c[i * es + 2] / mean[2])) / 3;
        const g = GLOW[mat] * (shade ? Math.min(2.5, v * v * v * 1.45) : 1);
        for (let k = 0; k < 3; k++) col[i * 3 + k] = HUE[k] * 0.06 * v + HUE[k] * g * 0.55;
      }
      out.push({ pos, nrm, idx, col, base: [1, 1, 1], emit: true });
    } else {
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) col[i * 3 + k] = c[i * es + k] * STEM_BASE[k] * 3.0 + HUE[k] * (GLOW[mat] || 0) * 0.08;
      out.push({ pos, nrm, idx, col, base: [1, 1, 1] });
    }
  }
  return out;
}
const all = meshes(false);
const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
for (const m of all) for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], m.pos[i + k]); b[k + 3] = Math.max(b[k + 3], m.pos[i + k]); }
const c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2], fov = 35, ts = 420, dist = R.fitDistance(b, fov, 0.86);
const opts = { light: MOON, groundColor: [0.03, 0.04, 0.05] };
const tiles = [];
for (const [az, el, lab] of [[30, 12, 'SIDE'], [200, 12, 'BACK'], [20, -18, 'BELOW']]) {
  for (const sh of [false, true]) tiles.push({ img: R.render(meshes(sh), R.orbit(c, az, el, dist, fov, ts, ts), { ...opts, ground: el > 0 }), label: `${lab} GLOWSHADE ${sh ? 'ON' : 'OFF'}` });
}
const out = path.join(ROOT, '.tmp/sculpt', name, 'night.png');
R.savePNG(out, R.sheet(tiles, 2, { title: `${name} AT NIGHT - LOD${lodN} AS THE FLORA BATCH DRAWS IT (APPROX.)` }));
console.log('  sheet', path.relative(ROOT, out));
