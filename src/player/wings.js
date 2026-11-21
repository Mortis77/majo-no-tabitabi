// 光翼 — procedural wings of light that unfold from the heroine's back while gliding.
// Each wing is a fan of long feather blades (one merged geometry, additive glow, soft gradient by vertex colour).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../core/game.js';
import { PAL } from '../core/mats.js';
import { clamp, damp, easeOutBack } from '../core/util.js';

const WING_T = { value: 0 };

function featherGeo(len, wid, colA, colB) {
  // a slim leaf: root at origin, tip at +x (len), widest at 40 %
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(len * 0.25, wid * 0.9, len * 0.65, wid * 0.75, len, 0.02);
  s.bezierCurveTo(len * 0.7, -wid * 0.35, len * 0.3, -wid * 0.45, 0, 0);
  const g = new THREE.ShapeGeometry(s, 10);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Color(colA), b = new THREE.Color(colB), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = clamp(pos.getX(i) / len);
    c.copy(a).lerp(b, Math.pow(t, 0.8)).multiplyScalar(0.55 + 0.75 * Math.sin(Math.PI * Math.min(1, t * 1.15)));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // feather coordinates (linear in position, so they interpolate exactly): x = along 0..1, y = across / width
  const fc = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { fc[i * 2] = pos.getX(i) / len; fc[i * 2 + 1] = pos.getY(i) / wid; }
  g.setAttribute('aFeather', new THREE.BufferAttribute(fc, 2));
  return g;
}

/** One wing (side = +1 left / -1 right in the character's frame, which faces +Z). */
function makeWing(side, mat) {
  const parts = [];
  const N = 7;
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);
    const len = 0.75 + 0.55 * Math.sin(Math.PI * (0.25 + 0.6 * f));
    const g = featherGeo(len, 0.17 - 0.04 * f, i < 3 ? 0xfff2c6 : 0xffe9a8, i % 2 ? PAL.glowCyan : 0xffd27a);
    // fan: from pointing up-out to pointing down-out
    const ang = 1.05 - f * 1.55;
    g.rotateZ(ang);
    g.translate(0.02 * i, -0.03 * i, -0.012 * i);
    parts.push(g);
  }
  const geo = mergeGeometries(parts);
  if (side < 0) geo.scale(-1, 1, 1); // mirrored winding is fine: the material is double-sided
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = 3;
  return m;
}

export function createWings() {
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false, fog: false,
  });
  // crafted light feathers: bright rachis, fine slanted barbs, soft vanes fading to the edge, a hot tip
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWingT = WING_T;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aFeather;\nvarying vec2 vFeather;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFeather = aFeather;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFeather;\nuniform float uWingT;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        float t = clamp( vFeather.x, 0.0, 1.0 );
        float up = 0.62 * sin( 3.14159 * pow( max( t, 1e-3 ), 0.7 ) ) + 0.02;
        float lo = 0.3 * sin( 3.14159 * pow( max( t, 1e-3 ), 0.8 ) ) + 0.02;
        float e = vFeather.y >= 0.0 ? vFeather.y / up : -vFeather.y / lo;
        e = clamp( e, 0.0, 1.0 );
        float rachis = 1.0 - smoothstep( 0.0, 0.1, e );
        float barb = 0.62 + 0.38 * sin( ( t * 1.6 - e * ( vFeather.y >= 0.0 ? 0.55 : -0.55 ) ) * 120.0 );
        float vane = 1.0 - smoothstep( 0.55, 1.0, e );
        float shimmer = 0.85 + 0.15 * sin( uWingT * 4.0 - t * 9.0 );
        float tip = smoothstep( 0.7, 1.0, t ) * 0.6;
        diffuseColor.rgb *= ( vane * ( 0.45 + 0.45 * barb ) * shimmer + rachis * 1.1 + tip * vane ) * ( 0.35 + 0.65 * smoothstep( 0.0, 0.12, t ) );
      }`);
  };
  mat.customProgramCacheKey = () => 'wingFeather1';
  const root = new THREE.Group();
  root.name = 'lightWings';
  const L = new THREE.Group(), R = new THREE.Group();
  L.add(makeWing(1, mat)); R.add(makeWing(-1, mat));
  L.position.set(0.07, 0, 0); R.position.set(-0.07, 0, 0);
  root.add(L, R);
  root.visible = false;
  let open = 0, target = 0, t = 0, unfold = 0;
  // soft glow ribbons from the two longest feather tips while the wings are spread
  const trails = [null, null], tips = [L, R], _tip = new THREE.Vector3();
  const stopTrails = () => { for (let i = 0; i < 2; i++) if (trails[i]) { trails[i].stop?.(); trails[i] = null; } };
  return {
    root, mat,
    get open() { return open; },
    set(on) { if (on && target === 0) unfold = 0; target = on ? 1 : 0; },
    /** bank: -1..1 (roll the wings), lift: 0..1 (strong updraft spreads them) */
    update(dt, bank = 0, lift = 0, bright = 1) {
      open = damp(open, target, target ? 7 : 9, dt);
      unfold = Math.min(1, unfold + dt * 2.6);
      t += dt;
      WING_T.value = t;
      root.visible = open > 0.02;
      if (!root.visible || target === 0 || open < 0.6) stopTrails();
      if (!root.visible) return;
      const k = target ? easeOutBack(unfold) * open : open;
      const flap = Math.sin(t * 3.1) * 0.12 * (1 - lift * 0.6);
      // folded: blades swept back and down along the spine; open: spread sideways
      const spread = 0.15 + 1.05 * k + lift * 0.15;
      // rotation.y > 0 swings the left wing's tip (+X) backward (-Z); mirrored for the right wing
      L.rotation.set(0.25 - 0.2 * k, (1.35 - spread) + 0.38 * k + flap, 0.25 * (1 - k) + bank * 0.25);
      R.rotation.set(0.25 - 0.2 * k, -(1.35 - spread) - 0.38 * k - flap, -0.25 * (1 - k) + bank * 0.25);
      const s = 0.35 + 0.65 * k;
      L.scale.setScalar(s); R.scale.setScalar(s);
      mat.opacity = clamp(open * bright * (0.85 + 0.15 * Math.sin(t * 7)));
      if (target && open >= 0.6) {
        for (let i = 0; i < 2; i++) {
          if (!trails[i]) trails[i] = G.fx?.trail?.({ color: 0xffe2a0, color2: 0x8fe8ff, width: 0.07, life: 0.55, style: 'glow', intensity: 0.55 + 0.6 * bright }) || null;
          if (!trails[i]) continue;
          tips[i].updateMatrixWorld();
          trails[i].push(tips[i].localToWorld(_tip.set(i ? -1.12 : 1.12, 0.42, -0.04)));
        }
      }
    },
    stopTrails,
  };
}
