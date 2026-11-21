// 影狼 / 胧牙 — the shade wolf, sculpted anew on the skeleton and clips of ani_wolf (Quaternius, CC0). Shapes in wolf_lib.mjs.
// INTENT
//  silhouette: a lean wolf of ink — high withers, deep keeled chest, tucked waist, long jointed legs, a long narrow head, ears
//    laid back, a torn crest of brush strokes from nape to croup and a heavy brush tail hanging low: it reads as a hunter, never a dog.
//  big forms: the chest + withers block, the haunch, the head wedge. medium: legs with elbow / hock, the mane crest, the tail brush.
//  the eye rests on: the head (brow over the ember eyes, the jaw line, the cut lip seam glowing faintly) and the mane at the nape.
//  story: a beast of ink-flame — strokes dark at the root and pale at the tip, ink settling into the legs and paws; no scars, no realism.
//  must not look like: the pack's chunky dog, a primitive, a symmetric comb of spikes, even fur noise everywhere.
// Bind pose, game metres (the pack's Root wrapper carries the x100), +Z front, feet on y = 0.
// WOLF_LOD=1 builds shade_wolf_lod (pooled ordinary wolves: same skeleton, ~5k triangles, fewer strokes, coarser voxel).
// After every build:   node tools/sculpt/assets/shade_wolf.mjs post [lod]    (welds weights, splits eyes / ember into their own
//                                                                           primitives: materials Eyes_Black + Eye_Ember)
//                      node tools/sculpt/assets/shade_wolf.mjs sheets [lod]  (final sheets from the written GLB)
import { buildWolf, EYE, CORE, rotHead } from './wolf_lib.mjs';

const LOD = !!process.env.WOLF_LOD;
const RIG = 'assets/models/refined/ani_wolf.glb';

export default {
  name: LOD ? 'shade_wolf_lod' : 'shade_wolf',
  id: LOD ? 'sculpt_ani_wolf_lod' : 'sculpt_ani_wolf',
  rig: { file: RIG },
  rigCredit: 'Quaternius, CC0 (skeleton + clips)',
  voxel: LOD ? 0.0036 : 0.0026,
  lods: [LOD ? 5000 : 14000],
  ground: 0,
  aoRange: 0.07,
  aoStrength: 0.38,
  cavityDark: 0.25,
  cavity: [0.003, 0.012],
  creaseAngle: 80,
  hardAngle: 70,
  bandSlack: 0.012,
  materials: { body: { name: 'Main' }, eye: { name: 'Eyes_Black' }, ember: { name: 'Eye_Ember' } },
  weights: { smooth: 4, smoothAlpha: 0.5 },
  poses: [['Idle', 0.8], ['Walk', 0.3], ['Gallop', 0.12], ['Gallop', 0.36], ['Attack', 0.55], ['Death', 0.9], ['Eating', 0.63]],
  notes: 'Sculpted shade wolf on the ani_wolf skeleton (joints, IBMs, clips unchanged). Vertex colours as a value map under the shade tint. Primitives: Main (body), Eyes_Black (the hot eye cores), Eye_Ember (eye rims + lip seam).',
  build({ S, rig }) { return buildWolf(S, rig, { lod: LOD }); },
};

// =========================================================================================== CLI: post / sheets
const ROLE = typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('shade_wolf.mjs') ? process.argv[2] : null;
const NAME = process.argv[3] === 'lod' ? 'shade_wolf_lod' : 'shade_wolf';
if (ROLE === 'post') postProcess().catch((e) => { console.error(e); process.exit(1); });
if (ROLE === 'sheets') finalSheets().catch((e) => { console.error(e); process.exit(1); });

function weldWeights(Pp, J, W, n) {
  const groups = new Map();
  // GLB positions are in the mesh node's space (the pack's x100 wrapper): 1 unit = 1 cm... of 1/100 game metre -> key at 1e-7
  for (let v = 0; v < n; v++) { const k = `${Math.round(Pp[v * 3] * 1e7)},${Math.round(Pp[v * 3 + 1] * 1e7)},${Math.round(Pp[v * 3 + 2] * 1e7)}`; (groups.get(k) || groups.set(k, []).get(k)).push(v); }
  let welded = 0;
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const acc = new Map();
    for (const v of g) for (let k = 0; k < 4; k++) if (W[v * 4 + k] > 0) acc.set(J[v * 4 + k], (acc.get(J[v * 4 + k]) || 0) + W[v * 4 + k]);
    const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((a, b) => a + b[1], 0);
    for (const v of g) for (let k = 0; k < 4; k++) { J[v * 4 + k] = top[k] ? top[k][0] : 0; W[v * 4 + k] = top[k] ? top[k][1] / sum : 0; }
    welded += g.length;
  }
  return welded;
}

