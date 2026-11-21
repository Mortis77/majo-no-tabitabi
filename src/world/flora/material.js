// Flora materials: MeshToonMaterial patched for instanced vegetation, then hookMaterial()'d so the shared lighting
// model (veilhook: wrapped terminator + cel band, coloured shadow, rim, translucency, surface detail) applies.
//  * per-instance attributes: aCol0 (tint colour, linear), aCol1 (land multiplier), aFx (glow, hue, phase, crown 0..1)
//  * wind in the vertex shader: whole-plant sway growing with height², gusts that travel across the land along the wind,
//    per-clump lag and leaf flutter for foliage cards; small plants bend away from the heroine (fPush);
//  * FLORA_BILL: camera-facing foliage cards (position = card centre, aCard = corner / size / spin) — crowns made of many
//    soft painted cards with spherical normals read as a few lit masses (the soft-volume tree look);
//  * FLORA_TEX: painted atlas (R shade, G tint mask -> instance tint or the part's second colour, B glow mask, A cover),
//    alpha kept through the mips and alpha-to-coverage on MSAA tiers;
//  * FLORA_MIX: per-vertex blend toward a second colour (moss / lichen / snow caps on rocks, snow on boughs);
//  * dithered distance fade (near models fade out while the far cards fade in: no chunk pop);
//  * crown collapse (burnt-out trees keep only the charred trunk); emissive glow (night palette, tips / caps / crystals).
// A matching MeshDepthMaterial carries the same vertex code so shadows sway, face the light and lose their crowns too.
import * as THREE from 'three';
import { canopyPigment, crownPlane } from './canopyBrush.js';
import { toonGradient, hookMaterial } from '../../core/mats.js';

/** Uniforms shared by every flora material (updated once per frame by flora.js). */
export const FU = {
  fTime: { value: 0 },
  fWind: { value: new THREE.Vector3(2, 0, 0) },
  fPush: { value: new THREE.Vector4(0, -999, 0, 1.4) },
  fCam: { value: new THREE.Vector4(0, 0, 0, 0) },
};

export const PALETTE_GLSL = /* glsl */`
vec3 fPal(float h) {
  vec3 c0 = vec3(0.0, 0.36, 1.0);  // cyan (linear: minor channels low and luminance ~ the pink / violet ones, so it stays vivid after tone mapping)
  vec3 c1 = vec3(0.0, 0.5, 0.3);    // teal
  vec3 c2 = vec3(0.36, 0.12, 1.0);  // violet
  vec3 c3 = vec3(1.0, 0.12, 0.55);  // pink
  vec3 c4 = vec3(1.0, 0.3, 0.02);   // ember
  h = clamp(h, 0.0, 1.0) * 4.0;
  if (h < 1.0) return mix(c0, c1, h);
  if (h < 2.0) return mix(c1, c2, h - 1.0);
  if (h < 3.0) return mix(c2, c3, h - 2.0);
  return mix(c3, c4, h - 3.0);
}
`;
/** Same palette on the CPU (linear RGB), for tinting caps / crystals to match their glow. */
const PAL = [[0.0, 0.36, 1.0], [0.0, 0.5, 0.3], [0.36, 0.12, 1.0], [1.0, 0.12, 0.55], [1.0, 0.3, 0.02]];
export function palette(h, out) {
  h = Math.min(1, Math.max(0, h)) * 4;
  const i = Math.min(3, Math.floor(h)), f = h - i, a = PAL[i], b = PAL[i + 1];
  out[0] = a[0] + (b[0] - a[0]) * f; out[1] = a[1] + (b[1] - a[1]) * f; out[2] = a[2] + (b[2] - a[2]) * f;
  return out;
}

