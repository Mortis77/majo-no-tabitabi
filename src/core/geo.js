// Primitive mesh helpers + static-geometry baking. Geometries are cached by parameters.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const gcache = new Map();
function geom(k, make) { let g = gcache.get(k); if (!g) { g = make(); g.userData.shared = true; gcache.set(k, g); } return g; }

function place(mesh, x = 0, y = 0, z = 0) { mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; return mesh; }

/** Box centred on (x,y,z). */
export function box(w, h, d, mat, x, y, z) {
  return place(new THREE.Mesh(geom(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), mat), x, y, z);
}
/** Cylinder / cone-frustum, axis along +y, centred on (x,y,z). */
export function cyl(rTop, rBot, h, mat, x, y, z, seg = 10) {
  return place(new THREE.Mesh(geom(`c${rTop},${rBot},${h},${seg}`, () => new THREE.CylinderGeometry(rTop, rBot, h, seg)), mat), x, y, z);
}
/** Cone, apex up, centred on (x,y,z). */
export function cone(r, h, mat, x, y, z, seg = 10) {
  return place(new THREE.Mesh(geom(`k${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg)), mat), x, y, z);
}
/** Sphere centred on (x,y,z). */
export function sphere(r, mat, x, y, z, wSeg = 14, hSeg = 10) {
  return place(new THREE.Mesh(geom(`s${r},${wSeg},${hSeg}`, () => new THREE.SphereGeometry(r, wSeg, hSeg)), mat), x, y, z);
}
/** Low-poly rock-ish blob (icosahedron). */
export function ico(r, mat, x, y, z, detail = 0) {
  return place(new THREE.Mesh(geom(`i${r},${detail}`, () => new THREE.IcosahedronGeometry(r, detail)), mat), x, y, z);
}
/** Torus lying in the XY plane (ring facing +z), centred on (x,y,z). */
export function torus(r, tube, mat, x, y, z, rSeg = 8, tSeg = 24) {
  return place(new THREE.Mesh(geom(`t${r},${tube},${rSeg},${tSeg}`, () => new THREE.TorusGeometry(r, tube, rSeg, tSeg)), mat), x, y, z);
}
/** Group helper: grp(a, b, c) -> THREE.Group containing them. */
export function grp(...children) { const g = new THREE.Group(); for (const c of children) if (c) g.add(c); return g; }

/**
 * Collapse every static Mesh under `root` into one merged Mesh per material. Huge draw-call saver: ALWAYS bake
 * buildings / props made of many primitives before adding them to the scene.
 * - Meshes (or whole sub-trees) flagged `userData.dynamic = true` are kept as live objects (things you animate later).
 * - Lights, InstancedMesh, Points, Lines, Sprites and empty named Groups flagged dynamic are kept as-is.
 * - The result is a new Group with root's position/rotation/scale; `root` itself is left untouched and can be discarded.
 * Avoid negative scales (they flip triangle winding).
 */
export function bakeStatic(root, { castShadow = true, receiveShadow = true } = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const buckets = new Map();
  const kept = [];
  const visit = (o) => {
    if (o !== root && o.userData.dynamic) { kept.push(o); return; }
    if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh) {
      const mats = Array.isArray(o.material) ? null : o.material;
      if (mats && o.geometry && o.geometry.attributes.position) {
        let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
        if (!g.attributes.normal) g.computeVertexNormals();
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        g.morphAttributes = {};
        rel.multiplyMatrices(inv, o.matrixWorld);
        g.applyMatrix4(rel);
        let b = buckets.get(mats);
        if (!b) buckets.set(mats, (b = { geos: [], cast: false, recv: false }));
        b.geos.push(g);
        b.cast = b.cast || o.castShadow; b.recv = b.recv || o.receiveShadow;
      } else kept.push(o);
    } else if (o.isLight || o.isPoints || o.isLine || o.isSprite || o.isInstancedMesh || o.isSkinnedMesh) {
      kept.push(o); return;
    }
    for (const c of [...o.children]) visit(c);
  };
  visit(root);
  const out = new THREE.Group();
  out.name = root.name || 'baked';
  out.position.copy(root.position); out.quaternion.copy(root.quaternion); out.scale.copy(root.scale);
  out.userData = { ...root.userData };
  for (const [mat, b] of buckets) {
    const merged = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = castShadow && b.cast; m.receiveShadow = receiveShadow && b.recv;
    out.add(m);
    if (b.geos.length > 1) for (const g of b.geos) g.dispose();
  }
  for (const o of kept) {
    rel.multiplyMatrices(inv, o.matrixWorld);
    o.removeFromParent();
    rel.decompose(o.position, o.quaternion, o.scale);
    out.add(o);
  }
  return out;
}

/** Recursively set castShadow / receiveShadow. */
export function setShadows(obj, cast = true, receive = true) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
  return obj;
}
