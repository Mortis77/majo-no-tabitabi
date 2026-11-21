// Character / creature shading: anime cel material + ink outline (inverted hull).
//
//   makeCelMaterial(src, kind, { shade, headC, sph })  -> CelMaterial (a MeshToonMaterial; clones keep the cel shader)
//   buildOutlines(root, { faceWeight })               -> adds outline SkinnedMeshes (userData.outline = true) under root
//   CEL_U                                              -> shared uniforms (time, viewport height) — updateCelGlobals() per frame
//
// Kinds: 'cloth' | 'skin' | 'face' | 'hair' | 'eye' | 'line' | 'fur' (creatures).  Every CelMaterial still goes through
// hookMaterial(), so the Veil lighting / fog of the shared lighting model applies on top (they only touch light + fog code).
//
// Shading model (per light, in RE_Direct): half-Lambert terminator through a soft-edged smoothstep -> mix(shadeColour, albedo).
// The shade colour is the albedo pushed to a cooler, more saturated tone (MToon shadeColor from the GLB when present).
// Shadow-map visibility is captured (getShadow macro) and folded INTO that ramp, so cast shadows become the same coloured
// shade tone instead of greying the light. Rim light toward each light (sun / ring / lantern), warm SSS band on skin at the
// terminator, Kajiya-style moving "angel ring" on hair, glossy eyes. Face normals are spherised in the vertex shader
// (bind-space, then skinned) so nose and cheeks never cast shadow shards.
import * as THREE from 'three';
import { silverHairPaint } from './hair-shading.js';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { hasWorldLighting } from '../render/veilhook.js';
import { hookMaterial } from '../core/mats.js';
import { U } from '../render/atmo.js';
import { FACE_VERTEX, FACE_PARS } from './face-shading.js';

const KINDS = { cloth: 0, skin: 1, face: 2, hair: 3, eye: 4, line: 5, fur: 6 };

// heroine-look job (docs/api/actors-look.md "Character fixes"): head centre from base positions, soft light-following hair
// band, dark cool hair at dusk / night, brows + lash line through the own fringe, face-line morph names. ?charfix=0 = before.
// Set once per load by core/assets.js (G.charfix); read when materials compile and when characters are converted.
export const CEL_FIX = { on: true, band: null, stock: true, tune: [1, 1, 1, 1, 0.02] };
export function setCelFix(on, band = null) { CEL_FIX.on = !!on; CEL_FIX.band = band; }
// fix round: compile-time tuning (?hairtune=night sheen, day band, band width, see-lines at night [1 = shipped], face tilt [m, 0.02])
const celFixDef = (m) => (CEL_FIX.on && hasWorldLighting(m) ? '\n#define CEL_FIX 1\n#define CEL_TN vec4( ' + CEL_FIX.tune.slice(0, 4).map((x) => (+x).toFixed(4)).join(', ') + ' )' : '');
/** How "black" a hair material is (0..1, from its mean albedo): dark AND not warm. Black / blue-black hair gets the cool
 *  night treatment; dark red, auburn and brown keep their colour (fix round: they turned black-blue). */
export function hairDarkK(m) {
  const c = meanAlbedo(m), l = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
  const warm = (c.r - c.b) / Math.max(Math.max(c.r, c.g, c.b), 1e-3);
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return (1 - ss(0.06, 0.2, l)) * (1 - ss(0.12, 0.35, warm));
}
/** Tags a hair band vector with the material's darkness (uHairB.z = -1 - k when the soft band or no band is used). */
export function hairDarkTag(b, m) {
  const v = b ? b.clone() : new THREE.Vector4(0, 0, 0, 0);
  if (v.z < 0.5) v.z = -1 - hairDarkK(m);
  return v;
}

/** Shared uniforms (same objects in every cel / outline material). */
export const CEL_U = {
  uCelTime: { value: 0 },
  uViewH: { value: 900 },
  uOutW: { value: 1.35 },     // outline width in px at a 900 px tall viewport
  uOutFar: { value: 38 },     // outline gone by this view depth (m)
};
const _sz = new THREE.Vector2();
let _lastT = -1;
/** Called by every actor's update (cheap; once per frame does the work). */
export function updateCelGlobals(G) {
  const t = G?.time?.now ?? G?.time?.t ?? performance.now() / 1000;
  if (t === _lastT) return;
  _lastT = t;
  CEL_U.uCelTime.value = (performance.now() / 1000) % 1000;
  if (G?.renderer) { G.renderer.getDrawingBufferSize(_sz); CEL_U.uViewH.value = Math.max(200, _sz.y); }
  const q = G?.quality?.name;
  CEL_U.uOutFar.value = q === 'low' ? 10 : q === 'med' ? 22 : 38;
}

// ---------------------------------------------------------------------------------------------------------------------
const VERT_PARS = /* glsl */`
uniform vec3 uHeadC;
uniform vec3 uFaceKeyWorld;
varying vec3 vFaceKey;
uniform vec4 uCelV;      // x: normal spherise amount, y: tail wag amount, z: tail root z, w: tail length
uniform float uCelTime;
uniform vec4 uEarL, uEarR;   // fox ears: pivot (bind space) xyz, ear height (0 = no twitch)
varying vec3 vCelObj;
// rotate p about the pivot around axis a by angle t (Rodrigues)
vec3 celRot( vec3 p, vec3 piv, vec3 a, float t ) {
  vec3 d = p - piv; float c = cos( t ), s = sin( t );
  return piv + d * c + cross( a, d ) * s + a * dot( a, d ) * ( 1.0 - c );
}
`;
const VERT_NORMAL = /* glsl */`
#if CEL_KIND == 2 || CEL_KIND == 4 || CEL_KIND == 5
{
  vec3 cd = position - uHeadC;
  cd.z += 0.035;                // centre a little behind -> flatter front
  cd.y *= 0.85;
#ifdef CEL_FIX
  cd.y += CEL_FY;               // fix round: the face keeps a little of its sky-facing tilt (cool shade, blush contrast)
#endif
  float cl = length( cd );
  if ( cl > 1e-4 ) objectNormal = normalize( mix( objectNormal, cd / cl, uCelV.x ) );
}
#endif
`;
const VERT_BEGIN = /* glsl */`
vCelObj = position - uHeadC;
if ( uEarL.w > 0.0 ) {
  // fox ears: an occasional quick flick (each ear on its own beat) and a slow listening sway, pivoting at the ear base
  bool left = position.x - uHeadC.x > 0.0;
  vec4 E = left ? uEarL : uEarR;
  float ft = clamp( ( position.y - E.y ) / E.w, 0.0, 1.0 );
  float ph = modelMatrix[3].x * 0.37 + modelMatrix[3].z * 0.53 + ( left ? 0.0 : 1.7 );
  float tc = mod( uCelTime + ph * 3.1, left ? 4.7 : 6.1 );
  float flick = smoothstep( 0.0, 0.05, tc ) * ( 1.0 - smoothstep( 0.05, 0.32, tc ) );
  float tc2 = mod( uCelTime * 1.0 + ph * 5.3, 11.3 );
  flick += 0.7 * smoothstep( 0.0, 0.05, tc2 ) * ( 1.0 - smoothstep( 0.05, 0.3, tc2 ) );
  float sway = 0.05 * sin( uCelTime * 0.9 + ph );
  float sd = left ? 1.0 : -1.0;
  transformed = celRot( transformed, E.xyz, vec3( 0.0, 0.0, 1.0 ), sd * ( flick * 0.32 + sway ) * ft );
  transformed = celRot( transformed, E.xyz, vec3( 1.0, 0.0, 0.0 ), -flick * 0.12 * ft );
}
#if CEL_KIND == 6
if ( uCelV.y > 0.0 ) {
  // procedural tail: bend sideways, more toward the tip (bind space, before skinning)
  float tl = max( uCelV.w, 1e-3 );
  float ft = clamp( ( uCelV.z - position.z ) / tl, 0.0, 1.0 );
  float ph = modelMatrix[3].x * 0.37 + modelMatrix[3].z * 0.53;
  float wag = sin( uCelTime * 2.3 + ph ) * 0.75 + sin( uCelTime * 3.7 + ph * 1.7 ) * 0.25;
  transformed.x += wag * uCelV.y * ft * ft * tl;
  transformed.y += ( 0.5 + 0.5 * sin( uCelTime * 1.6 + ph ) ) * uCelV.y * 0.35 * ft * ft * tl;
}
#endif
`;

