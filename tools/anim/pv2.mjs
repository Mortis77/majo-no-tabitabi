#!/usr/bin/env node
// Clip contact strips: rows = clip x view, columns = frames across the clip.
//   node pv2.mjs --model char.glb --anims lib.glb --clips A,B --frames 8 --views g,ff [--hips 0.887] [--gohei] [--broom] [--cell 150x190] [--out x.png]
//   clip entry may be "Name@0.2-0.8" to restrict the time window (fractions)
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import * as esbuild from 'esbuild';
import { launch, ROOT } from '../../tools/cdp.mjs';

const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const has = (n) => args.includes('--' + n);
const model = path.resolve(opt('model', path.join(ROOT, 'assets/models/chars/char_akari.glb')));
const anims = (opt('anims', '') || '').split(',').filter(Boolean).map((p) => path.resolve(p));
const clips = (opt('clips', '') || '').split(',').filter(Boolean);
const views = (opt('views', 'g,ff')).split(',');
const frames = Number(opt('frames', 8));
const [CW, CH] = (opt('cell', '150x190')).split('x').map(Number);
const out = path.resolve(opt('out', path.join(ROOT, '.tmp/anim2/strip.png')));
const hipsH = Number(opt('hips', 0.887));
const W = frames * CW + 110, H = clips.length * views.length * CH;
const gohei = has('gohei') ? path.join(ROOT, 'assets/models/chars/prop_gohei.glb') : null;
const broom = has('broom') ? path.join(ROOT, 'assets/models/chars/prop_broom.glb') : null;

