#!/usr/bin/env node
// Round-2 costume checker.  node check.mjs a.glb [b.glb ...] [--out results.json] [--nosettle]
// 1) OPEN EDGES (node): body + every garment primitive welded by position (0.01 mm); an edge used by one triangle is a hole or
//    a hem. Garment boundary edges must be on the hems the generator declared in <file>.layers.json (skirt top under the
//    sash, turned skirt hem, sleeve opening + armhole, open-front columns, cape edges); body boundaries are skin, ignored.
// 2) LAYERS (browser, three.js skinning): rest pose + idle, run mid-stride, sprint, sit, cast, jump, with the solver OFF and the
//    shipped static fallback (tools/costume/hang-fallback.js). For every garment piece of layer Lo and every piece of a
//    lower layer Li: an Lo vertex within 2 cm of Li that lies more than 2 mm behind Li's surface is INSIDE (counted).
//    Rest pose also counts vertices closer than 3 mm to a lower layer (TOO CLOSE, the depth-precision / z-fight risk).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import * as esbuild from 'esbuild';
import { NodeIO } from '@gltf-transform/core';
import { launch, ROOT } from '../../tools/cdp.mjs';
const args = process.argv.slice(2); const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const files = args.filter((a, i) => a.endsWith('.glb') && !(i > 0 && args[i - 1] === '--out')).map((f) => path.resolve(f));
const POSES = [['rest', null], ['idle', 'Idle_Loop@0.3'], ['run', 'Jog_Fwd_Loop@0.3'], ['sprint', 'Sprint_Loop@0.6'], ['sit', 'Driving_Loop@0.5'], ['cast', 'Spell_Simple_Shoot@0.5'], ['jump', 'Jump_Loop@0.5']];
const sidecarOf = (f) => { for (const c of [f.replace(/\.glb$/, '.layers.json'), path.join(ROOT, '.tmp/costume/out', path.basename(f).replace(/\.glb$/, '.layers.json'))]) if (fs.existsSync(c)) return JSON.parse(fs.readFileSync(c, 'utf8')); throw new Error('no layers.json for ' + f); };

async function openEdges(file, side) {
  const doc = await new NodeIO().read(file); const prims = [];
  for (const nd of doc.getRoot().listNodes()) { const m = nd.getMesh(); if (!m) continue; const list = side.meshes[nd.getName()];
    m.listPrimitives().forEach((p, i) => { if (list) prims.push({ p, info: list[i] }); else if (p.getMaterial()?.getName() === 'Body') prims.push({ p, info: { name: 'Body', body: true } }); }); }
  const key = new Map(); const ec = new Map();
  for (const [pi, { p }] of prims.entries()) { const P = p.getAttribute('POSITION').getArray(), I = p.getIndices().getArray(); const id = new Int32Array(P.length / 3);
    for (let i = 0; i < id.length; i++) { const kk = Math.round(P[i * 3] * 1e5) + ',' + Math.round(P[i * 3 + 1] * 1e5) + ',' + Math.round(P[i * 3 + 2] * 1e5); if (!key.has(kk)) key.set(kk, key.size); id[i] = key.get(kk); }
    for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3]; const wa = id[a], wb = id[b]; if (wa === wb) continue; const kk = wa < wb ? wa + '_' + wb : wb + '_' + wa;
      const o = ec.get(kk); if (o) o.n++; else ec.set(kk, { n: 1, pi, a, b }); } }
  const res = { undeclared: 0, declared: 0, byPiece: {} };
  const hemSets = prims.map(({ info }) => new Set(info.hems || []));
  for (const v of ec.values()) { if (v.n !== 1) continue; const { info } = prims[v.pi]; if (info.body) continue;
    if (hemSets[v.pi].has(v.a) && hemSets[v.pi].has(v.b)) res.declared++; else { res.undeclared++; res.byPiece[info.name] = (res.byPiece[info.name] || 0) + 1; } }
  return res;
}

