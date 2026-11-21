// Instanced batches for flora: one Batch per model (all its parts share the instance buffers) and one per far stand-in.
// Source data lives in CPU arrays sorted by spatial chunk, so a visible chunk is one contiguous range: packing the GPU
// buffers each time the view changes is a handful of TypedArray.set() calls. Near batches cast shadows for the first
// `shadowCount` instances only (the chunks inside the shadow range are packed first).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { partRule } from './species.js';
import { makeFloraMaterial } from './material.js';
import { buildProcModel, buildProcFar } from './procgen.js';

const _m = new THREE.Matrix4();

/** Read a model from G.assets and merge its meshes into parts. null if the asset is missing. */
export function buildModelParts(G, sp) {
  if (sp.key && !sp.noProc) {
    const pm = buildProcModel(G, sp.key, sp);
    if (pm) {
      for (const p of pm.parts) if (p.rule.mode === 'mul' && p.rule.base != null) bake(p.geo, p.rule.base);
      return pm;
    }
  }
  // sculpted plants (install round 2026-11-17): sp.sculpt = [G.sculpt type, asset id, LOD] — keep that LOD node only
  const sc = sp.sculpt && G.sculpt?.on?.(sp.sculpt[0]) && G.assets?.ready?.(sp.sculpt[1]) ? sp.sculpt : null;
  const obj = G.assets?.model?.(sc ? sc[1] : sp.asset);
  if (!obj) return null;
  if (sc) {
    const keep = new RegExp('_LOD' + sc[2] + '$'), drop = [];
    obj.traverse((o) => { if (/_LOD\d$/.test(o.name || '') && !keep.test(o.name)) drop.push(o); });
    for (const o of drop) o.removeFromParent();
  }
  obj.updateMatrixWorld(true);
  const groups = new Map();
  const box = new THREE.Box3();
  const crownBox = new THREE.Box3();
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const mats = [].concat(o.material);
    const src = mats[0];
    const rule = partRule(sp, src.name || '');
    let g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    const n = g.attributes.position.count;
    // vertex colours -> Float32 RGB, then bake the colour rule
    const col = new Float32Array(n * 3);
    const ca = g.attributes.color;
    for (let i = 0; i < n; i++) {
      const r = ca ? ca.getX(i) : 1, gg = ca ? ca.getY(i) : 1, b = ca ? ca.getZ(i) : 1;
      col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
    }
    const k = rule.dark ?? 1;
    const base = rule.mode === 'mul' ? (rule.base != null ? new THREE.Color(rule.base) : (src.color ? src.color.clone() : new THREE.Color(1, 1, 1))) : new THREE.Color(k, k, k);
    if (rule.mode === 'tint' && !ca) base.setRGB(0.85 * k, 0.85 * k, 0.85 * k);
    // a sculpt's tinted part carries its painted albedo: keep its light / dark story as a value (per channel, relative
    // to the part's mean, about the old models' 0.85 level) and let the instance tint give the hue, as before
    if (sc && rule.mode === 'tint' && ca) {
      const mean = [0, 0, 0];
      for (let i = 0; i < n; i++) { mean[0] += col[i * 3]; mean[1] += col[i * 3 + 1]; mean[2] += col[i * 3 + 2]; }
      for (let j = 0; j < 3; j++) mean[j] = Math.max(1e-3, mean[j] / n);
      for (let i = 0; i < n; i++) { const v = 0.85 * (col[i * 3] / mean[0] + col[i * 3 + 1] / mean[1] + col[i * 3 + 2] / mean[2]) / 3; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v; }
    }
    for (let i = 0; i < n; i++) { col[i * 3] *= base.r; col[i * 3 + 1] *= base.g; col[i * 3 + 2] *= base.b; }
    // plain Float32 copies: refined asset models may carry quantized / interleaved attributes (merge needs one type)
    const f32 = (a, k) => { if (!a) return null; const o = new Float32Array(a.count * k); for (let i = 0; i < a.count; i++) for (let j = 0; j < k; j++) o[i * k + j] = a.getComponent(i, j); return new THREE.BufferAttribute(o, k); };
    const keep = { position: f32(g.attributes.position, 3), normal: f32(g.attributes.normal, 3), color: new THREE.BufferAttribute(col, 3) };
    if (src.map && g.attributes.uv) keep.uv = f32(g.attributes.uv, 2);
    const ng = new THREE.BufferGeometry();
    for (const a in keep) if (keep[a]) ng.setAttribute(a, keep[a]);
    if (!ng.attributes.normal) ng.computeVertexNormals();
    if (g.index) ng.setIndex(g.index);
    g.dispose();
    ng.computeBoundingBox();
    box.union(ng.boundingBox);
    if (rule.crown) crownBox.union(ng.boundingBox);
    const key = [rule.mode, rule.crown ? 1 : 0, rule.glow || 0, rule.tip ? rule.tip.join() : '', src.map ? src.map.uuid : '', src.side, src.alphaTest || 0].join('|');
    let grp = groups.get(key);
    if (!grp) groups.set(key, (grp = { rule, map: src.map || null, side: src.side, alphaTest: src.alphaTest || 0, geos: [] }));
    grp.geos.push(ng);
  });
  if (!groups.size) return null;
  const height = Math.max(0.3, box.max.y);
  if (crownBox.isEmpty()) crownBox.copy(box);
  const parts = [];
  for (const grp of groups.values()) {
    let geos = grp.geos;
    const idx = geos.every((q) => q.index), noIdx = geos.every((q) => !q.index);
    if (!idx && !noIdx) geos = geos.map((q) => (q.index ? q.toNonIndexed() : q));
    const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!geo) continue;
    geo.computeBoundingSphere();
    parts.push({ geo, rule: grp.rule, map: grp.map, side: grp.side, alphaTest: grp.alphaTest });
  }
  const cc = crownBox.getCenter(new THREE.Vector3()), cs = crownBox.getSize(new THREE.Vector3());
  return { parts, height, box, crown: { cx: cc.x, cy: cc.y, cz: cc.z, rx: cs.x / 2, ry: cs.y / 2, rz: cs.z / 2 } };
}