// classify: the hot eye core (white, inside the core ellipsoid) -> 1 (Eyes_Black, pupil glow); the pink eye rim and the
// lip seam (the only warm red on the body) -> 2 (Eye_Ember, eye glow)
const DEG = Math.PI / 180;
function toEyeLocal(pb, c) {
  const q = rotHead(pb, -1); const d = [Math.abs(q[0]) - c[0], q[1] - c[1], q[2] - c[2]];
  const [ax, ay, az] = EYE.tilt.map((v) => v * DEG);
  const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay), cz = Math.cos(az), sz = Math.sin(az);
  // local = Rx^T Ry^T Rz^T d
  let [x, y, z] = d;
  [x, y] = [cz * x + sz * y, -sz * x + cz * y];
  [x, z] = [cy * x - sy * z, sy * x + cy * z];
  [y, z] = [cx * y + sx * z, -sx * y + cx * z];
  return [x, y, z];
}
function glowKind(r, g, b, pb) {
  const l = toEyeLocal(pb, CORE.c), e = Math.hypot(l[0] / CORE.r[0], l[1] / CORE.r[1], l[2] / CORE.r[2]);
  if (e < 1.6 && g > 0.5 && r > 0.6) return 1;
  if (r - g < 0.18 || r < 0.35) return 0;
  return 2;
}

// relax the weights where an edge stretches: every vertex of an edge longer than 3x its rest length in any clip frame takes
// the mean weights of its ring (a few rounds); a ring of two stretches no more than its neighbours
function relaxStretch(rig, skinMesh, P0, J, W, I, n) {
  const ring = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const a = I[t + k], b = I[t + (k + 1) % 3]; ring[a].add(b); ring[b].add(a); }
  const E = []; for (let v = 0; v < n; v++) for (const u of ring[v]) if (u > v) E.push(v, u);
  const d = (Q, a, b) => Math.hypot(Q[a * 3] - Q[b * 3], Q[a * 3 + 1] - Q[b * 3 + 1], Q[a * 3 + 2] - Q[b * 3 + 2]);
  const L0 = []; for (let e = 0; e < E.length; e += 2) L0.push(d(P0, E[e], E[e + 1]));
  const clips = rig.clips;
  const scan = () => {
    const bad = new Set(); let worst = 0, where = '', worst1 = 0;
    for (const c of clips) for (let i = 0; i <= 16; i++) {
      const Q = skinMesh(P0, null, J, W, rig.pose(c, c.duration * i / 16)).pos;
      for (let e = 0; e < E.length; e += 2) { if (L0[e / 2] < 1e-4) continue; const r = d(Q, E[e], E[e + 1]) / L0[e / 2];
        if (r > worst) { worst = r; where = `${c.name} t=${(c.duration * i / 16).toFixed(2)}s at ${[0, 1, 2].map((k) => P0[E[e] * 3 + k].toFixed(3)).join(',')}`; }
        if (L0[e / 2] >= 0.001 && r > worst1) worst1 = r;
        if (r > 3) { bad.add(E[e]); bad.add(E[e + 1]); } }
    }
    return { bad, worst, where, worst1 };
  };
  let s = scan(); console.log(`post: stretch before relax ${s.worst.toFixed(2)} (${s.where}), ${s.bad.size} vertices over 3x`);
  for (let round = 0; round < 6 && s.bad.size; round++) {
    const set = new Set(s.bad); for (const v of s.bad) for (const u of ring[v]) set.add(u);
    const nj = new Map();
    for (const v of set) {
      const acc = new Map(); const add = (u, k) => { for (let q = 0; q < 4; q++) if (W[u * 4 + q] > 0) acc.set(J[u * 4 + q], (acc.get(J[u * 4 + q]) || 0) + W[u * 4 + q] * k); };
      add(v, 1); for (const u of ring[v]) add(u, 1);
      nj.set(v, [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4));
    }
    for (const [v, top] of nj) { const sum = top.reduce((a, b) => a + b[1], 0); for (let q = 0; q < 4; q++) { J[v * 4 + q] = top[q] ? top[q][0] : 0; W[v * 4 + q] = top[q] ? top[q][1] / sum : 0; } }
    s = scan(); console.log(`post: relax round ${round + 1}: worst ${s.worst.toFixed(2)} (${s.where}), ${s.bad.size} over 3x; edges >= 1 mm: ${s.worst1.toFixed(2)}`);
  }
  return s;
}