const FRAG_PARS = /* glsl */`
varying vec3 vViewPosition;
varying vec3 vCelObj;
uniform vec3 uShadeTint;
uniform vec4 uCelP;     // x: terminator (half-lambert), y: softness, z: rim, w: shadow weight
uniform vec4 uCelQ;     // x: skin SSS, y: hair spec, z: cloth sheen, w: self light (eyes)
uniform vec4 uSpirit;   // rgb: glow colour, a: amount (0 = normal)
uniform vec4 uHairB;    // crown highlight: x band height above the head centre, y half width, z strand count, w strength
uniform vec4 uCelG;     // x: painterly grain amount, y: back-face (inside of cloth) shade, z: garment flag, w: metres per model unit (creatures)
uniform float uCelTime;
${FACE_PARS}
float mvcSh = 1.0;
float celH3( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float celVN( vec3 x ) {
  vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( celH3( i ), celH3( i + vec3( 1, 0, 0 ) ), f.x ), mix( celH3( i + vec3( 0, 1, 0 ) ), celH3( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( celH3( i + vec3( 0, 0, 1 ) ), celH3( i + vec3( 1, 0, 1 ) ), f.x ), mix( celH3( i + vec3( 0, 1, 1 ) ), celH3( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
// painterly grain: soft vertical brush strokes + fine tooth, fixed to the surface (bind space), fading with distance
float celGrain() {
  vec3 p = vCelObj * ( uCelG.w > 0.0 ? uCelG.w : 1.0 );   // creatures: uCelG.w = metres per model unit
  if ( uCelG.z > 0.5 ) {
    // garments (look round): long soft brush strokes only (no speckle) + a fine weave that only shows close up;
    // the weave fades out by its own screen-space frequency, so it never aliases into shimmer
    float br = celVN( vec3( p.x * 22.0, p.y * 5.0, p.z * 22.0 ) ) - 0.5;
    float wa = ( p.x + p.z ) * 1250.0, wb = p.y * 1250.0;
    float fw = max( fwidth( wa ), fwidth( wb ) );
    float wv = sin( wa ) * sin( wb ) * ( 1.0 - smoothstep( 0.3, 0.9, fw ) );
    // Leather has a pebbled grain rather than crossed threads.
    if (uCelQ.w < 0.0) wv = (celVN(p * 180.0) - 0.5) * (1.0 - smoothstep(0.3, 0.9, fw));
    return br * ( 1.0 - smoothstep( 3.0, 11.0, length( vViewPosition ) ) ) + wv * 0.45;
  }
  float g = celVN( vec3( p.x * 34.0, p.y * 9.0, p.z * 34.0 ) ) * 0.6 + celVN( p * 120.0 ) * 0.4;
  return ( g - 0.5 ) * ( 1.0 - smoothstep( 3.0, 11.0, length( vViewPosition ) ) );
}
float celGr = 0.0;
float celFoldD = 0.0;   // garments: how deep this texel sits in a painted fold (0 = open cloth)
float celLastR = 1.0, celLastLum = 0.0;   // ramp + strength of the last direct light (= the sun: directional lights run last)
struct ToonMaterial { vec3 diffuseColor; };
float celLum( vec3 c ) { return dot( c, vec3( 0.299, 0.587, 0.114 ) ); }
// heroine-look: hair glints only under a strong, near-white light (the day sun); dusk sun and lanterns leave hair dark
float celHairDay( vec3 c ) { float l = celLum( c ); return smoothstep( 0.6, 1.8, l ) * smoothstep( 0.25, 0.08, ( c.r - c.b ) / max( l, 1e-3 ) ); }
// fix round: how black this hair is: per material (uHairB.z = -1 - k, set at load from the mean albedo, so one texture never
// splits into two tones); per texel only for the old zig-zag ring path. Dark red / brown / auburn count as coloured, not black.
float celHairDark( vec3 a ) {
  if ( uHairB.z < -0.5 ) return clamp( -uHairB.z - 1.0, 0.0, 1.0 );
  float l = celLum( a );
  return ( 1.0 - smoothstep( 0.06, 0.2, l ) ) * ( 1.0 - smoothstep( 0.12, 0.35, ( a.r - a.b ) / max( max( a.r, max( a.g, a.b ) ), 1e-3 ) ) );
}
vec3 celShadeCol( vec3 a ) {
  float l = celLum( a );
  if ( uCelG.z > 0.5 ) {
    // garments: light cloth keeps a soft, light blue-grey shade (white never turns grey); strong colours go deeper,
    // and warm reds lean toward crimson in the shade
    vec3 g = max( mix( vec3( l ), a, 1.15 ), vec3( 0.0 ) ) * uShadeTint * mix( 0.9, 1.32, smoothstep( 0.3, 0.85, l ) );
    g.b += g.r * 0.06;
    return g;
  }
  vec3 s = max( mix( vec3( l ), a, 1.3 ), vec3( 0.0 ) );
  return s * uShadeTint;
}
vec3 celSafeN( vec3 v, vec3 fb ) { float l = length( v ); return l > 1e-5 ? v / l : fb; }
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
  vec3 N = geometryNormal, L = directLight.direction, V = geometryViewDir;
  float ndl = dot( N, L );
  float h = ndl * 0.5 + 0.5 + celGr * uCelG.x * 0.9 - celFoldD * 1.1;   // painted folds fall into shade first
  float r = smoothstep( uCelP.x - uCelP.y, uCelP.x + uCelP.y, h );
  float sh = mix( 1.0, smoothstep( 0.2, 0.8, mvcSh ), uCelP.w );
  r *= sh;
  vec3 a = material.diffuseColor;
  float gm = step( 0.5, uCelG.z );
  // garments: warm lit side; the painted folds stay deeper inside the shade
  vec3 col = mix( celShadeCol( a ) * ( 1.0 - celFoldD * 0.7 ), a * mix( vec3( 1.0 ), vec3( 1.035, 1.0, 0.94 ), gm ), r );
  float band = r * ( 1.0 - r ) * 4.0;
  col += a * vec3( 1.0, 0.36, 0.22 ) * band * ( uCelQ.x + gm * 0.1 );
  vec3 Lc = directLight.color;
#if CEL_KIND <= 3
  // humanoids (revision r2): a lamp right beside her must not light the cloth past full sun (white kosode blew out
  // next to street lamps); the irradiance of any one light is capped near the sun's
  { float lcl = celLum( Lc ); Lc *= min( 1.0, 3.2 / max( lcl, 1e-4 ) ); }
#endif
  #if CEL_KIND == 2
    if (uCelQ.w > .5) {
      // A paper lantern at the hip warms the underside of the chin. At night
      // it must leave room for the overhead key on the broad cheek planes.
      float warm = smoothstep(.18, .76, (Lc.r - Lc.b) / max(.001, celLum(Lc)));
      float below = smoothstep(.10, .82, -(vec4(L, 0.0) * viewMatrix).y);
      Lc *= mix(1.0, .25, warm * below);
      Lc = mix(Lc, celLum(Lc) * vec3(1.18, .96, .94), .21 * warm * below);
    }
  #endif
  celLastR = r; celLastLum = celLum( Lc );
  float ndv = clamp( dot( N, V ), 0.0, 1.0 );
#ifdef CEL_FIX
#if CEL_KIND == 3
  // heroine-look: only lanterns reach this (the sun / moon go through the Veil hook's mvSun): under a warm lantern hair
  // keeps its dark value with a cool cast (it went mid-brown); the rims below still separate it from a dark ground
  col *= mix( vec3( 0.42, 0.46, 0.62 ), vec3( 1.0 ), max( celHairDay( Lc ), 1.0 - celHairDark( a ) ) );   // black hair only
#endif
#endif
  vec3 add = col;
  // rim toward the light (crisp anime rim), stronger when back-lit
  float rim = smoothstep( 0.58, 0.74, 1.0 - ndv );
  float toL = clamp( ndl * 0.75 + 0.4, 0.0, 1.0 ) * ( 0.45 + 0.55 * clamp( -dot( V, L ) * 0.5 + 0.5, 0.0, 1.0 ) );
  add += mix( mix( a, vec3( 1.0 ), 0.5 ), mix( a, vec3( 1.0, 0.95, 0.86 ), 0.6 ), gm ) * rim * toL * uCelP.z * sh;
  // soft fabric sheen on the lit side
  add += a * pow( 1.0 - ndv, 2.0 ) * uCelQ.z * r;
#if CEL_KIND <= 3
  // revision r2: thin screen-space rim on the light's side of the silhouette (hair, shoulders, sleeves), also when the
  // light is behind her or she stands in a cast shadow, so she never melts into a busy background
  {
    float nl = length( N.xy ), ll = length( L.xy );
    float side = ( nl > 1e-4 && ll > 1e-4 ) ? dot( N.xy / nl, L.xy / ll ) : 0.0;
    float thin = smoothstep( 0.66, 0.82, 1.0 - ndv ) * smoothstep( 0.05, 0.55, side );
    float back = 0.6 + 0.4 * clamp( -dot( V, L ), 0.0, 1.0 );
    add += mix( a, vec3( 1.0, 0.95, 0.86 ), 0.7 ) * thin * back * ( 0.55 + 0.45 * sh ) * min(1.3, 2.2 * uCelP.z) / max( celLum( Lc ), 0.6 );   // same brightness under a weak dusk sun
  }
#endif
#if CEL_KIND == 3
  {
    vec3 up = ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz;
    vec3 T = celSafeN( up - N * dot( N, up ), up );
    #ifdef USE_MAP
      float jit = fract( sin( floor( vMapUv.x * 48.0 ) * 12.9898 + floor( vMapUv.y * 6.0 ) * 4.17 ) * 43758.5453 ) - 0.5;
    #else
      float jit = 0.0;
    #endif
    // stylised: the ring sits where the view (lifted a little toward the light) grazes the strands
    vec3 Hh = celSafeN( V * 0.7 + L * 0.3 + up * 0.22, N );
    float th = dot( celSafeN( T + N * ( 0.1 + jit * 0.16 ), T ), Hh );
    float s = sqrt( max( 0.0, 1.0 - th * th ) );
    float spec = pow( max( s, 0.0 ), 48.0 );
    spec = smoothstep( 0.3, 0.62, spec ) * ( 0.3 + 0.7 * r ) * smoothstep( 0.05, 0.35, dot( N, up ) + 0.25 );
#ifdef CEL_FIX
    // heroine-look: this runs for lanterns only (the sun goes through the Veil hook's mvSun): no glint and no ring
    // from a lantern on hair with the soft band (FRAG_POST draws that band from the sun / moon key)
    add += mix( a * 2.5 + 0.1, vec3( 1.0, 0.96, 0.9 ), 0.5 ) * spec * uCelQ.y * ( uHairB.w > 0.0 ? ( uHairB.z < 0.5 ? 0.0 : 0.25 ) : 1.0 ) * celHairDay( Lc );
    if ( uHairB.w > 0.0 && uHairB.z >= 0.5 ) {
#else
    add += mix( a * 2.5 + 0.1, vec3( 1.0, 0.96, 0.9 ), 0.5 ) * spec * uCelQ.y * ( uHairB.w > 0.0 ? 0.25 : 1.0 );
    if ( uHairB.w > 0.0 ) {
#endif
      // anime "angel ring": a crisp band fixed on the crown (bind space), zig-zag strand edges, brightest facing the view
      vec3 o = vCelObj;
      float az = atan( o.x, o.z );
      float tooth = abs( fract( az * uHairB.z / 6.2831853 + jit * 0.15 ) - 0.5 ) * 2.0;
      float y = o.y - uHairB.x + ( tooth - 0.5 ) * uHairB.y * 0.9;
      float ring = 1.0 - smoothstep( uHairB.y * 0.55, uHairB.y, abs( y ) );
      float face = smoothstep( 0.15, 0.55, ndv ) * smoothstep( -0.35, 0.1, dot( N, up ) );
      float front = 0.55 + 0.45 * smoothstep( -0.6, 0.4, o.z / max( length( o.xz ), 1e-3 ) );
      ring *= face * front * ( 0.45 + 0.55 * r ) * uHairB.w;
      add = mix( add, mix( a * 2.2 + 0.16, vec3( 1.0, 0.97, 0.92 ), 0.42 ), clamp( ring, 0.0, 1.0 ) * 0.85 );
    }
  }
#endif
  reflectedLight.directDiffuse += Lc * add * RECIPROCAL_PI;
}
// The local sun uses the same authored normals as the inks. Keep a broad flat
// key plane, a single shadow plane and a small turning value on the key side.
float celSunPlane(vec3 N, vec3 L, float shadow, vec3 energy, vec3 albedo, inout ReflectedLight light) {
  #if CEL_KIND == 2
    if (uCelQ.w > .5) {
      float cut = facePaint;
      float visible = smoothstep(.13, .84, shadow);
      vec3 plane = mix(vec3(.34,.245,.267), vec3(.85,.83,.82), cut);
      plane += vec3(.22,.20,.18) * faceEdgeLight(N);
      light.directDiffuse += BRDF_Lambert(albedo) * energy * mix(vec3(.061,.053,.060), plane, visible);
      return cut * visible;
    }
  #endif
  float d = dot(N,L) - celFoldD * .18;
  float threshold = (uCelP.x - .5) * 1.6;
  float width = max(.043, fwidth(d) * 1.3);
  #if CEL_KIND == 2
    threshold -= .16;
    width = max(width,.11);
  #endif
  float key = smoothstep(threshold-width, threshold+width, d) * smoothstep(.16,.85,shadow);
  float facing = smoothstep(.23,.79,d);
  float turning = .56 + .37 * facing;
  vec3 shade = mix(vec3(.94,.91,.98),clamp(uShadeTint,vec3(.55),vec3(1.15)),.42);
  #if CEL_KIND == 1 || CEL_KIND == 2
    shade = vec3(1.09,.88,.87);
  #endif
  light.directDiffuse += BRDF_Lambert(albedo) * energy * mix(.045 * shade, vec3(turning), key);
  return key;
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
  vec3 a = material.diffuseColor;
  vec3 sat = max( mix( vec3( celLum( a ) ), a, 1.12 ), vec3( 0.0 ) );
  reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( sat );
}
#define RE_Direct           RE_Direct_Toon
#define RE_IndirectDiffuse  RE_IndirectDiffuse_Toon
`;
// shadow capture: the directional / spot shadow factor is kept for the ramp instead of multiplying the light
const FRAG_SHADOW = /* glsl */`
#ifdef USE_SHADOWMAP
float mvcKeepSh( float s ) { mvcSh = s; return 1.0; }
#define getShadow( a, b, c, d, e, f ) mvcKeepSh( getShadow( a, b, c, d, e, f ) )
#endif
`;
// garments: painted folds -> light. The texel is compared with a blurred mip of the same texture: darker than its
// surroundings in the same hue = a pleat valley / fold. Part of that painted dark is lifted and handed to the cel ramp
// (celFoldD shifts the terminator), so folds turn into shade shapes that follow the light instead of a printed pattern.
// Different hues (motifs, trims, stitches) are left alone. Cost: one coarse-mip fetch per garment fragment.
const FRAG_COLOR = /* glsl */`
#if CEL_KIND == 2
  if (uCelQ.w > .5) facePaint = faceKeyMask();
#endif
#ifdef CEL_TIP
// sculpted fur (dango, install-actors round): COLOR_0 is RGBA, A = the 'tip' mask (ear tips, tail flame, lock ends). three
// multiplied it into the alpha (USE_COLOR_ALPHA); take it back out as the mask, the body stays opaque
float celTip = vColor.a;
diffuseColor.a = opacity;
#endif
if ( uCelG.x > 0.0 ) { celGr = celGrain(); diffuseColor.rgb *= 1.0 + celGr * uCelG.x; }
#if CEL_KIND == 0 && defined( USE_MAP )
if ( uCelG.z > 0.5 ) {
  vec3 cc = diffuseColor.rgb;
  vec3 bl = textureLod( map, vMapUv, 4.5 ).rgb * diffuse;
  float lc = celLum( cc ), lb = celLum( bl );
  float mc = max( max( cc.r, cc.g ), cc.b ), mb = max( max( bl.r, bl.g ), bl.b );
  if ( lb > 0.01 && mc > 1e-3 && mb > 1e-3 ) {
    float hueD = length( cc / mc - bl / mb );
    float same = 1.0 - smoothstep( 0.25, 0.6, hueD );
    float ratio = clamp( lc / lb, 0.0, 1.0 );
    // light cloth (r2): its painted folds are faint values, so they keep their painted cool tone (no lift) and push
    // the terminator harder; strong colours keep the old lift
    float lt = smoothstep( 0.55, 0.85, lb );
    celFoldD = ( 1.0 - ratio ) * same * ( 1.0 + 1.6 * lt );
    diffuseColor.rgb *= mix( 1.0, 1.0 / max( ratio, 0.4 ), 0.4 * same * ( 1.0 - lt ) );
  }
  // loud primaries: a touch less chroma
  float mn = min( min( cc.r, cc.g ), cc.b );
  float sat = mc > 1e-3 ? ( mc - mn ) / mc : 0.0;
  diffuseColor.rgb = mix( vec3( celLum( diffuseColor.rgb ) ), diffuseColor.rgb, 1.0 - 0.1 * smoothstep( 0.75, 0.98, sat ) );
}
#endif
`;
const FRAG_POST = /* glsl */`
{
#if CEL_KIND == 0
  #if NUM_DIR_LIGHTS > 0
  if (uCelQ.w > 0.0) {
    vec3 halfDir = normalize(directionalLights[0].direction + normalize(vViewPosition));
    float h = max(dot(normalize(normal), halfDir), 0.0);
    reflectedLight.directSpecular += mix(diffuseColor.rgb, vec3(1.0), .25) * directionalLights[0].color
      * pow(h, mix(24.0, 65.0, uCelQ.w)) * uCelQ.w
      #ifdef CEL_FIX
      * mvLitK
      #endif
      ;
  }
  #endif
  if ( uCelG.y > 0.0 && !gl_FrontFacing ) {
    // the inside of single-layer cloth (sleeve bags, hakama, robes): in its own shadow, cooler
    reflectedLight.directDiffuse *= 1.0 - uCelG.y;
    reflectedLight.indirectDiffuse *= mix( vec3( 1.0 ), uShadeTint * 1.25, uCelG.y * 0.6 );
  }
#endif
#if CEL_KIND == 0
  if ( uCelG.z > 0.5 ) {
    // garments: a long soft value gradient, lighter at the shoulders, deeper toward the hem (ground occlusion);
    // vCelObj is relative to the head centre in bind space (metres)
    float gy = smoothstep( -1.6, -0.35, vCelObj.y );
    float gk = mix( 0.8, 1.04, gy );
    reflectedLight.directDiffuse *= mix( 1.0, gk, 0.6 ); reflectedLight.indirectDiffuse *= gk;
#ifdef CEL_FIX
    if ( uCelG.z > 1.5 ) {
      // wardrobe cloth (material extras.shadeAmbient, uCelG.z = 2): where the sun does not reach (own shade, cast shadow,
      // an underside seen from below) the sky / ground bounce keeps its brightness but takes the cloth's own shade hue
      // (cool grey-blue for white), so white cloth never turns the warm beige of skin (docs/api/heroine.md "Wardrobe")
      vec3 stH = uShadeTint / max( celLum( uShadeTint ), 1e-3 );
      reflectedLight.indirectDiffuse = mix( reflectedLight.indirectDiffuse, vec3( celLum( reflectedLight.indirectDiffuse ) ) * stH, ( 1.0 - mvLitK ) * 0.85 );
    }
#endif
  }
#endif
#if NUM_DIR_LIGHTS > 0
  // the sky / bounce light splits with the sun's terminator too, so the two tones read even under a bright sky
  {
    float sunK = smoothstep( 0.04, 0.6, celLastLum );
    vec3 ambShade = mix( vec3( 1.0 ), uShadeTint * 1.15, 0.8 );
    reflectedLight.indirectDiffuse *= mix( vec3( 1.0 ), mix( ambShade, vec3( 1.0 ), celLastR ), sunK );
  }
#endif
  {
    // soft sky rim on every silhouette (keeps her readable against dark ground and at night)
    float sNdv = abs( dot( normalize( normal ), normalize( -vViewPosition ) ) );
    float sRim = smoothstep( 0.76, 0.91, 1.0 - sNdv );
    reflectedLight.indirectDiffuse += reflectedLight.indirectDiffuse * sRim * uCelP.z * 0.9;
  }
#if CEL_KIND == 4
  // eyes stay bright and glossy: a little self light + a view-dependent glint; highlights twinkle softly (never go dark)
  reflectedLight.indirectDiffuse += diffuseColor.rgb * uCelQ.w;
  if ( uCelQ.w > 0.3 ) totalEmissiveRadiance += diffuseColor.rgb * ( 0.55 + 0.12 * sin( uCelTime * 3.1 + vCelObj.x * 40.0 ) );
#endif
#if CEL_KIND == 2
  if (uCelQ.w > .5) {
    reflectedLight.indirectDiffuse *= mix(vec3(.87,.77,.83), vec3(1.0), facePaint);
    #ifdef CEL_FIX
      float night = smoothstep(.50,.94,mvV);
      float cheek = smoothstep(-.097,-.038,vCelObj.y);
      float palette = night * mix(.15,.68,cheek);
      reflectedLight.directDiffuse = faceNightBounce(reflectedLight.directDiffuse, diffuseColor.rgb, palette);
      reflectedLight.indirectDiffuse = faceNightBounce(reflectedLight.indirectDiffuse, diffuseColor.rgb, palette);
    #endif
  }
  // face: warm lift in the shade, stable under any light
  reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3( 1.0, 0.9, 0.86 ) * 0.04;
#endif
#if CEL_KIND == 6
  // fur / body gradient: lighter back, deeper belly (world-up from the view normal)
  {
    vec3 wN = ( vec4( normalize( normal ), 0.0 ) * viewMatrix ).xyz;
    float g = clamp( wN.y * 0.5 + 0.5, 0.0, 1.0 );
    vec3 gk = mix( vec3( 0.78, 0.8, 0.95 ), vec3( 1.06, 1.04, 1.0 ), g );
    reflectedLight.directDiffuse *= gk; reflectedLight.indirectDiffuse *= gk;
  }
#endif
#if CEL_KIND == 3
  // hair depth: ends and the underside a touch deeper / cooler
  float hy = clamp( ( vCelObj.y + 0.05 ) / 0.35 + 1.0, 0.0, 1.0 );
  vec3 dk = mix( vec3( 0.80, 0.82, 1.0 ), vec3( 1.0 ), hy );
  reflectedLight.directDiffuse *= dk; reflectedLight.indirectDiffuse *= dk;
#ifdef CEL_FIX
  {
    // heroine-look: the fill / ambient on DARK hair (night ring fill, lamp pools, dusk sky) turns cool and lower as the day
    // goes (mvV: the Veil hook's veil amount here, 0 day, ~0.5 dusk, 1 night), so black hair stays black-blue at dusk and
    // night; by day, and coloured or light hair at any time, as it was
    float nightK = smoothstep( 0.12, 0.55, mvV ), dayK = 1.0 - nightK;
    float hk = celHairDark( diffuseColor.rgb );
    float coolK = nightK * hk;
    vec3 ind = reflectedLight.indirectDiffuse;
    float irrL = celLum( ind ) / max( celLum( diffuseColor.rgb ), 0.03 );   // ambient irradiance (before the cool-down)
    reflectedLight.indirectDiffuse = mix( ind, vec3( celLum( ind ) ) * vec3( 0.8, 0.88, 1.12 ) * 0.62, coolK );
    // the warm dusk sun / night key on the crown: same value kept (the rim still reads), hue turned cool, body a bit lower
    vec3 dd = reflectedLight.directDiffuse;
    reflectedLight.directDiffuse = mix( dd, vec3( celLum( dd ) ) * vec3( 0.82, 0.9, 1.12 ) * 0.8, coolK );
#if NUM_DIR_LIGHTS > 0
    vec3 bN = normalize( normal ), bV = normalize( vViewPosition ), bL = directionalLights[ 0 ].direction;
    vec3 up = ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz;
    // fix round: the moon key (the hook's night key rides on directional light 0)
    float mkL = celLum( mvPalette( MV_ROW_MOONKEY, mvV ) * mvHemiMul );
    if ( coolK > 0.0 ) {
      // black hair at dusk / night keeps its locks: a dim cool value on the lock faces turned to the moon and the sky, so
      // strands read from the side and the crown is not one flat black mass (the warm lift stays gone)
      float f = smoothstep( -0.1, 0.75, dot( bN, bL ) ) * 0.65 + smoothstep( -0.2, 0.9, dot( bN, up ) ) * 0.35;
      reflectedLight.indirectDiffuse += vec3( 0.55, 0.63, 0.95 ) * ( mkL + 0.04 ) * f * f * coolK * 0.08 * CEL_TN.x;
    }
    if ( uHairB.w > 0.0 && uHairB.z < 0.5 && uCelQ.w < .9 ) {
      // soft light-following band (extras.hairBand; uHairB = height above the head centre, half width, 0 / -1-k = this
      // band, strength), lit by the sun / moon key: a soft band on the roundness of the head that tilts with the light,
      // slides with the half vector, and varies lock by lock (anisotropic term on the lock's own normal + long streaks)
      vec3 o = vCelObj;
      vec3 H = celSafeN( bV + bL, bN );
      vec3 nh = bN - up * dot( bN, up ), hh = H - up * dot( H, up );
      float hw = uHairB.y * 1.6 * CEL_TN.z;
      float yc = uHairB.x + hw * ( ( dot( H, up ) - 0.35 ) * 1.2 + dot( nh, hh ) * 1.6 );
      float bd = ( o.y - yc ) / max( hw * 0.75, 1e-4 );
      float ring = exp( -0.5 * bd * bd );     // soft edges: no hard parallel lines
      vec3 Ts = celSafeN( up - bN * dot( bN, up ), up );
      float th = dot( Ts, H );
      float kk = pow( max( 1.0 - th * th, 0.0 ), 8.0 );
      float st = celVN( vec3( o.x * 70.0, o.y * 5.0, o.z * 70.0 ) );
      ring *= mix( 0.3, 1.0, kk ) * mix( 0.45, 1.2, st );
      float ol = length( o );
      ring *= ( 1.0 - smoothstep( 0.1, 0.42, abs( dot( bN, up ) - ( ol > 1e-4 ? o.y / ol : 0.0 ) ) ) ) * smoothstep( 0.05, 0.4, dot( bN, up ) );
      // brightest on the front of the head, toward the view and the light; quiet at the back and round the sides
      float front = smoothstep( -0.5, 0.35, o.z / max( length( o.xz ), 1e-3 ) );
      ring *= smoothstep( 0.15, 0.7, dot( bN, bV ) ) * ( 0.2 + 0.8 * front ) * ( 0.45 + 0.55 * clamp( dot( bN, bL ) * 0.8 + 0.3, 0.0, 1.0 ) ) * uHairB.w;
      float sunE = celLum( directionalLights[ 0 ].color * mvSunLocal / max( mvSunCam, vec3( 1e-3 ) ) ) * RECIPROCAL_PI * ( 0.3 + 0.7 * mvLitK );
      float lvl = mix( ( 0.3 * irrL + 1.4 * mkL * CEL_TN.x ) * RECIPROCAL_PI, 0.9 * sunE * CEL_TN.y, dayK );
      // black hair: a cool pale sheen; coloured / light hair: a lighter tone of its own colour (no grey stripe on warm hair)
      vec3 bc = mix( min( diffuseColor.rgb * 2.4 + 0.1, vec3( 1.0 ) ), vec3( 0.8, 0.87, 1.0 ), hk );
      bc = mix( bc, vec3( 0.62, 0.72, 1.0 ) * max( celLum( bc ), 0.5 ), nightK * 0.6 );
      reflectedLight.directDiffuse += bc * lvl * clamp( ring, 0.0, 1.0 );
    }
#endif
    // Silver fibre reflects the sky without becoming its saturated blue. Keep the
    // directional contrast and energy of the current light, including the moon.
    if ( uCelQ.w > 0.0 ) {
      vec3 ash = vec3( 1.03, 0.976, 1.095 );
      vec3 sky = reflectedLight.indirectDiffuse;
      float skyY = celLum( sky );
      float blue = smoothstep( 0.08, 0.58, ( sky.b - sky.r ) / max( 0.002, skyY ) );
      float neutral = uCelQ.w * mix( 0.72, 0.94, dayK );
      reflectedLight.indirectDiffuse = mix( sky, ash * skyY * ( 1.0 + 0.40 * dayK ), neutral * blue );
      vec3 key = reflectedLight.directDiffuse;
      float keyY = celLum( key );
      float coolKey = smoothstep( 0.08, 0.58, ( key.b - key.r ) / max( 0.002, keyY ) );
      reflectedLight.directDiffuse = mix( key, ash * keyY * ( 1.0 + 0.12 * dayK ), neutral * coolKey );
      ${silverHairPaint}
    }
  }
#endif
#endif
#ifdef CEL_TIP
  // tips burn: the tail flame tongues and the bright lock ends flicker with a little light of their own (dark ear tips,
  // low value, stay dark: the glow follows the painted value)
  {
    float tl = smoothstep( 0.25, 0.7, celLum( diffuseColor.rgb ) );
    float fl = 0.75 + 0.25 * sin( uCelTime * 7.3 + vCelObj.y * 41.0 ) * sin( uCelTime * 4.1 + vCelObj.z * 23.0 );
    totalEmissiveRadiance += uSpirit.rgb * max( uSpirit.a, 0.5 ) * celTip * tl * 0.22 * fl;
  }
#endif
  if ( uSpirit.a > 0.0 ) {
    vec3 sN = normalize( normal );
    vec3 sV = normalize( -vViewPosition );
    float f = 1.0 - abs( dot( sN, sV ) );
    float pulse = 0.82 + 0.18 * sin( uCelTime * 2.6 + vCelObj.y * 9.0 );
    // creatures (upgrade 3): the shade edge is alive — tongues of violet light crawl up the silhouette
    float crawl = celVN( vCelObj * ( uCelG.w > 0.0 ? uCelG.w : 1.0 ) * 7.0 + vec3( 0.0, -uCelTime * 1.7, uCelTime * 0.3 ) );
    float edge = smoothstep( 0.45, 1.0, f ) * ( 0.55 + 0.9 * crawl ) + smoothstep( 0.82, 1.0, f ) * 0.35;
    totalEmissiveRadiance += uSpirit.rgb * uSpirit.a * ( edge * 0.32 + 0.015 ) * pulse;
  }
}
`;

