// woodwork_lib — shared helper of the village woodwork set (bench, table_low, stool, ladder, log_seat, timber_log,
// plank, planks_stack, wheelbarrow). Members of the same family as the first batch's batched props (_smallprops.mjs:
// handcart, barrel, bucket): vertex colours on every LOD, no textures, the game's material names.
//
// Three jobs:
//  1. shape helpers a village carpenter would use: boards with eased edges, poles that are not straight, through-tenon
//     tops with a wedge, cord lashings, a crisp colour zone on a surface (`zone`, for a cup ring, a worn seat, end grain);
//  2. paint helpers: wood by board, bark, end grain, cord, iron — colour follows form, calm big faces;
//  3. a vertex-colour build driver (a copy of the _smallprops.mjs driver: same kit stages, COLOR_0 on every LOD, material
//     renames), with sheets framed by the object's largest size (game.png in _smallprops fits by HEIGHT, which crops a
//     plank or a bench), and an `--old` mode that renders the nine pack models side by side.
//
//   SCULPT_THREADS=2 node tools/sculpt/assets/woodwork_lib.mjs tools/sculpt/assets/<name>.mjs [--quick]
//   node tools/sculpt/assets/woodwork_lib.mjs --old            (.tmp/sculpt/bench/old_models.png)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as P from '../sdf.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..', '..');
export const C = P.color;
export const mix = P.mix, ss = P.ss, clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const FAR = () => process.env.SMALLPROPS_FAR === '1';
export const add = (a, b) => (a ? a.add(b) : b);

// ===================================================================================================== shape helpers
/**
 * A board: a box from..to with eased (hand-planed) edges, a slight irregularity of thickness and an optional bow.
 * axis = the board's length axis ('x' | 'z'). bow: metres of rise at the middle (along the length).
 */