const pageSrc = `
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { collectChains, settleChains } from './tools/costume/hang-fallback.js';
const loader = new GLTFLoader();
function closest(p, a, b, c, out) { // Ericson, closest point on triangle
  const ab = b.clone().sub(a), ac = c.clone().sub(a), ap = p.clone().sub(a); const d1 = ab.dot(ap), d2 = ac.dot(ap); if (d1 <= 0 && d2 <= 0) return out.copy(a);
  const bp = p.clone().sub(b); const d3 = ab.dot(bp), d4 = ac.dot(bp); if (d3 >= 0 && d4 <= d3) return out.copy(b);
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return out.copy(a).addScaledVector(ab, d1 / (d1 - d3));
  const cp = p.clone().sub(c); const d5 = ab.dot(cp), d6 = ac.dot(cp); if (d6 >= 0 && d5 <= d6) return out.copy(c);
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return out.copy(a).addScaledVector(ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return out.copy(b).addScaledVector(c.clone().sub(b), (d4 - d3) / ((d4 - d3) + (d5 - d6)));
  const den = 1 / (va + vb + vc); return out.copy(a).addScaledVector(ab, vb * den).addScaledVector(ac, vc * den); }
window.run = async (o) => {
  const lib = (await loader.loadAsync(o.anims)).animations; const g = await loader.loadAsync(o.model); const root = g.scene; root.updateMatrixWorld(true);
  let hips = null; root.traverse((n) => { if (n.name === 'J_Bip_C_Hips') hips = n; }); const hipsY = hips.getWorldPosition(new THREE.Vector3()).y; const k = hipsY / 0.887;
  const clips = lib.map((c) => { const cc = c.clone(); for (const t of cc.tracks) if (t.name === 'J_Bip_C_Hips.position') { const v = t.values; for (let i = 1; i < v.length; i += 3) v[i] *= k; } return cc; });
  const chains = collectChains(root); const mixer = new THREE.AnimationMixer(root);
  const pieces = []; for (const [mname, list] of Object.entries(o.side.meshes)) { const obj = root.getObjectByName(mname); if (!obj) continue; const ms = obj.isMesh ? [obj] : obj.children.filter((c) => c.isMesh);
    ms.forEach((m, i) => { if (list[i] && list[i].layer != null) pieces.push({ m, name: list[i].name, layer: list[i].layer }); }); }
  const out = {};
  for (const [pname, spec] of o.poses) {
    mixer.stopAllAction();
    if (spec) { const [cn, tt] = spec.split('@'); const clip = clips.find((c) => c.name === cn); mixer.clipAction(clip).reset().play(); mixer.setTime(clip.duration * Number(tt)); }
    root.updateMatrixWorld(true); if (spec && o.settle) { settleChains(chains, { g: 0.55, hipsHeight: hipsY }); root.updateMatrixWorld(true); }
    const v = new THREE.Vector3();
    for (const pc of pieces) { pc.m.skeleton.update(); const P = pc.m.geometry.attributes.position; const n = P.count; const arr = new Float32Array(n * 3); for (let i = 0; i < n; i++) { pc.m.getVertexPosition(i, v); v.applyMatrix4(pc.m.matrixWorld); arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z; } pc.W = arr; pc.I = pc.m.geometry.index.array; }
    const C = 0.02; const res = { inside: 0, close: 0, pairs: {} };
    for (const inner of pieces) {
      const outers = pieces.filter((q) => q.layer > inner.layer && !(q.name === 'tabi_cuff' && inner.name.startsWith('shell_lip'))); if (!outers.length) continue;
      const grid = new Map(); const { W, I } = inner; const A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3();
      for (let t = 0; t < I.length; t += 3) { let x0 = 9, y0 = 9, z0 = 9, x1 = -9, y1 = -9, z1 = -9; for (let e = 0; e < 3; e++) { const i = I[t + e]; x0 = Math.min(x0, W[i * 3]); x1 = Math.max(x1, W[i * 3]); y0 = Math.min(y0, W[i * 3 + 1]); y1 = Math.max(y1, W[i * 3 + 1]); z0 = Math.min(z0, W[i * 3 + 2]); z1 = Math.max(z1, W[i * 3 + 2]); }
        for (let a = Math.floor(x0 / C); a <= Math.floor(x1 / C); a++) for (let b = Math.floor(y0 / C); b <= Math.floor(y1 / C); b++) for (let c = Math.floor(z0 / C); c <= Math.floor(z1 / C); c++) { const kk = a + ',' + b + ',' + c; if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(t); } }
      const q = new THREE.Vector3(), cp = new THREE.Vector3(), nn = new THREE.Vector3();
      for (const outer of outers) { let cin = 0, ccl = 0; const OW = outer.W; const nOut = OW.length / 3;
        for (let i = 0; i < nOut; i++) { q.set(OW[i * 3], OW[i * 3 + 1], OW[i * 3 + 2]); const ca = Math.floor(q.x / C), cb = Math.floor(q.y / C), cc = Math.floor(q.z / C); let best = 1e9; const cand = [];
          for (let a = ca - 1; a <= ca + 1; a++) for (let b = cb - 1; b <= cb + 1; b++) for (let c = cc - 1; c <= cc + 1; c++) for (const t of grid.get(a + ',' + b + ',' + c) || []) {
            A.fromArray(W, I[t] * 3); B.fromArray(W, I[t + 1] * 3); Cc.fromArray(W, I[t + 2] * 3); closest(q, A, B, Cc, cp); const d = cp.distanceTo(q); if (d > 0.02) continue;
            nn.copy(B).sub(A).cross(Cc.clone().sub(A)); if (nn.lengthSq() < 1e-14) continue; nn.normalize(); cand.push([d, q.clone().sub(cp).dot(nn)]); if (d < best) best = d; }
          if (!cand.length) continue; let s = -1e9; for (const [d, sv] of cand) if (d <= best + 0.0005) s = Math.max(s, sv);
          if (s < -0.002) { cin++; if (o.detail && cin <= 400) (res.idx ||= {})[outer.name + '>' + inner.name] = [...((res.idx || {})[outer.name + '>' + inner.name] || []), i]; } else if (!spec && best < 0.003) ccl++; }
        if (cin || ccl) res.pairs[outer.name + '>' + inner.name] = [cin, ccl]; res.inside += cin; res.close += ccl; } }
    out[pname] = res;
  }
  return out;
};
window.__ready = true;
`;
const bundle = await esbuild.build({ stdin: { contents: pageSrc, resolveDir: ROOT, loader: 'js' }, bundle: true, format: 'iife', write: false, logLevel: 'silent' });
const js = bundle.outputFiles[0].text; const html = `<!doctype html><meta charset="utf-8"><script src="/p.js"></script>`;
const server = http.createServer((req, res) => { const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); return; } if (p === '/p.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(js); return; }
  const f = path.normalize(p); if ((f.startsWith(ROOT + '/assets/') || f.startsWith(ROOT + '/.tmp/')) && fs.existsSync(f)) { res.writeHead(200); fs.createReadStream(f).pipe(res); return; } res.writeHead(404); res.end(); });