async function postProcess() {
  const fs = await import('node:fs');
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { loadRig, M4, skinMesh } = await import('../rig.mjs');
  const file = `assets/models/sculpt/${NAME}.glb`;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(file);
  const mesh = doc.getRoot().listMeshes()[0];
  if (mesh.listPrimitives().length > 1) { console.log('already post-processed'); return; }
  const rig = await loadRig(file);
  const prim = mesh.listPrimitives()[0];
  const P = prim.getAttribute('POSITION').getArray(), N = prim.getAttribute('NORMAL').getArray(), C = prim.getAttribute('COLOR_0').getArray();
  const J = prim.getAttribute('JOINTS_0').getArray(), W = prim.getAttribute('WEIGHTS_0').getArray(), I = prim.getIndices().getArray();
  const n = P.length / 3;
  console.log('post: welded weights on', weldWeights(P, J, W, n), 'coincident vertices');
  const st = relaxStretch(rig, skinMesh, rig.old[0].pos, J, W, I, n);
  weldWeights(P, J, W, n);
  fs.writeFileSync(`.tmp/sculpt/${NAME}/stretch_final.json`, JSON.stringify({ worst: +st.worst.toFixed(2), where: st.where, worstEdgesOver1mm: +st.worst1.toFixed(2) }, null, 1));
  const kind = new Uint8Array(n);
  for (let v = 0; v < n; v++) { const w = M4.pt(rig.meshWorld, P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); kind[v] = glowKind(C[v * 3], C[v * 3 + 1], C[v * 3 + 2], w); }
  // a triangle goes to a glow primitive when at least two of its corners are that kind
  const tris = [[], [], []];
  for (let t = 0; t < I.length; t += 3) {
    const k = [kind[I[t]], kind[I[t + 1]], kind[I[t + 2]]];
    let pick = 0; for (const q of [1, 2]) if (k.filter((x) => x === q).length >= 2) pick = q;
    tris[pick].push(I[t], I[t + 1], I[t + 2]);
  }
  const buf = doc.getRoot().listBuffers()[0];
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const body = prim.getMaterial();
  const mats = doc.getRoot().listMaterials();
  const eyeMat = mats.find((m) => m.getName() === 'Eyes_Black') || doc.createMaterial('Eyes_Black');
  let emberMat = mats.find((m) => m.getName() === 'Eye_Ember');
  if (!emberMat) emberMat = doc.createMaterial('Eye_Ember').setBaseColorFactor([0.9, 0.3, 0.4, 1]).setRoughnessFactor(1).setMetallicFactor(0);
  eyeMat.setBaseColorFactor([0.9, 0.2, 0.35, 1]);
  const make = (list, mat) => {
    const map = new Map(), Pv = [], Nv = [], Cv = [], Jv = [], Wv = [], Iv = [];
    for (const v of list) {
      let m = map.get(v);
      if (m === undefined) { m = map.size; map.set(v, m); Pv.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); Nv.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]); Cv.push(C[v * 3], C[v * 3 + 1], C[v * 3 + 2]); for (let k = 0; k < 4; k++) { Jv.push(J[v * 4 + k]); Wv.push(W[v * 4 + k]); } }
      Iv.push(m);
    }
    return doc.createPrimitive().setMaterial(mat)
      .setAttribute('POSITION', acc('VEC3', Float32Array.from(Pv))).setAttribute('NORMAL', acc('VEC3', Float32Array.from(Nv)))
      .setAttribute('COLOR_0', acc('VEC3', Float32Array.from(Cv))).setAttribute('JOINTS_0', acc('VEC4', J.constructor.from(Jv)))
      .setAttribute('WEIGHTS_0', acc('VEC4', Float32Array.from(Wv))).setIndices(acc('SCALAR', (map.size > 65535 ? Uint32Array : Uint16Array).from(Iv)));
  };
  const prims = [make(tris[0], body), make(tris[1], eyeMat), make(tris[2], emberMat)];
  mesh.removePrimitive(prim);
  for (const s of prim.listSemantics()) { const a = prim.getAttribute(s); prim.setAttribute(s, null); a.dispose(); }
  const ix = prim.getIndices(); prim.setIndices(null); ix.dispose(); prim.dispose();
  for (const p of prims) mesh.addPrimitive(p);
  // the pack's other materials (Main_Light, Nose) are no longer used
  for (const m of doc.getRoot().listMaterials()) if (!m.listParents().some((x) => x.propertyType === 'Primitive')) m.dispose();
  const bin = await io.writeBinary(doc); fs.writeFileSync(file, bin);
  console.log(`post: wrote ${file} ${(bin.length / 1024).toFixed(0)} KB; tris body ${tris[0].length / 3}, eyes ${tris[1].length / 3}, ember ${tris[2].length / 3}`);
}