export function board([x0, y0, z0, x1, y1, z1], { r = 0.006, bow = 0, cup = 0, axis = 'x', seed = 1 } = {}) {
  let b = P.roundBox([x1 - x0, y1 - y0, z1 - z0], r).at((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  if (bow || cup) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, L = axis === 'x' ? (x1 - x0) / 2 : (z1 - z0) / 2, W = axis === 'x' ? (z1 - z0) / 2 : (x1 - x0) / 2;
    b = b.warp((x, y, z, o) => {
      const u = axis === 'x' ? (x - cx) / L : (z - cz) / L, v = axis === 'x' ? (z - cz) / W : (x - cx) / W;
      o[1] = bow * (1 - u * u) + cup * v * v;
    }, { lip: 1.15, grow: Math.abs(bow) + Math.abs(cup) + 0.01 });
  }
  return b;
}

/** a round stick / pole along points with a radius function of t and a gentle wobble of the section */
export function pole(points, r, { seed = 1, wob = 0.08 } = {}) {
  let t = P.tube(points, r);
  if (wob) t = t.rough({ type: 'fbm', scale: 0.25, amp: (typeof r === 'number' ? r : r(0.5)) * wob, oct: 2, seed });
  return t;
}

/**
 * A cord lashing around a stick: `turns` rounded wraps about the axis a->b (centre at `at`), slightly fat so they
 * survive simplification as a band. Returns the shape (part it yourself).
 */
export function lashing(at, dir, R, { turns = 3, cord = 0.007, pitch = 0.013, tilt = 8 } = {}) {
  let w = null;
  for (let i = 0; i < turns; i++) {
    const y = (i - (turns - 1) / 2) * pitch;
    w = add(w, P.torus(R + cord * 0.55, cord).turn(tilt * (i % 2 ? 1 : -1), 0, 0).at(0, y, 0));
  }
  return w.aim(dir).at(at[0], at[1], at[2]);
}

/**
 * A crisp colour zone ON a surface: the part of `base`'s surface where region(x,y,z) <= 0 (a distance-like value)
 * becomes its own shape a fraction of a millimetre proud, so it gets its own part (the simplifier keeps part borders:
 * a ring of paint survives at 1,800 triangles). Usage: zone(top, (x,y,z) => ring distance).part('cupring', ...)
 */
export function zone(base, region, proud = 0.0007) {
  const bf = base.f;
  return new P.Shape((x, y, z) => Math.max(bf(x, y, z) - proud, region(x, y, z)), base.b);
}

/**
 * A split running in from an end along the grain: a V opening at the top surface (y = top) that is widest and deepest
 * at A (on or past the end face) and closes to nothing at B. Cut it: slab.cut(splitCut(...)). The kit's crack() tapers
 * to zero at BOTH ends and stays buried when started inside a board.
 * axisY: the surface it opens to faces +Y (top); for a split opening on another face, build it at +Y and turn it.
 */
export function splitCut(A, B, top, { d0 = 0.03, w0 = 0.01, wig = 0.003, seed = 1 } = {}) {
  const ax = B[0] - A[0], az = B[1] - A[1], L2 = ax * ax + az * az, L = Math.sqrt(L2), ph = seed * 1.7;
  const f = (x, y, z) => {
    const ur = ((x - A[0]) * ax + (z - A[1]) * az) / L2, u = clamp(ur, 0, 1);
    const sp = ((x - A[0]) * az - (z - A[1]) * ax) / L - wig * Math.sin(u * 19 + ph) * (1 - u);
    const dep = d0 * (1 - u) + 1e-4, t = clamp((y - (top - dep)) / dep, 0, 1);
    const hw = (w0 / 2) * Math.pow(1 - u, 0.7) * (0.25 + 0.75 * t);
    return Math.max(Math.abs(sp) - hw, (top - dep) - y, (ur - 1) * L);
  };
  const r = Math.max(d0, w0) + 0.02;
  return new P.Shape(f, [Math.min(A[0], B[0]) - r, top - d0 - 0.01, Math.min(A[1], B[1]) - r, Math.max(A[0], B[0]) + r, top + 0.05, Math.max(A[1], B[1]) + r]);
}

/** bounded break (three planes inside a ball) — chip() is an unbounded cone (NOTES.md) */
export function brk(at, dir, size, seed = 1) {
  const rnd = P.prng(seed), d = P.norm(dir);
  let s = P.sphere(size);
  for (let i = 0; i < 3; i++) {
    const n = P.norm([d[0] + (rnd() - 0.5) * 0.9, d[1] + (rnd() - 0.5) * 0.9, d[2] + (rnd() - 0.5) * 0.9]);
    s = s.intersect(P.plane(n.map((v) => -v), [n[0] * -size * 0.35, n[1] * -size * 0.35, n[2] * -size * 0.35]));
  }
  return s.at(at[0], at[1], at[2]);
}

// ===================================================================================================== paint helpers
/** low-frequency wood grain value 0..1 along an axis (vertex colours: keep it broad) */
export function grain(x, y, z, axis = 'x', seed = 1, freq = 90) {
  const u = axis === 'x' ? x : axis === 'z' ? z : y;
  const v = axis === 'x' ? y * 2.5 + z : axis === 'z' ? x + y * 2.5 : x + z;
  return 0.5 + 0.5 * Math.sin(v * freq + 5 * P.fbm(u * 2.5, v * 6, seed, seed, 2));
}

// the family's woods (sRGB). Lighter than the first batch's round one (NOTES: paint near PAL / the old object).
export const WOOD = {
  pale: C('#cfa070'), mid: C('#b07a4e'), deep: C('#8a5a3a'), dark: C('#5e3e2a'),
  silver: C('#b4a08a'), worn: C('#e6c294'), grime: C('#3a281c'), fresh: C('#ecc894'),
};

/**
 * Wood paint. o: { tone (0 pale .. 1 deep), axis, seed, silver (rain on tops 0..1), wornTop (hands / sitting 0..1),
 * foot (ground damp height m), toneAt: (c) => tone override (per board) }
 */
export function woodPaint(o = {}) {
  const axis = o.axis || 'x', seed = o.seed || 1;
  return (c) => {
    const { x, y, z, cavity, edge, ny } = c;
    const tone = o.toneAt ? o.toneAt(c) : (o.tone ?? 0.4);
    let col = tone < 0.5 ? mix(WOOD.pale, WOOD.mid, tone * 2) : mix(WOOD.mid, WOOD.deep, tone * 2 - 1);
    col = mix(col, WOOD.deep, 0.22 * grain(x, y, z, axis, seed, o.freq || 60) + 0.12 * P.fbm(x * 3, y * 3, z * 3, seed + 3, 2));
    if (ny > 0.4) col = mix(col, WOOD.silver, (o.silver ?? 0.25) * ss(0.4, 0.9, ny));
    if (ny < -0.5) col = mix(col, WOOD.dark, 0.35);
    if (o.foot) col = mix(col, WOOD.grime, 0.55 * ss(o.foot, 0, y));
    col = mix(col, WOOD.worn, edge * (o.edge ?? 0.5));
    return mix(col, WOOD.grime, cavity * 0.5);
  };
}

/** end grain of a sawn or cut end: pale, rings about the pith (cx, cy in the plane given by axis) */
export function endGrainPaint({ axis = 'z', centre = [0, 0], R = 0.25, tone = 0, seed = 1, heart = 0.55 } = {}) {
  return (c) => {
    const { x, y, z, cavity, edge } = c;
    const a = axis === 'z' ? [x, y] : axis === 'x' ? [z, y] : [x, z];
    const r = Math.hypot(a[0] - centre[0], a[1] - centre[1]) / R;
    let col = mix(C('#e6c899'), C('#cfa774'), tone);
    col = mix(col, C('#b98c5c'), 0.25 * (0.5 + 0.5 * Math.sin(r * 38 + 2 * P.fbm(x * 9, y * 9, z * 9, seed, 2))));
    col = mix(col, C('#c08a58'), ss(heart + 0.05, heart - 0.1, r) * 0.45);    // darker heartwood
    col = mix(col, C('#f2dcb2'), edge * 0.4);
    return mix(col, C('#4a3220'), cavity * 0.6);
  };
}

export function barkPaint({ seed = 1, moss = 0 } = {}) {
  return (c) => {
    const { x, y, z, cavity, edge, ny } = c;
    let col = mix(C('#7a6250'), C('#5c4838'), 0.5 + 0.5 * P.fbm(x * 5, y * 5, z * 5, seed, 2));
    col = mix(col, C('#a39484'), edge * 0.55 + (ny > 0.5 ? 0.18 : 0));     // ridges and the rained-on top grey
    if (moss) col = mix(col, C('#8a8a4c'), moss * ss(0.2, 0.7, -ny + 0.3 * P.fbm(x * 4, y * 4, z * 4, seed + 1, 2)));
    return mix(col, C('#2c2018'), cavity * 0.65);
  };
}

export function cordPaint({ seed = 1, tone = 0 } = {}) {
  return (c) => {
    const { x, y, z, cavity, edge } = c;
    let col = mix(C('#d8c08a'), C('#b49a64'), clamp(tone + 0.5 * P.fbm(x * 40, y * 40, z * 40, seed, 2), 0, 1));
    col = mix(col, C('#efe0b4'), edge * 0.4);
    return mix(col, C('#5a4a30'), cavity * 0.55);
  };
}

export function ironPaint({ seed = 1, rust = 0.5 } = {}) {
  return (c) => {
    const { x, y, z, edge, cavity, ny } = c;
    let col = mix(C('#4a4d57'), C('#3a3c44'), 0.5 + 0.5 * P.fbm(x * 12, y * 12, z * 12, seed, 2));
    const r = clamp(ss(0.45, 0.8, P.fbm(x * 8, y * 8, z * 8, seed + 7, 2) + 0.5) * rust + (ny < -0.3 ? 0.3 : 0) + cavity * 0.5, 0, 1);
    col = mix(col, C('#93522c'), r * 0.75);
    return mix(col, C('#a4a8b2'), edge * 0.55);
  };
}

/** shared materials (game names are set per asset in gameMats) */
export const MATS = {
  wood: { name: 'wood', surface: 'wood', look: { rim: 0.3 } },
  bark: { name: 'bark', surface: 'bark', look: {} },
  metal: { name: 'metal', surface: 'metal', look: { spec: 0.55, specPower: 40, rim: 0.4 } },
};

// ===================================================================================================== build driver
async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--old')) return oldSheet();
  const assetPath = args.find((a) => a.endsWith('.mjs'));
  const quick = args.includes('--quick');
  const { loadModel } = await import('../model.mjs');
  const { Pool } = await import('../pool.mjs');
  const { PARTS } = await import('../sdf.mjs');
  const { extract, simplify, splitNormals, checkMesh } = await import('../mesh.mjs');
  const { bakeVertexColors } = await import('../bake.mjs');
  const { writeStaticGLB } = await import('../gltf.mjs');
  const { faceTags } = await import('../build.mjs');
  const R = await import('../preview.mjs');
  const T0 = Date.now(), secs = (t) => ((Date.now() - t) / 1000).toFixed(1) + ' s';
  const M = await loadModel(assetPath);
  const cfg = M.cfg, def = M.def, name = def.name;
  if (quick) cfg.voxel *= 1.5;
  const outDir = path.join(ROOT, '.tmp', 'sculpt', name); fs.mkdirSync(outDir, { recursive: true });
  const glbDir = path.join(ROOT, 'assets', 'models', 'sculpt'); fs.mkdirSync(glbDir, { recursive: true });
  const pool = new Pool(assetPath);
  let lodsAll = [];
  console.log(`woodwork ${name}: ${pool.size} workers, voxel ${(cfg.voxel * 1000).toFixed(1)} mm, bounds ${M.bounds.map((v) => v.toFixed(3)).join(' ')}`);
  try {
    const full = await extract(M, pool, cfg.voxel, console.log);
    const tags = await faceTags(pool, full.pos, full.idx);
    const fb = checkMesh(full.pos, full.idx).bounds, diag = Math.hypot(fb[3] - fb[0], fb[4] - fb[1], fb[5] - fb[2]);
    const errs = cfg.lodError || [0.004, 0.012, 0.03].map((k) => k * diag);
    const lods = []; lodsAll = lods;
    let src = { pos: full.pos, idx: full.idx, tag: tags.part };
    let far = null;
    for (const [li, target] of cfg.lods.entries()) {
      if (def.farFrom != null && li === def.farFrom) {
        process.env.SMALLPROPS_FAR = '1';
        const M2 = await loadModel(assetPath); const pool2 = new Pool(assetPath);
        const full2 = await extract(M2, pool2, cfg.voxel * (def.farVoxel || 2), console.log);
        const tags2 = await faceTags(pool2, full2.pos, full2.idx);
        far = { M: M2, pool: pool2 }; src = { pos: full2.pos, idx: full2.idx, tag: tags2.part };
        delete process.env.SMALLPROPS_FAR;
      }
      const s = simplify(src.pos, src.idx, target, { faceTag: src.tag, hardAngle: cfg.hardAngle ?? 50, maxError: errs[li] ?? Infinity, ...(cfg.lodTurn?.[li] != null ? { maxNormalTurn: cfg.lodTurn[li] } : {}) });
      const cb = checkMesh(s.pos, s.idx).bounds, drift = Math.max(...cb.map((v, k) => Math.abs(v - fb[k])));
      console.log(`  LOD${li}: ${s.idx.length / 3} tris (target ${target}), bbox drift ${(drift * 1000).toFixed(0)} mm`);
      lods.push(s); src = s; s.far = far;
    }
    const out = [];
    for (const L of lods) {
      const sn = splitNormals(L.pos, L.idx, cfg.creaseAngle, { faceTag: L.tag });
      const nv = sn.pos.length / 3, tagsOf = new Map();
      for (let f = 0; f < sn.idx.length / 3; f++) for (let k = 0; k < 3; k++) { const s = sn.src[sn.idx[f * 3 + k]]; let t = tagsOf.get(s); if (!t) tagsOf.set(s, (t = new Set())); t.add(L.tag[f]); }
      const at = Float32Array.from(sn.pos), acc = new Float32Array(nv * 4);
      for (let f = 0; f < sn.idx.length / 3; f++) {
        const ia = sn.idx[f * 3], ib = sn.idx[f * 3 + 1], ic = sn.idx[f * 3 + 2];
        for (const v of [ia, ib, ic]) {
          if (tagsOf.get(sn.src[v]).size < 2) continue;
          for (let k = 0; k < 3; k++) acc[v * 4 + k] += (sn.pos[ia * 3 + k] + sn.pos[ib * 3 + k] + sn.pos[ic * 3 + k]) / 3;
          acc[v * 4 + 3]++;
        }
      }
      for (let v = 0; v < nv; v++) if (acc[v * 4 + 3]) for (let k = 0; k < 3; k++) at[v * 3 + k] = 0.35 * sn.pos[v * 3 + k] + 0.65 * acc[v * 4 + k] / acc[v * 4 + 3];
      const vc = await bakeVertexColors(L.far ? L.far.pool : pool, at, L.far ? L.far.M : M);
      out.push({ pos: sn.pos, nrm: sn.nrm, idx: sn.idx, col: vc.col, tag: L.tag, vpart: vc.part });
    }
    const glb = path.join(glbDir, name + '.glb');
    const extras = { author: 'sculpted for this project', lods: out.map((o, i) => ({ lod: i, tris: o.idx.length / 3 })), anchors: def.anchors || {}, voxel: cfg.voxel, vertexColour: true };
    await writeStaticGLB(glb, { name, lods: out, parts: PARTS, materials: cfg.materials || {}, atlas: null, anchors: def.anchors || {}, extras });
    const bytes = await renameMaterials(glb, cfg.materials || {}, def.gameMats || {});
    console.log(`  wrote ${path.relative(ROOT, glb)} (${(bytes / 1024).toFixed(0)} KB)`);
    let before = null, beforeBounds = null;
    if (def.replaces) { before = await loadBefore(def.replaces, R); beforeBounds = bboxOf(before); }
    const checks = {
      name, full: checkMesh(full.pos, full.idx), flippedFacesVsField: tags.flips,
      lods: out.map((o, i) => ({ lod: i, target: cfg.lods[i], ...checkMesh(lods[i].pos, lods[i].idx), vertsWritten: o.pos.length / 3, parts: [...new Set(Array.from(o.tag))].map((t) => PARTS[t]?.name) })),
      fileKB: Math.round(bytes / 1024), vertexColourOnly: true,
    };
    const b = checks.lods[0].bounds;
    if (beforeBounds) checks.vsReplaced = { replaced: def.replaces.file, scale: def.replaces.scale, before: beforeBounds.map((v) => +v.toFixed(3)), after: b, sizeBefore: sizeOf(beforeBounds), sizeAfter: sizeOf(b), maxDelta: +Math.max(...b.map((v, k) => Math.abs(v - beforeBounds[k]))).toFixed(3) };
    const frag = { [def.id || 'sculpt_' + name]: {
      file: `models/sculpt/${name}.glb`, type: 'model', license: 'CC0 (original work)', author: 'sculpted for this project',
      source: `tools/sculpt/assets/${name}.mjs (node tools/sculpt/assets/woodwork_lib.mjs)`, scale: 1,
      size: sizeOf(b), tris: checks.lods[0].tris, lods: checks.lods.map((l) => l.tris),
      materials: Object.entries(cfg.materials || {}).map(([k, m]) => (def.gameMats || {})[k] || m.name),
      mats: Object.fromEntries(Object.entries(cfg.materials || {}).map(([k, m]) => [(def.gameMats || {})[k] || m.name, { surface: m.surface, look: m.look || {} }])),
      notes: def.notes || '',
    } };
    fs.writeFileSync(path.join(glbDir, name + '.manifest.json'), JSON.stringify(frag, null, 1) + '\n');
    await sheets({ M, out, before, outDir, quick, R, PARTS });
    checks.buildSeconds = +((Date.now() - T0) / 1000).toFixed(1);
    fs.writeFileSync(path.join(outDir, 'checks.json'), JSON.stringify(checks, null, 1));
    console.log(JSON.stringify({ lods: checks.lods.map((l) => [l.tris, l.watertight, l.openEdges, l.nonManifoldEdges]), size: sizeOf(b), before: beforeBounds && sizeOf(beforeBounds), maxDelta: checks.vsReplaced?.maxDelta, fileKB: checks.fileKB }));
  } finally { await pool.close(); for (const L of lodsAll) if (L.far) await L.far.pool.close().catch(() => {}); }
  console.log(`done in ${secs(T0)}`);
}
const sizeOf = (b) => [+(b[3] - b[0]).toFixed(3), +(b[4] - b[1]).toFixed(3), +(b[5] - b[2]).toFixed(3)];
function bboxOf(meshes) {
  const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const m of meshes) for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], m.pos[i + k]); b[k + 3] = Math.max(b[k + 3], m.pos[i + k]); }
  return b;
}