await new Promise((r) => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
const page = await launch({ width: 200, height: 200 }); page.on('Runtime.exceptionThrown', (p) => console.error('EXC', (p.exceptionDetails.exception?.description || '').slice(0, 300)));
await page.goto(`http://127.0.0.1:${port}/`); for (let i = 0; i < 100; i++) { if (await page.evaluate('!!window.__ready').catch(() => false)) break; await new Promise((r) => setTimeout(r, 100)); }
const all = {}; const outFile = opt('out');
if (outFile && fs.existsSync(outFile)) Object.assign(all, JSON.parse(fs.readFileSync(outFile, 'utf8')));
for (const f of files) {
  const side = sidecarOf(f); const id = path.basename(f, '.glb'); const t0 = Date.now();
  const edges = await openEdges(f, side);
  const layers = await page.evaluate(`run(${JSON.stringify({ model: f, anims: path.join(ROOT, 'assets/models/chars/anim_ual.glb'), side, poses: POSES, settle: !args.includes('--nosettle'), detail: args.includes('--detail') })})`, { timeout: 600000 });
  all[id] = { edges, layers };
  const line = POSES.map(([p]) => `${p}:${layers[p].inside}`).join(' ');
  console.log(`${id.padEnd(18)} open undeclared ${edges.undeclared} (hems ${edges.declared}) | inside ${line} | rest too-close ${layers.rest.close}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(all, null, 1));
}
await page.close(); server.close(); process.exit(0);
