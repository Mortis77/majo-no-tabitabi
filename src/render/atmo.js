// Atmosphere palette + shared uniforms + shared GLSL for the whole render pipeline.
// One function of the Veil value v (0 = sunlit morning .. 1 = deep night) gives every colour: sky, fog, sun tint,
// moonlit ambient, clouds. It is baked into a small half-float texture so shaders can evaluate it PER FRAGMENT at the
// fragment's own world position (the land under the Moon is dark even when seen from the sunlit meadow), and the same
// numbers are evaluated on the CPU for the camera position (lights, scene.fog for unhooked materials, grading).
import * as THREE from 'three';
import { CLEAR_CLOUD_BASE } from './cloud-layer.js';
import { VEIL, SUN_DIR, SUN_ANGULAR_RADIUS, MOON_ANGULAR_RADIUS } from '../world/veil.js';

// ---- palette keys (sRGB hex; converted to linear on bake) -----------------------------------------------------------
// v:            sunlit       early dusk    deep dusk     night
const KEYS = [0, 0.38, 0.72, 1];
const ROWS = {
  skyZen:   { c: [0x267dcb, 0x546bad, 0x2e2a6c, 0x060a26], k: [1.05, 0.95, 0.7, 0.62] },
  skyHor:   { c: [0xc1dfee, 0xf4c79f, 0xe58a84, 0x1a2452], k: [1.15, 1.1, 0.85, 0.62] },
  fog:      { c: [0xc4dcec, 0xf3c39a, 0xb07a96, 0x17204a], k: [1.05, 1.0, 0.75, 0.6] },
  // look round: a warmer key, and a much weaker sky fill (was k 1.25 / 1.3 / 1.9 / 3.2): the Sun (by day) and the Moon
  // key + lanterns (at night) shape the forms, the sky only fills the shade
  sunTint:  { c: [0xfff5eb, 0xffdfb7, 0xffc397, 0xff9a58], k: [1, 1, 1, 1] },
  // Sky and ground fill are less saturated than the painted horizon; the moon and lanterns still set the direction by night.
  hemiSky:  { c: [0xe0e9fa, 0xcbbddc, 0xa69ac5, 0x9caad5], k: [0.92, 0.94, 0.96, 0.41] },
  hemiGnd:  { c: [0xa79b8c, 0x947464, 0x66566f, 0x414964], k: [1.0, 1.0, 1.2, 1.0] },
  cloudLit: { c: [0xffffff, 0xffd6a8, 0xffa08e, 0x34447e], k: [1.25, 1.2, 0.95, 0.5] },
  cloudSh:  { c: [0x8faed1, 0x9d8cb5, 0x5e4682, 0x0e1430], k: [1.0, 0.95, 0.8, 0.5] },
  // look (v-look): multiplier on the ambient where the Sun does not reach -> coloured shadows (linear RGB, ~unit luminance):
  // clear blue in the meadow, violet-rose at dusk, deep indigo with a hint of teal at night
  shadowTint: { lin: [[0.83, 0.93, 1.12], [0.94, 0.87, 1.10], [1.0, 0.86, 1.15], [0.82, 0.94, 1.19]] },
  // light the sunlit ground throws back up onto down- and side-facing surfaces (x the local sun colour)
  // night key: the cool light of the Moon wheel (look round), x the cel band, from the wheel's direction
  moonKey:  { c: [0x000000, 0x000000, 0x6c74c4, 0x86a2ff], k: [0, 0, 0.4, 0.64] },
  bounce:   { lin: [[0.32, 0.27, 0.23], [0.38, 0.28, 0.23], [0.31, 0.22, 0.23], [0.08, 0.1, 0.16]] },
};
// scalar row: exposure, fog density (per km), bloom threshold, bloom strength
// HDR budget (fix-render): the night used to be lifted by a camera exposure of 1.5, which amplified every emissive /
// additive source (glow plants, spell fx, the ring) by 1.5 as well and blew bloom into a white sheet. The lift now lives
// in the LIGHT and SKY colours (LIFT below, folded into the rows), so lit surfaces look exactly as before while emissive
// stays at its authored value; the camera exposure keeps only a gentle 1.15 at night.
// Bloom thresholds are soft-knee thresholds now (post.js), so strengths are higher than with the old hard cut.
const SCALARS = [
  [1.0, 0.42, 1.9, 0.42],
  [1.0, 0.55, 1.6, 0.48],
  [1.0, 0.7, 1.1, 0.55],
  [1.15, 0.62, 1.0, 0.6],
];
const LIFT = [1, 1, 1.12, 1.5 / 1.15]; // old exposure / new exposure per key: folded into the lit / sky colour rows
for (const n of ['skyZen', 'skyHor', 'fog', 'sunTint', 'hemiSky', 'hemiGnd', 'cloudLit', 'cloudSh']) ROWS[n].k = ROWS[n].k.map((k, i) => k * LIFT[i]);
/** Night lift folded into the lights (shaders that light things with their own constants can multiply by it). */
export const nightLift = (v) => { const [i, t] = seg(v); return LIFT[i] + (LIFT[i + 1] - LIFT[i]) * t; };
const ROW_NAMES = Object.keys(ROWS); // texture row index = position here; scalar row = ROW_NAMES.length
const NROWS = 16, NCOLS = 64;

