// Ice floes (冰 on water): a faceted translucent slab that floats on real water, bobs gently, can be stood on (it is a
// G.world platform, which the physics system mirrors as a fixed collider), and melts away — faster near fire.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { hookMaterial } from '../core/mats.js';
import { smoothstep } from '../core/util.js';

const MAX_FLOES = 24;
const TOP = 0.3;          // floe top above the water line
let iceMat = null;

function floeGeometry(r) {
  const N = 9;
  const rad = [];
  const a0 = Math.random() * Math.PI * 2;
  for (let i = 0; i < N; i++) rad.push(r * (0.8 + 0.24 * Math.random()));
  const ring = (y, s, jit) => {
    const out = [];
    for (let i = 0; i < N; i++) {
      const a = a0 + (i / N) * Math.PI * 2 + (Math.random() - 0.5) * jit;
      out.push([Math.cos(a) * rad[i] * s, y + (Math.random() - 0.5) * 0.05, Math.sin(a) * rad[i] * s]);
    }
    return out;
  };
  const top = ring(TOP, 0.86, 0.12), mid = ring(TOP - 0.2, 1.0, 0.1), bot = ring(-0.55, 0.72, 0.15);
  const P = [], C = [];
  const cTop = new THREE.Color(0xf2fbff), cSide = new THREE.Color(0x9fd6f2), cDeep = new THREE.Color(0x5fa8d8);
  const tri = (a, b, c, col) => { P.push(...a, ...b, ...c); for (let k = 0; k < 3; k++) C.push(col.r, col.g, col.b); };
  const ctr = [0, TOP + 0.03, 0];
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    tri(ctr, top[j], top[i], cTop);
    tri(top[i], top[j], mid[j], cSide); tri(top[i], mid[j], mid[i], cSide);
    tri(mid[i], mid[j], bot[j], cDeep); tri(mid[i], bot[j], bot[i], cDeep);
    tri([0, -0.7, 0], bot[i], bot[j], cDeep);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  return g;
}

export function createFloes(E) {
  const floes = [];
  const api = {
    floes,
    /** ★ freezeWater(x, z, r, duration=30) -> floe | null (null if (x,z) is not water). */
    freeze(x, z, r = 4, duration = 30) {
      const W = G.world;
      if (!(W.heightAt(x, z) < W.seaLevel - 0.3)) return null;
      r = Math.max(1.5, Math.min(r, 10));
      if (!iceMat) {
        iceMat = hookMaterial(new THREE.MeshLambertMaterial({
          color: 0xffffff, vertexColors: true, emissive: 0x3c7fa6, emissiveIntensity: 0.3, transparent: true, opacity: 0.9, flatShading: true,
        }));
      }
      const mesh = new THREE.Mesh(floeGeometry(r), iceMat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      const sea = W.seaLevel;
      mesh.position.set(x, sea, z);
      mesh.rotation.y = Math.random() * Math.PI * 2;
      mesh.scale.setScalar(0.2);
      G.scene.add(mesh);
      const platform = W.addPlatform({ x, z, r: r * 0.86, top: sea + TOP, thick: 0.85, tag: 'icefloe' });
      const f = { x, z, r, top: sea + TOP, duration, t: 0, mesh, platform, seed: Math.random() * 10, dead: false, k: 1, pr: r * 0.86 };
      f.remove = () => kill(f, false);
      f.melt = (sec) => { f.t += sec; };
      floes.push(f);
      if (floes.length > MAX_FLOES) kill(floes[0], true);
      G.fx?.burst?.('hit_ice', mesh.position);
      G.fx?.ring?.(new THREE.Vector3(x, sea + 0.05, z), { color: 0xcff4ff, radius: r * 1.6, dur: 0.6 });
      G.audio?.sfx?.('freeze', { pos: mesh.position });
      G.events.emit('element:reaction', { type: 'freeze', pos: mesh.position.clone(), power: 1, floe: f });
      return f;
    },
    update(dt) {
      const t = G.time.t;
      for (let i = floes.length - 1; i >= 0; i--) {
        const f = floes[i];
        if (f.dead) continue;
        // fire nearby melts faster
        const hot = E.fire.heatAt(f.x, f.z);
        f.t += dt * (hot > 0 ? 4 : 1);
        const left = 1 - f.t / f.duration;
        if (left <= 0) { kill(f, true); continue; }
        const grow = smoothstep(0, 0.35, f.t);
        f.k = left < 0.3 ? 0.35 + 0.65 * (left / 0.3) : 1;
        const s = (0.2 + 0.8 * grow) * f.k;
        f.mesh.scale.set(s, 0.6 + 0.4 * f.k, s);
        f.mesh.position.y = G.world.seaLevel + Math.sin(t * 1.3 + f.seed) * 0.04 - (1 - f.k) * 0.12;
        f.mesh.rotation.x = Math.sin(t * 0.9 + f.seed * 2) * 0.012;
        f.mesh.rotation.z = Math.cos(t * 1.1 + f.seed) * 0.012;
        const pr = f.r * 0.86 * f.k;
        if (Math.abs(pr - f.pr) > 0.06 * f.r) { f.pr = pr; f.platform.r = pr; f.platform.top = f.top - (1 - f.k) * 0.12; }
      }
    },
    /** Melt every floe within r of (x, z) by `sec` seconds. */
    meltNear(x, z, r, sec) {
      let n = 0;
      for (const f of floes) if (!f.dead && Math.hypot(f.x - x, f.z - z) < r + f.r) { f.t += sec; n++; }
      return n;
    },
    clear() { for (const f of [...floes]) kill(f, false); },
  };
  function kill(f, splash) {
    if (f.dead) return;
    f.dead = true;
    f.platform.dead = true;
    f.mesh.removeFromParent();
    f.mesh.geometry.dispose();
    const i = floes.indexOf(f);
    if (i >= 0) floes.splice(i, 1);
    if (splash) { G.fx?.burst?.('splash', f.mesh.position); G.audio?.sfx?.('splash', { pos: f.mesh.position }); }
  }
  return api;
}
