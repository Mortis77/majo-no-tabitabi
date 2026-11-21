#!/usr/bin/env node
// Offline creature refinement (visual upgrade 3) — the SKINNED counterpart of tools/refine-models.mjs.
// Asset-pack animals and monsters are flat-coloured low-poly rigs. This bakes painted light into them WITHOUT touching
// anything the animation depends on: vertex count / order, JOINTS_0 / WEIGHTS_0, skins, bones, node names and clips stay
// byte-identical (checked after writing), so the manifest `clips`, wildlife clip tables and the AnimationMixer bindings
// keep working. Runtime smoothing (assets.js celify: welded smooth normals) still applies on top.
//
//   node tools/refine-creatures.mjs                  refine every id in IDS, write assets/models/refined/<id>.glb
//   node tools/refine-creatures.mjs ani_fox ...      only these ids
//   node tools/refine-creatures.mjs --manifest       also repoint the manifest entries (through tools/manifest-patch.mjs)
//
// Per model (bind pose, node transforms applied so every primitive is in one space):
//   1. voxel ambient occlusion: the triangles are rasterised into a ~44³ occupancy grid; every vertex marches 20
//      cosine-weighted rays off its (position-welded, smoothed) normal; the open fraction becomes AO
//   2. back / belly gradient: the underside (low on the body and facing down) darkens, the back keeps full value —
//      the painted "sun from above" read of fur / feather / scale that a two-tone cel ramp alone cannot give
//   3. both multiply into COLOR_0 (created white if missing; an existing COLOR_0 is multiplied, never replaced)
//   4. palette pull: every non-eye material's baseColorFactor moves 30 % toward the nearest src/core/mats.js PAL colour
//      when one is near, saturation is capped at 0.72 and value floored at 0.08 (no pure black fur in the night land)
// The originals stay in models/creatures/; the manifest entry keeps `orig` and gets `refined: 'creature'`.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const WRITE_MANIFEST = args.includes('--manifest');
const only = args.filter((a) => !a.startsWith('--'));
// the skinned creatures the game shows (types.js / wildlife.js); hand-built bodies (jelly, hitogata, wisp) need none
const IDS = ['ani_wolf', 'mon_bat', 'mon_golem_big', 'ani_fox', 'ani_deer', 'ani_stag', 'ani_chicken', 'ani_cow', 'ani_dog',
  'ani_sheep', 'ani_koi', 'ani_frog', 'ani_raccoon', 'ani_cat', 'ani_hedgehog'];
// per-id knobs: ao strength, belly darkening, ground counted as solid (standing animals)
const KNOB = { mon_bat: { ground: false, belly: 0.12 }, ani_koi: { ground: false, belly: 0.25 }, mon_golem_big: { ao: 0.7, belly: 0.15 } };

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8'));
const PAL = (() => {
  const src = fs.readFileSync(path.join(ROOT, 'src/core/mats.js'), 'utf8');
  const body = src.slice(src.indexOf('export const PAL'), src.indexOf('};', src.indexOf('export const PAL')));
  return [...body.matchAll(/(\w+):\s*0x([0-9a-fA-F]{6})/g)].filter((m) => !/glow|Hot|Eye|crystal/i.test(m[1]))
    .map((m) => { const v = parseInt(m[2], 16); return [(v >> 16) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; });
})();
const toS = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const toL = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function hsv(r, g, b) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d > 1e-6) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, mx > 0 ? d / mx : 0, mx]; }
function rgb(h, s, v) { const i = Math.floor(((h % 1) + 1) % 1 * 6), f = ((h % 1) + 1) % 1 * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6]; }

function pullColor(lin) {
  let c = lin.slice(0, 3).map(toS);
  let best = null, bd = 1e9;
  for (const p of PAL) { const d = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]); if (d < bd) { bd = d; best = p; } }
  if (best && bd < 0.28) c = c.map((v, i) => v + (best[i] - v) * 0.3);
  let [h, s, v] = hsv(...c);
  s = Math.min(s, 0.72); v = Math.max(v, 0.08);
  return [...rgb(h, s, v).map(toL), lin[3] ?? 1];
}

// column-major 4x4
function mul(a, b) { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; }
function worldOf(node) { let m = node.getMatrix(); let p = node.getParentNode?.(); while (p) { m = mul(p.getMatrix(), m); p = p.getParentNode?.(); } return m; }
const xf = (m, x, y, z, w = 1) => [m[0] * x + m[4] * y + m[8] * z + m[12] * w, m[1] * x + m[5] * y + m[9] * z + m[13] * w, m[2] * x + m[6] * y + m[10] * z + m[14] * w];