// heroine-look: opaque hair marks the colour target's alpha with 0 (everything else opaque writes 1; the post passes never
// read scene alpha). The see-through face lines (buildSeeLines) blend with SRC_ALPHA_SATURATE = min(a, 1 - dst alpha), so
// they show on hair only: never through a headband, hat, hand or the gohei in front of the brows.
const FRAG_END = /* glsl */`
#ifdef CEL_FIX
#ifdef OPAQUE
#if CEL_KIND == 3
  gl_FragColor.a = 0.0;
#endif
#endif
#endif
`;

// ---- merged characters (draw-call pass, docs/api/actors-look.md) -------------------------------------------------------
// One CelMaterial can stand for up to CEL_SLOTS source materials ("slots") of one character: every vertex carries its slot
// (attribute aCelS), the per-material uniforms become per-slot uniform arrays, the colour maps one sampler2DArray, and the
// compile-time CEL_KIND branches run as branches on the slot's kind. Same maths per fragment as the separate materials.
export const CEL_SLOTS = 24;
// texture arrays per merged material (one per map size): the player's outfit uses five sizes (512² … 2048²)
export const CEL_ARRS = 5;
const SLOT_U = ['uSlC', 'uSlT', 'uSlP', 'uSlQ', 'uSlG', 'uSlH', 'uSlE', 'uSlA', 'uSlS', 'uSlV'];
// #if CEL_KIND <expr> ... #endif  ->  if ( <expr on celKind> ) { ... }   (other preprocessor blocks untouched)
function celRuntime(src) {
  const out = [], stack = [];
  for (const line of src.split('\n')) {
    const t = line.trim();
    let mm;
    if ((mm = /^#if\s+(.*CEL_KIND.*)$/.exec(t))) { out.push('if ( ' + mm[1].replace(/CEL_KIND/g, 'celKind') + ' ) {'); stack.push(true); }
    else if (/^#if/.test(t)) { out.push(line); stack.push(false); }
    else if (/^#endif/.test(t)) out.push(stack.pop() ? '}' : line);
    else if (/^#el/.test(t) && stack[stack.length - 1]) throw new Error('celRuntime: #else in a CEL_KIND block');
    else out.push(line);
  }
  return out.join('\n');
}
const must = (s, a, b) => { if (!s.includes(a)) throw new Error('cel multi patch: missing ' + a.slice(0, 40)); return s.replace(a, b); };
let MULTI = null;
function multiChunks() {
  if (MULTI) return MULTI;
  const arr = (n) => 'uniform vec4 ' + n + '[ CEL_SLOTS ];\n';
  let vp = VERT_PARS.replace(/^uniform vec4 uCelV;.*$/m, '');
  vp += 'attribute float aCelS;\nflat varying int vCelS;\nvarying vec2 vCelUv;\nint celS, celKind;\n' + arr('uSlT') + arr('uSlA') + arr('uSlV')
    + '#define uCelV uSlV[ celS ]\n';
  const vn = 'celS = int( aCelS + 0.5 ); vCelS = celS; vCelUv = uv; celKind = int( uSlT[ celS ].w + 0.5 );\n' + celRuntime(VERT_NORMAL);
  const vb = celRuntime(must(VERT_BEGIN, 'if ( uEarL.w > 0.0 ) {', 'if ( uEarL.w > 0.0 && uSlA[ celS ].y > 0.5 ) {'));
  let fp = FRAG_PARS.replace(/^uniform (vec3|vec4) (uShadeTint|uCelP|uCelQ|uSpirit|uHairB|uCelG);.*$/mg, '');
  // maps: up to CEL_ARRS texture arrays (one per map size, so no layer is resampled); slot E.w = array * 256 + layer, < 0 none
  const pick = (fn, extra) => Array.from({ length: CEL_ARRS }, (_, i) => (i < CEL_ARRS - 1 ? 'if ( c < ' + (i * 256 + 255.5) + ' ) ' : '')
    + 'return ' + fn + '( uCelArr' + i + ', vec3( uv, c - ' + (i * 256) + '.0 )' + extra + ' ); ').join('');
  fp = 'flat varying int vCelS;\nvarying vec2 vCelUv;\nint celKind;\nuniform highp sampler2DArray ' + Array.from({ length: CEL_ARRS }, (_, i) => 'uCelArr' + i).join(', ') + ';\n'
    + ['uSlC', 'uSlT', 'uSlP', 'uSlQ', 'uSlG', 'uSlH', 'uSlE', 'uSlA', 'uSlS'].map(arr).join('')
    + '#define uShadeTint uSlT[ vCelS ].rgb\n#define uCelP uSlP[ vCelS ]\n#define uCelQ uSlQ[ vCelS ]\n#define uSpirit uSlS[ vCelS ]\n'
    + '#define uHairB uSlH[ vCelS ]\n#define uCelG uSlG[ vCelS ]\n#define celHasMap ( uSlE[ vCelS ].w >= 0.0 )\n'
    + 'vec4 celTex( vec2 uv ) { float c = max( uSlE[ vCelS ].w, 0.0 ); ' + pick('texture', '') + '}\n'
    + 'vec4 celTexLod( vec2 uv, float l ) { float c = max( uSlE[ vCelS ].w, 0.0 ); ' + pick('textureLod', ', l') + '}\n' + fp;
  fp = must(fp, `#ifdef USE_MAP
      float jit = fract( sin( floor( vMapUv.x * 48.0 ) * 12.9898 + floor( vMapUv.y * 6.0 ) * 4.17 ) * 43758.5453 ) - 0.5;
    #else
      float jit = 0.0;
    #endif`, 'float jit = celHasMap ? fract( sin( floor( vCelUv.x * 48.0 ) * 12.9898 + floor( vCelUv.y * 6.0 ) * 4.17 ) * 43758.5453 ) - 0.5 : 0.0;');
  let fc = must(FRAG_COLOR, '#if CEL_KIND == 0 && defined( USE_MAP )', '#if CEL_KIND == 0 && celHasMap');
  fc = must(fc, 'textureLod( map, vMapUv, 4.5 ).rgb * diffuse;', 'celTexLod( vCelUv, 4.5 ).rgb * uSlC[ vCelS ].rgb;');
  MULTI = { vp, vn, vb, fp: celRuntime(fp), fc: celRuntime(fc), fpost: celRuntime(FRAG_POST), fend: celRuntime(FRAG_END) };
  return MULTI;
}

function patchCelMulti(sh, m) {
  const C = multiChunks();
  Object.assign(sh.uniforms, m.celU, { uCelTime: CEL_U.uCelTime, uFaceKeyWorld: U.mvSunDir });
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n#define CEL_SLOTS ' + CEL_SLOTS + '\n' + (CEL_FIX.on && hasWorldLighting(m) ? '#define CEL_FIX 1\n#define CEL_FY ' + (+CEL_FIX.tune[4]).toFixed(4) + '\n' : '') + C.vp)
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + C.vn)
    .replace('#include <skinnormal_vertex>', '#include <skinnormal_vertex>\n' + celRuntime(FACE_VERTEX))
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + C.vb);
  let f = sh.fragmentShader;
  f = must(f, '#include <common>', '#include <common>\n#define CEL_SLOTS ' + CEL_SLOTS + celFixDef(m));
  f = must(f, '#include <lights_toon_pars_fragment>', C.fp);
  f = must(f, '#include <shadowmap_pars_fragment>', '#include <shadowmap_pars_fragment>\n' + FRAG_SHADOW);
  f = must(f, 'void main() {', 'void main() {\n  celKind = int( uSlT[ vCelS ].w + 0.5 );');
  f = must(f, 'vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = uSlC[ vCelS ];');
  f = must(f, 'vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = uSlE[ vCelS ].rgb;');
  f = must(f, '#include <map_fragment>', '#ifdef CEL_SIDE\n  if ( uSlA[ vCelS ].z > 0.5 && !gl_FrontFacing ) discard;   // one-sided slot in a two-sided merged draw\n#endif\n'
    + '{ vec4 celTx = celTex( vCelUv ); if ( celHasMap ) diffuseColor *= celTx; }');
  f = must(f, '#include <alphatest_fragment>', '#ifdef CEL_ATEST\n  if ( diffuseColor.a < uSlA[ vCelS ].x ) discard;\n#endif');
  f = must(f, '#include <color_fragment>', '#include <color_fragment>\n' + C.fc);
  f = must(f, '#include <aomap_fragment>', C.fpost + '#include <aomap_fragment>');
  f = must(f, '#include <opaque_fragment>', '#include <opaque_fragment>\n' + C.fend);
  sh.fragmentShader = f;
}

function patchCel(sh, m) {
  if (m.cel.multi) { patchCelMulti(sh, m); return; }
  const cu = m.celU;
  Object.assign(sh.uniforms, cu, { uCelTime: CEL_U.uCelTime, uFaceKeyWorld: U.mvSunDir });
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n#define CEL_KIND ' + KINDS[m.cel.kind] + '\n' + (CEL_FIX.on && hasWorldLighting(m) ? '#define CEL_FIX 1\n#define CEL_FY ' + (+CEL_FIX.tune[4]).toFixed(4) + '\n' : '') + VERT_PARS)
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + VERT_NORMAL)
    .replace('#include <skinnormal_vertex>', '#include <skinnormal_vertex>\n' + FACE_VERTEX)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BEGIN);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n#define CEL_KIND ' + KINDS[m.cel.kind] + celFixDef(m))
    .replace('#include <lights_toon_pars_fragment>', FRAG_PARS)
    .replace('#include <shadowmap_pars_fragment>', '#include <shadowmap_pars_fragment>\n' + FRAG_SHADOW)
    .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR)
    .replace('#include <aomap_fragment>', FRAG_POST + '#include <aomap_fragment>')
    .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n' + FRAG_END);
}