async function renameMaterials(file, materials, gameMats) {
  const { NodeIO } = await import('@gltf-transform/core');
  const io = new NodeIO();
  const doc = await io.read(file);
  for (const m of doc.getRoot().listMaterials()) {
    for (const [k, spec] of Object.entries(materials)) {
      if (m.getName() === `${spec.name}_${spec.surface}_vc`) {
        m.setName(gameMats[k] || spec.name);
        const ex = m.getExtras(); ex.sculpt = { lod: 'vertex' }; m.setExtras(ex);
      }
    }
  }
  const bin = await io.writeBinary(doc);
  fs.writeFileSync(file, bin);
  return bin.length;
}

/** the model the game shows now, as renderer meshes (manifest scale applied; COLOR_0 kept) */
export async function loadBefore({ file, scale = 1 }, R) {
  const { NodeIO } = await import('@gltf-transform/core');
  const doc = await new NodeIO().read(path.join(ROOT, file));
  const meshes = [];
  const visit = (node, mat) => {
    const m = mul4(mat, node.getMatrix());
    const mesh = node.getMesh();
    if (mesh) for (const prim of mesh.listPrimitives()) {
      const pa = prim.getAttribute('POSITION'), na = prim.getAttribute('NORMAL'), ca = prim.getAttribute('COLOR_0'), ia = prim.getIndices();
      const n = pa.getCount(), pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), t = [0, 0, 0, 0];
      for (let i = 0; i < n; i++) {
        pa.getElement(i, t); const x = t[0], y = t[1], z = t[2];
        pos[i * 3] = (m[0] * x + m[4] * y + m[8] * z + m[12]) * scale; pos[i * 3 + 1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) * scale; pos[i * 3 + 2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) * scale;
        if (na) { na.getElement(i, t); const a = m[0] * t[0] + m[4] * t[1] + m[8] * t[2], b = m[1] * t[0] + m[5] * t[1] + m[9] * t[2], c = m[2] * t[0] + m[6] * t[1] + m[10] * t[2]; const l = Math.hypot(a, b, c) || 1; nrm[i * 3] = a / l; nrm[i * 3 + 1] = b / l; nrm[i * 3 + 2] = c / l; }
      }
      const idx = ia ? Uint32Array.from(ia.getArray()) : Uint32Array.from({ length: n }, (_, i) => i);
      const mt = prim.getMaterial();
      const base = mt ? mt.getBaseColorFactor().slice(0, 3) : [0.7, 0.7, 0.7];
      let col = null;
      if (ca) { col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { ca.getElement(i, t); col[i * 3] = t[0]; col[i * 3 + 1] = t[1]; col[i * 3 + 2] = t[2]; } }
      meshes.push({ pos, nrm, idx, col, base });
    }
    for (const c of node.listChildren()) visit(c, m);
  };
  for (const s of doc.getRoot().listScenes()) for (const n of s.listChildren()) visit(n, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return meshes;
}
function mul4(a, b) {
  const o = new Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; }
  return o;
}
const lodMeshes = (o) => [{ pos: o.pos, nrm: o.nrm, idx: o.idx, col: o.col, base: [1, 1, 1] }];

