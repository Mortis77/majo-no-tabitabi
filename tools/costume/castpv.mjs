#!/usr/bin/env node
// Cast line-up previewer: several character GLBs side by side, all driven by one clip library.
//   node castpv.mjs --models a.glb,b.glb [--anims lib.glb] [--poses "Idle_Loop@0.3,Spell_Simple_Idle_Loop@0.5"] [--views ff,bb]
//                   [--cell 220x420] [--toon] [--labels "A,B"] [--out sheet.png] [--focus head]
// Rows = poses x views, columns = models. Same camera for every column (heights compare directly).
// The hips translation track is scaled per model by (its rest hips height / 0.887) — the game rule from the anim_ual manifest.
// Prints per model: rest height, hips height, and the skinned min-y (sole height) in every pose.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import * as esbuild from 'esbuild';
import { launch, ROOT } from '../../tools/cdp.mjs';

const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const has = (n) => args.includes('--' + n);
let models = opt('models').split(',').map((p) => path.resolve(p));
const anims = (opt('anims', '') || '').split(',').filter(Boolean).map((p) => path.resolve(p));
const poses = (opt('poses', '') || '').split(',').filter(Boolean);
const views = (opt('views', 'ff,bb')).split(',');

const colPoses = has('colposes') ? poses : null; if (colPoses) models = colPoses.map(() => models[0]);
const labelsIn = opt('labels') ? opt('labels').split(',') : colPoses ? colPoses.map((p) => p.split('@')[0]) : models.map((m) => path.basename(m, '.glb').replace(/^char_/, ''));
const [CW, CH] = (opt('cell', '200x400')).split('x').map(Number);
const out = path.resolve(opt('out', path.join(ROOT, '.tmp/costume/out/cast.png')));
const rowsList = []; if (colPoses) for (const v of views) rowsList.push({ p: '(col)', v }); else for (const p of (poses.length ? poses : ['(rest)'])) for (const v of views) rowsList.push({ p, v });
const W = models.length * CW, H = rowsList.length * CH;

