// A hand-built wild rabbit (map round, 2026-11-22) for the instanced herds: soft ellipsoid body, head, long ears,
// powder-puff tail, with procedural clips (idle sniffing, grazing, the hop) baked into the same bone texture format as
// the rigged animals (life/skinned.js). Faces +z, ~0.45 m long.
import * as THREE from 'three';
import { bakeProcedural } from './skinned.js';

const lin = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const FUR = lin(0x9b8770), DARK = lin(0x6e5d4c), BELLY = lin(0xd9cfc0), WHITE = lin(0xf2efe8), PINK = lin(0xd9a89c), EYE = lin(0x1d1714);
const ell = (rx, ry, rz, x, y, z, rotX = 0, seg = 10) => {
  const g = new THREE.SphereGeometry(1, seg, Math.max(6, seg - 3));
  g.scale(rx, ry, rz); g.rotateX(rotX); g.translate(x, y, z); return g;
};
const PIV = { head: [0, 0.24, 0.13], earL: [0.035, 0.33, 0.15], earR: [-0.035, 0.33, 0.15], hind: [0, 0.1, -0.06], fore: [0, 0.1, 0.12], tail: [0, 0.18, -0.19] };

export function bakeRabbit() {
  const parts = [
    { geo: ell(0.115, 0.115, 0.19, 0, 0.16, 0, -0.18, 12), bone: 0, color: (x, y) => (y < 0.12 ? BELLY : FUR) },
    { geo: ell(0.078, 0.075, 0.09, 0, 0.27, 0.19, 0.2, 10), bone: 1, color: (x, y, z) => (z > 0.26 ? DARK : FUR) },
    { geo: ell(0.013, 0.013, 0.013, 0.05, 0.29, 0.24, 0, 5), bone: 1, color: EYE },
    { geo: ell(0.013, 0.013, 0.013, -0.05, 0.29, 0.24, 0, 5), bone: 1, color: EYE },
    { geo: ell(0.022, 0.085, 0.012, 0.035, 0.41, 0.15, -0.35, 7), bone: 2, color: (x, y, z) => (z > 0.152 ? PINK : FUR) },
    { geo: ell(0.022, 0.085, 0.012, -0.035, 0.41, 0.15, -0.35, 7), bone: 3, color: (x, y, z) => (z > 0.152 ? PINK : FUR) },
    { geo: ell(0.045, 0.06, 0.1, 0.075, 0.07, -0.07, 0.2, 8), bone: 4, color: FUR },
    { geo: ell(0.045, 0.06, 0.1, -0.075, 0.07, -0.07, 0.2, 8), bone: 4, color: FUR },
    { geo: ell(0.022, 0.07, 0.025, 0.045, 0.05, 0.13, 0, 6), bone: 5, color: BELLY },
    { geo: ell(0.022, 0.07, 0.025, -0.045, 0.05, 0.13, 0, 6), bone: 5, color: BELLY },
    { geo: ell(0.04, 0.04, 0.035, 0, 0.19, -0.2, 0, 7), bone: 6, color: WHITE },
  ];
  const M = () => new THREE.Matrix4();
  const rotAt = (p, rx, ry = 0, rz = 0) => {
    const m = new THREE.Matrix4().makeTranslation(p[0], p[1], p[2]);
    m.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
    return m.multiply(new THREE.Matrix4().makeTranslation(-p[0], -p[1], -p[2]));
  };
  function pose(state, t) {
    const T2 = t * Math.PI * 2;
    let lift = 0, pitch = 0, head = 0, ear = 0, earS = 0, hind = 0, fore = 0, tail = 0, stretch = 1;
    if (state === 'idle') { head = 0.06 * Math.sin(T2 * 3) * (t > 0.5 ? 1 : 0.2); ear = 0.12 * Math.max(0, Math.sin(T2 * 2 - 1)) ; earS = 0.1 * Math.sin(T2); tail = 0.1 * Math.sin(T2 * 4); }
    else if (state === 'eat') { head = 0.55 + 0.06 * Math.sin(T2 * 6); pitch = 0.12; ear = -0.25; }
    else if (state === 'alert') { head = -0.25; pitch = -0.22; lift = 0.05; ear = -0.15; }
    else { // hop
      const s = Math.sin(Math.PI * t);
      lift = 0.13 * s; pitch = -0.28 * Math.cos(T2); stretch = 1 + 0.18 * s;
      hind = -0.9 * s; fore = 0.7 * Math.sin(Math.PI * Math.min(1, t * 1.3)); ear = -0.45 * s; head = 0.1 * Math.cos(T2);
    }
    const body = new THREE.Matrix4().makeTranslation(0, lift, 0).multiply(rotAt([0, 0.16, 0], pitch)).multiply(new THREE.Matrix4().makeScale(1, 1 / Math.sqrt(stretch), stretch));
    const H = body.clone().multiply(rotAt(PIV.head, head));
    return [
      body, H,
      H.clone().multiply(rotAt(PIV.earL, ear, 0, earS)), H.clone().multiply(rotAt(PIV.earR, ear, 0, -earS)),
      body.clone().multiply(rotAt(PIV.hind, hind)), body.clone().multiply(rotAt(PIV.fore, fore)),
      body.clone().multiply(rotAt(PIV.tail, tail)),
    ];
  }
  return bakeProcedural(parts, 7, pose, { idle: [2.4, 24], eat: [1.6, 16], alert: [1.0, 4], hop: [0.42, 10] });
}