/** Procedural far stand-ins: lumpy blob crown, cone crown (pines/bamboo), mushroom cap. Unit sized, crown centred. */
export function buildFarParts(type) {
  const pf = buildProcFar(type);
  if (pf) return pf;
  const ramp = (g, lo, hi, y0, y1) => {
    const p = g.attributes.position, n = p.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0))); const k = lo + (hi - lo) * t; c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  };
  const strip = (g) => { g.deleteAttribute('uv'); return g; };
  let crown, trunk;
  if (type === 'blob') {
    crown = mergeVertices(strip(new THREE.IcosahedronGeometry(1, 0)).deleteAttribute('normal'));
    const p = crown.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + 0.13 * Math.sin(x * 4.1 + z * 2.3) * Math.cos(y * 3.3 - x);
      p.setXYZ(i, x * k, y * k * (y < 0 ? 0.8 : 1), z * k);
    }
    crown = ramp(crown, 0.62, 1.0, -1, 1);
    crown.computeVertexNormals();
    trunk = ramp(strip(new THREE.CylinderGeometry(0.1, 0.15, 2.6, 4, 1, true).translate(0, -1.9, 0)), 0.55, 0.9, -3.2, -0.6);
    trunk = bake(trunk, 0x6a4a38);
  } else if (type === 'cone') {
    crown = ramp(strip(new THREE.ConeGeometry(1, 2, 6, 1).translate(0, 0, 0)), 0.6, 1.0, -1, 1);
    trunk = bake(ramp(strip(new THREE.CylinderGeometry(0.07, 0.1, 2.4, 5, 1, true).translate(0, -2.1, 0)), 0.6, 0.9, -3.3, -0.9), 0x6a4a38);
  } else {
    crown = ramp(strip(new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, -0.35, 0)), 0.7, 1.0, -0.6, 0.65);
    trunk = bake(ramp(strip(new THREE.CylinderGeometry(0.2, 0.28, 3.2, 6, 1, true).translate(0, -1.9, 0)), 0.7, 1.0, -3.5, -0.3), 0x8f8cb4);
  }
  const glow = type === 'shroom' ? 0.85 : 1.2;
  return {
    parts: [
      { geo: crown, rule: { mode: 'tint', crown: true, glow, tip: type === 'shroom' ? null : [0.2, 1.0] }, side: THREE.FrontSide, mat: type === 'shroom' ? { glowDesat: 0.45 } : undefined }, // revision: far caps as calm as the near ones
      { geo: trunk, rule: { mode: 'mul', glow: type === 'shroom' ? 0.3 : 0 }, side: THREE.FrontSide },
    ],
    height: 2, crown: { cx: 0, cy: 0, cz: 0, rx: 1, ry: 1, rz: 1 },
  };
}
function bake(g, hex) {
  const c = new THREE.Color(hex), a = g.attributes.color.array;
  for (let i = 0; i < a.length; i += 3) { a[i] *= c.r; a[i + 1] *= c.g; a[i + 2] *= c.b; }
  return g;
}

