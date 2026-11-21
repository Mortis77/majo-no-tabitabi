// Shared helper for the six world rocks (rock_boulder_a, rock_boulder_b, rock_slab, rock_outcrop, rock_standing,
// rock_rubble). Not an asset itself.
//  - shape helpers: smooth convex polyhedra (big facets that catch the light), random stones around an ellipsoid,
//    bedded layers;
//  - NEUTRAL stone paint (value only: the game tints rock per land and adds moss / snow by its own rules);
//  - rockDef(): the common asset config (budgets 2400 / 800 / 220, one material `Rock_rock`, before = the game's
//    protoRock at the same size);
//  - a post step (kit workaround, see kitNotes): the kit always gives LOD0 an atlas + object-space normal map, which an
//    instanced rock cannot use. `node tools/sculpt/assets/rock_common.mjs post tools/sculpt/assets/<name>.mjs`
//    rewrites the GLB so EVERY LOD is vertex coloured (COLOR_0 = RGBA, A = "moss here" mask), area-averaged from the
//    full field, one primitive per LOD, no textures; and renders the instanced truth: vc.png (LODs in vertex colour,
//    tinted the way the three lands tint rock, moss from the mask) and field.png (the six rocks scattered by the dozen at
//    every rotation, scale and depth, from the game camera).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as P from '../sdf.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const nz3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// ------------------------------------------------------------------------------------------------------------ shapes
/**
 * Smooth convex polyhedron: planes [[nx,ny,nz,d], ...] (n need not be unit), surface where n.p = d; k = edge blend
 * radius (log-sum-exp smooth max, still 1-Lipschitz). `floor` (y) is a HARD cut so the foot stays sharp (buried).
 */
export function poly(planes, { k = 0.03, floor = 0, bounds } = {}) {
  const PL = planes.map(([a, b, c, d]) => { const l = Math.hypot(a, b, c); return [a / l, b / l, c / l, d]; });
  const n = PL.length, v = new Float64Array(n);
  const f = (x, y, z) => {
    let m = -1e9;
    for (let i = 0; i < n; i++) { const p = PL[i]; v[i] = x * p[0] + y * p[1] + z * p[2] - p[3]; if (v[i] > m) m = v[i]; }
    let s = 0; for (let i = 0; i < n; i++) s += Math.exp((v[i] - m) / k);
    const d = m + k * Math.log(s) - k * 0.4; // pull back a little so faces sit where the planes say
    return floor == null ? d : Math.max(d, floor - y);
  };
  return new P.Shape(f, bounds || [-1, floor ?? -1, -1, 1, 2, 1]);
}

/**
 * Fracture-plane rock (revision 2): the same planes as poly(), but TWO edge radii. Edges are crisp (k ≈ 6 mm, a 2–3 cm
 * bevel); only where `soft(x, y, z)` > 0 (the weathered crown, the upwind side) the edges round over with kSoft.
 * No pull-back, so a face sits on its plane in both regions (no step where the weight changes).
 */
export function rockPoly(planes, { k = 0.006, kSoft = 0.05, soft = null, floor = 0, bounds } = {}) {
  const PL = planes.map(([a, b, c, d]) => { const l = Math.hypot(a, b, c); return [a / l, b / l, c / l, d]; });
  const n = PL.length, v = new Float64Array(n);
  const f = (x, y, z) => {
    let m = -1e9;
    for (let i = 0; i < n; i++) { const p = PL[i]; v[i] = x * p[0] + y * p[1] + z * p[2] - p[3]; if (v[i] > m) m = v[i]; }
    let s = 0; for (let i = 0; i < n; i++) s += Math.exp((v[i] - m) / k);
    let d = m + k * Math.log(s);
    const w = soft ? soft(x, y, z) : 0;
    if (w > 0) { let s2 = 0; for (let i = 0; i < n; i++) s2 += Math.exp((v[i] - m) / kSoft); d += (m + kSoft * Math.log(s2) - d) * Math.min(1, w); }
    return floor == null ? d : Math.max(d, floor - y);
  };
  return new P.Shape(f, bounds || [-1, floor ?? -1, -1, 1, 2, 1], null, 1.15);
}

/** wear only where w(x, y, z) > 0 (weathered tops); everything else keeps its crisp break */
export function wearWhere(S, body, r, w, opts = {}) {
  const worn = body.wear(r, opts), f = body.f, g = worn.f;
  return new S.Shape((x, y, z) => { const t = w(x, y, z); const d = f(x, y, z); return t <= 0 ? d : d + (g(x, y, z) - d) * Math.min(1, t); }, body.b, body.pf, body.lip * 1.1);
}