const viewerSrc = `
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.7));
const sun = new THREE.DirectionalLight(0xfff2dd, 2.0); sun.position.set(3, 6, 4); scene.add(sun);
const back = new THREE.DirectionalLight(0xddeeff, 1.0); back.position.set(-3, 4, -5); scene.add(back);
const loader = new GLTFLoader();
const VIEW = { g: [0.22, 0.5, -1], ff: [0.28, 0.12, 1], s: [1, 0.12, 0.05], sl: [-1, 0.12, 0.05], b: [0, 0.2, -1], top: [0.05, 1, 0.2], lf: [0.3, -0.45, 1] };
window.run = async (o) => {
  const gltf = await loader.loadAsync(o.model);
  const root = gltf.scene; scene.add(root);
  let clips = [];
  for (const a of o.anims) { const g = await loader.loadAsync(a); clips = clips.concat(g.animations); }
  const k = o.hipsH / 0.887;
  for (const c of clips) for (const t of c.tracks) if (/Hips\\.position$/.test(t.name) && k !== 1) for (let i = 1; i < t.values.length; i += 3) t.values[i] *= k;
  root.traverse((n) => { if (n.isMesh) n.frustumCulled = false; });
  const bone = (nm) => { let b = null; root.traverse((n) => { if (!b && n.name === nm) b = n; }); return b; };
  if (o.gohei) { const g = await loader.loadAsync(o.gohei); const h = bone('J_Bip_R_Hand'); g.scene.position.set(-0.075, -0.025, 0); g.scene.rotation.set(Math.PI / 2, 0, -0.25); h.add(g.scene); }
  if (o.broom) { const g = await loader.loadAsync(o.broom); g.scene.position.set(0, 0.46, 0.02); root.add(g.scene); root.updateMatrixWorld(true); window.__bb = new THREE.Box3().setFromObject(g.scene); }
  const grid = new THREE.GridHelper(4, 16, 0x556070, 0x3a4250); scene.add(grid);
  const cam = new THREE.PerspectiveCamera(30, o.cw / o.ch, 0.01, 100);
  const tall = (o.tall || 2.15) * k, cy = (o.cy || 0.86) * k;
  const dist = tall * 0.5 / Math.tan(15 * Math.PI / 180) + 0.3;
  const mixer = new THREE.AnimationMixer(root);
  renderer.setScissorTest(true);
  const labels = document.getElementById('labels'); labels.innerHTML = '';
  const lab = (txt, x, y, col) => { const el = document.createElement('div'); el.textContent = txt; el.style.cssText = 'position:absolute;top:' + y + 'px;left:' + x + 'px;color:' + (col || '#fff') + ';font:11px/1.2 Menlo,monospace;text-shadow:0 1px 2px #000;width:104px;word-wrap:break-word'; labels.appendChild(el); };
  const info = [];
  let row = 0;
  for (const spec of o.clips) {
    const [name, win] = spec.split('@'); const [w0, w1] = win ? win.split('-').map(Number) : [0, 1];
    const clip = clips.find((c) => c.name === name);
    if (!clip) { info.push(name + ' MISSING'); row += o.views.length; continue; }
    const loop = /Loop/.test(name);
    for (const vn of o.views) {
      const y = (o.nrows - 1 - row) * o.ch;
      renderer.setViewport(0, y, 110, o.ch); renderer.setScissor(0, y, 110, o.ch); renderer.setClearColor(0x161a22, 1); renderer.clear();
      lab(name + ' [' + vn + '] ' + clip.duration.toFixed(2) + 's', 4, (row) * o.ch + 6);
      for (let fi = 0; fi < o.frames; fi++) {
        const fr = w0 + (w1 - w0) * (o.frames === 1 ? 0 : loop && w1 === 1 ? fi / o.frames : fi / (o.frames - 1));
        const t = clip.duration * fr;
        mixer.stopAllAction(); const act = mixer.clipAction(clip); act.reset().play(); mixer.setTime(t);
        root.updateMatrixWorld(true);
        const x = 110 + fi * o.cw;
        renderer.setViewport(x, y, o.cw, o.ch); renderer.setScissor(x, y, o.cw, o.ch);
        renderer.setClearColor((row + fi) % 2 ? 0x232a36 : 0x2b3342, 1); renderer.clear();
        const v = VIEW[vn] || VIEW.g; const d = new THREE.Vector3(...v).normalize().multiplyScalar(dist);
        const c = new THREE.Vector3(0, cy, 0); cam.position.copy(c).add(d); cam.lookAt(c); cam.updateProjectionMatrix();
        renderer.render(scene, cam);
        if (row % o.views.length === 0) lab(t.toFixed(2), x + 4, row * o.ch + 4, '#ffd');
      }
      row++;
    }
  }
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  return { info, clips: clips.length, bb: window.__bb ? [window.__bb.min.toArray(), window.__bb.max.toArray()] : null };
};
window.__viewerReady = true;
`;
const bundle = await esbuild.build({ stdin: { contents: viewerSrc, resolveDir: ROOT, loader: 'js' }, bundle: true, format: 'iife', write: false, logLevel: 'silent', define: { 'import.meta.url': '"http://127.0.0.1/"' } });
const js = bundle.outputFiles[0].text;
const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#222;overflow:hidden}canvas{width:100%;height:100%;display:block}#labels{position:absolute;inset:0}</style><canvas id="c"></canvas><div id="labels"></div><script src="/viewer.js"></script>`;
const files = new Map();
const urlFor = (f) => { const k = '/f/' + files.size + '/' + path.basename(f); files.set(k, f); return k; };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); return; }
  if (p === '/viewer.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(js); return; }
  if (files.has(p)) { res.writeHead(200); fs.createReadStream(files.get(p)).pipe(res); return; }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const page = await launch({ width: W, height: H });
page.on('Runtime.exceptionThrown', (p) => console.error('EXC', (p.exceptionDetails.exception?.description || p.exceptionDetails.text || '').slice(0, 400)));
let code = 0;
try {
  await page.goto(base + '/');
  for (let i = 0; i < 100; i++) { if (await page.evaluate('!!window.__viewerReady').catch(() => false)) break; await new Promise((r) => setTimeout(r, 100)); }
  const o = { model: urlFor(model), anims: anims.map(urlFor), clips, views, frames, cw: CW, ch: CH, nrows: clips.length * views.length, hipsH, tall: Number(opt('tall', 0)), cy: Number(opt('cy', 0)), gohei: gohei ? urlFor(gohei) : null, broom: broom ? urlFor(broom) : null };
  const info = await page.evaluate(`run(${JSON.stringify(o)})`, { timeout: 120000 });
  await page.screenshot(out);
  console.log(JSON.stringify({ out, ...info }));
} catch (e) { code = 2; console.log(JSON.stringify({ error: e.message.slice(0, 400) })); }
finally { await page.close(); server.close(); }
process.exit(code);