export class Batch {
  /**
   * model: { parts, height, crown }; n: number of instances; cap: GPU capacity; opts: { flex, castShadow, name, far }
   */
  constructor(G, model, n, cap, opts) {
    this.name = opts.name;
    this.n = n;
    this.cap = Math.max(1, Math.min(n, cap));
    this.model = model;
    this.mat = opts.source?.mat || new Float32Array(n * 16);
    this.c0 = opts.source?.c0 || new Float32Array(n * 3);
    this.c1 = opts.source?.c1 || new Float32Array(n * 3);
    this.fx = opts.source?.fx || new Float32Array(n * 4);
    this.count = 0; this.shadowCount = 0; this.dirty = true;
    this.dist = opts.dist || 100;
    this.meshes = [];
    const cap2 = this.cap;
    this.aMat = new THREE.InstancedBufferAttribute(new Float32Array(cap2 * 16), 16).setUsage(THREE.DynamicDrawUsage);
    this.aC0 = new THREE.InstancedBufferAttribute(new Float32Array(cap2 * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aC1 = new THREE.InstancedBufferAttribute(new Float32Array(cap2 * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aFx = new THREE.InstancedBufferAttribute(new Float32Array(cap2 * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const self = this;
    for (const p of model.parts) {
      const geo = p.geo.clone();
      geo.setAttribute('aCol0', this.aC0); geo.setAttribute('aCol1', this.aC1); geo.setAttribute('aFx', this.aFx);
      const r = p.rule;
      const mat = makeFloraMaterial({
        height: model.height, flex: opts.flex || 0, crownY: model.crown.cy, crown: !!r.crown, tint: r.mode === 'tint',
        crownC: [model.crown.cx, model.crown.cy, model.crown.cz], crownR: [model.crown.rx, model.crown.ry, model.crown.rz],
        glow: r.glow || 0, tipLo: r.tip ? r.tip[0] : 0, tipHi: r.tip ? r.tip[1] : 0, map: p.map, alphaTest: p.alphaTest, side: p.side,
        G, ...(p.mat || { surface: r.mode === 'mul' && !p.map && /log|stump|fallen/.test(opts.name) ? 'bark' : null }),
      });
      this.fade = this.fade || [];
      const mesh = new THREE.InstancedMesh(geo, mat, cap2);
      mesh.instanceMatrix = this.aMat;
      mesh.count = 0; mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.name = 'flora:' + opts.name;
      mesh.castShadow = !!opts.castShadow;
      mesh.receiveShadow = !(p.mat && p.mat.noRecv); // revision: mushroom gills are always under their cap: no shadow-map stair-steps
      mesh.customDepthMaterial = mat.userData.depth;
      if (opts.castShadow) {
        mesh.onBeforeShadow = function () { this.count = self.shadowCount; };
        mesh.onAfterShadow = function () { this.count = self.count; };
      }
      this.meshes.push(mesh);
      this.fade.push(mat.userData.fU.fFade.value);
      G.scene.add(mesh);
    }
    this.tris = model.parts.reduce((s, p) => s + (p.geo.index ? p.geo.index.count : p.geo.attributes.position.count) / 3, 0);
  }
  /** Dithered distance fade of every part: mode +1 fade out over [a, b], -1 fade in, 0 none. */
  setFade(a, b, mode) { for (const f of this.fade) f.set(a, b, mode, f.w); }
  /** Sort-order bookkeeping: instance slots are filled chunk by chunk (see flora.js), ranges stored per chunk. */
  setRanges(starts, counts) { this.cStart = starts; this.cCount = counts; }
  begin() { this.count = 0; this.shadowCount = 0; }
  add(c, shadow) {
    let k = this.cCount.get(c);
    if (!k) return;
    this.addRange(this.cStart.get(c),k,shadow);
  }
  // Near-only ornaments have a radius smaller than a chunk. Pack the visible runs only.
  addNearby(c,eye,range) {
    const start=this.cStart.get(c),end=start+this.cCount.get(c),r2=range*range;
    let run=start;
    for(let slot=start;slot<end;slot++){
      const i=slot*16;
      const x=this.mat[i+12]-eye.x,y=this.mat[i+13]-eye.y,z=this.mat[i+14]-eye.z;
      if(x*x+y*y+z*z<=r2 && this.mat[i+15]) continue;
      if(slot>run) this.addRange(run,slot-run,false);
      run=slot+1;
    }
    if(end>run) this.addRange(run,end-run,false);
  }
  addRange(s,k,shadow) {
    k = Math.min(k, this.cap - this.count);
    if (k <= 0) return;
    const o = this.count;
    this.aMat.array.set(this.mat.subarray(s * 16, (s + k) * 16), o * 16);
    this.aC0.array.set(this.c0.subarray(s * 3, (s + k) * 3), o * 3);
    this.aC1.array.set(this.c1.subarray(s * 3, (s + k) * 3), o * 3);
    this.aFx.array.set(this.fx.subarray(s * 4, (s + k) * 4), o * 4);
    this.count += k;
    if (shadow) this.shadowCount = this.count;
  }
  end() {
    const n = this.count;
    for (const a of [this.aMat, this.aC0, this.aC1, this.aFx]) {
      a.clearUpdateRanges();
      if (n) { a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true; }
    }
    for (const m of this.meshes) { m.count = n; m.visible = n > 0; }
  }
  /** Write one instance's source data. */
  set(i, matrix, c0, c1, fx) {
    if (matrix) matrix.toArray(this.mat, i * 16);
    if (c0) { this.c0[i * 3] = c0[0]; this.c0[i * 3 + 1] = c0[1]; this.c0[i * 3 + 2] = c0[2]; }
    if (c1) { this.c1[i * 3] = c1[0]; this.c1[i * 3 + 1] = c1[1]; this.c1[i * 3 + 2] = c1[2]; }
    if (fx) { this.fx[i * 4] = fx[0]; this.fx[i * 4 + 1] = fx[1]; this.fx[i * 4 + 2] = fx[2]; this.fx[i * 4 + 3] = fx[3]; }
    this.dirty = true;
  }
  hide(i) { this.mat.fill(0, i * 16, i * 16 + 16); this.dirty = true; }
}
export { _m as _scratchMatrix };
