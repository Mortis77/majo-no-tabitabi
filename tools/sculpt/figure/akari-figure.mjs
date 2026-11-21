// 灯里 assembled: skin (cut into Face / Body on a designed border), the face's parts and thirteen shapes, the refitted
// hair and bow, the always-worn undergarment — as a list of primitives ready for the previewer and the GLB writer.
import fs from 'node:fs';
import path from 'node:path';
import * as S from '../sdf.mjs';
import { loadRig, skinMesh } from '../rig.mjs';
import { ROOT, loadCharacter, addClips, io, texRGBA, decodeImage } from './glbio.mjs';
import { RIG_SOURCE, PRESENT, makeRigSource } from './make-rig.mjs';
import { buildSkin, OUT } from './akari-mesh.mjs';
import { headShape, HEAD, NECK_BLEND } from '../assets/akari_head.mjs';
import { bodyShape } from '../assets/akari_body.mjs';
import { cutFaceHalf, faceParts, heightMap, shapeDelta, lidSurface, SHAPES, ROLE, PAINT, TAG } from './face.mjs';
import { splitField, compactMesh } from './seam.mjs';
import { vertexNormals } from './meshops.mjs';
import * as PT from './paint.mjs';
import { figureWeights, rigid, copyWeights } from './weights.mjs';

export { OUT, SHAPES };
export const HAIR = { scale: 0.925, pivot: [0, 1.363, -0.0075], shift: [0, 0.002, 0] };
const SKIN_SHADE = [0.97, 0.81, 0.86], LINE_SHADE = [0.369, 0.275, 0.271];
const MATS = {
  Face: { extras: { shadeColor: SKIN_SHADE, authoredFaceNormals: true } }, Body: { extras: { shadeColor: SKIN_SHADE } }, FaceMouth: { extras: { shadeColor: SKIN_SHADE } },
  EyeWhite: { emissive: [0.05, 0.044, 0.036], extras: { shadeColor: [1, 1, 1] } },   // the white sits 2.5-7 mm under the lids, i.e. in their shadow, and the game's eye shade is blue: a small warm self-light keeps it a clear white
  EyeIris: { alphaMode: 'MASK', alphaCutoff: 0.5, extras: { shadeColor: [1, 1, 1] } },
  EyeHighlight: { alphaMode: 'BLEND', doubleSided: true, extras: { shadeColor: [1, 1, 1] } },
  FaceEyeline: { alphaMode: 'BLEND', doubleSided: true, extras: { shadeColor: LINE_SHADE } }, FaceEyelash: { alphaMode: 'BLEND', doubleSided: true, extras: { shadeColor: LINE_SHADE } },
  FaceBrow: { alphaMode: 'BLEND', doubleSided: true, extras: { shadeColor: LINE_SHADE } },
  cloth_white: { extras: { shadeColor: [0.62, 0.64, 0.78], garment: true } },
  cloth_trim: { extras: { shadeColor: [0.62, 0.64, 0.78], garment: true } },          // the under-robe's cord
};
const FACE_ORDER = ['FaceMouth', 'EyeWhite', 'FaceEyeline', 'FaceEyelash', 'FaceBrow', 'EyeIris', 'EyeHighlight', 'Face'];

export async function loadFigureRig() {
  if (!fs.existsSync(RIG_SOURCE)) await makeRigSource();
  const rig = await loadRig(RIG_SOURCE);
  for (const f of ['assets/models/chars/anim_ual.glb', 'assets/models/chars/anim_miko.glb']) await addClips(rig, path.join(ROOT, f));
  return rig;
}

/**
 * Normals of the skin taken from the SCULPT's field instead of the simplified mesh (revision 2, review F7 / B1): the cel
 * terminator is a hard edge, so every facet of a decimated mesh shows as a stair or an island in the shade. The gradient
 * of the field, sampled over a few millimetres, is the form the sculptor meant. Wider samples where small forms must not
 * break the shade (collarbones, the throat); on the neck the normal is bent 60 % toward the neck's own axis, the way
 * the game bends the face's toward the head centre, so the neck takes ONE shade shape. Walls of the eye and mouth
 * openings (TAG.RIM: they are not on the sculpt) keep the mesh normal.
 */