async function refine(io, id) {
  const e = manifest[id];
  if (!e) { console.warn('  no manifest entry', id); return null; }
  const srcRel = e.orig || e.file;
  const doc = await io.read(path.join(ROOT, 'assets', srcRel));
  const knob = Object.assign({ ao: 0.62, belly: 0.22, ground: true }, KNOB[id] || {});
  // gather every primitive in one space
  const prims = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const W = worldOf(node);
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      const eye = /eye|pupil|iris/i.test(mat?.getName() || '');
      const pos = prim.getAttribute('POSITION'), nor = prim.getAttribute('NORMAL'), idx = prim.getIndices();
      const n = pos.getCount();
      const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
      const t = [], u = [];
      for (let i = 0; i < n; i++) {
        pos.getElement(i, t); const w = xf(W, t[0], t[1], t[2]); P.set(w, i * 3);
        if (nor) { nor.getElement(i, u); const q = xf(W, u[0], u[1], u[2], 0); const l = Math.hypot(...q) || 1; N.set([q[0] / l, q[1] / l, q[2] / l], i * 3); }
      }
      const I = idx ? Array.from(idx.getArray()) : Array.from({ length: n }, (_, i) => i);
      prims.push({ prim, mat, eye, P, N, I, n });
    }
  }
  if (!prims.length) return null;
  // bounds
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const p of prims) for (let i = 0; i < p.n; i++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p.P[i * 3 + k]); hi[k] = Math.max(hi[k], p.P[i * 3 + k]); }
  const ext = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const RES = 44, vs = ext / (RES - 4);
  const o0 = lo.map((v) => v - 2 * vs);
  const dims = [0, 1, 2].map((k) => Math.ceil((hi[k] - lo[k]) / vs) + 5);
  const grid = new Uint8Array(dims[0] * dims[1] * dims[2]);
  const cell = (x, y, z) => { const i = Math.floor((x - o0[0]) / vs), j = Math.floor((y - o0[1]) / vs), k = Math.floor((z - o0[2]) / vs);
    if (i < 0 || j < 0 || k < 0 || i >= dims[0] || j >= dims[1] || k >= dims[2]) return -1; return i + dims[0] * (j + dims[1] * k); };
  // rasterise triangles (eyes too: they occlude)
  for (const p of prims) for (let f = 0; f < p.I.length; f += 3) {
    const a = p.I[f] * 3, b = p.I[f + 1] * 3, c = p.I[f + 2] * 3;
    const L = Math.max(Math.hypot(p.P[b] - p.P[a], p.P[b + 1] - p.P[a + 1], p.P[b + 2] - p.P[a + 2]), Math.hypot(p.P[c] - p.P[a], p.P[c + 1] - p.P[a + 1], p.P[c + 2] - p.P[a + 2]));
    const st = Math.max(1, Math.ceil(L / (vs * 0.5)));
    for (let i = 0; i <= st; i++) for (let j = 0; j <= st - i; j++) {
      const u = i / st, v = j / st, w = 1 - u - v;
      const x = p.P[a] * w + p.P[b] * u + p.P[c] * v, y = p.P[a + 1] * w + p.P[b + 1] * u + p.P[c + 1] * v, z = p.P[a + 2] * w + p.P[b + 2] * u + p.P[c + 2] * v;
      const q = cell(x, y, z); if (q >= 0) grid[q] = 1;
    }
  }
  const solid = (x, y, z) => { if (knob.ground && y < lo[1] - vs * 0.25) return true; const q = cell(x, y, z); return q >= 0 && grid[q] === 1; };
  // welded smooth normals for the ray frame (faceted normals would give a speckled bake)
  const key = (x, y, z) => `${Math.round(x / (vs * 0.05))},${Math.round(y / (vs * 0.05))},${Math.round(z / (vs * 0.05))}`;
  const acc = new Map();
  for (const p of prims) for (let f = 0; f < p.I.length; f += 3) {
    const [a, b, c] = [p.I[f] * 3, p.I[f + 1] * 3, p.I[f + 2] * 3];
    const e1 = [p.P[b] - p.P[a], p.P[b + 1] - p.P[a + 1], p.P[b + 2] - p.P[a + 2]], e2 = [p.P[c] - p.P[a], p.P[c + 1] - p.P[a + 1], p.P[c + 2] - p.P[a + 2]];
    const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const v of [a, b, c]) { const k = key(p.P[v], p.P[v + 1], p.P[v + 2]); const s = acc.get(k) || [0, 0, 0]; s[0] += fn[0]; s[1] += fn[1]; s[2] += fn[2]; acc.set(k, s); }
  }
  // fixed cosine-weighted directions (golden spiral on the hemisphere)
  const DIRS = []; const ND = 20;
  for (let i = 0; i < ND; i++) { const r = Math.sqrt((i + 0.5) / ND), a = i * 2.39996; DIRS.push([r * Math.cos(a), Math.sqrt(Math.max(0, 1 - r * r)), r * Math.sin(a)]); }
  const maxD = ext * 0.32, step = vs * 0.7;
  const H = hi[1] - lo[1] || 1;
  let shadeSum = 0, shadeN = 0;
  for (const p of prims) {
    p.S = new Float32Array(p.n);
    for (let i = 0; i < p.n; i++) {
      const x = p.P[i * 3], y = p.P[i * 3 + 1], z = p.P[i * 3 + 2];
      let nn = acc.get(key(x, y, z)) || [p.N[i * 3], p.N[i * 3 + 1], p.N[i * 3 + 2]];
      const l = Math.hypot(...nn) || 1; nn = nn.map((v) => v / l);
      // tangent frame
      const up = Math.abs(nn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      let tx = [up[1] * nn[2] - up[2] * nn[1], up[2] * nn[0] - up[0] * nn[2], up[0] * nn[1] - up[1] * nn[0]]; const tl = Math.hypot(...tx) || 1; tx = tx.map((v) => v / tl);
      const bt = [nn[1] * tx[2] - nn[2] * tx[1], nn[2] * tx[0] - nn[0] * tx[2], nn[0] * tx[1] - nn[1] * tx[0]];
      let open = 0;
      for (const d of DIRS) {
        const dir = [tx[0] * d[0] + nn[0] * d[1] + bt[0] * d[2], tx[1] * d[0] + nn[1] * d[1] + bt[1] * d[2], tx[2] * d[0] + nn[2] * d[1] + bt[2] * d[2]];
        let hit = false;
        for (let s = vs * 1.6; s < maxD; s += step) { if (solid(x + dir[0] * s, y + dir[1] * s, z + dir[2] * s)) { hit = true; break; } }
        if (!hit) open++;
      }
      const ao = 1 - knob.ao * (1 - open / ND);
      const h = (y - lo[1]) / H;
      const belly = 1 - knob.belly * smooth(-0.1, -0.85, nn[1]) * (1 - smooth(0.35, 0.8, h)) - 0.06 * (1 - smooth(0.0, 0.5, h));
      const back = 1 + 0.05 * smooth(0.3, 0.95, nn[1]);
      const s = p.eye ? 1 : clamp(Math.sqrt(Math.max(0.0, ao)) * belly * back, 0.35, 1.0);
      p.S[i] = s; if (!p.eye) { shadeSum += s; shadeN++; }
    }
  }
  // keep the body's overall value: the bake moves light around (belly / folds darker, back full), it does not dim the model
  const gain = Math.max(1, 0.93 / Math.max(0.5, shadeSum / Math.max(1, shadeN)));
  for (const p of prims) {
    const col = new Float32Array(p.n * 4);
    const old = p.prim.getAttribute('COLOR_0');
    const t = [];
    for (let i = 0; i < p.n; i++) {
      const s = p.eye ? 1 : Math.min(1, p.S[i] * gain);
      let o = [1, 1, 1, 1];
      if (old) { old.getElement(i, t); o = [t[0], t[1], t[2], t.length > 3 ? t[3] : 1]; }
      col.set([o[0] * s, o[1] * s, o[2] * s, o[3]], i * 4);
    }
    const accr = doc.createAccessor().setType('VEC4').setArray(col).setBuffer(doc.getRoot().listBuffers()[0]);
    p.prim.setAttribute('COLOR_0', accr);
  }
  // palette pull (once per material)
  const done = new Set();
  for (const p of prims) {
    if (!p.mat || done.has(p.mat) || p.eye) continue; done.add(p.mat);
    p.mat.setBaseColorFactor(pullColor(p.mat.getBaseColorFactor()));
  }
  const out = `models/refined/${id}.glb`;
  await io.write(path.join(ROOT, 'assets', out), doc);
  return { id, out, src: srcRel, avg: shadeSum / Math.max(1, shadeN) * gain };
}