/** keep the side of a wavy plane (normal n through `at`) where n.p < -gap(y): one half of a split stone */
export function halfSpace(S, { n, at, gap = () => 0.01, wander = 0.03, seed = 1, side = -1 }) {
  const u = nz3(n);
  return new S.Shape((x, y, z) => {
    let d = (x - at[0]) * u[0] + (y - at[1]) * u[1] + (z - at[2]) * u[2];
    d += wander * P.fbm(x * 3, y * 3, z * 3, seed, 2);
    return side < 0 ? d + gap(y) : -d + gap(y);
  }, [-2, -1, -2, 2, 3, 2], null, 1.2);
}

/** support of an ellipsoid with half-axes s along unit n */
const support = (s, n) => Math.hypot(s[0] * n[0], s[1] * n[1], s[2] * n[2]);

/**
 * A stone: `count` facets around an ellipsoid of half-sizes `size` (centred on `c`), each cut 0.78..1.0 of the support
 * (so facets are big and unequal), plus optional extra planes. Returns planes in world coordinates.
 */
export function stonePlanes(rnd, { size, c = [0, 0, 0], count = 9, cut = [0.78, 1.0], flatTop = 0, extra = [], noUnder = false }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const yy = 1 - 2 * (i + 0.5) / count, rr = Math.sqrt(Math.max(0, 1 - yy * yy)), a = i * 2.39996 + rnd() * 0.9;
    let n = nz3([Math.cos(a) * rr + (rnd() - 0.5) * 0.4, yy + (rnd() - 0.5) * 0.3, Math.sin(a) * rr + (rnd() - 0.5) * 0.4]);
    // noUnder: no overhanging walls at the foot (walls go INTO the ground, so the stone reads buried, not dropped)
    if (noUnder && n[1] < -0.08) n = nz3([n[0], -0.08 * Math.hypot(n[0], n[2]), n[2]]);
    const d = support(size, n) * (cut[0] + (cut[1] - cut[0]) * rnd());
    out.push([n[0], n[1], n[2], d + n[0] * c[0] + n[1] * c[1] + n[2] * c[2]]);
  }
  if (flatTop) { const n = nz3([(rnd() - 0.5) * 0.3, 1, (rnd() - 0.5) * 0.3]); out.push([n[0], n[1], n[2], support(size, n) * flatTop + n[0] * c[0] + n[1] * c[1] + n[2] * c[2]]); }
  for (const e of extra) out.push(e);
  return out;
}

/** the region a fresh break removes: beyond the plane (normal n through `at`), dished inward by `bowl` m around `at`
 *  (conchoidal), to be cut with `{ paintCut: true }` after `.part('fresh')` */
export function breakAway(S, { n, at, bowl = 0.025, r = 0.3, ripple = 0 }) {
  const u = nz3(n);
  return new S.Shape((x, y, z) => {
    const px = x - at[0], py = y - at[1], pz = z - at[2], d = px * u[0] + py * u[1] + pz * u[2];
    const q2 = px * px + py * py + pz * pz - d * d;
    const dish = bowl * Math.exp(-q2 / (r * r)) + ripple * Math.sin(Math.sqrt(q2) * 70) * Math.exp(-q2 / (r * r));
    return -(d + dish);
  }, [-2, -1, -2, 2, 3, 2], null, 1.3);
}

/** a LOCAL flat chip: the part of a breakAway half-space inside a ball of radius r around `at` (a nick in an edge, not
 *  a plane across the whole stone) */
export function chipFlat(S, { n, at, r = 0.08, bowl = 0.006, depth = 0.03, spin = 0 }) {
  const u = nz3(n), at2 = [at[0] - u[0] * depth, at[1] - u[1] * depth, at[2] - u[2] * depth];
  // bounded by a turned box, not a ball: the scar's outline is straight-sided and angular, not a round bite
  return breakAway(S, { n: u, at: at2, bowl, r: r * 0.8 }).intersect(S.box([r * 2.4, r * 1.6, r * 1.9]).turn(spin * 0.7 + 17, spin, spin * 0.45 + 31).at(at[0], at[1], at[2]));
}

/** a shallow seam along y = y0 on the sides (bedding joint): pushes the surface in by `depth` over `width` */
export function seam(S, body, { y0, depth = 0.012, width = 0.02, wobble = 0.01, seed = 1, where = null }) {
  const f = body.f;
  return new S.Shape((x, y, z) => {
    const yy = y - y0 + wobble * P.fbm(x * 4, 0, z * 4, seed, 2), t = Math.max(0, 1 - Math.abs(yy) / width);
    return f(x, y, z) + depth * t * t * (where ? where(x, y, z) : 1);
  }, body.b, body.pf, (body.lip || 1) + depth / width);
}