function fieldNormals(shape, pos, meshN, tag) {
  const n = pos.length / 3, out = new Float32Array(n * 3), g = [0, 0, 0], g2 = [0, 0, 0];
  const A = [0, 1.238, -0.024], B = [0, 1.352, -0.004], ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], xa = Math.abs(x);
    if (tag && (tag[v] & TAG.RIM)) { out[v * 3] = meshN[v * 3]; out[v * 3 + 1] = meshN[v * 3 + 1]; out[v * 3 + 2] = meshN[v * 3 + 2]; continue; }
    const fine = xa > 0.49 || y < 0.17 || y > 1.3;                // hand, foot, head: small forms
    shape.normal(x, y, z, g, fine ? 0.0012 : 0.003);
    // collar zone: clavicles, throat, the root of the neck -> a wide sample
    const wide = (1 - PT.sm(0.1, 0.135, xa)) * PT.sm(1.2, 1.235, y) * (1 - PT.sm(1.3, 1.318, y)) * 0.85;
    if (wide > 0.01) { shape.normal(x, y, z, g2, 0.009); for (let k = 0; k < 3; k++) g[k] = g[k] * (1 - wide) + g2[k] * wide; }
    // neck: toward the axis
    const t = Math.max(0, Math.min(1, ((x - A[0]) * ab[0] + (y - A[1]) * ab[1] + (z - A[2]) * ab[2]) / l2));
    const rx = x - A[0] - ab[0] * t, ry = y - A[1] - ab[1] * t, rz = z - A[2] - ab[2] * t, rl = Math.hypot(rx, ry, rz);
    const wn = 0.6 * PT.sm(1.262, 1.282, y) * (1 - PT.sm(HEAD.jawPlane(z) - 0.012, HEAD.jawPlane(z) + 0.004, y)) * (1 - PT.sm(0.042, 0.056, rl));
    if (wn > 0.01 && rl > 1e-5) { g[0] = g[0] * (1 - wn) + (rx / rl) * wn; g[1] = g[1] * (1 - wn) + (ry / rl) * wn; g[2] = g[2] * (1 - wn) + (rz / rl) * wn; }
    let l = Math.hypot(g[0], g[1], g[2]);
    // a field normal that disagrees with the mesh (a thin web, a vertex pulled off the surface) falls back to the mesh
    if (!(l > 1e-6) || (g[0] * meshN[v * 3] + g[1] * meshN[v * 3 + 1] + g[2] * meshN[v * 3 + 2]) / l < 0.2) { g[0] = meshN[v * 3]; g[1] = meshN[v * 3 + 1]; g[2] = meshN[v * 3 + 2]; l = 1; }
    out[v * 3] = g[0] / l; out[v * 3 + 1] = g[1] / l; out[v * 3 + 2] = g[2] / l;
  }
  return out;
}