const VERT_PARS = /* glsl */`
#ifdef FLORA_PAINTED_CROWN
${crownPlane}
#endif
#ifdef USE_INSTANCING
attribute vec3 aCol0;
attribute vec3 aCol1;
attribute vec4 aFx;
#endif
#ifdef FLORA_LEAF
attribute vec4 aLeaf;   // clump centre (model space), phase
#endif
#ifdef FLORA_BILL
attribute vec4 aCard;   // corner x, corner y (-0.5..0.5), card size (m), spin
#endif
#ifdef FLORA_MIX
attribute float aMix;
#endif
uniform float fTime;
uniform vec3 fWind;
uniform vec4 fPush;
uniform vec4 fCam;    // camera position (fades)
uniform vec4 fPart;   // height, flex (m per m/s at the top), crown centre y, crown flag
uniform vec4 fLook;   // tint flag, glow strength, tip lo, tip hi
uniform vec4 fFade;   // fade start, fade end, mode (+1 fade out, -1 fade in, 0 none), glow floor
uniform vec4 fMix;    // second colour (linear), w = 1: second colour is the instance tint instead
uniform vec3 fCol2;   // texture second colour (stems, flower centres), multiplied by the land factor
uniform vec4 fCrown;  // crown centre (model space), w = 1: billboard cards take the crown-volume normal / shade
uniform vec3 fCrownR; // 1 / crown radii (model space)
uniform vec3 fCore;   // revision: tint of the shaded crown core (cool green-blue for leaves, dusty mauve for blossom)
varying vec3 vFCol;
varying vec3 vFCol2;
varying vec3 vFGlow;
varying float vFFade;
${PALETTE_GLSL}
float fHash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
`;
const VERT_MAIN = /* glsl */`
vFCol = vec3(1.0);
vFCol2 = fCol2;
vFGlow = vec3(0.0);
vFFade = 1.0;
#ifdef USE_INSTANCING
{
  float hN = clamp(position.y / fPart.x, 0.0, 1.4);
  vec3 io = instanceMatrix[3].xyz;
  if (fPart.w > 0.5) transformed = mix(vec3(0.0, fPart.z, 0.0), transformed, aFx.w);
  if (fPart.y > 0.0) {
    float ph = aFx.z * 6.2832 + fTime * 1.25 + dot(io.xz, vec2(0.071, 0.053));
    float wl = length(fWind);
    vec2 wd = fWind.xz / max(wl, 0.01);
    // gusts: bands of stronger wind travelling downwind across the land
    float gu = 0.5 + 0.5 * sin(dot(io.xz, wd) * 0.045 - fTime * 1.6);
    gu *= 0.65 + 0.35 * sin(dot(io.xz, vec2(-wd.y, wd.x)) * 0.027 + fTime * 0.21);
    float gust = 0.5 + 1.25 * gu * gu;
    vec3 w = fWind * gust * (0.72 + 0.3 * sin(ph) + 0.1 * sin(ph * 2.3 + 1.0));
    w += vec3(sin(ph * 1.7), 0.0, cos(ph * 1.3)) * (0.3 + 0.15 * wl);
    vec3 dp = io - fPush.xyz; dp.y = 0.0;
    float dl = length(dp);
    w += dp / max(dl, 0.001) * 16.0 * (1.0 - smoothstep(fPush.w * 0.35, fPush.w, dl)) * (1.0 - step(2.5, fPart.x));
    vec3 d = w * (fPart.y * hN * hN);
    float fl = sin(fTime * 5.3 + position.x * 3.1 + position.z * 2.3 + aFx.z * 20.0);
    d += vec3(fl, 0.0, cos(fTime * 4.4 + position.y * 2.7 + aFx.z * 13.0)) * (0.1 * fPart.y * hN);
#ifdef FLORA_LEAF
    // clumps lag behind the crown and bob on their own; leaves flutter
    float cp = aLeaf.w * 6.2832 + fTime * (1.6 + 0.5 * gu) + dot(io.xz, wd) * 0.05;
    vec3 lag = vec3(sin(cp), 0.35 * sin(cp * 1.37 + 2.0), cos(cp * 0.83)) * (0.25 + 0.6 * gust) * (0.4 + 0.12 * wl);
    d += lag * fPart.y * (0.6 + hN) * 2.2;
    d += vec3(sin(fTime * 9.0 + aLeaf.w * 40.0 + position.y), 0.0, cos(fTime * 7.7 + aLeaf.w * 31.0)) * (0.03 + 0.02 * wl) * gust;
#endif
    mat3 im = mat3(instanceMatrix);
    float s2 = max(dot(im[0], im[0]), 1e-4);
    transformed += (transpose(im) * d) / s2;
  }
  vFCol = fLook.x > 0.5 ? aCol0 : aCol1;
#ifdef FLORA_LEAF
  if (fLook.x > 0.5) {
    // round 2: every clump drifts in hue (+-14 deg about the grey axis) and value, so a crown is a range of
    // neighbouring colours (crimson / scarlet / orange in a maple, yellow- and blue-greens in a broadleaf)
    float hr = fract(aLeaf.w * 7.31 + aFx.z * 3.7) - 0.5;
    float th = hr * 0.5, ct = cos(th), st = sin(th);
    vec3 kx = vec3(0.57735);
    vec3 c = vFCol;
    vFCol = max(c * ct + cross(kx, c) * st + kx * dot(kx, c) * (1.0 - ct), vec3(0.0));
    vFCol *= 0.92 + 0.16 * fract(aLeaf.w * 13.7 + aFx.z * 5.1);
  }
#endif
  vFCol2 = fCol2 * aCol1;
  float tipM = 1.0;
  if (fLook.w > fLook.z) tipM = max(fFade.w, smoothstep(fLook.z, fLook.w, hN) * step(0.45, fHash3(floor(position * 3.0))));
#ifdef FLORA_MIX
  vec3 mixC = fMix.w > 0.5 ? aCol0 : fMix.rgb * aCol1;
  vFCol = mix(vFCol, mixC, aMix);
  tipM *= 1.0 - aMix * (1.0 - fMix.w);
#endif
  vFGlow = fPal(aFx.y) * (aFx.x * fLook.y * tipM);
  if (fFade.z != 0.0 && fFade.y > fFade.x) {
    float dc = length(io - fCam.xyz);
    float k = smoothstep(fFade.x, fFade.y, dc);
    vFFade = fFade.z > 0.0 ? 1.0 - k : k;
  }
}
#endif
`;
// after project_vertex: expand camera-facing cards in view space
const VERT_BILL = /* glsl */`
#if defined(FLORA_BILL) && defined(USE_INSTANCING)
{
  float sc = length(instanceMatrix[0].xyz) * aCard.z * (fPart.w > 0.5 ? aFx.w : 1.0);
  float cr = cos(aCard.w), sr = sin(aCard.w);
  mvPosition.xy += vec2(aCard.x * cr - aCard.y * sr, aCard.x * sr + aCard.y * cr) * sc;
  gl_Position = projectionMatrix * mvPosition;
}
#endif
`;
// look round: the crown as ONE soft volume. Each card corner takes the normal of the crown ellipsoid at that corner
// (with a little of the card's own normal), and a shade from how deep it sits in the crown: lit side, a darker and
// cooler core, a soft rim. Neighbouring cards share one smooth light field, so the crown shows a few broad tone steps
// and one clean terminator instead of every card flickering on its own.
const VERT_CROWN = /* glsl */`
#if defined(FLORA_BILL) && defined(FLORA_LEAF) && defined(USE_INSTANCING)
if (fCrown.w > 0.5) {
  float scC = length(instanceMatrix[0].xyz) * aCard.z * (fPart.w > 0.5 ? aFx.w : 1.0);
  float crC = cos(aCard.w), srC = sin(aCard.w);
  vec2 ovC = vec2(aCard.x * crC - aCard.y * srC, aCard.x * srC + aCard.y * crC) * scC;
  vec3 owC = transpose(mat3(viewMatrix)) * vec3(ovC, 0.0);
  mat3 imC = mat3(instanceMatrix);
  vec3 oiC = (transpose(imC) * owC) / max(dot(imC[0], imC[0]), 1e-4);
  vec3 relC = (transformed + oiC - fCrown.xyz) * fCrownR;
  float rlC = length(relC);
  vec3 nC = normalize(relC * fCrownR + vec3(0.0, 1e-4, 0.0));
  nC = normalize(nC * 0.86 + normalize(objectNormal + vec3(0.0, 1e-4, 0.0)) * 0.14 + vec3(0.0, 0.1, 0.0));
  vNormal = normalize(normalMatrix * (imC * nC));
#ifdef USE_COLOR
  vec3 hueC = vColor.rgb / max(vColor.g, 1e-3);
  float outC = smoothstep(0.25, 1.05, rlC);
  float upC = clamp(relC.y / max(rlC, 1e-3) * 0.5 + 0.5, 0.0, 1.0);
  // revision: a clear lit top and a shaded underside (three soft value steps across the crown even in flat light)
  float upS = smoothstep(0.18, 0.82, upC);
  // and every leaf clump its own lit top and shaded underside (clump centre aLeaf.xyz), so even a crown seen only from
  // below, or one lit by a low sun, shows two or three value steps per mass instead of one flat colour
  vec3 rkC = transformed + oiC - aLeaf.xyz;
  float upK = smoothstep(0.3, 0.74, clamp(rkC.y / max(length(rkC), 1e-3) * 0.5 + 0.5, 0.0, 1.0));
  float aoC = mix(0.6, 1.0, outC) * (0.7 + 0.34 * upS) * (0.6 + 0.55 * upK);
#ifdef FLORA_PAINTED_CROWN
  vColor.rgb = crownPlane((aLeaf.xyz-fCrown.xyz)*fCrownR,hueC,fCore);
#else
  vColor.rgb = hueC * aoC * mix(fCore, vec3(1.0), outC * (0.55 + 0.45 * upS));
#endif
#endif
}
#endif
`;
const VERT_BILL_WP = /* glsl */`
// round 2: a billboard card looks its shadow up at its CENTRE (worldPosition is not moved to the expanded corner), so
// each card takes one soft shadow value: painted dapples instead of straight shadow-map edges / diagonal bands
// running across the camera-facing cards.
#if defined(FLORA_LEAF) && defined(USE_SHADOWMAP)
// foliage receives its own shadow from a little outside the crown surface: no acne bands, soft dapples
worldPosition.xyz += normalize(transpose(mat3(viewMatrix)) * transformedNormal + vec3(0.0, 1e-4, 0.0)) * 0.45;
#endif
`;