/** Per-kind defaults: [terminator, softness, rim, shadowWeight], [sss, hairSpec, sheen, selfLight], shade multiplier */
const PRESET = {
  cloth: { p: [0.5, 0.05, 0.55, 1.0], q: [0, 0, 0.12, 0], k: 0.5, g: 0.07 },
  skin:  { p: [0.46, 0.06, 0.6, 1.0], q: [0.25, 0, 0, 0], k: 0.66, g: 0.03 },
  face:  { p: [0.4, 0.08, 0.45, 0.55], q: [0.22, 0, 0, 0], k: 0.78, g: 0.018 },
  hair:  { p: [0.5, 0.05, 0.6, 1.0], q: [0, 1.0, 0, 0], k: 0.5, g: 0.04 },
  eye:   { p: [0.3, 0.2, 0.0, 0.3], q: [0, 0, 0, 0.12], k: 0.86, g: 0 },
  line:  { p: [0.3, 0.2, 0.0, 0.3], q: [0, 0, 0, 0], k: 0.9, g: 0 },
  fur:   { p: [0.48, 0.07, 0.6, 1.0], q: [0.0, 0, 0.18, 0], k: 0.52, g: 0.06 },
};
// painted garments (extras.garment): soft terminator, lighter coloured shade so the painted folds read, little sheen
const GARMENT = { p: [0.47, 0.1, 0.68, 1.0], q: [0, 0, 0.05, 0], k: 0.6, g: 0.06 };
const COOL = new THREE.Color(0.78, 0.82, 1.0);
// skin / face shade (look round): warm and rosy, never the cool cloth shade (a cool shade made skin look grey)
const WARM = new THREE.Color(1.0, 0.8, 0.82);
// Rim, fabric sheen, grain, hard-surface glint. Stored on each material slot, including after batching.
const FINISH = {
  stretch: [.17, .11, .035, 0], voile: [.20, .08, .06, 0],
  wool: [.15, .035, .15, 0], linen: [.19, .06, .10, 0],
  leather: [.30, .15, .085, -.5], brass: [.61, .15, .012, .56], glass: [.53, .12, .005, .8],
};