/** re-cut a hard floor at y = 0 (after a lean) */
export function floor0(S, body) { const f = body.f; return new S.Shape((x, y, z) => Math.max(f(x, y, z), -y), [body.b[0], 0, body.b[2], body.b[3], body.b[4], body.b[5]], body.pf, body.lip); }

/** plane through point `at` with outward normal n */
export const pl = (n, at) => { const u = nz3(n); return [u[0], u[1], u[2], u[0] * at[0] + u[1] * at[1] + u[2] * at[2]]; };

/**
 * An open V crack cut into `body` along a wavy plane (normal n through `at`): `width` across at the surface near `top`,
 * a V section that closes `depth` m below the surface, fading out (shallower and narrower) toward `bottom` (y).
 * Only near the surface — never through the whole stone (a through-cut adds walls nobody sees and eats the budget).
 */
export function vCrack(S, body, { n, at, width = 0.05, depth = 0.14, bottom = 0.1, top = 0.7, wander = 0.03, seed = 1, where = null }) {
  const u = nz3(n), fb = body.f;
  const f = (x, y, z) => {
    const b = fb(x, y, z);
    if (b > 0.02) return b;
    let d = (x - at[0]) * u[0] + (y - at[1]) * u[1] + (z - at[2]) * u[2];
    d += wander * P.fbm(x * 3.5, y * 3.5, z * 3.5, seed, 3);
    const t = P.clamp((y - bottom) / (top - bottom), 0, 1) * (where ? where(x, y, z) : 1);
    const D = depth * Math.sqrt(t), hw = (0.013 + width * 0.5 * t * t) * Math.min(1, t * 4);
    if (D <= 1e-4) return b;
    // the carve stops where it would be narrower than ~2 voxels (no knife-thin slivers at the V bottom or the ends:
    // dual contouring makes non-manifold edges there)
    const cut = hw * Math.sqrt(P.clamp(1 + b / D, 0, 1)) - 0.007 - Math.abs(d);   // sqrt: a U bottom, not a knife V
    return Math.max(b, cut);
  };
  return new S.Shape(f, body.b, body.pf, (body.lip || 1) + 0.4);
}

// ------------------------------------------------------------------------------------------------------------- paint
// Value only, in sRGB. Mean about 0.6 (the game's grey rock base ROCK_C = #9b97a0 is ~0.6) so land tints keep their
// meaning. The kit multiplies AO (0.7) and cavity (0.45) in afterwards; here: weather story.
//   WEATHER side = -X (wind and rain: pitted, lichen-free, streaked); DAMP side = -Z (shade: darker, lichen, moss mask)
export function paintStone(c, o = {}) {
  const { x, y, z, nx, ny, nz, edge, cavity, broad } = c;
  const H = o.height || 1;
  const fresh = c.part === 'fresh';
  let v = 0.55 + 0.1 * P.fbm(x * 1.2 + 3, y * 1.2, z * 1.2, o.seed || 1, 2);        // slow drift between blocks
  if (o.bed) { const b = o.bed(x, y, z); v += 0.05 * Math.sin(b * Math.PI * 2); } // bedding bands (rev 3: one broad band per bed; the fine harmonic read as wood grain)
  if (fresh) {
    // a fresh break: paler, cleaner, crisp; only a hint of the ripple
    v = 0.72 + 0.03 * P.fbm(x * 6, y * 6, z * 6, 4, 2) + 0.08 * edge - 0.05 * cavity;
    return [v, v, v];
  }
  const up = P.ss(0.3, 0.9, ny), side = 1 - Math.abs(ny);
  v += 0.2 * up - 0.04;                                                                    // bleached top
  const weather = P.ss(0.0, -0.7, nx) * side, damp = P.ss(0.1, -0.8, nz) * (0.5 + 0.5 * side);
  v -= 0.06 * weather + 0.1 * damp;                                                // weather side greyer, damp side darker
  // pitting on the weather side only: dark speckle, cell ~8 cm
  const pit = P.ss(0.22, 0.08, P.cellular(x * 11, y * 11, z * 11, 7));
  v -= 0.2 * pit * weather;
  // rain streaks running down the side faces from the top edge (weather side and front)
  const streak = P.ss(0.0, 0.4, P.fbm(x * 4, y * 0.5, z * 4, 5, 2)) * side * P.ss(0.15, 0.7, y / H) * (0.4 + 0.6 * weather);
  v -= 0.16 * streak;
  // lichen rosettes: pale crusts ~10–18 cm, sparse, on the damp side and the tops; never on the weather side
  //   (clustered by a slow patch mask so they gather in colonies instead of an even polka-dot)
  const ros = P.cellular(x * 3.4 + 11, y * 3.4, z * 3.4, 9), colony = P.ss(0.0, 0.35, P.fbm(x * 1.4 + 7, y * 1.4, z * 1.4, 13, 2));
  const lichen = P.ss(0.34, 0.18, ros) * colony * P.clamp(0.25 + 0.9 * damp + 0.5 * up, 0, 1) * (1 - weather) * P.ss(0.12, 0.3, y / H);
  v += 0.17 * P.clamp(lichen, 0, 1);
  // edge wear: pale on the exposed edges
  v += 0.16 * edge;
  // crevices & cracks: wet dark (beyond the kit's cavity)
  v -= 0.18 * P.clamp(cavity * 1.3 + Math.max(0, broad) * 1.0, 0, 1);
  // damp dark foot
  v *= 0.6 + 0.4 * P.ss(0.0, Math.min(0.22, H * 0.28), y);
  return [v, v, v];
}