const FRAG_PARS = /* glsl */`
#ifdef FLORA_PAINTED_CROWN
${canopyPigment}
#endif
varying vec3 vFCol;
varying vec3 vFCol2;
varying vec3 vFGlow;
varying float vFFade;
uniform vec4 fFade;
uniform vec4 fLook2;   // fresnel glow, inner glow, glow follows shade, glow desaturation
uniform float fFill;   // light through the petals: shaded blossom keeps its own warm colour (0 = off)
float fGlowM = 1.0;
`;
// distance fades. MSAA tiers: coverage (alpha-to-coverage), so a fading tree goes see-through in clean sub-sample
// steps instead of a screen-door of discarded pixels; mode |z| = 2 is an OVERLAP cross-fade (each side reaches full
// cover at the middle of the band, so the near model and its stand-in never leave a gap). 'low': ordered dither.
const FRAG_FADE = /* glsl */`
#ifndef ALPHA_TO_COVERAGE
if (vFFade < 0.999) {
  float dz = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (fFade.z < 0.0) dz = 1.0 - dz;
  if (dz > vFFade) discard;
}
#endif
`;
const FRAG_FADE_A2C = /* glsl */`
#ifdef ALPHA_TO_COVERAGE
if (vFFade < 0.999) {
  float fA = abs(fFade.z) > 1.5 ? clamp(vFFade * 2.0, 0.0, 1.0) : vFFade;
  diffuseColor.a *= fA;
  if (diffuseColor.a <= 0.004) discard;
}
#endif
`;
// painted atlas: R shade, G tint mask, B glow mask, A coverage (kept through the mips)
const FRAG_MAP = /* glsl */`
#ifdef USE_MAP
{
  vec4 fTx = texture2D(map, vMapUv);
  // look round: the atlas mips keep their coverage (atlas.js coverageMips), so no distance boost here
  float a = fTx.a;
  diffuseColor.a *= a;
#ifdef FLORA_TEX
#ifdef FLORA_PAINTED_CROWN
  diffuseColor.rgb *= mix(vFCol2, vFCol, fTx.g) * canopyPigment(fTx.r);
#else
  diffuseColor.rgb *= mix(vFCol2, vFCol, fTx.g) * (0.25 + 1.0 * fTx.r);
#endif
  fGlowM = fTx.b * 0.85 + 0.15;
#else
  diffuseColor.rgb *= vec3(dot(fTx.rgb, vec3(0.3, 0.59, 0.11))) * 2.4 * vFCol;
#endif
}
#else
  diffuseColor.rgb *= vFCol;
#endif
`;
// revision: fLook2.z > 0 makes the glow follow the painted vertex shade (bright crown of a cap falling off to a dim rim,
// soft fins), fLook2.w pulls the glow colour toward its own grey (calmer, light-like rather than paint-like)
const FRAG_EMIT = /* glsl */`
{
  vec3 fGc = vFGlow * fGlowM;
  float fDs = fLook2.w;
#ifdef USE_COLOR
  if (fLook2.z > 0.0) {
    // bright, paler crown falling off to a deeper, dimmer rim
    float fSh = clamp(vColor.g, 0.0, 1.2);
    fGc *= mix(1.0, fSh * fSh * fSh * 1.45, fLook2.z);
    fDs *= 0.75 + 0.4 * fSh;
  }
#endif
  if (fDs > 0.0) fGc = mix(fGc, vec3(dot(fGc, vec3(0.2126, 0.7152, 0.0722))), clamp(fDs, 0.0, 1.0));
  totalEmissiveRadiance += fGc;
  totalEmissiveRadiance += diffuseColor.rgb * (fFill * clamp(mvDay, 0.0, 1.0)); // daylight only (veilhook mvDay)
}
#ifdef FLORA_FRES
{
  vec3 fV = normalize(vViewPosition);
  float ndv = clamp(abs(dot(normal, fV)), 0.0, 1.0);
  float fr = pow(1.0 - ndv, 3.0);
  vec3 fGf = vFGlow;
  if (fLook2.w > 0.0) fGf = mix(fGf, vec3(dot(fGf, vec3(0.2126, 0.7152, 0.0722))), fLook2.w);
  totalEmissiveRadiance += (fGf + vFCol * 0.08) * (fLook2.x * fr + fLook2.y * ndv * ndv);
}
#endif
`;