export class CelMaterial extends THREE.MeshToonMaterial {
  constructor(params, cel) {
    super(params);
    this.isCelMaterial = true;
    this.type = 'MeshToonMaterial';
    this.cel = { kind: 'cloth', ...(cel || {}) };
    this._install();
  }
  _install() {
    const c = this.cel;
    if (c.multi) {
      // merged character part: per-slot arrays (filled by actors/celmerge.js), one texture array
      const v4 = () => ({ value: Array.from({ length: CEL_SLOTS }, () => new THREE.Vector4()) });
      this.celU = { uHeadC: { value: new THREE.Vector3() }, uEarL: { value: new THREE.Vector4() }, uEarR: { value: new THREE.Vector4() } };
      for (let i = 0; i < CEL_ARRS; i++) this.celU['uCelArr' + i] = { value: null };
      for (const k of SLOT_U) this.celU[k] = v4();
      this.onBeforeCompile = (sh) => patchCel(sh, this);
      this.customProgramCacheKey = () => 'cel4m' + (CEL_FIX.on ? ':fix' : '');
      return;
    }
    const pr = c.garment && c.kind === 'cloth' ? GARMENT : (PRESET[c.kind] || PRESET.cloth);
    const shade = new THREE.Color(1, 1, 1);
    if (c.shade) shade.copy(c.shade);
    // MToon shade colours are often near-white or pinkish: push to a cool, saturated shade at the preset depth
    const l = (shade.r + shade.g + shade.b) / 3;
    if (l > 0.001) shade.multiplyScalar(1 / Math.max(l, 0.5));
    const tone = c.kind === 'skin' || c.kind === 'face' ? WARM : COOL;
    shade.lerp(tone, 0.5).multiply(tone).multiplyScalar(pr.k * (c.shadeK ?? 1));
    this.celU = {
      uShadeTint: { value: shade },
      uCelP: { value: new THREE.Vector4(...pr.p) },
      uCelQ: { value: new THREE.Vector4(...pr.q) },
      uSpirit: { value: new THREE.Vector4(0, 0, 0, 0) },
      uHeadC: { value: c.headC ? c.headC.clone() : new THREE.Vector3() },
      uCelV: { value: new THREE.Vector4(c.sph ?? 0.85, c.wag ?? 0, c.tailZ ?? 0, c.tailLen ?? 0) },
      uHairB: { value: c.hairB ? c.hairB.clone() : new THREE.Vector4(0, 0, 0, 0) },
      uCelG: { value: new THREE.Vector4(c.grain ?? pr.g, c.garment && c.doubleSided ? 0.55 : 0, c.garment ? (c.shadeAmbient ? 2 : 1) : 0, 0) },   // z 2: wardrobe cloth (FRAG_POST)
      uEarL: { value: c.earL ? c.earL.clone() : new THREE.Vector4(0, 0, 0, 0) },
      uEarR: { value: c.earR ? c.earR.clone() : new THREE.Vector4(0, 0, 0, 0) },
    };
    // Hair has no eye self-light. Its fourth slot carries the optional silver-fibre treatment.
    if (c.kind === 'hair' && c.silverHair) {
      this.celU.uCelQ.value.w = 1;
      this.celU.uCelP.value.z = .18;
    }
    if (c.kind === 'cloth' && c.garment) {
      const [rim, sheen, grain, glint] = FINISH[c.finish] || FINISH.linen;
      this.celU.uCelP.value.z = rim;
      this.celU.uCelQ.value.z = sheen;
      this.celU.uCelQ.value.w = glint;
      this.celU.uCelG.value.x = grain;
    }
    if (c.kind === 'skin' || c.kind === 'face') this.celU.uCelP.value.z *= .55;
    if (c.spirit) this.celU.uSpirit.value.set(c.spirit.r, c.spirit.g, c.spirit.b, c.spiritK ?? 1);
    // c.tip: the vertex colour's alpha is a mask, not opacity (sculpted 团子; see FRAG_COLOR CEL_TIP)
    if (c.tip) this.defines = { ...(this.defines || {}), CEL_TIP: '' };
    this.onBeforeCompile = (sh) => patchCel(sh, this);
    this.customProgramCacheKey = () => 'cel4:' + c.kind + (c.tip ? ':tip' : '') + (CEL_FIX.on ? ':fix' : '');
  }
  copy(src) {
    super.copy(src);
    if (src.cel) {
      this.cel = { ...src.cel };
      if (src.cel.slots) this.cel.slots = src.cel.slots.map((s) => ({ ...s }));
      this._install();
      // textures (the merged texture array) are shared, never cloned
      for (const k in src.celU) { const v = src.celU[k].value; this.celU[k].value = Array.isArray(v) ? v.map((x) => x.clone()) : v && v.clone && !v.isTexture ? v.clone() : v; }
      if (src.defines) this.defines = { ...src.defines };
    }
    return this;
  }
  /** Turn this material into "living darkness" (shade spirits): glow colour + amount (merged: every slot, or k(slot)). */
  setSpirit(color, k = 1) {
    const c = new THREE.Color(color);
    if (this.cel.multi) { this.celU.uSlS.value.forEach((v, i) => v.set(c.r, c.g, c.b, typeof k === 'function' ? k(this.cel.slots[i] || {}) : k)); return this; }
    this.celU.uSpirit.value.set(c.r, c.g, c.b, k); return this;
  }
}

function kindOf(name) {
  if (/^Face$|_Face$|FaceSkin/i.test(name)) return 'face';
  if (/EyeWhite|EyeIris|EyeHighlight|Eye$/i.test(name)) return 'eye';
  if (/FaceEyeline|FaceEyelash|FaceBrow|FaceMouth/i.test(name)) return 'line';
  if (/Hair/i.test(name)) return 'hair';
  if (/^Body$|Skin/i.test(name)) return 'skin';
  if (/Fox|Tail|Ear|Fur/i.test(name)) return 'fur';
  return 'cloth';
}

/** Convert a glTF PBR material into a CelMaterial (keeps map, alpha, side). */
export function makeCelMaterial(m, kind, extra = {}) {
  const name = m.name || '';
  kind = kind || kindOf(name);
  const sc = m.userData?.shadeColor;
  const garment = !!m.userData?.garment;
  const t = new CelMaterial({
    color: m.color ? m.color.clone() : new THREE.Color(0xffffff), map: m.map || null,
    transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, side: m.side, vertexColors: m.vertexColors,
    depthWrite: m.depthWrite,
  }, { kind, silverHair: m.userData?.hairStyle === 'silver-witch', finish: m.userData?.finish, shade: Array.isArray(sc) ? new THREE.Color(sc[0], sc[1], sc[2]) : null, garment, shadeAmbient: garment && !!m.userData?.shadeAmbient, doubleSided: m.side === THREE.DoubleSide, ...extra });
  if (m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0.01) {
    t.emissive.copy(m.emissive); t.emissiveMap = m.emissiveMap || null; t.emissiveIntensity = m.emissiveIntensity ?? 1;
  }
  if (kind === 'face' && m.userData?.authoredFaceNormals) {
    // These channels are unused by face materials and survive character batching.
    t.celU.uCelV.value.w = 1;
    t.celU.uCelQ.value.w = 1;
  }
  if (kind === 'eye' && /Highlight/i.test(name)) { t.celU.uCelQ.value.w = 0.6; }
  if (kind === 'eye' && /Iris/i.test(name)) { t.celU.uCelQ.value.w = 0.2; }
  if (garment) t.userData.garment = true;
  // the cel path paints its own grain (uCelG.x); the shared surface-detail layer stays off characters (docs/api/look.md §2)
  t.userData.surface = 'none';
  t.name = name;
  hookMaterial(t);
  return t;
}

// ---- outline ------------------------------------------------------------------------------------------------------------
let OUTLINE_MAT = null;
const OUT_VERT_PARS = /* glsl */`
attribute vec3 aOutC;
attribute float aOutW;   // < 0: single-layer garment (no pull toward the camera: no ink through the cloth)
varying vec3 vOutC;
uniform float uViewH, uOutW, uOutFar;
`;
const OUT_VERT_POST = /* glsl */`
{
  vOutC = aOutC;
  vec3 on = normalMatrix * objectNormal;
  float onl = length( on );
  float depth = -mvPosition.z;
  if ( onl > 1e-5 && depth > 0.0 ) {
    on /= onl;
    float pxWorld = 2.0 * depth / ( projectionMatrix[ 1 ][ 1 ] * uViewH );
    float px = uOutW * ( uViewH / 900.0 ) * mix( 1.0, 0.65, smoothstep( 4.0, 20.0, depth ) );
    float t = min( px * pxWorld, 0.0055 ) * abs( aOutW );
    t *= 1.0 - smoothstep( uOutFar * 0.55, uOutFar, depth );
    mvPosition.xyz += on * t;
    if ( aOutW > 0.0 ) mvPosition.z -= t * 0.6;
    gl_Position = projectionMatrix * mvPosition;
  }
}
`;
/** The single shared outline material (lit Lambert so local light / Veil fog darken it with the scene). */
export function outlineMaterial() {
  if (OUTLINE_MAT) return OUTLINE_MAT;
  // polygon offset pushes the hull a hair behind coincident cloth (no z-fighting at hems where the offset is tiny)
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.BackSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
  m.name = 'CelOutline';
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uViewH: CEL_U.uViewH, uOutW: CEL_U.uOutW, uOutFar: CEL_U.uOutFar });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + OUT_VERT_PARS)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + OUT_VERT_POST);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOutC;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vOutC;');
  };
  m.customProgramCacheKey = () => 'celOutline1';
  m.userData.shared = true;
  hookMaterial(m);
  OUTLINE_MAT = m;
  return m;
}

