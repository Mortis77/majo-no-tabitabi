#!/usr/bin/env node
// Inspect + render GLB/GLTF models headlessly: prints structure (size, triangles, bones, animation clips) and saves a
// two-angle preview PNG per file so you can SEE what a downloaded model looks like.
//
//   node tools/glbview.mjs path/a.glb path/b.glb [--out dir] [--anim "Idle"] [--t 0.4] [--size 960x540] [--toon]
//
// --anim   pose the model with the named clip (substring match) at normalised time --t (0..1, default 0.3)
// --toon   preview with the game's toon materials instead of the file's own
// Output: .tmp/glbview/<basename>.png (or --out). One JSON line per file on stdout.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import * as esbuild from 'esbuild';
import { launch, TMP, ROOT } from '../../tools/cdp.mjs';

const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const flags = new Set(['--out', '--anim', '--t', '--size']);
const files = [];
for (let i = 0; i < args.length; i++) { if (flags.has(args[i])) { i++; continue; } if (args[i].startsWith('--')) continue; files.push(path.resolve(args[i])); }
if (!files.length) { console.error('usage: node tools/glbview.mjs <file.glb> [...] [--out dir] [--anim name] [--t 0..1] [--toon]'); process.exit(1); }
const outDir = opt('out') ? path.resolve(opt('out')) : path.join(TMP, 'glbview');
const [W, H] = (opt('size', '960x540') || '960x540').split('x').map(Number);
fs.mkdirSync(outDir, { recursive: true });

const viewerSrc = `
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true });
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.6));
const sun = new THREE.DirectionalLight(0xfff2dd, 2.2); sun.position.set(3, 6, 4); scene.add(sun);
const cam = new THREE.PerspectiveCamera(35, innerWidth / 2 / innerHeight, 0.01, 5000);
const loader = new GLTFLoader();
const draco = new DRACOLoader(); draco.setDecoderPath('/draco/'); loader.setDRACOLoader(draco); loader.setMeshoptDecoder(MeshoptDecoder);
let current = null, grid = null;
window.view = async (url, o) => {
  if (current) scene.remove(current);
  if (grid) scene.remove(grid);
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene; current = root; scene.add(root);
  let tris = 0, meshes = 0, skinned = 0, bones = 0; const mats = new Set(), texs = new Set();
  root.traverse((n) => {
    if (n.isBone) bones++;
    if (!n.isMesh) return;
    meshes++; if (n.isSkinnedMesh) skinned++;
    const g = n.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    for (const m of [].concat(n.material)) { mats.add(m.name || m.uuid); if (m.map) texs.add(m.map.uuid); }
    if (o.toon) { const m = n.material; n.material = new THREE.MeshToonMaterial({ color: m.color, map: m.map, transparent: m.transparent, alphaTest: m.alphaTest, side: m.side, vertexColors: m.vertexColors }); }
  });
  let clipUsed = null;
  if (o.anim && gltf.animations.length) {
    const clip = gltf.animations.find((c) => c.name.toLowerCase().includes(o.anim.toLowerCase()));
    if (clip) { const mixer = new THREE.AnimationMixer(root); mixer.clipAction(clip).play(); mixer.setTime(clip.duration * o.t); clipUsed = clip.name; }
  }
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root, true);
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z, 1e-3);
  grid = new THREE.GridHelper(Math.ceil(r * 3), 12, 0x556070, 0x3a4250); grid.position.set(c.x, box.min.y, c.z); scene.add(grid);
  const dist = r * 1.25 / Math.tan((cam.fov / 2) * Math.PI / 180) * 0.62 + r * 0.5;
  renderer.setScissorTest(true);
  const views = [[0.75, 0.42, 1], [-0.85, 0.35, -1]];
  views.forEach((v, i) => {
    const w = innerWidth / 2;
    renderer.setViewport(i * w, 0, w, innerHeight); renderer.setScissor(i * w, 0, w, innerHeight);
    renderer.setClearColor(i ? 0x232a36 : 0x2b3342, 1); renderer.clear();
    const d = new THREE.Vector3(v[0], v[1], v[2]).normalize().multiplyScalar(dist);
    cam.position.copy(c).add(d); cam.near = dist / 100; cam.far = dist * 20; cam.updateProjectionMatrix(); cam.lookAt(c);
    renderer.render(scene, cam);
  });
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  return {
    size: [+size.x.toFixed(3), +size.y.toFixed(3), +size.z.toFixed(3)], minY: +box.min.y.toFixed(3),
    triangles: Math.round(tris), meshes, skinnedMeshes: skinned, bones, materials: mats.size, textures: texs.size,
    clips: gltf.animations.map((a) => a.name + ' (' + a.duration.toFixed(2) + 's)'), clipPosed: clipUsed,
    topNodes: root.children.slice(0, 12).map((n) => n.name || n.type),
  };
};
window.__viewerReady = true;
`;
const bundle = await esbuild.build({ stdin: { contents: viewerSrc, resolveDir: ROOT, loader: 'js' }, bundle: true, format: 'iife', write: false, logLevel: 'silent', define: { 'import.meta.url': '"http://127.0.0.1/"' } });
const js = bundle.outputFiles[0].text;
const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#222;overflow:hidden}canvas{width:100%;height:100%;display:block}</style><canvas id="c"></canvas><script src="/viewer.js"></script>`;
const dracoDir = path.join(ROOT, 'node_modules/three/examples/jsm/libs/draco/gltf');
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); return; }
  if (p === '/viewer.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(js); return; }
  if (p.startsWith('/draco/')) { const f = path.join(dracoDir, path.basename(p)); if (fs.existsSync(f)) { res.writeHead(200); fs.createReadStream(f).pipe(res); return; } }
  const m = /^\/f\/(\d+)\/(.*)$/.exec(p);
  if (m) {
    // serve the model and any sibling files it references (.bin, textures) from the model's own folder
    const base = path.dirname(files[Number(m[1])]);
    const f = path.normalize(path.join(base, m[2]));
    if (f.startsWith(base) && fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200, { 'content-type': 'application/octet-stream' }); fs.createReadStream(f).pipe(res); return; }
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const page = await launch({ width: W, height: H });
let code = 0;
try {
  await page.goto(base + '/');
  for (let i = 0; i < 100; i++) { if (await page.evaluate('!!window.__viewerReady').catch(() => false)) break; await new Promise((r) => setTimeout(r, 100)); }
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    try {
      const o = { anim: opt('anim'), t: Number(opt('t', 0.3)), toon: args.includes('--toon') };
      const info = await page.evaluate(`view(${JSON.stringify(`/f/${i}/${encodeURIComponent(path.basename(f))}`)}, ${JSON.stringify(o)})`, { timeout: 60000 });
      const png = path.join(outDir, path.basename(f).replace(/\.(glb|gltf)$/i, '') + (o.anim ? '.' + o.anim.replace(/\W/g, '') : '') + '.png');
      await page.screenshot(png);
      console.log(JSON.stringify({ file: path.relative(ROOT, f), kb: Math.round(fs.statSync(f).size / 1024), ...info, preview: png }));
    } catch (e) { code = 2; console.log(JSON.stringify({ file: path.relative(ROOT, f), error: e.message.slice(0, 300) })); }
  }
} finally { await page.close(); server.close(); }
process.exit(code);