/** framing by the LARGEST size (a plank is 0.15 m tall and 1.5 m long) */
function frame(b) {
  const c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
  const S = Math.max(b[4] - b[1], b[3] - b[0], b[5] - b[2]);
  return { c, S };
}

async function sheets({ M, out, before, outDir, quick, R }) {
  const name = M.def.name, save = (n, img) => { R.savePNG(path.join(outDir, n), img); console.log(`  sheet .tmp/sculpt/${name}/${n}`); };
  const after = lodMeshes(out[0]);
  const b = bboxOf(after), { c, S } = frame(b);
  const fov = 35, ts = quick ? 300 : 440, dist = R.fitDistance(b, fov, 0.86);
  const views = [];
  for (let i = 0; i < 8; i++) views.push([i * 45, 14, `${i * 45} DEG`]);
  for (let i = 0; i < 3; i++) views.push([30 + i * 120, 55, `ABOVE ${30 + i * 120}`]);
  views.push([20, -25, 'BELOW']);
  save('turntable.png', R.sheet(views.map(([az, el, label]) => ({ img: R.render(after, R.orbit(c, az, el, dist, fov, ts, ts), { ground: el > 0 }), label })), 4, { title: `${name} TURNTABLE (LOD0 ${out[0].idx.length / 3} TRIS, VERTEX COLOUR)` }));
  save('clay.png', R.sheet([0, 90, 180, 270].map((az) => ({ img: R.render(after, R.orbit(c, az + 20, 18, dist, fov, ts, ts), { clay: true }), label: `CLAY ${az + 20}` })).concat([{ img: R.render(after, R.orbit(c, 40, 70, dist, fov, ts, ts), { clay: true }), label: 'CLAY TOP' }]), 5, { title: `${name} CLAY - FORM ONLY` }));
  // hero: standing two metres away (from the object's near side), eye height 1.6
  const heroW = quick ? 960 : 1920, heroH = quick ? 540 : 1080, eyeY = 1.6, heroD = 2 + S * 0.35;
  const heroCam = (az, w = heroW, h = heroH, fv = 55) => { const a = az * Math.PI / 180; return R.camera([c[0] + Math.sin(a) * heroD, eyeY, c[2] + Math.cos(a) * heroD], [c[0], b[1] + (b[4] - b[1]) * 0.45, c[2]], fv, w, h); };
  save('hero.png', R.render(after, heroCam(32)));
  // close: the object filling the frame, from front-left high and back-right, plus the two ends at arm's length
  const cw = quick ? 640 : 900, ch = Math.round(cw * 0.62), dC = R.fitDistance(b, 40, 0.95, cw / ch);
  const ends = (M.def.closeups || []).map(([p, az, el, d]) => ({ img: R.render(after, R.orbit(p, az, el, d, 40, cw, ch)), label: `DETAIL ${p.map((v) => v.toFixed(2)).join(',')}` }));
  save('close.png', R.sheet([
    { img: R.render(after, R.orbit(c, 32, 28, dC, 40, cw, ch)), label: 'CLOSE 32' }, { img: R.render(after, R.orbit(c, 212, 24, dC, 40, cw, ch)), label: 'CLOSE 212' },
    ...ends,
  ], 2, { title: `${name} CLOSE (LOD0)` }));
  // game camera: 50 deg fov, looking down ~20 deg, the object's LARGEST size about `px` pixels on screen
  const gameCam = (w, h, px, az = 32) => { const k = 1 / Math.tan(50 * Math.PI / 360); const d = (h / 2) * k * S / px; const a = az * Math.PI / 180, e = 20 * Math.PI / 180; return R.camera([c[0] + Math.sin(a) * d * Math.cos(e), c[1] + Math.sin(e) * d, c[2] + Math.cos(a) * d * Math.cos(e)], c, 50, w, h); };
  save('game.png', R.sheet(out.map((o, i) => ({ img: R.render(lodMeshes(o), gameCam(560, 480, 300)), label: `LOD${i} ${o.idx.length / 3} TRIS` })).concat(out.map((o, i) => ({ img: R.render(lodMeshes(o), gameCam(560, 480, 110, 212)), label: `LOD${i} SMALL, BACK` }))), out.length, { title: `${name} AT GAME DISTANCE (LARGEST SIZE 300 / 110 PX)` }));
  const lt = [];
  for (let i = 0; i < out.length; i++) lt.push({ img: R.render(lodMeshes(out[i]), R.orbit(c, 30, 16, dist, fov, ts, ts)), label: `LOD${i} ${out[i].idx.length / 3}` });
  for (let i = 0; i < out.length; i++) lt.push({ img: R.render(lodMeshes(out[i]).map((m) => ({ ...m, col: null })), R.orbit(c, 30, 16, dist, fov, ts, ts), { wire: true, clay: true }), label: `LOD${i} WIRE` });
  save('lods.png', R.sheet(lt, out.length, { title: `${name} LODS` }));
  if (before) {
    const bs = quick ? 420 : 640;
    const cmp = (az) => heroCam(az, bs, bs, 46);
    const gc = gameCam(bs, Math.round(bs * 0.6), 200);
    const tiles = [
      { img: R.render(before, cmp(32)), label: 'BEFORE - 2 M' }, { img: R.render(after, cmp(32)), label: 'AFTER - 2 M' },
      { img: R.render(before, cmp(212)), label: 'BEFORE - BACK' }, { img: R.render(after, cmp(212)), label: 'AFTER - BACK' },
      { img: R.render(before, gc), label: 'BEFORE - GAME CAMERA' }, { img: R.render(lodMeshes(out[1]), gc), label: 'AFTER LOD1 - GAME CAMERA' },
      { img: R.render(before, R.orbit(c, 32, 18, dist, fov, bs, bs), { clay: true }), label: 'BEFORE - CLAY' }, { img: R.render(after, R.orbit(c, 32, 18, dist, fov, bs, bs), { clay: true }), label: 'AFTER - CLAY' },
    ];
    save('before_after.png', R.sheet(tiles, 2, { title: `${name} BEFORE / AFTER - SAME CAMERA AND LIGHT` }));
  }
}