// sample a texture (small copy) for per-vertex outline colours
const texCache = new WeakMap();
function texSampler(tex) {
  if (!tex || !tex.image) return null;
  if (texCache.has(tex)) return texCache.get(tex);
  let fn = null;
  try {
    const S = 64;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(tex.image, 0, 0, S, S);
    const d = cx.getImageData(0, 0, S, S).data;
    fn = (u, v, out) => {
      u = u - Math.floor(u); v = v - Math.floor(v);
      if (tex.flipY) v = 1 - v;
      const x = Math.min(S - 1, (u * S) | 0), y = Math.min(S - 1, (v * S) | 0);
      const i = (y * S + x) * 4;
      return out.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, THREE.SRGBColorSpace);
    };
  } catch (e) { fn = null; }
  texCache.set(tex, fn);
  return fn;
}
const _c = new THREE.Color(), _hsl = { h: 0, s: 0, l: 0 };
function inkOf(c) {
  c.getHSL(_hsl);
  c.setHSL(_hsl.h, Math.min(1, _hsl.s * 1.15 + 0.08), Math.min(0.2, _hsl.l * 0.32 + 0.025));
  return c;
}

/** Smooth (position-welded) normals so the hull does not split at hard edges / UV seams. */
export function smoothNormals(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const n = pos.count;
  const map = new Map();
  const acc = new Float32Array(n * 3);
  const key = (i) => Math.round(pos.getX(i) * 2e3) + ',' + Math.round(pos.getY(i) * 2e3) + ',' + Math.round(pos.getZ(i) * 2e3);
  const keys = new Array(n);
  for (let i = 0; i < n; i++) {
    const k = keys[i] = key(i);
    let a = map.get(k);
    if (!a) map.set(k, (a = [0, 0, 0]));
    if (nor) { a[0] += nor.getX(i); a[1] += nor.getY(i); a[2] += nor.getZ(i); }
  }
  for (let i = 0; i < n; i++) {
    const a = map.get(keys[i]);
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    acc[i * 3] = a[0] / l; acc[i * 3 + 1] = a[1] / l; acc[i * 3 + 2] = a[2] / l;
  }
  return new THREE.BufferAttribute(acc, 3);
}

function outlineGeometry(mesh, weight) {
  const g = mesh.geometry, mat = mesh.material;
  const o = new THREE.BufferGeometry();
  o.setIndex(g.index);
  o.setAttribute('position', g.attributes.position);
  o.setAttribute('normal', smoothNormals(g));
  if (g.attributes.skinIndex) { o.setAttribute('skinIndex', g.attributes.skinIndex); o.setAttribute('skinWeight', g.attributes.skinWeight); }
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3), w = new Float32Array(n);
  const uv = g.attributes.uv;
  const samp = texSampler(mat.map);
  const base = mat.color ? mat.color : new THREE.Color(1, 1, 1);
  for (let i = 0; i < n; i++) {
    if (samp && uv) samp(uv.getX(i), uv.getY(i), _c); else _c.setRGB(1, 1, 1);
    _c.multiply(base);
    inkOf(_c);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    w[i] = weight;
  }
  o.setAttribute('aOutC', new THREE.BufferAttribute(col, 3));
  o.setAttribute('aOutW', new THREE.BufferAttribute(w, 1));
  if (g.morphAttributes.position) { o.morphAttributes.position = g.morphAttributes.position; o.morphTargetsRelative = g.morphTargetsRelative; }
  return o;
}

export function sameBones(a, b) {
  if (!a || !b || a.bones.length !== b.bones.length) return false;
  for (let i = 0; i < a.bones.length; i++) if (a.bones[i] !== b.bones[i]) return false;
  return true;
}

/**
 * Add ink outlines to a loaded (not yet cloned) model. Opaque skinned parts without morphs are merged into ONE outline
 * draw per skeleton; morph-target parts (the face skin) get their own (morph-aware) outline. Transparent / eye / line parts
 * get none. Outline meshes: userData.outline = true, castShadow = false.
 */
export function buildOutlines(root, opts = {}) {
  root.updateMatrixWorld(true);
  const groups = [];   // { skel, bindMatrix, parent, geos: [] }
  const singles = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.outline) return;
    const m = o.material;
    if (!m || Array.isArray(m) || m.transparent || m.alphaTest > 0.01) return;
    const name = m.name || '';
    if (/Eye|FaceEyeline|FaceEyelash|FaceBrow|FaceMouth|HairBack/i.test(name)) return;
    if (opts.only && !opts.only.test(name)) return;
    const kind = m.cel?.kind || kindOf(name);
    let weight = kind === 'face' ? (opts.faceWeight ?? 0.5) : kind === 'hair' ? 0.85 : 1;
    if (m.userData?.garment && m.side === THREE.DoubleSide) weight = -0.85;
    // The witch hat has a modelled binding; a second full-width ink shell breaks into dots at grazing angles.
    if (o.name === 'akari_witch_hat') weight *= .12;
    if (o.name === 'akari_hair') weight *= .65;
    if (!o.isSkinnedMesh) { singles.push([o, weight]); return; }
    if (o.geometry.morphAttributes.position) { singles.push([o, weight]); return; }
    let gp = groups.find((x) => sameBones(x.skel, o.skeleton) && x.bindMatrix.equals(o.bindMatrix) && x.first.matrixWorld.equals(o.matrixWorld));
    if (!gp) groups.push(gp = { skel: o.skeleton, bindMatrix: o.bindMatrix, first: o, geos: [] });
    gp.geos.push(outlineGeometry(o, weight));
  });
  const mat = outlineMaterial();
  const made = [];
  const finish = (src, geo) => {
    const om = src.isSkinnedMesh ? new THREE.SkinnedMesh(geo, mat) : new THREE.Mesh(geo, mat);
    om.name = (src.name || 'mesh') + '_outline';
    om.userData.outline = true;
    om.castShadow = false; om.receiveShadow = false;
    om.frustumCulled = false;
    om.position.copy(src.position); om.quaternion.copy(src.quaternion); om.scale.copy(src.scale);
    src.parent.add(om);
    if (src.isSkinnedMesh) om.bind(src.skeleton, src.bindMatrix);
    if (geo.morphAttributes.position && src.morphTargetInfluences) {
      om.morphTargetDictionary = { ...src.morphTargetDictionary };
      om.morphTargetInfluences = src.morphTargetInfluences.slice();
    }
    made.push(om);
  };
  for (const gp of groups) {
    const geo = gp.geos.length === 1 ? gp.geos[0] : BGU.mergeGeometries(harmonize(gp.geos), false);
    if (geo) finish(gp.first, geo);
  }
  for (const [o, w] of singles) finish(o, outlineGeometry(o, w));
  return made;
}

/**
 * Re-shade a hand prop (broom, gohei…) with the cel path: wood / metal / straw get cel + outline (opts.outline regexp),
 * paper stays light and outline-free. Lantern paper becomes a ribbed, glowing paper material.
 */
export function celifyProp(root, opts = {}) {
  const seen = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.userData.outline) return;
    const conv = (m) => {
      if (!m || m.isCelMaterial || m.isMeshBasicMaterial) return m;
      if (seen.has(m)) return seen.get(m);
      const n = m.name || '';
      let t;
      if (/LanternPaper/.test(n)) t = lanternPaperMaterial(0xffc27a, 1.7);
      else if (n === 'Paper') {
        // shide paper (r2): stays paper-white with a light fold shade (was the deep cool fur shade -> blue blocks)
        t = makeCelMaterial(m, 'cloth', { sph: 0, shadeK: 1.7 });
        t.emissive.setRGB(0.16, 0.155, 0.14);   // light through thin paper: never a dark blue block on her back
      } else {
        t = makeCelMaterial(m, /Straw|Paper|Cord/.test(n) ? 'fur' : 'cloth', { sph: 0 });
        if (/Brass|Gold/.test(n)) t.celU.uCelQ.value.z = 0.6;
      }
      seen.set(m, t);
      return t;
    };
    const isPaper = !Array.isArray(o.material) && o.material?.name === 'Paper';
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    if (isPaper && !o.isSkinnedMesh && o.geometry.attributes.position?.count === 92) o.geometry = shideGeometry(o.geometry);
  });
  if (opts.outline) buildOutlines(root, { only: opts.outline });
  return root;
}

/**
 * A sculpted hand prop (tools/sculpt GLB, install-actors round): nodes <name>_LOD0/1/2 plus anchor subtrees whose meshes are
 * named <anchor>_LOD0/1/2 (the gohei's shide). Returns ONE THREE.LOD; each level is that level's pieces merged into one
 * mesh per material group, in the prop's root space (anchors hang rigid at their rest pose), so a level draws exactly as
 * many meshes as there are groups, near or far. LOD0 keeps the shared colour atlas and the OBJECT-space normal map; LOD1/2
 * are vertex coloured. scene: a loaded clone (G.assets.model). opts:
 *   dists  [0, d1, d2]   switch distances (metres)
 *   groups [{ name, test: /re/ on the material name (a trailing _vc ignored), make(src, level) -> material }]
 *   outline /re/ on group names that get an ink outline (one per group mesh, like celifyProp); the group material is
 *           named after its group
 * Pieces matching no group are dropped. null when the scene has no <..>_LOD0 node.
 */
export function sculptProp(scene, opts) {
  scene.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  const lod = new THREE.LOD();
  lod.name = (scene.name || 'prop') + ':sculpt';
  const dists = opts.dists || [0, 4, 12];
  const rel = new THREE.Matrix4();
  for (let level = 0; level < dists.length; level++) {
    const tag = '_LOD' + level;
    const parts = new Map();   // group -> [{ geo, mat }]
    scene.traverse((o) => {
      if (!o.isMesh) return;
      // a multi-material glTF mesh is a Group named <node> holding one Mesh per primitive
      const owner = new RegExp(tag + '$').test(o.name) ? o : o.parent && new RegExp(tag + '$').test(o.parent.name) ? o.parent : null;
      if (!owner) return;
      const mn = String(o.material?.name || '').replace(/_vc$/, '');
      const gp = opts.groups.find((g) => g.test.test(mn));
      if (!gp) return;
      rel.multiplyMatrices(inv, o.matrixWorld);
      const geo = o.geometry.clone().applyMatrix4(rel);
      if (!parts.has(gp)) parts.set(gp, []);
      parts.get(gp).push({ geo, mat: o.material });
    });
    if (!parts.size) { if (level === 0) return null; break; }
    const holder = new THREE.Group(); holder.name = lod.name + tag;
    for (const [gp, list] of parts) {
      const names = Object.keys(list[0].geo.attributes).filter((k) => list.every((p) => p.geo.attributes[k]));
      for (const p of list) for (const k of Object.keys(p.geo.attributes)) if (!names.includes(k)) p.geo.deleteAttribute(k);
      const geo = list.length === 1 ? list[0].geo : BGU.mergeGeometries(list.map((p) => p.geo), false);
      if (!geo) continue;
      if (list.length > 1) for (const p of list) p.geo.dispose();
      geo.computeBoundingSphere();
      const src = list[0].mat;
      const mat = gp.make(src, level);
      mat.name = gp.name;   // buildOutlines / kindOf read the group name ('Wood', 'Metal', 'Paper', ...)
      if (level === 0 && src.normalMap && 'normalMap' in mat && !mat.isMeshBasicMaterial) {
        mat.normalMap = src.normalMap; mat.normalMapType = src.normalMapType;
        if (src.normalScale) mat.normalScale.copy(src.normalScale);
        mat.needsUpdate = true;
      }
      const m = new THREE.Mesh(geo, mat);
      m.name = lod.name + ':' + gp.name + tag;
      holder.add(m);
    }
    if (opts.outline) buildOutlines(holder, { only: opts.outline });
    lod.addLevel(holder, dists[level]);
  }
  return lod;
}

