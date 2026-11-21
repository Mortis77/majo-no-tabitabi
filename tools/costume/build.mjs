#!/usr/bin/env node
// node build.mjs <id> [--out file]   (recipes in recipes.mjs)
import path from 'node:path';
import fs from 'node:fs';
import { loadChar, Wardrobe, Canvas, lerp, smooth, fbm, vnoise, clamp01, samplePose } from './garment.mjs';
import { buildShells } from './shells.mjs';
import { buildSkirt, buildSleeve, buildCollar, buildSash, buildCharm, buildSandals, buildHairRibbon, paintSwatches, scaleOf } from './outfit.mjs';
import { RECIPES } from './recipes.mjs';
import { buildExtras } from './extras.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const ids = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));

export async function build(id, outFile) {
  const R = RECIPES[id]; if (!R) throw new Error('no recipe ' + id);
  const src = path.join(ROOT, 'assets/models/chars', R.src);
  const C = await loadChar(src); const M = C.M; const k = scaleOf(C);
  const T = R.tex || 512; const TB = R.texB || T;
  const wd = new Wardrobe(C, { texSize: T }); wd.cvA = new Canvas(T, T); wd.cvB = new Canvas(TB, TB); wd.idlePose = await samplePose('Idle_Loop', 0.3); wd.sw = new Map(); wd.swRect = [0.75, 0.75, 1, 1];
  // drop the VRoid outfit primitives + replaced add-ons
  for (const nd of C.root.listNodes()) { const m = nd.getMesh(); if (!m) continue;
    for (const p of m.listPrimitives()) { const mn = p.getMaterial()?.getName() || ''; if ((R.dropPrims || []).includes(mn) || (/_body$/.test(nd.getName()) && mn !== 'Body' && !(R.keepPrims || []).includes(mn)) || ((R.dropAddons || []).includes(mn) && /_addons$/.test(nd.getName()))) { m.removePrimitive(p); } }
    if ((R.dropNodes || []).includes(nd.getName())) nd.dispose(); }
  // shrink add-on brims radially beyond the head (round 2: villager_a's straw hat)
  if (R.scaleAddons) for (const nd of C.root.listNodes()) { const m = nd.getMesh(); if (!m || !/_addons$/.test(nd.getName())) continue;
    for (const p of m.listPrimitives()) { const f = R.scaleAddons[p.getMaterial()?.getName()]; if (!f) continue; const a = p.getAttribute('POSITION'); const arr = a.getArray().slice(); const hc = M.head; const r0 = 0.105 * k;
      for (let i = 0; i < arr.length; i += 3) { const dx = arr[i] - hc[0], dz = arr[i + 2] - hc[2]; const r = Math.hypot(dx, dz); if (r <= r0) continue; const rn = r0 + (r - r0) * f; arr[i] = hc[0] + dx * rn / r; arr[i + 2] = hc[2] + dz * rn / r; }
      a.setArray(arr); } }
  if (R.rename) { const old = C.pfx; for (const nd of C.root.listNodes()) if (nd.getName() === old || nd.getName().startsWith(old + '_')) nd.setName(nd.getName().replace(old, R.rename));
    for (const m of C.root.listMeshes()) if (m.getName().startsWith(old + '_')) m.setName(m.getName().replace(old, R.rename)); C.pfx = R.rename; }
  const ctx = { C, M, k, wd, R };
  const shells = buildShells(wd, R, wd.cvA); ctx.shells = shells; wd.shellGeo = { foot: shells.foot?.geo };
  let skirt = null;
  for (const [i, S] of (R.skirts || []).entries()) { const SS = typeof S === 'function' ? S(ctx) : S; SS.layer = 2 + i; const s = buildSkirt(wd, SS); if (i === 0) skirt = s; ctx['skirt' + i] = s; }
  ctx.skirt = skirt;
  if (R.sleeves) { const S = typeof R.sleeves === 'function' ? R.sleeves(ctx) : R.sleeves; buildSleeve(wd, 'L', S); buildSleeve(wd, 'R', S); }
  if (R.collar && shells.torso) buildCollar(wd, shells.torso, { collar: typeof R.collar === 'function' ? R.collar(ctx) : R.collar }, shells.cuts);
  let sash = null; if (R.sash) { sash = buildSash(wd, skirt, typeof R.sash === 'function' ? R.sash(ctx) : R.sash); ctx.sash = sash; }
  if (R.charm && sash) buildCharm(wd, sash, R.charm);
  if (R.sandals) buildSandals(wd, R.sandals);
  if (R.ribbon) buildHairRibbon(wd, R.ribbon);
  if (R.extras) buildExtras(ctx, R.extras);
  paintSwatches(wd); wd.cvA.dilate(6); wd.cvB.dilate(6);
  wd.textures.set(C.pfx + '_garment_a', wd.cvA); wd.textures.set(C.pfx + '_garment_b', wd.cvB);
  const A = C.pfx + '_garment_a', B = C.pfx + '_garment_b';
  const mats = { cloth_white: { tex: A }, cloth_red_inner: { tex: A }, cloth_inner: { tex: A }, cloth_leg: { tex: A }, cloth_foot: { tex: A },
    cloth_red: { tex: B, doubleSided: true }, cloth_top: { tex: A }, cloth_skirt: { tex: B, doubleSided: true }, cloth_white_sode: { tex: B, doubleSided: true }, cloth_outer: { tex: B, doubleSided: true }, cloth_sleeve: { tex: B, doubleSided: true }, cloth_apron: { tex: B, doubleSided: true }, cloth_coat: { tex: B, doubleSided: true },
    cloth_trim: { tex: B }, Ribbon: { colour: R.ribbon?.col || [206, 34, 36], shade: [0.5, 0.06, 0.12] } };
  for (const [n, s] of Object.entries(mats)) wd.material(n, { ...s, shade: s.shade || (R.shadeColors || {})[n] || [0.62, 0.64, 0.78] });
  const out = outFile || path.join(ROOT, '.tmp/costume/out', R.out);
  const res = await wd.finish(out, { dumpTex: path.join(ROOT, '.tmp/costume/out/tex_' + id), sidecar: out.replace(/\.glb$/, '.layers.json') });
  const info = { id, out, tris: res.tris, chains: wd.chains, size: fs.statSync(out).size };
  fs.writeFileSync(path.join(ROOT, '.tmp/costume/out', id + '.chains.json'), JSON.stringify(info, null, 1));
  console.log(id, 'garment tris', res.tris, 'chains', wd.chains.length, 'bytes', info.size);
  return info;
}
if (ids.length) for (const id of ids) await build(id, opt('out'));
