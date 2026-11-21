// Static costume-chain solver for the garment preview and layer checker.
// Capture the bind pose once with collectChains; call settleChains after applying a pose.
import * as THREE from 'three';
const DOWN = new THREE.Vector3(0, -1, 0);
const CHAIN_ROOT = /^J_Sec_[A-Za-z]+_\d+_01$/; // costume chains only (old VRoid chains like J_Sec_L_SkirtBack0 are ignored)
const SKIRT = /^J_Sec_(Hakama|Robe|Kimono|Tunic|TunicOver|Happi|Haori|Apron|Trousers|WorkCoat)_/;
const next = (b) => b.children.find((c) => c.name.startsWith('J_Sec_')) || null;
export function collectChains(root) {
  root.updateMatrixWorld(true); const by = {}; root.traverse((n) => { by[n.name] = n; });
  const roots = []; root.traverse((n) => { if (CHAIN_ROOT.test(n.name)) roots.push(n); });
  const hipsQ0 = by.J_Bip_C_Hips.getWorldQuaternion(new THREE.Quaternion()).invert();
  for (const r0 of roots) for (let b = r0; b; b = next(b)) { b.userData.restQ = b.quaternion.clone(); const c = next(b);
    if (c) b.userData.dirH = c.getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())).normalize().applyQuaternion(hipsQ0); }
  const cap = (a, b, r) => ({ a: by[a], b: by[b], r });
  const legs = ['L', 'R'].flatMap((s) => [cap(`J_Bip_${s}_UpperLeg`, `J_Bip_${s}_LowerLeg`, 0.088), cap(`J_Bip_${s}_LowerLeg`, `J_Bip_${s}_Foot`, 0.066)]);
  return { roots, hips: by.J_Bip_C_Hips, legs };
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _pq = new THREE.Quaternion();
function aim(b, from, to) { // rotate joint b (world) so that direction `from` becomes `to`
  _q.setFromUnitVectors(from, to); b.getWorldQuaternion(_wq); b.parent.getWorldQuaternion(_pq); b.quaternion.copy(_pq.invert().multiply(_q.multiply(_wq))); b.updateWorldMatrix(false, true); }
function pushOut(pt, caps, s) { // move a point out of capsules (returns true if moved)
  let moved = false; for (const c of caps) { c.a.getWorldPosition(_a); c.b.getWorldPosition(_b); const ab = _b.clone().sub(_a); const t = THREE.MathUtils.clamp(pt.clone().sub(_a).dot(ab) / ab.lengthSq(), 0, 1);
    const q = _a.clone().addScaledVector(ab, t); const d = pt.clone().sub(q); const r = c.r * s; const l = d.length(); if (l < r) { pt.copy(q).addScaledVector(l > 1e-6 ? d.divideScalar(l) : new THREE.Vector3(0, 0, 1), r); moved = true; } }
  return moved; }
export function settleChains({ roots, hips, legs }, { g = 0.55, skirtRest = 0.3, hipsHeight = 0.887 } = {}) {
  const s = hipsHeight / 0.887; const R = 0.235 * s; const hq = new THREE.Quaternion();
  for (const r0 of roots) for (let b = r0; b; b = next(b)) b.quaternion.copy(b.userData.restQ || b.quaternion);
  if (hips) hips.getWorldQuaternion(hq);
  for (const r0 of roots) {
    r0.parent.updateWorldMatrix(true, true); const isSkirt = SKIRT.test(r0.name), isSleeve = r0.name.includes('Sleeve');
    for (let b = r0; b; ) {
      const c = next(b); if (!c) break;
      b.updateWorldMatrix(false, true); b.getWorldPosition(_p); c.getWorldPosition(_c);
      const dir = _c.clone().sub(_p).normalize(); let tgt;
      if (isSkirt && b.userData.dirH) tgt = dir.clone().lerp(b.userData.dirH.clone().applyQuaternion(hq), skirtRest).normalize();
      else tgt = dir.clone().lerp(DOWN, isSleeve ? g : g * 0.6).normalize();
      aim(b, dir, tgt);
      if (isSkirt) { c.getWorldPosition(_c); if (pushOut(_c, legs, s)) aim(b, tgt, _c.clone().sub(_p).normalize()); }
      if (isSleeve && hips) { hips.getWorldPosition(_a); c.getWorldPosition(_c); const dx = _c.x - _a.x, dz = _c.z - _a.z, d = Math.hypot(dx, dz);
        if (d < R && _c.y < _a.y + 0.15) { const want = new THREE.Vector3(_a.x + dx / (d || 1) * R, _c.y, _a.z + dz / (d || 1) * R).sub(_p).normalize(); aim(b, _c.clone().sub(_p).normalize(), want); } }
      b = c;
    }
  }
}