/**
 * The gohei's shide (r2): the GLB strips are flat rectangles offset in hard 90-degree steps, which read as pixel
 * stair-steps at game distance. Rebuilt as folded paper: each step is a panel tilted alternately in depth (so the
 * folds catch light / shade), joined to the next by a short slanted fold, so the outline zig-zags on diagonals.
 * Same material, same draw; keeps the original folded top piece (vertices 80..91). ~2x the 46 triangles.
 */
const SHIDE_GEO = new WeakMap();
function shideGeometry(src) {
  if (SHIDE_GEO.has(src)) return SHIDE_GEO.get(src);
  const P = [];
  const quad = (a, b, c, d) => { P.push(...a, ...b, ...c, ...a, ...c, ...d); };
  for (const sx of [1, -1]) for (const [zl, w, h, x0] of [[0.006, 0.026, 0.047, 0.011], [-0.006, 0.022, 0.04, 0.011]]) {
    let prev = null;
    for (let i = 0; i < 5; i++) {
      const xl = x0 + (i & 1 ? 0.016 : 0) + i * 0.0015, xr = xl + w;
      const yt = 0.332 - i * h, yb = yt - h * 0.55;
      const za = zl + (i & 1 ? 0.0035 : -0.0035) * Math.sign(zl), zb = zl - (i & 1 ? 0.0035 : -0.0035) * Math.sign(zl);
      const T = [[sx * xl, yt, za], [sx * xr, yt, za]], B = [[sx * xl, yb, zb], [sx * xr, yb, zb]];
      if (prev) quad(prev[0], prev[1], T[1], T[0]);
      quad(T[0], T[1], B[1], B[0]);
      prev = B;
    }
  }
  const sp = src.attributes.position;
  for (let i = 80; i + 3 < sp.count; i += 4) {   // the folded top piece: two triangles per quad, as authored
    const v = (k) => [sp.getX(i + k), sp.getY(i + k), sp.getZ(i + k)];
    quad(v(0), v(1), v(2), v(3));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  SHIDE_GEO.set(src, g);
  return g;
}

let LANTERN_T = null;
/**
 * Paper-lantern glow: warm core, darker ribs across the paper, a soft edge falloff (not a flat light bulb). Unlit / blooms.
 * userData.setGlow(k) animates brightness like glowDynamic.
 */
export function lanternPaperMaterial(color = 0xffb155, strength = 2.2) {
  const base = new THREE.Color(color);
  const m = new THREE.MeshBasicMaterial({ color });
  m.toneMapped = false;
  if (!LANTERN_T) LANTERN_T = CEL_U.uCelTime;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCelTime = CEL_U.uCelTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLp;\nvarying vec3 vLn;\nvarying vec3 vLv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLp = position;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvLn = normalize( normalMatrix * normal );\nvLv = -mvPosition.xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLp;\nvarying vec3 vLn;\nvarying vec3 vLv;\nuniform float uCelTime;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        float vl = length( vLv );
        float ndv = vl > 1e-5 ? abs( dot( normalize( vLn ), vLv / vl ) ) : 1.0;
        float rib = 1.0 - 0.32 * ( 1.0 - smoothstep( 0.0, 0.18, abs( fract( vLp.y * 60.0 ) - 0.5 ) * 2.0 ) );
        float core = 0.55 + 0.45 * ndv;
        float flick = 0.94 + 0.06 * sin( uCelTime * 11.0 + sin( uCelTime * 3.7 ) * 2.0 );
        diffuseColor.rgb *= rib * core * flick;
        diffuseColor.rgb += vec3( 1.0, 0.85, 0.6 ) * pow( ndv, 6.0 ) * 0.25 * length( diffuse );
      }`);
  };
  m.customProgramCacheKey = () => 'lanternPaper1';
  m.userData.setGlow = (k) => { m.color.copy(base).multiplyScalar(Math.max(0.02, strength * k)); };
  m.userData.setGlow(1);
  return m;
}

/**
 * Draw-call merge for VRoid faces: the three alpha-blended line layers (eyeline, eyelash, brow — same colour, same
 * blending, same morphs) become ONE skinned mesh with a stacked texture atlas. Skipped when UVs leave 0..1 or the layers
 * do not share a skeleton. Returns the number of meshes removed.
 */
export function mergeFaceLines(root) {
  const parts = [];
  root.traverse((o) => { if (o.isSkinnedMesh && !Array.isArray(o.material) && /^(FaceEyeline|FaceEyelash|FaceBrow)$/.test(o.material.name || '')) parts.push(o); });
  if (parts.length < 2) return 0;
  const a = parts[0];
  for (const p of parts) {
    if (!p.material.map?.image || p.parent !== a.parent || !sameBones(p.skeleton, a.skeleton) || !p.bindMatrix.equals(a.bindMatrix)) return 0;
    const uv = p.geometry.attributes.uv;
    if (!uv) return 0;
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); if (u < -1e-3 || u > 1.001 || v < -1e-3 || v > 1.001) return 0; }
    const ma = p.geometry.morphAttributes.position;
    if ((ma?.length || 0) !== (a.geometry.morphAttributes.position?.length || 0)) return 0;
  }
  const W = 512, H = 128, n = parts.length;
  let cv;
  try {
    cv = document.createElement('canvas'); cv.width = W; cv.height = H * n;
    const cx = cv.getContext('2d');
    parts.forEach((p, i) => cx.drawImage(p.material.map.image, 0, i * H, W, H));
  } catch (e) { return 0; }
  const geos = parts.map((p, i) => {
    const g = p.geometry.clone();
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setY(k, (i + Math.min(1, Math.max(0, uv.getY(k)))) / n);
    for (const key of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(key)) g.deleteAttribute(key);
    return g;
  });
  const merged = BGU.mergeGeometries(geos, false);
  if (!merged) return 0;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.anisotropy = 4;
  const mat = a.material;
  // heroine-look: keep the morph names (parts[0] IS a: after updateMorphTargets its dictionary is renumbered 0..n, so the
  // merged lines never followed a blink once the cel merge matched targets by name)
  const dict = { ...a.morphTargetDictionary }, rows = parts.map((p) => p.material.name);
  mat.map = tex; mat.name = 'FaceLines'; mat.needsUpdate = true;
  a.geometry = merged;
  a.updateMorphTargets();
  a.morphTargetDictionary = CEL_FIX.on ? dict : { ...parts[0].morphTargetDictionary };
  a.userData.lineRows = rows;
  for (let i = 1; i < parts.length; i++) parts[i].parent.remove(parts[i]);
  return parts.length - 1;
}

/**
 * heroine-look: brows and the lash line through the character's OWN fringe (the cel-shading convention). One extra
 * SkinnedMesh per character ('cel:seeLines', userData.seeLines) shares the face-line geometry, skeleton and morphs and is
 * drawn a few centimetres toward the camera along the view ray with the depth test on: it wins over the fringe (which lies
 * within that distance in front of the brows) and loses to anything further in front (hands, hats, the gohei, other
 * characters). Per texture row strength (stock FaceLines atlas rows Eyeline / Eyelash / Brow; the sculpted FaceEyelash's
 * three rows lash / lower line / brow), faded by the head's facing (gone past ~70° and at the back) and by distance (gone
 * by SEE_LINES.far m; the rig also hides the mesh there, so the draw costs nothing far away). Only the opaque core of a
 * stroke is drawn, lifted toward a skin tone (dark paint vanishes on near-black hair), lit by the scene (toon + Veil hook),
 * drawn just before the face decals so the real line paints over it wherever it is visible. Returns the mesh or null.
 */
// mean colour of a material (colour x map, from a 4x4 down-sample of the image; linear)
function meanAlbedo(m) {
  const c = m.color ? m.color.clone() : new THREE.Color(1, 1, 1);
  const img = m.map?.image;
  if (!img || typeof document === 'undefined') return c;
  try {
    const cv = document.createElement('canvas'); cv.width = cv.height = 4;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0, 4, 4);
    const d = cx.getImageData(0, 0, 4, 4).data, t = [0, 0, 0];
    let n = 0;
    for (let i = 0; i < 64; i += 4) if (d[i + 3] > 128) { for (let k = 0; k < 3; k++) t[k] += d[i + k] / 255; n++; }
    if (n) c.multiply(new THREE.Color().setRGB(t[0] / n, t[1] / n, t[2] / n, THREE.SRGBColorSpace));
  } catch (e) { /* tainted or not decodable: colour only */ }
  return c;
}
export const SEE_LINES = { off: 0.035, brow: 0.6, lash: 0.4, lower: 0.25, lift: 0.6, far: 10, lod: 2, light: 0.7 };
const SEE_SKIN = new THREE.Color(0.86, 0.66, 0.6);   // the stroke is lifted toward a skin tone: dark paint would vanish on dark hair
export function buildSeeLines(root) {
  const lines = [];
  let brow = false, hairM = null;
  root.traverse((o) => {
    if (!o.isSkinnedMesh || Array.isArray(o.material) || o.userData.outline) return;
    const n = o.material?.name || '';
    if (!hairM && n === 'Hair' && !o.material.transparent) hairM = o.material;
    if (/^(FaceLines|FaceEyeline|FaceEyelash|FaceBrow)$/.test(n)) lines.push(o);
    if (n === 'FaceBrow' || n === 'FaceLines') brow = true;
  });
  if (lines.length !== 1 || !lines[0].material.map) return null;   // separate stock layers (merge skipped): would be 3 draws
  const src = lines[0], sm = src.material;
  const S = SEE_LINES;
  const rowS = (nm) => (/Brow/.test(nm) ? S.brow : /Eyelash|Eyeline/.test(nm) ? S.lash : S.lower);
  // stock: atlas rows in merge order; sculpted single FaceEyelash (no brow layer): lash, lower line, brow
  const rows = src.userData.lineRows || (!brow && sm.name === 'FaceEyelash' ? ['FaceEyelash', 'lower', 'FaceBrow'] : [sm.name]);
  const sv = rows.map(rowS);
  // the hair's mean albedo decides the blend: dark hair gets the stroke ADDED (lifted toward skin, it would vanish
  // otherwise), light / coloured hair gets darkened toward the line colour (reverse subtract of hair - line)
  const hc = hairM ? meanAlbedo(hairM) : new THREE.Color(0.05, 0.05, 0.06);
  const dark = (hc.r * 0.299 + hc.g * 0.587 + hc.b * 0.114) < 0.18;
  const lineC = new THREE.Color(0.06, 0.04, 0.045);
  // fix round: on light hair a darkened stroke reads strong (navy brows on kuzunoha): S.light x the row strengths
  if (!dark) for (let i = 0; i < sv.length; i++) sv[i] *= S.light;
  const U = {
    uSeeS: { value: new THREE.Vector4(sv[0] ?? 0, sv[1] ?? 0, sv[2] ?? 0, rows.length) },
    uSeeOff: { value: S.off }, uSeeFar: { value: S.far }, uSeeLift: { value: S.lift }, uSeeSkin: { value: SEE_SKIN.clone() },
    uSeeDark: { value: dark ? 1 : 0 }, uSeeHair: { value: hc.clone().sub(lineC) },
    uHeadC: { value: (sm.celU?.uHeadC?.value || new THREE.Vector3()).clone() },
  };
  // lit like the rest of her (toon + the Veil hook): a lifted stroke must not glow at night
  const mat = new THREE.MeshToonMaterial({ map: sm.map, color: sm.color.clone(), transparent: true, depthWrite: false, depthTest: true, side: sm.side, fog: true,
    blending: THREE.CustomBlending, blendEquation: dark ? THREE.AddEquation : THREE.ReverseSubtractEquation,
    blendSrc: THREE.SrcAlphaSaturateFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
  mat.forceSinglePass = true;
  mat.name = 'SeeLines';
  mat.userData.surface = 'none';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uHeadC;\nuniform float uSeeOff, uSeeFar;\nvarying float vSee;')
      .replace('#include <project_vertex>', `#include <project_vertex>
{
  // facing: the spherised face normal at this point and the head's forward axis (bind +z), both skinned
  vec3 cd = position - uHeadC; cd.z += 0.035; cd.y *= 0.85;
  vec3 sn = normalize( cd ), fw = vec3( 0.0, 0.0, 1.0 );
#ifdef USE_SKINNING
  sn = ( skinMatrix * vec4( sn, 0.0 ) ).xyz; fw = ( skinMatrix * vec4( fw, 0.0 ) ).xyz;
#endif
  sn = normalize( normalMatrix * sn ); fw = normalize( normalMatrix * fw );
  vec3 tv = normalize( -mvPosition.xyz );
  float dist = -mvPosition.z;
  vSee = smoothstep( 0.15, 0.4, dot( sn, tv ) ) * smoothstep( 0.34, 0.62, dot( fw, tv ) ) * ( 1.0 - smoothstep( uSeeFar * 0.7, uSeeFar, dist ) );
  mvPosition.xyz += tv * uSeeOff;     // toward the camera along the view ray: same pixel, nearer depth
  gl_Position = projectionMatrix * mvPosition;
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uSeeS;\nuniform float uSeeLift, uSeeDark;\nuniform vec3 uSeeSkin, uSeeHair;\nvarying float vSee;\nfloat seeNk = 0.0;\n#define SEE_TN ' + (+CEL_FIX.tune[3]).toFixed(4) + '\n#define SEE_LOD ' + (+SEE_LINES.lod).toFixed(2))
      .replace('#include <alphatest_fragment>', `{
  float row = floor( clamp( vMapUv.y, 0.0, 0.9999 ) * uSeeS.w );
  float s = row < 0.5 ? uSeeS.x : row < 1.5 ? uSeeS.y : uSeeS.z;
  // fix round: only the solid core of a stroke (the lash row's soft wing fill read as a smudge / second tail past the corner)
  diffuseColor.a = s * ( row < 0.5 ? smoothstep( 0.62, 0.95, diffuseColor.a ) : smoothstep( 0.4, 0.9, diffuseColor.a ) ) * vSee;
  // lash row: thin strokes only; where the blurred mip says the paint is a broad mass (the lash wing) it is left out
  if ( row < 0.5 ) diffuseColor.a *= 1.0 - smoothstep( 0.5, 0.85, textureLod( map, vMapUv, SEE_LOD ).a );
  // dusk / night: quieter, and the lift turns from skin toward a cool grey (lantern-lit skin tone read as painted brown strokes)
  #ifdef MV_FILL_LIT
  seeNk = smoothstep( 0.12, 0.55, mvV );
  #endif
  diffuseColor.a *= 1.0 - 0.45 * seeNk * SEE_TN;
  // dark hair: the lifted stroke is added; light hair: (hair - line) is subtracted (the blend does the rest)
  diffuseColor.rgb = uSeeDark > 0.5 ? mix( diffuseColor.rgb, mix( uSeeSkin, vec3( 0.5, 0.53, 0.66 ), seeNk * SEE_TN ), uSeeLift ) : max( uSeeHair, vec3( 0.0 ) );
  if ( diffuseColor.a < 0.004 ) discard;
}
#include <alphatest_fragment>`)
      .replace('#include <opaque_fragment>', `if ( uSeeDark > 0.5 ) outgoingLight = mix( outgoingLight, vec3( dot( outgoingLight, vec3( 0.299, 0.587, 0.114 ) ) ) * vec3( 0.85, 0.92, 1.18 ), seeNk * SEE_TN * 0.85 );
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'seeLines5';
  hookMaterial(mat);
  const m = new THREE.SkinnedMesh(src.geometry, mat);
  m.name = 'cel:seeLines';
  m.position.copy(src.position); m.quaternion.copy(src.quaternion); m.scale.copy(src.scale);
  // drawn just before the face decals: where the line is visible anyway, the real line paints over the lifted stroke
  m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; m.renderOrder = src.renderOrder - 1;
  m.userData.seeLines = true;
  if (src.morphTargetDictionary) { m.morphTargetDictionary = { ...src.morphTargetDictionary }; m.morphTargetInfluences = src.morphTargetInfluences.map(() => 0); }
  src.parent.add(m);
  m.bind(src.skeleton, src.bindMatrix);
  return m;
}

/**
 * Draw-call merge for costume models: skinned meshes under the same parent that share a material, skeleton, bind matrix
 * and local transform (the costume files split garments into many primitives: the heroine's outfit is 25) become one mesh.
 * Morph-target meshes are left alone. Returns the number of meshes removed.
 */
export function mergeByMaterial(root) {
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isSkinnedMesh || Array.isArray(o.material) || o.geometry.morphAttributes.position || o.userData.outline) return;
    const key = o.parent.uuid + '|' + o.material.uuid;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(o);
  });
  let removed = 0;
  const attrs = (g) => Object.keys(g.attributes).sort().join(',');
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const a = list[0];
    const ok = list.filter((o) => sameBones(o.skeleton, a.skeleton) && o.bindMatrix.equals(a.bindMatrix) && o.matrix.equals(a.matrix) && attrs(o.geometry) === attrs(a.geometry) && !!o.geometry.index === !!a.geometry.index);
    if (ok.length < 2) continue;
    const merged = BGU.mergeGeometries(harmonize(ok.map((o) => o.geometry)), false);
    if (!merged) continue;
    a.geometry = merged;
    for (let i = 1; i < ok.length; i++) { ok[i].parent.remove(ok[i]); removed++; }
  }
  return removed;
}

/**
 * Shadow proxy (crowd cost): every shadow-casting skinned mesh of a character that shares one skeleton / bind matrix / local
 * transform is merged into ONE position + skin-only mesh that the shadow pass draws instead of ~13 per-material casters
 * (×2 cascades). The proxy lives on SHADOW_PROXY_LAYER (seen only by shadow cameras that enable it, see structures.js
 * PROXY_LAYER); the rig switches between proxy and real casters each frame depending on whether the sun's shadow camera sees
 * that layer, so nothing loses its shadow when it does not. Morph meshes (the face) stay real casters unless opts.morph (the
 * draw-call pass sets it for characters: the face joins in its rest shape). Returns the proxy or null.
 */
export const SHADOW_PROXY_LAYER = 5;
export function buildShadowProxy(root, opts = {}) {
  const list = [];
  // draw-call pass: morph meshes (the face) join too, in their rest shape (a blink or a smile does not show in a shadow)
  const withMorph = opts.morph === true;
  root.traverse((o) => { if (o.isSkinnedMesh && o.castShadow && !o.userData.outline && (withMorph || !o.geometry.morphAttributes.position)) list.push(o); });
  if (list.length < 2) return null;
  // glTF puts each multi-primitive mesh under its own group: compare world transforms, keep the biggest compatible set
  root.updateMatrixWorld(true);
  let ok = [];
  for (const a of list) {
    const set = list.filter((o) => sameBones(o.skeleton, a.skeleton) && o.bindMatrix.equals(a.bindMatrix) && o.matrixWorld.equals(a.matrixWorld));
    if (set.length > ok.length) ok = set;
    if (ok.length > list.length / 2) break;
  }
  if (ok.length < 2) return null;
  const a = ok[0];
  const geos = ok.map((o) => {
    const g = o.geometry, c = new THREE.BufferGeometry();
    for (const n of ['position', 'skinIndex', 'skinWeight']) c.setAttribute(n, g.attributes[n]);
    if (g.index) c.index = g.index;
    else { const n = g.attributes.position.count, ix = new (n > 65535 ? Uint32Array : Uint16Array)(n); for (let i = 0; i < n; i++) ix[i] = i; c.setIndex(new THREE.BufferAttribute(ix, 1)); }
    return c;
  });
  const merged = BGU.mergeGeometries(harmonize(geos), false);
  if (!merged) return null;
  const mat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
  mat.name = 'ShadowProxy';
  const px = new THREE.SkinnedMesh(merged, mat);
  px.name = 'shadowProxy';
  px.matrix.copy(a.matrix); px.matrix.decompose(px.position, px.quaternion, px.scale);
  px.bind(a.skeleton, a.bindMatrix);
  px.layers.set(SHADOW_PROXY_LAYER);
  px.castShadow = true; px.receiveShadow = false; px.frustumCulled = false;
  px.userData.shadowProxy = true;
  a.parent.add(px);
  for (const o of ok) o.userData.proxied = true;      // flags only: userData is JSON-copied when a model is cloned
  return px;
}

// GLB primitives of one garment can store the same attribute with different array types (skinIndex u8 / u16, uv f32 /
// normalised u16): give every geometry the widest common layout so mergeGeometries accepts them. Shallow copies only.
export function harmonize(geos) {
  const names = Object.keys(geos[0].attributes);
  const out = geos.map((g) => { const c = new THREE.BufferGeometry(); c.index = g.index; for (const n of names) c.setAttribute(n, g.attributes[n]); return c; });
  for (const n of names) {
    const as = geos.map((g) => g.attributes[n]);
    const a0 = as[0];
    if (as.every((a) => !a.isInterleavedBufferAttribute && a.array.constructor === a0.array.constructor && a.normalized === a0.normalized && a.gpuType === a0.gpuType)) continue;
    const isIdx = n === 'skinIndex';
    const T = isIdx ? Uint16Array : Float32Array;
    out.forEach((g, i) => {
      const a = as[i];
      const arr = new T(a.count * a.itemSize);
      for (let v = 0; v < a.count; v++) for (let k = 0; k < a.itemSize; k++) arr[v * a.itemSize + k] = a.getComponent(v, k);
      g.setAttribute(n, new THREE.BufferAttribute(arr, a.itemSize, false));
    });
  }
  return out;
}

/** Crown-highlight band for a hair mesh (bind space): height above the head centre, half width, strand count, strength. */
export function hairBand(geo, headC, ex = null) {
  // heroine-look: the hair material's glTF extras.hairBand { y, half, strength, teeth = 0 } (metres, bind space, y above the
  // head centre); teeth > 0 = the old zig-zag crown ring. CEL_FIX.band (?hairband=y,half,strength) overrides for tuning.
  let hb = CEL_FIX.on ? (CEL_FIX.band || ex?.hairBand) : null;
  // the hair maker's earlier extras.hairRing { y: absolute bind height, half } (akari_hair round 4) reads as a soft band too
  if (CEL_FIX.on && !hb && ex?.hairRing?.y > 0 && ex.hairRing.half > 0) hb = { y: ex.hairRing.y - headC.y, half: ex.hairRing.half * 1.3, strength: 1 };
  if (hb && hb.y > 0 && hb.half > 0) return new THREE.Vector4(hb.y, hb.half, hb.teeth ?? 0, hb.strength ?? 1);
  geo.computeBoundingBox();
  const top = geo.boundingBox.max.y - headC.y;
  if (!(top > 0.05)) return null;
  // CEL_FIX.stock (default; ?stockband=0 = off): stock card hair gets the soft band too (width from the same guess)
  if (CEL_FIX.on && CEL_FIX.stock) return new THREE.Vector4(top * 0.6, Math.max(0.012, top * 0.12), 0, 1);
  return new THREE.Vector4(top * 0.6, Math.max(0.008, top * 0.07), 26, 1);
}

/** Fox-ear pivots (bind space) per side from the ear meshes: { earL: Vector4(x, baseY, z, height), earR }. */
export function earPivots(geos, headC) {
  const side = [[0, 0, 0, 0, 1e9, -1e9], [0, 0, 0, 0, 1e9, -1e9]]; // sumx, sumz, n, _, minY, maxY
  for (const g of geos) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const s = side[p.getX(i) - headC.x > 0 ? 0 : 1];
      s[0] += p.getX(i); s[1] += p.getZ(i); s[2]++; s[4] = Math.min(s[4], p.getY(i)); s[5] = Math.max(s[5], p.getY(i));
    }
  }
  const v = (s) => s[2] ? new THREE.Vector4(s[0] / s[2], s[4], s[1] / s[2], Math.max(0.02, s[5] - s[4])) : null;
  return { earL: v(side[0]), earR: v(side[1]) };
}
