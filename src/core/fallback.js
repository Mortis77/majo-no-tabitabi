// Stand-ins used ONLY when a system is absent from the build (subset builds: `--systems structures`).
// They let any single system be looked at in isolation: basic light, a coarse ground, and a free-fly camera.
import * as THREE from 'three';
import { heightAt } from '../world/ground.js';
import { veilAt, SUN_DIR } from '../world/veil.js';
import { clamp } from './util.js';

export function installFallbacks(G, names) {
  const scene = G.scene;
  if (!names.has('sky')) {
    scene.background = new THREE.Color(0x8fc7ee);
    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x55603a, 1.4);
    const sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
    sun.position.copy(SUN_DIR).multiplyScalar(300);
    scene.add(hemi, sun, sun.target);
    G.lights = { sun, hemi, fallback: true };
    const day = new THREE.Color(0x8fc7ee), dusk = new THREE.Color(0xd98a5a), night = new THREE.Color(0x0a1026), c = new THREE.Color();
    G._fallbackSky = () => {
      const v = G.env.veil;
      if (v < 0.5) c.lerpColors(day, dusk, v * 2); else c.lerpColors(dusk, night, (v - 0.5) * 2);
      scene.background.copy(c);
      sun.intensity = 2.4 * (1 - 0.85 * v);
      hemi.intensity = 1.4 - 0.6 * v;
      sun.position.copy(G.env.focus).addScaledVector(SUN_DIR, 300);
      sun.target.position.copy(G.env.focus);
    };
  }
  if (!names.has('terrain')) {
    const N = 200, S = 1800;
    const g = new THREE.PlaneGeometry(S, S, N, N);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const cs = new THREE.Color(0x86c95a), cd = new THREE.Color(0xb59a4a), cn = new THREE.Color(0x1d3350);
    const sand = new THREE.Color(0xe8d9a8), rock = new THREE.Color(0x8a8791), c = new THREE.Color();
    const paint = () => {
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const h = heightAt(x, z);
        pos.setY(i, h);
        const v = veilAt(x, z);
        if (v < 0.5) c.lerpColors(cs, cd, v * 2); else c.lerpColors(cd, cn, (v - 0.5) * 2);
        if (h < 1.2) c.lerp(sand, clamp(1.2 - h, 0, 1));
        if (h > 60) c.lerp(rock, clamp((h - 60) / 40, 0, 1));
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
    };
    paint();
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    m.receiveShadow = true; m.name = 'fallbackTerrain';
    const w = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3c8fb5, transparent: true, opacity: 0.82 }));
    w.name = 'fallbackWater';
    scene.add(m, w);
    G.events.on('terrain:deformed', paint);
  }
  if (!names.has('player')) {
    const cam = G.camera;
    let yaw = 0, pitch = -0.25;
    const p = (G.params.cam || '').split(',').map(Number);
    if (p.length >= 6 && p.every((n) => Number.isFinite(n))) {
      cam.position.set(p[0], p[1], p[2]);
      const d = new THREE.Vector3(p[3] - p[0], p[4] - p[1], p[5] - p[2]).normalize();
      yaw = Math.atan2(-d.x, -d.z); pitch = Math.asin(clamp(d.y, -1, 1));
    } else {
      cam.position.set(-540, 62, 150);
      yaw = 0; pitch = -0.22;
    }
    const fwd = new THREE.Vector3(), right = new THREE.Vector3();
    G.freeCam = {
      get yaw() { return yaw; }, set yaw(v) { yaw = v; },
      get pitch() { return pitch; }, set pitch(v) { pitch = v; },
      /** Place the free camera at (px,py,pz) looking at (tx,ty,tz). */
      set(px, py, pz, tx, ty, tz) {
        cam.position.set(px, py, pz);
        const d = new THREE.Vector3(tx - px, ty - py, tz - pz).normalize();
        yaw = Math.atan2(-d.x, -d.z); pitch = Math.asin(clamp(d.y, -1, 1));
        cam.rotation.set(pitch, yaw, 0, 'YXZ');
      },
      update(rdt) {
        const inp = G.input;
        yaw -= inp.lookX * 0.0028; pitch = clamp(pitch - inp.lookY * 0.0028, -1.5, 1.5);
        cam.rotation.set(pitch, yaw, 0, 'YXZ');
        fwd.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
        right.set(Math.cos(yaw), 0, -Math.sin(yaw));
        const sp = (inp.codeHeld('ShiftLeft') ? 160 : 40) * rdt;
        const mx = (inp.codeHeld('KeyD') ? 1 : 0) - (inp.codeHeld('KeyA') ? 1 : 0);
        const my = (inp.codeHeld('KeyW') ? 1 : 0) - (inp.codeHeld('KeyS') ? 1 : 0);
        const mu = (inp.codeHeld('Space') ? 1 : 0) - (inp.codeHeld('KeyC') ? 1 : 0);
        cam.position.addScaledVector(fwd, my * sp).addScaledVector(right, mx * sp);
        cam.position.y += mu * sp;
      },
    };
  }
}
