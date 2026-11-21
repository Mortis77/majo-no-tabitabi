// Debug overlay: wireframes of every collider near the camera focus, drawn from Rapier's own debug renderer
// (so it shows exactly what the solver collides with: heightfield chunks, mirrored statics, bodies, capsules).
import * as THREE from 'three';

const RANGE = 70;          // colliders whose centre lies farther than this from the focus are skipped
const EVERY = 4;           // refresh every n frames (it is a debugging aid, not a hot path)

export function createDebug(P) {
  const { world, G } = P;
  let lines = null, on = false, tick = 0, cap = 0;
  const geo = new THREE.BufferGeometry();
  const f = new THREE.Vector3();
  const pred = (col) => {
    const t = col.translation();
    const dx = t.x - f.x, dz = t.z - f.z;
    // heightfield chunks are centred in a 32 m square: let them in from a little farther
    return dx * dx + dz * dz < (RANGE + 24) * (RANGE + 24);
  };

  function ensure() {
    if (lines) return;
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthTest: true, toneMapped: false });
    lines = new THREE.LineSegments(geo, mat);
    lines.name = 'physics-debug';
    lines.frustumCulled = false;
    lines.renderOrder = 999;
  }

  function refresh() {
    f.copy(G.env.focus);
    const buf = world.debugRender(undefined, pred);
    const v = buf.vertices, c = buf.colors;
    const n = v.length / 3;
    if (n > cap) {
      cap = Math.ceil(n * 1.3) + 64;
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage));
    }
    const pa = geo.attributes.position, ca = geo.attributes.color;
    pa.array.set(v);
    // rapier gives RGBA per vertex
    const out = ca.array;
    for (let i = 0, j = 0; i < n; i++, j += 4) { out[i * 3] = c[j]; out[i * 3 + 1] = c[j + 1]; out[i * 3 + 2] = c[j + 2]; }
    pa.needsUpdate = true; ca.needsUpdate = true;
    geo.setDrawRange(0, n);
  }

  return {
    get on() { return on; },
    set(v) {
      on = !!v;
      ensure();
      if (on) { if (!lines.parent) G.scene.add(lines); tick = 0; refresh(); }
      else if (lines.parent) lines.parent.remove(lines);
      return on;
    },
    update() {
      if (!on) return;
      if (++tick % EVERY === 0) refresh();
    },
  };
}