function patchVertex(sh, U, colour = false) {
  Object.assign(sh.uniforms, FU, U);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n' + VERT_PARS)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MAIN)
    .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_BILL + (colour ? VERT_CROWN : ''));
  if (sh.vertexShader.includes('#include <shadowmap_vertex>')) sh.vertexShader = sh.vertexShader.replace('#include <shadowmap_vertex>', VERT_BILL_WP + '#include <shadowmap_vertex>');
}

/** Default tint of a crown's shaded core (cool); blossom parts pass `core` (dusty mauve). Shared with impostor.js. */
export const CORE_LEAF = [0.8, 0.88, 1.05];

let _msaa = null;
/** True when the scene target is multisampled (alpha-to-coverage works); false on 'low' (FXAA). */
function msaa(G) {
  if (_msaa === null) _msaa = !!(G?.quality && G.quality.name !== 'low');
  return _msaa;
}

/**
 * Lit flora material for one model part.
 * opts: { height, flex, crownY, crown, tint, glow, tipLo, tipHi, map, alphaTest, side,
 *         leaf, bill, tex, mix: [r,g,b,useTint], col2: [r,g,b], fres: [k, inner], surface, look, glowFloor, G,
 *         core: [r,g,b] crown core tint, glowShade: 0..1 glow follows the vertex shade, glowDesat: 0..1,
 *         fill: light-through-petals fill (fraction of the albedo added as emission) }
 */