/** the "moss here" mask (vertex alpha): tops and cracks, more on the damp side, never on fresh breaks */
export function mossMask(px, py, pz, nx, ny, nzz, ao, cav, part, H) {
  // revision 2: broken patches, not a cap. Moss lives in the hollows (cavity, cracks, under ledges) and on the NORTH
  // half of the top; never on the weather side or fresh breaks. One slow patch noise (~30 cm) breaks it into islands,
  // a faster one frays their edges; the post step darkens the stone along the patch edge (damp rim).
  if (part === 'fresh') return 0;
  const north = P.ss(0.15, -0.6, nzz + 0.25 * P.fbm(px * 1.3, 0, pz * 1.3, 31, 1)), weather = P.ss(0.0, -0.7, nx);
  const top = P.ss(0.4, 0.85, ny) * P.ss(0.35, 0.75, py / H);
  const hollow = P.ss(0.12, 0.5, cav) * P.ss(-0.4, 0.2, ny + 0.3) + 0.6 * P.ss(0.35, 0.7, 1 - ao) * P.ss(0.1, 0.5, ny);
  const foot = P.ss(0.12, 0.02, py / H) * 0.5 * north;
  // rev 3: the hollows were mossed all along every bed recess (continuous green lines on the outcrop); now a hollow
  // only grows moss inside a patch island, and the islands are fewer and smaller
  const patch = P.fbm(px * 3.3 + 5, py * 3.3, pz * 3.3, 23, 2) * 0.9 + P.fbm(px * 11, py * 11, pz * 11, 27, 1) * 0.25;
  const island = P.ss(0.08, 0.32, patch);
  const want = top * (0.1 + 0.9 * north) * (1 - 0.85 * weather) + hollow * island * (1 - 0.7 * weather) + foot * island;
  return P.ss(0.4, 0.68, want + 0.55 * patch) * 0.8;
}

// ------------------------------------------------------------------------------------------------------- the config
export function rockDef(name, { build, bedPaint, before, notes = '', height = 1, extra = {} }) {
  return {
    name, id: 'sculpt_' + name,
    voxel: 0.006,
    lods: [2400, 800, 220],
    lodError: [0.02, 0.045, 0.1],
    atlas: 256,           // the kit insists on a LOD0 atlas; the post step drops it
    ground: 0,
    aoRange: 0.22,
    cavity: [0.012, 0.05],
    creaseAngle: 38,
    materials: { stone: { name: 'Rock', surface: 'rock', look: { rim: 0.22, wrap: 0.3 } } },
    anchors: {},
    notes: `Sculpted world rock (${name}). Every LOD vertex coloured: COLOR_0 RGBA, RGB = neutral stone value (multiply by the land / instance tint), A = moss-here mask (aMix). No textures. Origin = foot centre, +Y up, ~1 m unit; scale per species. See .tmp/sculpt/${name}/INSTALL.md.`,
    ...extra,
    build({ S }) {
      // assets name their body `.part('stone')` before cutting fresh breaks with `{ paintCut: true }` on a `.part('fresh')`
      S.part('fresh', { mat: 'stone', paint: (c) => paintStone(c, { height, bed: bedPaint }) });
      S.part('stone', { mat: 'stone', paint: (c) => paintStone(c, { height, bed: bedPaint, seed: name.length }) });
      return build(S);
    },
    async before({ threeToMeshes }) { return { meshes: threeToMeshes(await before()) }; },
  };
}