const OLD = [
  ['bench', 'prop_bench', 0.57623], ['table_low', 'prop_table_low', 0.41667], ['stool', 'prop_stool', 0.9],
  ['ladder', 'prop_ladder', 3.24675], ['log_seat', 'prop_log_a', 0.88889], ['timber_log', 'prop_tree_log', 2],
  ['plank', 'prop_plank_a', 1], ['planks_stack', 'prop_planks_stack', 0.875], ['wheelbarrow', 'prop_wheelbarrow', 2.76855],
];
async function oldSheet() {
  const R = await import('../preview.mjs');
  const tiles = [];
  for (const [n, id, sc] of OLD) {
    const m = await loadBefore({ file: `assets/models/refined/${id}.glb`, scale: sc }, R);
    const b = bboxOf(m), { c } = frame(b), dist = R.fitDistance(b, 35, 0.8);
    tiles.push({ img: R.render(m, R.orbit(c, 32, 22, dist, 35, 360, 360)), label: `${n} ${sizeOf(b).join('x')}` });
    tiles.push({ img: R.render(m, R.orbit(c, 212, 22, dist, 35, 360, 360)), label: `${n} BACK` });
  }
  const dir = path.join(ROOT, '.tmp', 'sculpt', 'bench'); fs.mkdirSync(dir, { recursive: true });
  R.savePNG(path.join(dir, 'old_models.png'), R.sheet(tiles, 6, { title: 'THE NINE PACK MODELS (FRONT = +Z AT 0 DEG)' }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