export function makeFloraMaterial(opts) {
  // look round: every flora part uses coverage on MSAA tiers (clean edges and coverage fades); 'low' keeps alpha test + dither
  const a2c = msaa(opts.G);
  const m = new THREE.MeshToonMaterial({
    color: 0xffffff, gradientMap: toonGradient(), vertexColors: true,
    map: opts.map || null, alphaTest: opts.map ? (opts.alphaTest || (opts.tex ? 0.42 : 0.5)) : 0, side: opts.side ?? THREE.FrontSide,
  });
  m.alphaToCoverage = a2c;
  m.name = 'flora';
  const defs = {};
  if (opts.leaf) defs.FLORA_LEAF = '';
  if (opts.bill) defs.FLORA_BILL = '';
  if (opts.tex) defs.FLORA_TEX = '';
  if (opts.paintedCrown) defs.FLORA_PAINTED_CROWN = '';
  if (opts.mix) defs.FLORA_MIX = '';
  if (opts.fres) defs.FLORA_FRES = '';
  m.defines = { ...defs };
  const mx = opts.mix || [1, 1, 1, 0], c2 = opts.col2 || [0.3, 0.45, 0.2];
  const U = {
    fPart: { value: new THREE.Vector4(Math.max(0.2, opts.height || 1), opts.flex || 0, opts.crownY || 0, opts.crown ? 1 : 0) },
    fLook: { value: new THREE.Vector4(opts.tint ? 1 : 0, opts.glow || 0, opts.tipLo ?? 0, opts.tipHi ?? 0) },
    fLook2: { value: new THREE.Vector4(opts.fres ? opts.fres[0] : 0, opts.fres ? opts.fres[1] : 0, opts.glowShade || 0, opts.glowDesat || 0) },
    fCore: { value: new THREE.Vector3(...(opts.core || CORE_LEAF)) },
    fFill: { value: opts.fill || 0 },
    fFade: { value: new THREE.Vector4(0, 0, 0, opts.glowFloor || 0) },
    fMix: { value: new THREE.Vector4(mx[0], mx[1], mx[2], mx[3] || 0) },
    fCol2: { value: new THREE.Vector3(c2[0], c2[1], c2[2]) },
    fCrown: { value: new THREE.Vector4(...(opts.crownC || [0, 0, 0]), opts.bill && opts.crownC && opts.leaf ? 1 : 0) },
    fCrownR: { value: new THREE.Vector3(...(opts.crownR || [1, 1, 1]).map((r) => 1 / Math.max(0.05, r))) },
  };
  m.userData.fU = U;
  if (opts.surface) m.userData.surface = opts.surface;
  else m.userData.surface = 'none';
  if (opts.look) m.userData.look = opts.look;
  m.onBeforeCompile = (sh) => {
    patchVertex(sh, U, true);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + FRAG_FADE)
      .replace('#include <map_fragment>', FRAG_MAP)
      .replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\n' + FRAG_FADE_A2C)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_EMIT);
  };
  m.customProgramCacheKey = () => 'mvFlora4';
  hookMaterial(m);
  // shadow caster with the same sway / crown collapse / cards facing the light
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: opts.map || null, alphaTest: opts.map ? 0.5 : 0 });
  d.defines = { ...defs };
  delete d.defines.FLORA_FRES;
  d.onBeforeCompile = (sh) => { patchVertex(sh, U); };
  d.customProgramCacheKey = () => 'mvFloraDepth2';
  m.userData.depth = d;
  return m;
}