/** the game's present rock (rockgeo.protoRock, as landforms and the flora rocks build it), fitted to a box, in grey */
export async function protoBefore(list) {
  const THREE = await import('three');
  const { protoRock } = await import(pathToFileURL(path.join(ROOT, 'src/world/landforms/rockgeo.js')).href);
  const grp = new THREE.Group();
  for (const it of list) {
    const { geo, cav } = protoRock(it.opts);
    geo.computeBoundingBox(); const b = geo.boundingBox;
    const [sx, sy, sz] = it.size, k = [sx / (b.max.x - b.min.x), sy / (b.max.y - b.min.y), sz / (b.max.z - b.min.z)];
    const p = geo.attributes.position, col = new Float32Array(p.count * 3);
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, (p.getX(i) - (b.max.x + b.min.x) / 2) * k[0], (p.getY(i) - b.min.y) * k[1], (p.getZ(i) - (b.max.z + b.min.z) / 2) * k[2]);
      const g = 0.33 * (0.72 + 0.28 * cav[i]) * (1 + 0.1 * Math.max(0, nrm.getY(i)));
      col[i * 3] = g; col[i * 3 + 1] = g; col[i * 3 + 2] = g;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true }));
    if (it.at) m.position.set(...it.at);
    if (it.rot) m.rotation.set(...it.rot);
    grp.add(m);
  }
  return grp;
}

// ------------------------------------------------------------------------------------------------- post step (CLI)
const LANDS = {
  // linear tints like rockgeo PALS (base) / procgen ROCK_C relative to the neutral grey, and the moss of that land
  // revision 2: moss = the game's own moss instance tints (scatter.js C.mossSun / mossDusk / mossNight, linear), mixed
  // by aMix exactly as the flora shader does (mix(col, tint, aMix)); the first pass used a brighter lime of its own
  sun: { tint: [1.08, 1.0, 0.96], moss: [0.159, 0.347, 0.068], k: 1 },
  mtn: { tint: [0.97, 0.95, 1.08], moss: [0.13, 0.27, 0.07], k: 0.6, snow: true },
  dusk: { tint: [1.12, 0.92, 0.88], moss: [0.323, 0.275, 0.042], k: 1 },
  night: { tint: [0.55, 0.56, 0.86], moss: [0.023, 0.145, 0.133], k: 1 },
};