// skins / joints / weights / animations must be untouched
async function verify(io, src, out) {
  const a = await io.read(path.join(ROOT, 'assets', src)), b = await io.read(path.join(ROOT, 'assets', out));
  const sig = (d) => JSON.stringify({
    nodes: d.getRoot().listNodes().map((n) => [n.getName(), n.getTranslation(), n.getRotation(), n.getScale()]),
    anims: d.getRoot().listAnimations().map((x) => [x.getName(), x.listChannels().length]),
    skins: d.getRoot().listSkins().map((s) => [s.listJoints().map((j) => j.getName()), Array.from(s.getInverseBindMatrices()?.getArray() || []).slice(0, 32)]),
    prims: d.getRoot().listMeshes().flatMap((m) => m.listPrimitives().map((p) => [p.getAttribute('POSITION').getCount(),
      Array.from(p.getAttribute('JOINTS_0')?.getArray() || []).join(','), Array.from(p.getAttribute('WEIGHTS_0')?.getArray() || []).slice(0, 400).join(',')])),
  });
  return sig(a) === sig(b);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const ids = only.length ? only : IDS;
const frag = {};
for (const id of ids) {
  const t0 = Date.now();
  const r = await refine(io, id);
  if (!r) continue;
  const ok = await verify(io, r.src, r.out);
  console.log(`${id}: ${r.out}  mean shade ${r.avg.toFixed(2)}  rig ${ok ? 'identical' : 'CHANGED'}  ${Date.now() - t0} ms`);
  if (!ok) { console.error('  rig changed — not repointing', id); continue; }
  frag[id] = { file: r.out, orig: r.src, refined: 'creature' };
}
if (WRITE_MANIFEST && Object.keys(frag).length) {
  const f = path.join(ROOT, '.tmp', 'refine-creatures.frag.json');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(frag, null, 1));
  execFileSync('node', [path.join(ROOT, 'tools/manifest-patch.mjs'), f], { stdio: 'inherit' });
}