// ---- final sheets from the written GLB: raw paint, the paint under the shade tint (approximation), clay; poses from its own clips
async function finalSheets() {
  const path = await import('node:path');
  const fs = await import('node:fs');
  const R = await import('../preview.mjs');
  const { loadRig, skinMesh, M4 } = await import('../rig.mjs');
  const out = `.tmp/sculpt/${NAME}`; fs.mkdirSync(out, { recursive: true });
  const rig = await loadRig(`assets/models/sculpt/${NAME}.glb`), oldRig = await loadRig(RIG);
  // primitive 0 body, 1 Eyes_Black (hot core: shadeEye x2.4 blooms near white), 2 Eye_Ember (shadeEye x1.5)
  const GL = [null, [1.9, 1.25, 1.5], [1.5, 0.35, 0.63]];
  const glowCol = (o, pi) => { const c = Float32Array.from(o.col); if (GL[pi]) for (let v = 0; v < c.length / 3; v++) c.set(GL[pi], v * 3); return c; };
  const shadeCol = (o, pi) => { const c = glowCol(o, pi); if (!GL[pi]) for (let v = 0; v < c.length / 3; v++) { c[v * 3] *= 0.36; c[v * 3 + 1] *= 0.27; c[v * 3 + 2] *= 0.6; } return c; };
  const parts = rig.old.map((o, pi) => ({ ...o, gcol: glowCol(o, pi), scol: shadeCol(o, pi) }));
  const pose = (r, clip, t) => (clip === 'rest' ? r.joints.map(() => M4.id()) : r.pose(r.clip(clip), t));
  const newMesh = (S, mode) => parts.map((o) => { const sk = skinMesh(o.pos, o.nrm, o.J, o.W, S); return { pos: sk.pos, nrm: sk.nrm, idx: o.idx, col: mode === 'clay' ? null : mode === 'shade' ? o.scol : o.gcol, base: [1, 1, 1] }; });
  const oldMeshes = (S) => oldRig.old.map((q) => { const sk = skinMesh(q.pos, q.nrm, q.J, q.W, S); return { pos: sk.pos, nrm: sk.nrm, idx: q.idx, uv: q.uv, tex: q.tex, col: q.col, base: q.base || [1, 1, 1] }; });
  const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const o of parts) { const sk = skinMesh(o.pos, o.nrm, o.J, o.W, pose(rig, 'rest', 0)); for (let i = 0; i < sk.pos.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], sk.pos[i + k]); b[k + 3] = Math.max(b[k + 3], sk.pos[i + k]); } }
  console.log('bounds', b.map((v) => v.toFixed(3)).join(' '));
  const c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2], fov = 35, dist0 = R.fitDistance(b, fov, 0.62), ts = 340;
  const save = (n, img) => { R.savePNG(path.join(out, n), img); console.log('sheet ' + path.join(out, n)); };
  const poses = [['Idle', 0.8], ['Walk', 0.3], ['Gallop', 0.12], ['Gallop', 0.36], ['Attack', 0.55], ['Death', 0.9], ['Eating', 0.63]];
  const tiles = [];
  for (const [clip, t] of poses) tiles.push({ img: R.render(oldMeshes(pose(oldRig, clip, t)), R.orbit(c, 60, 12, dist0, fov, ts, ts)), label: `OLD ${clip} ${t}` });
  for (const [clip, t] of poses) tiles.push({ img: R.render(newMesh(pose(rig, clip, t)), R.orbit(c, 60, 12, dist0, fov, ts, ts)), label: `NEW ${clip} ${t}` });
  for (const [clip, t] of poses) tiles.push({ img: R.render(newMesh(pose(rig, clip, t), 'shade'), R.orbit(c, 60, 12, dist0, fov, ts, ts)), label: `SHADE TINT ${clip}` });
  for (const [clip, t] of poses) tiles.push({ img: R.render(newMesh(pose(rig, clip, t), 'clay'), R.orbit(c, -60, 12, dist0, fov, ts, ts), { clay: true }), label: `CLAY OTHER SIDE` });
  // the frame the kit flagged (Eating t=0.63) close on the nape, both sides, clay
  const ep = pose(rig, 'Eating', 0.63), nc = [0, 0.45, 0.45];
  for (const az of [300, 60]) tiles.push({ img: R.render(newMesh(ep, 'clay'), R.orbit(nc, az, 15, 1.2, 35, ts, ts), { clay: true }), label: `EATING 0.63 NAPE CLAY ${az}` });
  for (const az of [300, 60]) tiles.push({ img: R.render(newMesh(ep), R.orbit(nc, az, 15, 1.2, 35, ts, ts)), label: `EATING 0.63 NAPE ${az}` });
  const gj = pose(rig, 'Gallop_Jump', 0.34);
  for (const az of [60, 300]) tiles.push({ img: R.render(newMesh(gj, 'clay'), R.orbit([0, 0.45, 0.3], az, 15, 1.2, 35, ts, ts), { clay: true }), label: `GALLOP_JUMP 0.34 SHOULDER ${az}` });
  save('poses.png', R.sheet(tiles, poses.length, { title: `${NAME} POSES (OWN CLIPS) - OLD / NEW / SHADE TINT / CLAY` }));
  const rest = pose(rig, 'rest', 0);
  const views = [0, 45, 90, 135, 180, 225, 270, 315];
  save('turntable.png', R.sheet([...views.map((az) => ({ img: R.render(newMesh(rest), R.orbit(c, az, 10, dist0, fov, 300, 300)), label: `${az} DEG` })),
    ...[0, 90, 180, 270].map((az) => ({ img: R.render(newMesh(rest), R.orbit(c, az, 60, dist0, fov, 300, 300)), label: `ABOVE ${az}` }))], 4, { title: `${NAME} BIND POSE TURNTABLE (FINAL GLB)` }));
  save('clay.png', R.sheet([0, 60, 90, 180, 270, 320].map((az) => ({ img: R.render(newMesh(rest, 'clay'), R.orbit(c, az, 12, dist0, fov, 400, 400), { clay: true }), label: `CLAY ${az}` })), 3, { title: `${NAME} CLAY` }));
  // head close-ups: what the boss (x7) shows
  const hc = [0, 0.6, 0.62], hd = 0.55;
  save('hero.png', R.sheet([[30, 8], [90, 4], [330, 20], [0, 4], [150, 25], [270, 45]].map(([az, el]) => ({ img: R.render(newMesh(rest), R.orbit(hc, az, el, hd, 35, 480, 480)), label: `HEAD ${az}/${el}` })), 3, { title: `${NAME} HEAD AND MANE CLOSE (WHAT THE x7 BOSS SHOWS)` }));
  const ba = [], orest = pose(oldRig, 'rest', 0);
  for (const az of [60, 300]) { ba.push({ img: R.render(oldMeshes(orest), R.orbit(c, az, 12, dist0, fov, 480, 480)), label: 'BEFORE' }); ba.push({ img: R.render(newMesh(rest), R.orbit(c, az, 12, dist0, fov, 480, 480)), label: 'AFTER' }); }
  ba.push({ img: R.render(oldMeshes(orest), R.orbit(c, 90, 0, dist0, fov, 480, 480)), label: 'BEFORE SIDE' }, { img: R.render(newMesh(rest, 'shade'), R.orbit(c, 90, 0, dist0, fov, 480, 480)), label: 'AFTER SIDE (SHADE TINT)' });
  const H = b[4] - b[1], kk = 1 / Math.tan(25 * Math.PI / 180);
  for (const px of [120, 300]) {
    const d = (360 / 2) * kk * H / px, gc = R.camera([c[0] + d * 0.6, c[1] + d * 0.3, c[2] + d * 0.75], c, 50, 480, 360);
    ba.push({ img: R.render(oldMeshes(orest), gc), label: `BEFORE GAME CAMERA ${px} PX` }, { img: R.render(newMesh(rest, 'shade'), gc), label: `AFTER GAME CAMERA ${px} PX (SHADE TINT)` });
  }
  save('before_after.png', R.sheet(ba, 2, { title: `${NAME} BEFORE / AFTER (FINAL GLB)` }));
  // game read: the x7 boss from the player's camera (looking up), and ordinary wolves at 6-10 m
  const gm = [];
  for (const [az, el, k, lab] of [[40, -8, 0.55, 'BOSS FROM BELOW'], [320, -4, 0.7, 'BOSS 3/4'], [60, 18, 1.5, 'WOLF 6 M'], [300, 18, 2.4, 'WOLF 10 M']]) gm.push({ img: R.render(newMesh(pose(rig, 'Idle', 0.8), 'shade'), R.orbit(c, az, el, dist0 * k, fov, 400, 400)), label: lab });
  save('game.png', R.sheet(gm, 4, { title: `${NAME} GAME READ (SHADE TINT)` }));
}