// Correct the drawn profile in millimetres. All three corrections fade out before the skull/neck seam.
// Apply the same mapping to each expression's absolute position so the lips still meet and vowels travel together.
function portraitOffsetY(x, y, z) {
  const front = PT.sm(0.025, 0.05, z);
  const chin = -0.0052 * (1 - PT.sm(1.319, 1.347, y)) * (1 - PT.sm(0.025, 0.061, Math.abs(x)));
  const mouth = 0.00125 * Math.exp(-((x / 0.023) ** 2) - (((y - 1.349) / 0.010) ** 2));
  const nose = 0.0024 * Math.exp(-((x / 0.012) ** 2) - (((y - 1.373) / 0.009) ** 2));
  return (chin + mouth + nose) * front;
}
function finishPortrait(part) {
  const { pos, nrm } = part;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2], lift = portraitOffsetY(x, y, z);
    for (const target of part.targets) {
      target[i + 1] += portraitOffsetY(x + target[i], y + target[i + 1], z + target[i + 2]) - lift;
    }
    pos[i + 1] += lift;
    if (part.material !== 'Face') continue;
    // Broad cheek lighting planes turn gradually towards the temple. Leave the ear, underside of the jaw,
    // and lid walls on their geometric normals. The painted nose and skin tone carry the small landmarks.
    const cheek = 0.91 * PT.sm(0.026, 0.059, z) * PT.sm(1.321, 1.350, y) * (1 - PT.sm(1.436, 1.465, y));
    if (cheek === 0 || nrm[i + 2] < 0.18) continue;
    const az = Math.sign(x) * (0.16 * Math.abs(x) / 0.06 + 0.78 * PT.sm(0.023, 0.076, Math.abs(x)));
    const el = 0.08 + (y - 1.389) * 3.0;
    const tx = Math.sin(az) * Math.cos(el), ty = Math.sin(el), tz = Math.cos(az) * Math.cos(el);
    const nx = nrm[i] * (1 - cheek) + tx * cheek, ny = nrm[i + 1] * (1 - cheek) + ty * cheek;
    const nz = nrm[i + 2] * (1 - cheek) + tz * cheek, len = Math.hypot(nx, ny, nz);
    nrm[i] = nx / len; nrm[i + 1] = ny / len; nrm[i + 2] = nz / len;
  }
}

/** skin colour as two numbers (warmth, shade) -> the ramp texture's uv */
function skinRampUV(J) {
  const k = J('J_Bip_L_LowerLeg'), e = J('J_Bip_L_LowerArm'), a = J('J_Bip_L_Foot');
  const warm = [[[k[0], k[1] + 0.012, 0.045], 0.05, 0.5], [[e[0], e[1], -0.032], 0.036, 0.5], [[a[0], 0.06, -0.07], 0.04, 0.5], [[0.045, 0.04, 0.115], 0.045, 0.5], [[0.578, 1.232, 0.012], 0.032, 0.45], [[0.645, 1.222, 0.015], 0.03, 0.4], [[0.57, 1.205, 0.085], 0.02, 0.4], [[0.142, 1.268, -0.006], 0.04, 0.18]];
  const shade = [[[0.118, 1.186, -0.006], 0.042, 0.5], [[0.055, 1.116, 0.072], 0.028, 0.28], [[0.012, 0.8, 0.0], 0.06, 0.45], [[k[0], k[1], -0.052], 0.036, 0.3], [[0.545, 1.204, 0.012], 0.03, 0.3]];
  const acc = (list, x, y, z) => { let s = 0; for (const [c, r, w] of list) { const d = Math.hypot(x - c[0], y - c[1], z - c[2]) / r; if (d < 1) s = Math.max(s, w * (1 - d * d) ** 2); } return s; };
  return (x, y, z) => { const xa = Math.abs(x); return [0.02 + 0.96 * acc(warm, xa, y, z), 0.02 + 0.96 * acc(shade, xa, y, z)]; };
}

/**
 * -> { rig, prims: [{ node, material, mat, pos, nrm, uv, idx, J, W, targets?, texR, role? }], zs, headC, skin (welded mesh
 *      with weights: { pos, idx, nrm, J, W, dense }), info }
 */