const _lin = (hex) => new THREE.Color().setHex(hex); // ColorManagement converts sRGB hex -> linear working space

const smooth = (t) => t * t * (3 - 2 * t);
function seg(v) {
  v = v < 0 ? 0 : v > 1 ? 1 : v;
  let i = 0;
  while (i < KEYS.length - 2 && v > KEYS[i + 1]) i++;
  return [i, smooth((v - KEYS[i]) / (KEYS[i + 1] - KEYS[i]))];
}
const ROWLIN = {};
for (const n of ROW_NAMES) ROWLIN[n] = ROWS[n].lin ? ROWS[n].lin.map((a) => new THREE.Color(a[0], a[1], a[2])) : ROWS[n].c.map((h, i) => _lin(h).multiplyScalar(ROWS[n].k[i]));

/** Palette colour `name` at veil v -> out (linear, HDR). */
export function pal(name, v, out = new THREE.Color()) {
  const [i, t] = seg(v);
  const a = ROWLIN[name][i], b = ROWLIN[name][i + 1];
  return out.setRGB(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
}
/** Scalars at veil v: { exposure, fogDensity (per metre), bloomThreshold, bloomStrength }. */
export function palScalars(v, out = {}) {
  const [i, t] = seg(v);
  const a = SCALARS[i], b = SCALARS[i + 1];
  const f = (k) => a[k] + (b[k] - a[k]) * t;
  out.exposure = f(0); out.fogDensity = f(1) / 1000; out.bloomThreshold = f(2); out.bloomStrength = f(3);
  return out;
}

/** Same as veil.js daylightAt, from a veil value. */
export const daylightFromVeil = (v) => Math.min(1, Math.max(0.02, 1 - v * v * (3 - 2 * v) * 0.98));

function bakePalette() {
  const data = new Uint16Array(NCOLS * NROWS * 4);
  const c = new THREE.Color(), s = {};
  for (let x = 0; x < NCOLS; x++) {
    const v = x / (NCOLS - 1);
    ROW_NAMES.forEach((n, r) => {
      pal(n, v, c);
      const o = (r * NCOLS + x) * 4;
      data[o] = THREE.DataUtils.toHalfFloat(c.r); data[o + 1] = THREE.DataUtils.toHalfFloat(c.g);
      data[o + 2] = THREE.DataUtils.toHalfFloat(c.b); data[o + 3] = THREE.DataUtils.toHalfFloat(1);
    });
    palScalars(v, s);
    const o = (ROW_NAMES.length * NCOLS + x) * 4;
    [s.exposure, s.fogDensity * 1000, s.bloomThreshold, s.bloomStrength].forEach((val, k) => { data[o + k] = THREE.DataUtils.toHalfFloat(val); });
  }
  const tex = new THREE.DataTexture(data, NCOLS, NROWS, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Lamp map layout (world/sky.js bakes it, veilhook.js reads it). */
export const LAMP_RES = 128, LAMP_CELL = 1;
// ---- shared uniforms (the SAME objects are plugged into every hooked material, the sky and the post passes) ----------
export const U = {
  mvPal: { value: bakePalette() },
  mvVeil: { value: new THREE.Vector4(VEIL.x, VEIL.z, VEIL.inner, VEIL.outer) },
  mvSunDir: { value: SUN_DIR.clone() },
  mvCamVeil: { value: 0 },
  mvSunCam: { value: new THREE.Color(1, 1, 1) },     // sun colour*daylight at the camera (what G.lights.sun carries)
  mvHemiMul: { value: 1 },                             // G.lights.hemi.intensity relative to nominal (cutscene dimming)
  mvSunMul: { value: 1 },                              // G.lights.sun.intensity relative to nominal
  mvRingCol: { value: new THREE.Color(0xffc062) },
  mvRingK: { value: 0 },                               // ring brightness as seen from the camera (0 by day)
  mvRingBoost: { value: 1 },
  mvFogCam: { value: new THREE.Color() },
  mvFogDensity: { value: 0.0005 },
  mvFogFalloff: { value: 0.0042 },                     // height falloff (1/m)
  mvFogBase: { value: 0 },
  mvSunVis: { value: 1 },                              // visible fraction of the Sun disc from the camera
  mvTime: { value: 0 },
  mvFlash: { value: new THREE.Color(0, 0, 0) },
  // look (v-look)
  mvSurf: { value: null },                             // surface-detail library (render/surfaces.js), set by the hook
  mvNoise: { value: null },                            // shared 4-octave noise (render/noise.js)
  mvCloud: { value: new THREE.Vector4(.52, CLEAR_CLOUD_BASE, .84, 0) }, // cover threshold, base, shadow strength, mirror
  mvQ: { value: new THREE.Vector4(1, 1, 1, 0) },       // detail on, fine scale on, cloud shadows on, debug view
  mvContact: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, -1e4, 0, 0)) }, // contact shadows: feet xyz + radius
  // lamp pools (light r3): EVERY glowing lantern near the view lights the ground and walls around it, through one
  // small camera-centred map (LAMP_RES^2 texels of LAMP_CELL m): rgb = summed pool colour on the ground plane,
  // a = sum of (pool luminance x lantern height) so the shader recovers the lamp height. Baked by world/sky.js.
  mvLampMap: { value: makeLampMap() },
  mvLampBox: { value: new THREE.Vector4(0, 0, 1 / (LAMP_RES * LAMP_CELL), 0) }, // origin x, origin z, 1 / size (m), night k
};
function makeLampMap() {
  const t = new THREE.DataTexture(new Uint16Array(128 * 128 * 4), 128, 128, THREE.RGBAFormat, THREE.HalfFloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.NoColorSpace; t.name = 'mvLampMap';
  t.needsUpdate = true;
  return t;
}
export const PAL_ROW = Object.fromEntries(ROW_NAMES.map((n, i) => [n, (i + 0.5) / NROWS]));
PAL_ROW.scalars = (ROW_NAMES.length + 0.5) / NROWS;

/** GLSL: palette lookup + veil helpers. Needs the uniforms of U named in it. */
export const GLSL_ATMO = /* glsl */`
uniform sampler2D mvPal;
uniform vec4 mvVeil;
uniform vec3 mvSunDir;
uniform float mvCamVeil;
uniform vec3 mvRingCol;
uniform float mvRingK;
uniform float mvRingBoost;
uniform float mvTime;
#define MV_ROW_SKYZEN ${PAL_ROW.skyZen.toFixed(5)}
#define MV_ROW_SKYHOR ${PAL_ROW.skyHor.toFixed(5)}
#define MV_ROW_FOG ${PAL_ROW.fog.toFixed(5)}
#define MV_ROW_SUN ${PAL_ROW.sunTint.toFixed(5)}
#define MV_ROW_HEMISKY ${PAL_ROW.hemiSky.toFixed(5)}
#define MV_ROW_HEMIGND ${PAL_ROW.hemiGnd.toFixed(5)}
#define MV_ROW_CLOUDLIT ${PAL_ROW.cloudLit.toFixed(5)}
#define MV_ROW_CLOUDSH ${PAL_ROW.cloudSh.toFixed(5)}
#define MV_ROW_SHADOW ${PAL_ROW.shadowTint.toFixed(5)}
#define MV_ROW_BOUNCE ${PAL_ROW.bounce.toFixed(5)}
#define MV_ROW_MOONKEY ${PAL_ROW.moonKey.toFixed(5)}
#define MV_ROW_SCALARS ${PAL_ROW.scalars.toFixed(5)}
vec3 mvPalette(float row, float v) { return texture2D(mvPal, vec2(clamp(v, 0.0, 1.0) * ${((NCOLS - 1) / NCOLS).toFixed(5)} + ${(0.5 / NCOLS).toFixed(5)}, row)).rgb; }
float mvVeilAt(vec2 xz) { return 1.0 - smoothstep(mvVeil.z, mvVeil.w, length(xz - mvVeil.xy)); }
float mvBoostSoft() { return 1.0 + (mvRingBoost - 1.0) * 0.35; }
float mvDaylight(float v) { return clamp(1.0 - v * v * (3.0 - 2.0 * v) * 0.98, 0.02, 1.0); }
`;

// ---- Sun / Moon geometry --------------------------------------------------------------------------------------------
export const RS = SUN_ANGULAR_RADIUS, RM = MOON_ANGULAR_RADIUS;
/** Visible fraction of the Sun disc for an angular separation `d` between Sun and Moon centres. */
export function sunVisibleFraction(d) {
  const r = RS, R = RM;
  if (d >= r + R) return 1;
  if (d <= R - r) return 0;
  const a = r * r * Math.acos((d * d + r * r - R * R) / (2 * d * r)) + R * R * Math.acos((d * d + R * R - r * r) / (2 * d * R))
    - 0.5 * Math.sqrt((-d + r + R) * (d + r - R) * (d - r + R) * (d + r + R));
  return Math.max(0, 1 - a / (Math.PI * r * r));
}
/** Two unit vectors perpendicular to `n` (tangent basis on the sky around a direction). */
export function basisAround(n, u, w) {
  const ref = Math.abs(n.y) < 0.9 ? _up : _x;
  u.crossVectors(ref, n).normalize();
  w.crossVectors(n, u).normalize();
}
const _up = new THREE.Vector3(0, 1, 0), _x = new THREE.Vector3(1, 0, 0);