const viewerSrc = `
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.7));
const sun = new THREE.DirectionalLight(0xfff2dd, 2.0); sun.position.set(3, 6, 4); scene.add(sun);
const back = new THREE.DirectionalLight(0xddeeff, 1.2); back.position.set(-3, 4, -5); scene.add(back);
const loader = new GLTFLoader();
const VIEW = { f: [0.75, 0.35, 1], b: [-0.6, 0.45, -1], s: [1, 0.15, 0.02], ff: [0, 0.08, 1], bb: [0, 0.12, -1], lf: [0.35, -0.6, 1], lb: [-0.3, -0.6, -1], g: [0.12, 0.42, -1], tq: [0.85, 0.18, 1], tb: [-0.85, 0.3, -1], ss: [1, 0.1, 0.05] };
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0);
import { collectChains, settleChains } from './tools/costume/hang-fallback.js';
window.run = async (o) => {
  let lib = [];
  for (const a of o.anims) lib = lib.concat((await loader.loadAsync(a)).animations);
  const chars = [];
  for (const url of o.models) {
    const g = await loader.loadAsync(url); const root = g.scene; scene.add(root); root.visible = false;
    root.traverse((n) => { if (n.isMesh) { n.frustumCulled = false; if (o.hidemat && new RegExp(o.hidemat).test(n.material.name)) n.visible = false; if (o.normals) { n.material = new THREE.MeshNormalMaterial({ side: n.material.side }); return; } if (o.toon) { const m = n.material; n.material = new THREE.MeshToonMaterial({ color: o.nomap ? new THREE.Color(0xdddddd) : m.color, map: o.nomap ? null : m.map, transparent: m.transparent, alphaTest: m.alphaTest, side: m.side }); } } });
    root.updateMatrixWorld(true);
    let hips = null; root.traverse((n) => { if (n.name === 'J_Bip_C_Hips') hips = n; });
    const hipsY = hips ? hips.getWorldPosition(new THREE.Vector3()).y : 0.887;
    const box = new THREE.Box3(); root.traverse((n) => { if (n.isSkinnedMesh) { n.computeBoundingBox(); box.union(n.boundingBox.clone().applyMatrix4(n.matrixWorld)); } });
    const k = hipsY / 0.887; root.userData.hipsY = hipsY;
    const clips = lib.map((c) => { const cc = c.clone(); for (const t of cc.tracks) if (t.name === 'J_Bip_C_Hips.position') { const v = t.values; for (let i = 1; i < v.length; i += 3) v[i] *= k; } return cc; });
    const chainsInfo = collectChains(root);
    chars.push({ chainsInfo, root, mixer: new THREE.AnimationMixer(root), clips, hipsY, restH: box.max.y, restMin: box.min.y, minY: {}, ownClips: g.animations.length });
  }
  const cam = new THREE.PerspectiveCamera(o.fov || 24, o.cw / o.ch, 0.05, 50);
  const target = new THREE.Vector3(0, o.cy || 0.85, 0); const dist = o.dist || 4.6;
  const grid = new THREE.GridHelper(4, 16, 0x556070, 0x3a4250); scene.add(grid);
  renderer.setScissorTest(true);
  const labels = document.getElementById('labels'); labels.innerHTML = '';
  o.rows.forEach((row, ri) => {
    chars.forEach((ch, ci) => {
      ch.mixer.stopAllAction(); let label = '';
      const rp = o.colPoses ? o.colPoses[ci] : row.p;
      if (rp !== '(rest)') {
        const [name, tt] = rp.split('@'); const t = tt === undefined ? 0.3 : Number(tt);
        const clip = ch.clips.find((k) => k.name === name) || ch.clips.find((k) => k.name.toLowerCase().includes(name.toLowerCase()));
        if (clip) { ch.mixer.clipAction(clip).reset().play(); ch.mixer.setTime(clip.duration * t); label = clip.name; }
        else label = name + ' MISSING';
      }
      ch.root.updateMatrixWorld(true);
      if (o.hang) { settleChains(ch.chainsInfo, { g: o.hang, hipsHeight: ch.hipsY }); ch.root.updateMatrixWorld(true); }
      const box = new THREE.Box3(); ch.root.traverse((n) => { if (n.isSkinnedMesh) { n.computeBoundingBox(); box.union(n.boundingBox.clone().applyMatrix4(n.matrixWorld)); } });
      ch.minY[rp] = +box.min.y.toFixed(3);
      ch.root.visible = true;
      const v = VIEW[row.v] || VIEW.ff; const x = ci * o.cw, y = (o.rows.length - 1 - ri) * o.ch;
      renderer.setViewport(x, y, o.cw, o.ch); renderer.setScissor(x, y, o.cw, o.ch);
      renderer.setClearColor((ri + ci) % 2 ? 0x2b3342 : 0x313a4a, 1); renderer.clear();
      cam.position.copy(target).add(new THREE.Vector3(v[0], v[1], v[2]).normalize().multiplyScalar(dist)); cam.lookAt(target); cam.updateProjectionMatrix();
      renderer.render(scene, cam);
      ch.root.visible = false;
      if (ri === 0 || (o.rows.length > 2 && ri % 2 === 0)) { const el = document.createElement('div'); el.textContent = o.labels[ci] + (ri === 0 ? '' : ''); el.style.cssText = 'position:absolute;top:' + (ri * o.ch + 3) + 'px;left:' + (ci * o.cw + 5) + 'px;color:#fff;font:12px/1.2 Menlo,monospace;text-shadow:0 1px 2px #000'; labels.appendChild(el); }
    });
  });
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  return chars.map((c, i) => ({ id: o.labels[i], restH: +c.restH.toFixed(3), restMin: +c.restMin.toFixed(3), hipsY: +c.hipsY.toFixed(3), ownClips: c.ownClips, minY: c.minY }));
};
window.__viewerReady = true;
`;
const bundle = await esbuild.build({ stdin: { contents: viewerSrc, resolveDir: ROOT, loader: 'js' }, bundle: true, format: 'iife', write: false, logLevel: 'silent', define: { 'import.meta.url': '"http://127.0.0.1/"' } });
const js = bundle.outputFiles[0].text;
const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#222;overflow:hidden}canvas{width:100%;height:100%;display:block}#labels{position:absolute;inset:0}</style><canvas id="c"></canvas><div id="labels"></div><script src="/viewer.js"></script>`;
const dirs = [];
const urlFor = (f) => { let i = dirs.indexOf(path.dirname(f)); if (i < 0) { dirs.push(path.dirname(f)); i = dirs.length - 1; } return `/d/${i}/${encodeURIComponent(path.basename(f))}`; };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); return; }
  if (p === '/viewer.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(js); return; }
  const m = /^\/d\/(\d+)\/(.*)$/.exec(p);
  if (m && dirs[Number(m[1])]) { const base = dirs[Number(m[1])]; const f = path.normalize(path.join(base, m[2])); if (f.startsWith(base) && fs.existsSync(f)) { res.writeHead(200); fs.createReadStream(f).pipe(res); return; } }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const page = await launch({ width: W, height: H });
page.on('Runtime.exceptionThrown', (p) => console.error('EXC', (p.exceptionDetails.exception?.description || p.exceptionDetails.text || '').slice(0, 400)));
page.on('Runtime.consoleAPICalled', (p) => console.log('LOG', p.args.map((a) => a.value).join(' ')));
let code = 0;
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  for (let i = 0; i < 100; i++) { if (await page.evaluate('!!window.__viewerReady').catch(() => false)) break; await new Promise((r) => setTimeout(r, 100)); }
  const o = { models: models.map(urlFor), anims: anims.map(urlFor), rows: rowsList, labels: labelsIn, toon: has('toon'), nomap: has('nomap'), hidemat: opt('hidemat'), normals: has('normals'), cw: CW, ch: CH, cy: Number(opt('cy', 0.85)), dist: Number(opt('dist', 4.6)), fov: Number(opt('fov', 24)), hang: Number(opt('hang', 0)), colPoses };
  const info = await page.evaluate(`run(${JSON.stringify(o)})`, { timeout: 180000 });
  await page.screenshot(out);
  for (const r of info) console.log(JSON.stringify(r));
  console.log('sheet', out);
} catch (e) { code = 2; console.log('error', e.message.slice(0, 400)); }
finally { await page.close(); server.close(); }
process.exit(code);
