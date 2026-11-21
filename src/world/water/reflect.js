// Above-water scene rendered from a camera reflected across the mean water plane.
import * as THREE from 'three';
import { U } from '../../render/atmo.js';

// people / creatures / their parts: reflected only near the camera; koi and blob shadows never
const ACTOR = /^(Deer|Fox|Crane|Cat|Dog|Bird|Wolf|Boar|Npc|npc)_|_(face|outfit|hair|addons|body|eyes)_\d/;
const NEVER = /^(Koi|actorBlob)/;
const SKIP = /^(flora:(grass|fern|flower)|fxParticles|gp:pickup|gp:moontears|mvSky)|_outline$/;

export class PlanarReflection {
  constructor({ level = 0, scale = 0.4, maxWidth = 900, detail = 1 } = {}) {
    this.level = level; this.scale = scale; this.maxWidth = maxWidth;
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 0 });
    this.rt.texture.name = 'mvWaterRefl';
    this.rt.texture.generateMipmaps = false;
    this.cam = new THREE.PerspectiveCamera();
    this.cam.matrixAutoUpdate = true;
    this.textureMatrix = new THREE.Matrix4();
    this.skip = []; this.skipAge = 1e9; this._lastEye = new THREE.Vector3(1e9, 0, 0);
    this.minSize = [0.015, 0.010, 0.006][detail]; this.nearSkinned = [18, 26, 42][detail]; this.far = 1800;
    this.hero = null;
    this.ms = 0; this.calls = 0; this.frames = 0;
    this._v = new THREE.Vector3(); this._t = new THREE.Vector3(); this._u = new THREE.Vector3();
    this._plane = new THREE.Plane(); this._clip = new THREE.Vector4(); this._q = new THREE.Vector4();
    this._size = new THREE.Vector2(); this._cc = new THREE.Color();
  }
  _scan(scene, eye) {
    const list = [], sp = this._sp || (this._sp = new THREE.Sphere());
    // Garments use bind-space bounds, and the compact broom parts move with the rider.
    // Their visible LOD has already been selected by the main camera.
    const heroMeshes = new Set();
    this.hero?.traverse(o => { if (o.isMesh) heroMeshes.add(o); });
    scene.traverse((o) => {
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
      const n = o.name || '';
      const m = o.material;
      if (heroMeshes.has(o)) {
        if (o.userData.outline || /outline|blob/i.test(n) || !o.layers.isEnabled(0)) list.push(o);
        return;
      }
      if (o.isPoints || o.isSprite || SKIP.test(n) || (m && !Array.isArray(m) && m.transparent && m.name !== 'water')) { list.push(o); return; }
      // small things far away are invisible in a half-resolution, rippled reflection
      const g = o.geometry;
      if (!g || n === 'terrain' || o.isInstancedMesh || o.isBatchedMesh) return;
      if (!g.boundingSphere) g.computeBoundingSphere();
      sp.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
      const d = sp.center.distanceTo(eye);
      // people and creatures: only the ones close to the camera (the heroine standing at the shore)
      if (NEVER.test(n)) { list.push(o); return; }
      if (o.isSkinnedMesh || ACTOR.test(n)) { if (d > this.nearSkinned) list.push(o); return; }
      if (sp.center.y + sp.radius < this.level - 0.05) { list.push(o); return; }                    // sunken (koi, beds)
      if (sp.radius / Math.max(1, d - sp.radius) < this.minSize) list.push(o);
    });
    this.skip = list; this.skipAge = 0;
  }
  render(renderer, scene, camera, hide) {
    renderer.getDrawingBufferSize(this._size);
    const k = Math.min(this.scale, this.maxWidth / Math.max(1, this._size.x));
    const w = Math.max(1, Math.round(this._size.x * k)), h = Math.max(1, Math.round(this._size.y * k));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    if (++this.skipAge > 45 || this._lastEye.distanceToSquared(camera.position) > 400) { this._scan(scene, camera.position); this._lastEye.copy(camera.position); }

    const L = this.level, c = this.cam;
    // mirrored pose
    const p = camera.getWorldPosition(this._v);
    camera.getWorldDirection(this._t);
    c.position.set(p.x, 2 * L - p.y, p.z);
    this._u.set(0, 1, 0).applyQuaternion(camera.quaternion); this._u.y = -this._u.y;
    c.up.copy(this._u);
    c.lookAt(p.x + this._t.x, 2 * L - p.y - this._t.y, p.z + this._t.z);
    c.layers.mask = camera.layers.mask; // same layers as the viewer (boot warm-up draws one layer at a time)
    c.fov = camera.fov; c.aspect = camera.aspect; c.near = camera.near; c.far = Math.min(camera.far, this.far); c.zoom = camera.zoom ?? 1;
    c.updateProjectionMatrix(); c.updateMatrixWorld(true);
    c.matrixWorldInverse.copy(c.matrixWorld).invert();
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(c.projectionMatrix).multiply(c.matrixWorldInverse);
    // oblique near plane = water plane (keeps only what is above the water)
    this._plane.setFromNormalAndCoplanarPoint(this._t.set(0, 1, 0), this._v.set(0, L - 0.02, 0));
    this._plane.applyMatrix4(c.matrixWorldInverse);
    const cp = this._clip.set(this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant);
    const pm = c.projectionMatrix, e = pm.elements, q = this._q;
    q.x = (Math.sign(cp.x) + e[8]) / e[0]; q.y = (Math.sign(cp.y) + e[9]) / e[5]; q.z = -1; q.w = (1 + e[10]) / e[14];
    cp.multiplyScalar(2 / cp.dot(q));
    e[2] = cp.x; e[6] = cp.y; e[10] = cp.z + 1; e[14] = cp.w;
    c.projectionMatrixInverse.copy(pm).invert();

    // draw
    const t0 = performance.now();
    const prevRT = renderer.getRenderTarget(), prevAuto = renderer.shadowMap.autoUpdate, prevBg = scene.background;
    const prevMWA = scene.matrixWorldAutoUpdate, prevAlpha = renderer.getClearAlpha(), info = renderer.info, prevReset = info.autoReset;
    renderer.getClearColor(this._cc);
    const vis = [];
    for (const o of this.skip) if (o.visible) { o.visible = false; vis.push(o); }
    for (const o of hide) if (o && o.visible) { o.visible = false; vis.push(o); }
    const callsBefore = info.render.calls;
    const mq = U.mvQ.value, qx = mq.x, qy = mq.y, cw = U.mvCloud.value.w;
    try {
      // Keep the same moving pools of light on a roof and its reflection.
      mq.x = 0; mq.y = 0; U.mvCloud.value.w = 1;
      renderer.shadowMap.autoUpdate = false; scene.background = null;
      // This pass precedes the main renderer. Evaluate this frame's new rider, broom and
      // moving prop transforms before drawing them through the reflected camera.
      scene.updateMatrixWorld(); scene.matrixWorldAutoUpdate = false; info.autoReset = false;
      renderer.setRenderTarget(this.rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, false);
      renderer.render(scene, c);
    } finally {
      for (const o of vis) o.visible = true;
      mq.x = qx; mq.y = qy; U.mvCloud.value.w = cw;
      renderer.setClearColor(this._cc, prevAlpha);
      renderer.shadowMap.autoUpdate = prevAuto; scene.background = prevBg; scene.matrixWorldAutoUpdate = prevMWA; info.autoReset = prevReset;
      renderer.setRenderTarget(prevRT);
    }
    this.calls = info.render.calls - callsBefore;
    this.ms = this.ms * 0.9 + (performance.now() - t0) * 0.1;
    this.frames++;
  }
  dispose() { this.rt.dispose(); }
}