export async function buildFigure({ log = console.log, hair = true, under = true, threads, headCacheDir = null } = {}) {
  const rig = await loadFigureRig();
  const nJ = rig.joints.length, jx = (nm) => { const i = rig.jointNames.indexOf(nm); if (i < 0) throw new Error('no joint ' + nm); return i; };
  const J = (nm) => rig.bone(nm).head;
  const pivot = J('J_Adj_L_FaceEye');
  const hs = headShape(S), zs = heightMap(hs);
  // ---- skin: contour, cut the face's openings on the half, mirror, split Face / Body on the designed border
  const sk = await buildSkin({ log, threads, headCacheDir, cutHalf: (h) => cutFaceHalf(h, pivot, hs) });
  const sp = splitField(sk, (x, y, z) => (y > 1.28 ? Math.min(z - HEAD.faceZ, y - HEAD.jawPlane(z)) : -1));
  const tag = Uint8Array.from(sp.src, (s) => (s[2] === 0 && s[0] === s[1] ? sk.tag[s[0]] : 0));
  const W0 = { pos: sp.pos, idx: sp.idx };
  const nrm = fieldNormals(hs.softAdd(bodyShape(S, J), NECK_BLEND), sp.pos, vertexNormals(sp.pos, sp.idx), tag);
  const wt = figureWeights(rig, W0, { headRigid: (x, y, z) => (y > 1.29 ? PT.sm(HEAD.jawPlane(z) - 0.016, HEAD.jawPlane(z) + 0.002, y) : 0) });
  log(`  weights: donor distance mean ${(wt.stats.meanDist * 1000).toFixed(1)} mm, max ${(wt.stats.maxDist * 1000).toFixed(1)} mm`);
  const skin = { pos: sp.pos, idx: sp.idx, nrm, J: wt.J, W: wt.W, dense: wt.dense, tag };
  const sub = (keep) => { // a primitive from the welded skin: triangles with side == keep
    const I = []; for (let t = 0; t < sp.side.length; t++) if ((sp.side[t] > 0) === keep) I.push(sp.idx[t * 3], sp.idx[t * 3 + 1], sp.idx[t * 3 + 2]);
    const c = compactMesh({ pos: sp.pos, idx: Uint32Array.from(I) });
    const n = c.pos.length / 3, o = { pos: c.pos, idx: c.idx, nrm: new Float32Array(n * 3), J: new Uint16Array(n * 4), W: new Float32Array(n * 4), tag: new Uint8Array(n), from: new Int32Array(n) };
    for (let v = 0; v < c.map.length; v++) { const u = c.map[v]; if (u < 0) continue; o.nrm.set(nrm.subarray(v * 3, v * 3 + 3), u * 3); o.J.set(wt.J.subarray(v * 4, v * 4 + 4), u * 4); o.W.set(wt.W.subarray(v * 4, v * 4 + 4), u * 4); o.tag[u] = tag[v]; o.from[u] = v; }
    return o;
  };
  const prims = [];
  const tex = {
    Face: PT.faceTexture(PAINT, 1024), Body: PT.skinRampTexture(64), EyeIris: PT.irisTexture(512), EyeHighlight: PT.highlightTexture(128), EyeWhite: PT.whiteTexture(128, 64),
    // lash line, lower line and brow share ONE primitive (material FaceEyelash) with a three-row texture: the game's own
    // merge of the three line materials (celmat.js mergeFaceLines) drops the morph target names, and the lines then stay
    // behind when the lids move
    FaceEyelash: PT.lineAtlas([PT.lineTexture(PT.PAL.lash, { edge: 0.1, endFade: 0.025 }), PT.lineTexture(PT.PAL.lashWarm, { edge: 0.34, endFade: 0.2 }), PT.lineTexture(PT.PAL.brow, { edge: 0.3, endFade: 0.1 })]),
    FaceMouth: PT.mouthTexture(64), cloth_white: PT.clothRampTexture(64), cloth_trim: PT.clothRampTexture(64, PT.hex('#c4423a')),
  };
  const mat = (name) => ({ name, ...(MATS[name] || {}), tex: tex[name] ? { name, bytes: tex[name].png(), mime: 'image/png' } : null });
  const texR = Object.fromEntries(Object.entries(tex).map(([k, c]) => [k, c.tex()]));
  const d3 = [0, 0, 0], zsLid = lidSurface(zs, pivot);   // closing lids slide over the eyeball, not through it
  const shapesOf = (pos, role, tagOf) => SHAPES.map((nm) => { const d = new Float32Array(pos.length); for (let v = 0; v < pos.length / 3; v++) { shapeDelta(nm, pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], typeof role === 'number' ? role : role[v], tagOf ? tagOf[v] : 0, zsLid, d3); d[v * 3] = d3[0]; d[v * 3 + 1] = d3[1]; d[v * 3 + 2] = d3[2]; } return d; });
  // ---- face skin
  const face = sub(true);
  const fb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; for (let i = 0; i < face.pos.length; i += 3) for (let k = 0; k < 3; k++) { fb[k] = Math.min(fb[k], face.pos[i + k]); fb[k + 3] = Math.max(fb[k + 3], face.pos[i + k]); }
  const headC = [(fb[0] + fb[3]) / 2, (fb[1] + fb[4]) / 2, (fb[2] + fb[5]) / 2];
  const fuv = new Float32Array(face.pos.length / 3 * 2); for (let v = 0; v < fuv.length / 2; v++) fuv.set(PT.faceUV(face.pos[v * 3], face.pos[v * 3 + 1]), v * 2);
  const facePrim = { node: 'akari_face', material: 'Face', mat: mat('Face'), pos: face.pos, nrm: face.nrm, uv: fuv, idx: face.idx, J: face.J, W: face.W, targets: shapesOf(face.pos, ROLE.skin, face.tag), texR: texR.Face };
  // ---- face parts, grouped by material
  const parts = faceParts(zs, pivot), byMat = new Map();
  const LINE_ROW = { FaceEyelash: 0, FaceEyeline: 1, FaceBrow: 2 };
  for (const p of parts) { const row = LINE_ROW[p.material], mname = row === undefined ? p.material : 'FaceEyelash'; let g = byMat.get(mname); if (!g) byMat.set(mname, (g = { pos: [], uv: [], idx: [], J: [], role: [] })); const o = g.pos.length / 3; g.pos.push(...p.pos); if (row === undefined) g.uv.push(...p.uv); else for (let q = 0; q < p.uv.length; q += 2) g.uv.push(p.uv[q], (row + 0.04 + 0.92 * Math.max(0, Math.min(1, p.uv[q + 1]))) / 3); for (const i of p.idx) g.idx.push(i + o); const j = p.bone === 'eye' ? jx(p.side > 0 ? 'J_Adj_L_FaceEye' : 'J_Adj_R_FaceEye') : jx('J_Bip_C_Head'); for (let v = 0; v < p.pos.length / 3; v++) { g.J.push(j); g.role.push(p.role); } }
  const facePrims = { Face: facePrim };
  for (const [name, g] of byMat) {
    const n = g.pos.length / 3, pos = Float32Array.from(g.pos), nr = new Float32Array(n * 3), Jv = new Uint16Array(n * 4), Wv = new Float32Array(n * 4);
    for (let v = 0; v < n; v++) { const x = pos[v * 3] - headC[0], y = pos[v * 3 + 1] - headC[1], z = pos[v * 3 + 2] - headC[2] + 0.035, l = Math.hypot(x, y, z) || 1; nr[v * 3] = x / l; nr[v * 3 + 1] = y / l; nr[v * 3 + 2] = z / l; Jv[v * 4] = g.J[v]; Wv[v * 4] = 1; }
    facePrims[name] = { node: 'akari_face', material: name, mat: mat(name), pos, nrm: nr, uv: Float32Array.from(g.uv), idx: Uint32Array.from(g.idx), J: Jv, W: Wv, targets: shapesOf(pos, g.role, null), texR: texR[name] };
  }
  for (const nm of FACE_ORDER) if (facePrims[nm]) { finishPortrait(facePrims[nm]); prims.push(facePrims[nm]); }
  // ---- body skin
  const body = sub(false), ramp = skinRampUV(J);
  const buv = new Float32Array(body.pos.length / 3 * 2); for (let v = 0; v < buv.length / 2; v++) buv.set(ramp(body.pos[v * 3], body.pos[v * 3 + 1], body.pos[v * 3 + 2]), v * 2);
  prims.push({ node: 'akari_body', material: 'Body', mat: mat('Body'), pos: body.pos, nrm: body.nrm, uv: buv, idx: body.idx, J: body.J, W: body.W, texR: texR.Body });
  // ---- hair and bow of the present model, refitted to the new skull
  if (hair) {
    const ch = await loadCharacter(PRESENT);
    if (ch.joints.join() !== rig.jointNames.join()) throw new Error('hair source and rig source disagree on the joint list');
    const doc = await io().read(PRESENT);
    for (const [node, name] of [['akari_hair', 'Hair'], ['akari_ribbon', 'Ribbon']]) {
      const p = ch.prims.find((q) => q.material === name), gm = doc.getRoot().listMaterials().find((m) => m.getName() === name), gt = gm.getBaseColorTexture();
      const pos = Float32Array.from(p.pos);
      for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) pos[i + k] = HAIR.pivot[k] + (pos[i + k] - HAIR.pivot[k]) * HAIR.scale + HAIR.shift[k];
      prims.push({ node, material: name, mat: { name, alphaMode: gm.getAlphaMode(), alphaCutoff: gm.getAlphaCutoff(), doubleSided: gm.getDoubleSided(), extras: gm.getExtras(), base: gm.getBaseColorFactor(), tex: gt ? { name, bytes: gt.getImage(), mime: gt.getMimeType() } : null }, pos, nrm: p.nrm, uv: p.uv, idx: p.idx, J: p.J, W: p.W, texR: p.tex });
    }
  }
  // ---- the undergarment
  if (under && fs.existsSync(path.join(ROOT, 'tools/sculpt/figure/under.mjs'))) {
    const { buildUnder } = await import('./under.mjs');
    const u = await buildUnder({ rig, skin, log, threads, copyWeights, nJ });
    prims.push({ node: 'akari_under', material: 'cloth_white', mat: mat('cloth_white'), ...u.white, texR: texR.cloth_white });
    if (u.cord) prims.push({ node: 'akari_under', material: 'cloth_trim', mat: mat('cloth_trim'), ...u.cord, texR: texR.cloth_trim });
  }
  for (const p of prims) { p.alphaMode = p.mat.alphaMode || 'OPAQUE'; p.alphaCutoff = p.mat.alphaCutoff ?? 0.5; p.doubleSided = !!p.mat.doubleSided; p.shade = p.mat.extras?.shadeColor || null; p.garment = !!p.mat.extras?.garment; }
  const faceLandmarks = {
    chinY: HEAD.chinY + portraitOffsetY(0, HEAD.chinY, 0.055),
    mouthY: HEAD.mouthY + portraitOffsetY(0, HEAD.mouthY, 0.076),
    eyeY: PAINT.eye.iris[1],
  };
  return { rig, prims, zs, headC, faceLandmarks, skin, pivot, J };
}