async function post(assetPath) {
  const { loadModel } = await import('../model.mjs');
  const { Pool } = await import('../pool.mjs');
  const { sampleMany, compose } = await import('../bake.mjs');
  const { PARTS } = await import('../sdf.mjs');
  const R = await import('../preview.mjs');
  const { Document, NodeIO } = await import('@gltf-transform/core');
  const M = await loadModel(assetPath);
  const name = M.def.name, glbPath = path.join(ROOT, 'assets/models/sculpt', name + '.glb');
  const outDir = path.join(ROOT, '.tmp/sculpt', name);
  const io = new NodeIO();
  const doc = await io.read(glbPath);
  const H = M.bounds[4] - M.bounds[1];
  // gather LOD meshes, weld by position + normal (the atlas seams are gone)
  const lods = [];
  for (const node of doc.getRoot().listNodes()) {
    const mm = /_LOD(\d)$/.exec(node.getName()); if (!mm || !node.getMesh()) continue;
    const pos = [], nrm = [], idx = [], key = new Map();
    for (const prim of node.getMesh().listPrimitives()) {
      const Pa = prim.getAttribute('POSITION').getArray(), Na = prim.getAttribute('NORMAL').getArray(), Ia = prim.getIndices().getArray();
      const remap = new Int32Array(Pa.length / 3);
      for (let v = 0; v < Pa.length / 3; v++) {
        const k = [Pa[v * 3], Pa[v * 3 + 1], Pa[v * 3 + 2], Na[v * 3], Na[v * 3 + 1], Na[v * 3 + 2]].map((q) => Math.round(q * 1e5)).join(',');
        let r = key.get(k);
        if (r === undefined) { r = pos.length / 3; key.set(k, r); pos.push(Pa[v * 3], Pa[v * 3 + 1], Pa[v * 3 + 2]); nrm.push(Na[v * 3], Na[v * 3 + 1], Na[v * 3 + 2]); }
        remap[v] = r;
      }
      for (const i of Ia) idx.push(remap[i]);
    }
    lods[+mm[1]] = { pos: Float32Array.from(pos), nrm: Float32Array.from(nrm), idx: Uint32Array.from(idx) };
  }
  // area-averaged samples: the vertex + a point a third of the way to each adjacent face's centroid (max 6)
  const pool = new Pool(assetPath);
  try {
    for (const L of lods) {
      const nv = L.pos.length / 3, adj = Array.from({ length: nv }, () => []);
      for (let f = 0; f < L.idx.length / 3; f++) for (let k = 0; k < 3; k++) adj[L.idx[f * 3 + k]].push(f);
      const pts = [], owner = [];
      for (let v = 0; v < nv; v++) {
        pts.push(L.pos[v * 3], L.pos[v * 3 + 1], L.pos[v * 3 + 2]); owner.push(v);
        for (const f of adj[v].slice(0, 6)) {
          let cx = 0, cy = 0, cz = 0; for (let k = 0; k < 3; k++) { const w = L.idx[f * 3 + k]; cx += L.pos[w * 3] / 3; cy += L.pos[w * 3 + 1] / 3; cz += L.pos[w * 3 + 2] / 3; }
          pts.push(L.pos[v * 3] + (cx - L.pos[v * 3]) * 0.4, L.pos[v * 3 + 1] + (cy - L.pos[v * 3 + 1]) * 0.4, L.pos[v * 3 + 2] + (cz - L.pos[v * 3 + 2]) * 0.4); owner.push(v);
        }
      }
      const res = await sampleMany(pool, Float32Array.from(pts));
      const acc = new Float64Array(nv * 5);
      for (let s = 0; s < owner.length; s++) {
        const v = owner[s], o = s * 8, c = compose(res.out, o, M.cfg), w = s === 0 || owner[s - 1] !== v ? 2 : 1;
        const pn = PARTS[res.part[s]]?.name;
        const a = mossMask(pts[s * 3], pts[s * 3 + 1], pts[s * 3 + 2], res.out[o + 3], res.out[o + 4], res.out[o + 5], res.out[o + 6], res.out[o + 7], pn, H);
        acc[v * 5] += c[0] * w; acc[v * 5 + 1] += c[1] * w; acc[v * 5 + 2] += c[2] * w; acc[v * 5 + 3] += a * w; acc[v * 5 + 4] += w;
      }
      L.col = new Float32Array(nv * 4);
      for (let v = 0; v < nv; v++) {
        const w = acc[v * 5 + 4], a = P.clamp(acc[v * 5 + 3] / w, 0, 1);
        // the damp rim: stone darkens where a moss patch begins (its edge reads darker, the patch reads as growth)
        const rim = 1 - 0.32 * P.ss(0.03, 0.4, a);
        for (let k = 0; k < 3; k++) L.col[v * 4 + k] = R.toLin(P.clamp(acc[v * 5 + k] / w * rim, 0, 1));
        L.col[v * 4 + 3] = a;
      }
    }
  } finally { await pool.close(); }
  // write the GLB again: root `<name>`, children `<name>_LOD0..2`, one primitive each, material Rock_rock (vertex colours)
  const old = doc.getRoot().listNodes().find((n) => n.getName() === name);
  const ex = { ...(old?.getExtras() || {}) };
  const nd = new Document(), buf = nd.createBuffer(), scene = nd.createScene(name);
  const root = nd.createNode(name);
  const spec = M.cfg.materials.stone;
  const mat = nd.createMaterial(`${spec.name}_${spec.surface}`).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0)
    .setExtras({ surface: spec.surface, look: spec.look, sculpt: { lod: 'vertex', alpha: 'moss mask (aMix), not opacity' } });
  const tris = [];
  lods.forEach((L, i) => {
    const prim = nd.createPrimitive()
      .setAttribute('POSITION', nd.createAccessor().setType('VEC3').setArray(L.pos).setBuffer(buf))
      .setAttribute('NORMAL', nd.createAccessor().setType('VEC3').setArray(L.nrm).setBuffer(buf))
      .setAttribute('COLOR_0', nd.createAccessor().setType('VEC4').setArray(L.col).setBuffer(buf))
      .setIndices(nd.createAccessor().setType('SCALAR').setArray(Uint16Array.from(L.idx)).setBuffer(buf)).setMaterial(mat);
    const mesh = nd.createMesh(`${name}_LOD${i}`).addPrimitive(prim);
    tris.push(L.idx.length / 3);
    root.addChild(nd.createNode(`${name}_LOD${i}`).setMesh(mesh).setExtras({ lod: i, tris: L.idx.length / 3 }));
  });
  ex.sculpt = { ...(ex.sculpt || {}), atlas: null, lods: tris.map((t, i) => ({ lod: i, tris: t })), colour: 'COLOR_0 RGBA linear: rgb neutral stone value, a = moss mask' };
  root.setExtras(ex);
  scene.addChild(root);
  const bin = await new NodeIO().writeBinary(nd);
  fs.writeFileSync(glbPath, bin);
  for (const f of ['atlas_color.png', 'atlas_normal.png']) { try { fs.unlinkSync(path.join(outDir, f)); } catch {} }
  // manifest fragment: vertex material, size
  const mf = path.join(ROOT, 'assets/models/sculpt', name + '.manifest.json');
  const frag = JSON.parse(fs.readFileSync(mf, 'utf8')); const e = Object.values(frag)[0];
  e.materials = ['Rock_rock']; e.mats = { Rock_rock: { surface: 'rock', look: spec.look } }; e.lods = tris; e.tris = tris[0]; e.notes = M.def.notes;
  fs.writeFileSync(mf, JSON.stringify(frag, null, 1) + '\n');
  // checks of what is written
  const chk = lods.map((L, i) => { const em = new Map(); for (let f = 0; f < L.idx.length / 3; f++) for (let k = 0; k < 3; k++) { const a = L.idx[f * 3 + k], b = L.idx[f * 3 + (k + 1) % 3]; const p = (q) => [L.pos[q * 3], L.pos[q * 3 + 1], L.pos[q * 3 + 2]].map((t) => Math.round(t * 1e4)).join(','); const ka = p(a), kb = p(b); const key = ka < kb ? ka + '|' + kb : kb + '|' + ka; em.set(key, (em.get(key) || 0) + 1); }
    let open = 0, nonman = 0; for (const c of em.values()) { if (c === 1) open++; else if (c > 2) nonman++; }
    const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; for (let v = 0; v < L.pos.length; v += 3) for (let k = 0; k < 3; k++) { bb[k] = Math.min(bb[k], L.pos[v + k]); bb[k + 3] = Math.max(bb[k + 3], L.pos[v + k]); }
    let am = 0; for (let v = 0; v < L.col.length; v += 4) am += L.col[v + 3];
    return { lod: i, tris: L.idx.length / 3, verts: L.pos.length / 3, openEdges: open, nonManifoldEdges: nonman, bounds: bb.map((t) => +t.toFixed(3)), mossMean: +(am / (L.col.length / 4)).toFixed(3) };
  });
  fs.writeFileSync(path.join(outDir, 'checks_vc.json'), JSON.stringify({ name, fileKB: Math.round(bin.length / 1024), lods: chk }, null, 1));
  console.log(JSON.stringify({ fileKB: Math.round(bin.length / 1024), lods: chk.map((c) => [c.tris, c.verts, c.openEdges, c.nonManifoldEdges, c.mossMean]) }));
  // ---- sheets: what the game will draw (vertex colours, land tint, moss from the mask)
  const look = (L, land, mossOn = true) => {
    const T = LANDS[land], n = L.pos.length / 3, col = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) {
      const a = mossOn ? L.col[v * 4 + 3] * T.k : 0;
      for (let k = 0; k < 3; k++) {
        let c = L.col[v * 4 + k] * (T.tint[k]);
        c = c + (T.moss[k] - c) * a;
        if (T.snow) { const s = P.ss(0.55, 0.9, L.nrm[v * 3 + 1]) * 0.85; c = c + (0.86 - c) * s; }
        col[v * 3 + k] = c;
      }
    }
    return { pos: L.pos, nrm: L.nrm, idx: L.idx, col, base: [1, 1, 1] };
  };
  const b = chk[0].bounds, cc = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2], fov = 35, ts = 300;
  const dist = R.fitDistance(b, fov, 0.8);
  const tiles = [];
  for (const az of [30, 150, 270]) tiles.push({ img: R.render([look(lods[0], 'sun', false)], R.orbit(cc, az, 14, dist, fov, ts, ts)), label: `LOD0 VC ${az}` });
  tiles.push({ img: R.render([look(lods[0], 'sun', false)], R.orbit(cc, 60, 70, dist, fov, ts, ts)), label: 'LOD0 VC TOP' });
  tiles.push({ img: R.render([look(lods[0], 'sun')], R.orbit(cc, 210, 14, dist, fov, ts, ts)), label: 'SUN + MOSS 210' });
  tiles.push({ img: R.render([look(lods[0], 'mtn')], R.orbit(cc, 30, 20, dist, fov, ts, ts)), label: 'MOUNTAIN + SNOW' });
  tiles.push({ img: R.render([look(lods[0], 'dusk')], R.orbit(cc, 120, 20, dist, fov, ts, ts)), label: 'DUSK' });
  tiles.push({ img: R.render([look(lods[0], 'night')], R.orbit(cc, 300, 20, dist, fov, ts, ts)), label: 'NIGHT' });
  const gcam = (px) => { const k = 1 / Math.tan(50 * Math.PI / 360), Hh = b[4] - b[1], d = (ts / 2) * k * Math.max(Hh, 0.55 * Math.max(b[3] - b[0], b[5] - b[2])) / px; const a = 25 * Math.PI / 180, e = 14 * Math.PI / 180; return R.camera([cc[0] + Math.sin(a) * d * Math.cos(e), cc[1] + Math.sin(e) * d, cc[2] + Math.cos(a) * d * Math.cos(e)], cc, 50, ts, ts); };
  lods.forEach((L, i) => tiles.push({ img: R.render([look(L, 'sun')], gcam([200, 90, 40][i])), label: `LOD${i} ${tris[i]} @${[200, 90, 40][i]}PX` }));
  tiles.push({ img: R.render([{ ...look(lods[1], 'sun', false), col: null }], R.orbit(cc, 30, 14, dist, fov, ts, ts), { wire: true, clay: true }), label: 'LOD1 WIRE' });
  R.savePNG(path.join(outDir, 'vc.png'), R.sheet(tiles, 4, { title: `${name} AS THE GAME DRAWS IT - VERTEX COLOUR ONLY, LAND TINT, MOSS MASK` }));
  console.log('  sheet .tmp/sculpt/' + name + '/vc.png');
}