/** primitives -> renderer meshes, posed by skin matrices Sk and / or morph weights { name: w } */
export function renderMeshes(fig, { Sk = null, morph = null, only = null, hide = null } = {}) {
  const out = [];
  for (const p of fig.prims) {
    if (only && !only.test(p.material)) continue;
    if (hide && hide.test(p.material)) continue;
    let pos = p.pos, nr = p.nrm;
    if (morph && p.targets) { pos = Float32Array.from(pos); for (const k in morph) { const i = SHAPES.indexOf(k), w = morph[k]; if (i < 0 || !w) continue; const d = p.targets[i]; for (let q = 0; q < pos.length; q++) pos[q] += d[q] * w; } }
    if (Sk) { const s = skinMesh(pos, nr, p.J, p.W, Sk); pos = s.pos; nr = s.nrm; }
    out.push({ pos, nrm: nr, idx: p.idx, uv: p.uv, tex: p.texR, base: p.mat.base ? p.mat.base.slice(0, 3) : [1, 1, 1], material: p.material, name: p.material, alphaMode: p.alphaMode, alphaCutoff: p.alphaCutoff, doubleSided: p.doubleSided, opacity: 1, shade: p.shade, garment: p.garment, bind: p.pos, authoredFaceNormals: p.mat.extras?.authoredFaceNormals, inkId: /Face|Eye/.test(p.material) ? 99 : undefined });
  }
  return out;
}
void rigid; void texRGBA; void decodeImage;