/** field.png: all six rocks (whatever GLBs exist) scattered at every rotation / scale / depth, game camera */
async function field() {
  const R = await import('../preview.mjs');
  const { NodeIO } = await import('@gltf-transform/core');
  const names = ['rock_boulder_a', 'rock_boulder_b', 'rock_slab', 'rock_outcrop', 'rock_standing', 'rock_rubble'];
  const io = new NodeIO(), lib = {};
  for (const n of names) {
    const f = path.join(ROOT, 'assets/models/sculpt', n + '.glb'); if (!fs.existsSync(f)) continue;
    const doc = await io.read(f); lib[n] = [];
    for (const node of doc.getRoot().listNodes()) { const mm = /_LOD(\d)$/.exec(node.getName()); if (!mm) continue; const p = node.getMesh().listPrimitives()[0]; if (!p.getAttribute('COLOR_0') || p.getAttribute('COLOR_0').getElementSize() !== 4) { delete lib[n]; break; } lib[n][+mm[1]] = { pos: p.getAttribute('POSITION').getArray(), nrm: p.getAttribute('NORMAL').getArray(), idx: p.getIndices().getArray(), col: p.getAttribute('COLOR_0').getArray() }; }
  }
  const have = Object.keys(lib); if (!have.length) return;
  const rnd = P.prng(5), out = [];
  const place = (L, [x, y, z], yaw, s, tint, moss, mk) => {
    const n = L.pos.length / 3, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3), c = Math.cos(yaw), si = Math.sin(yaw);
    for (let v = 0; v < n; v++) {
      const px = L.pos[v * 3] * s[0], py = L.pos[v * 3 + 1] * s[1], pz = L.pos[v * 3 + 2] * s[2];
      pos[v * 3] = x + c * px + si * pz; pos[v * 3 + 1] = y + py; pos[v * 3 + 2] = z - si * px + c * pz;
      const qx = L.nrm[v * 3] / s[0], qy = L.nrm[v * 3 + 1] / s[1], qz = L.nrm[v * 3 + 2] / s[2], l = Math.hypot(qx, qy, qz);
      nrm[v * 3] = (c * qx + si * qz) / l; nrm[v * 3 + 1] = qy / l; nrm[v * 3 + 2] = (-si * qx + c * qz) / l;
      const a = L.col[v * 4 + 3] * mk;
      for (let k = 0; k < 3; k++) { const b0 = L.col[v * 4 + k] * tint[k]; col[v * 3 + k] = b0 + (moss[k] - b0) * a; }
    }
    out.push({ pos, nrm, idx: L.idx, col, base: [1, 1, 1] });
  };
  const T = LANDS.sun;
  for (let i = 0; i < 26; i++) {
    const n = have[i % have.length], r = 2 + rnd() * 9, a = rnd() * 6.283, x = Math.sin(a) * r, z = -Math.cos(a) * r * 0.7 - 2;
    const s0 = 0.6 + rnd() * 1.3, sq = 0.85 + rnd() * 0.3, d = Math.hypot(x, z - 9);
    const L = lib[n][d < 9 ? 0 : d < 16 ? 1 : 2];
    place(L, [x, -0.1 * s0 * rnd() - 0.04, z], rnd() * 6.283, [s0 * sq, s0, s0 / sq], T.tint, T.moss, rnd() < 0.45 ? T.k : 0);
  }
  // kit workaround (kitNotes): preview.render's shadow lookup offsets by a FIXED 4 mm along the normal and its bias is
  // 1.5 shadow texels; over a 25 m field a texel is ~2 cm, so sloped faces self-shadow in fine stripes (acne) — the
  // "stripe banding" of the first review. Rendering the field at 1/10 scale (same image) makes the offset 2.5 texels.
  const SC = 0.1;
  for (const m of out) for (let i = 0; i < m.pos.length; i++) m.pos[i] *= SC;
  const cam = R.camera([0, 4.2 * SC, 9 * SC], [0, 0.3 * SC, -3 * SC], 50, 1280, 720);
  R.savePNG(path.join(ROOT, '.tmp/sculpt/rock_boulder_a/field.png'), R.render(out, cam, { groundColor: [0.16, 0.22, 0.1] }));
  console.log('  sheet .tmp/sculpt/rock_boulder_a/field.png (' + have.join(', ') + ')');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, a] = process.argv.slice(2);
  (cmd === 'post' ? post(a) : field()).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
