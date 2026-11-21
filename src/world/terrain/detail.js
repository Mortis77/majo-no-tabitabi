// Painterly ground MATERIAL detail, baked on the GPU once at boot into two RGBA8 texture arrays (tileable, mip-mapped):
//   albedo[layer] : rgb = colour RATIO around the material's palette colour, stored ×0.5 (0.5 = ×1, so the land palette
//                   and its Veil tints stay in charge; the texture only paints strokes, grain and flecks), a = height 0..1
//   normal[layer] : rg = tangent-space normal xy (×0.5+0.5, x along u, y along v), b = cavity (1 = open, 0 = crevice),
//                   a = accent mask (flowers in grass, clover flowers, sparkle seeds in snow, moss in paving joints, …)
// Layers (index = constant in DETAIL): see LAYERS below. Generation is one full-screen pass per layer and buffer (~20 ms
// on an M-series GPU at 512²). Everything is periodic in uv so the tiles wrap seamlessly; the terrain shader hides the
// repetition with two scales + macro noise.
import * as THREE from 'three';

export const DETAIL = {
  GRASS: 0, CLOVER: 1, DRY: 2, EARTH: 3, SAND: 4, GRAVEL: 5, ROCK: 6, SNOW: 7, PAVE: 8, SOIL: 9, RAKED: 10, LEAVES: 11,
};
const LAYERS = 12;
// normal strength per layer (height -> slope)
const NSTR = [2.2, 2.6, 2.0, 3.2, 2.0, 4.5, 4.0, 1.4, 4.0, 3.0, 3.0, 2.6];

const GLSL_COMMON = /* glsl */`
precision highp float;
precision highp int;
precision highp sampler2DArray;
uniform int uLayer;
uniform float uSize;
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
// periodic value noise: period P cells over uv 0..1
float vn(vec2 uv, float P) {
  vec2 p = uv * P; vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  float a = h21(mod(i, P)), b = h21(mod(i + vec2(1.0, 0.0), P)), c = h21(mod(i + vec2(0.0, 1.0), P)), d = h21(mod(i + vec2(1.0, 1.0), P));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 uv, float P, int oct) {
  float s = 0.0, a = 0.5, t = 0.0;
  for (int i = 0; i < 6; i++) { if (i >= oct) break; s += a * vn(uv + float(i) * 0.137, P); t += a; a *= 0.5; P *= 2.0; }
  return s / t;
}
// periodic voronoi: x = F1, y = F2, z = cell hash, w = second hash
vec4 vor(vec2 uv, float P, float jit) {
  vec2 p = uv * P; vec2 ip = floor(p), fp = fract(p);
  float f1 = 9.0, f2 = 9.0; vec2 id = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 c = mod(ip + g, P);
    vec2 o = 0.5 + (h22(c) - 0.5) * jit;
    vec2 r = g + o - fp; float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; id = c; } else if (d < f2) { f2 = d; }
  }
  return vec4(sqrt(f1), sqrt(f2), h21(id + 7.7), h21(id * 1.31 + 3.3));
}
// scattered tapered brush strokes; returns (coverage, stroke hash, along 0..1, second hash) of the top-most stroke
vec4 strokes(vec2 uv, float P, float len, float wid, float ang, float angVar, float seed, int per) {
  vec2 p = uv * P; vec2 ip = floor(p), fp = fract(p);
  vec4 best = vec4(0.0, -1.0, 0.0, 0.0);
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 c = mod(ip + g, P);
    for (int k = 0; k < 4; k++) {
      if (k >= per) break;
      vec2 hc = h22(c + seed + float(k) * 13.17);
      float hh = h21(c * 1.73 + seed + float(k) * 5.31);
      vec2 ctr = g + hc - fp;
      float a = ang + (hh - 0.5) * angVar;
      vec2 dir = vec2(cos(a), sin(a));
      float L = len * (0.6 + 0.8 * fract(hh * 7.3));
      float t = dot(-ctr, dir) / L;
      if (abs(t) > 0.5) continue;
      float bow = (fract(hh * 3.7) - 0.5) * 0.35 * L;                 // slightly curved strokes
      float across = dot(-ctr, vec2(-dir.y, dir.x)) - bow * (1.0 - 4.0 * t * t);
      float w = wid * (0.7 + 0.6 * fract(hh * 11.1)) * (1.0 - 3.2 * t * t) + 1e-4;
      float cov = 1.0 - smoothstep(w * 0.45, w, abs(across));
      if (cov > 0.02 && hh > best.y) best = vec4(cov, hh, t + 0.5, fract(hh * 17.9));
    }
  }
  if (best.y < 0.0) best.y = 0.0;
  return best;
}
// soft round dots (flowers, pebbles, sparkle seeds): (coverage, hash, dist/r)
vec3 dots(vec2 uv, float P, float r, float keep, float seed) {
  vec2 p = uv * P; vec2 ip = floor(p), fp = fract(p);
  vec3 best = vec3(0.0, 0.0, 9.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)); vec2 c = mod(ip + g, P);
    float hh = h21(c + seed);
    if (hh > keep) continue;
    vec2 o = 0.2 + 0.6 * h22(c + seed * 1.7);
    float rr = r * (0.6 + 0.8 * fract(hh * 9.1));
    float d = length(g + o - fp) / rr;
    if (d < best.z) best = vec3(1.0 - smoothstep(0.65, 1.0, d), hh / keep, d);
  }
  return best;
}

struct L { vec3 c; float h; float a; };

L layer(int id, vec2 uv) {
  L o; o.c = vec3(1.0); o.h = 0.5; o.a = 0.0;
  float big = fbm(uv, 3.0, 4);
  if (id == 0) { // ---- meadow grass: soft blotches + combed blade strokes in light and dark greens, sparse flower dots
    vec3 c = mix(vec3(0.86, 0.9, 0.9), vec3(1.08, 1.06, 0.96), smoothstep(0.3, 0.7, big));
    vec4 s1 = strokes(uv, 22.0, 0.95, 0.075, 1.15, 1.1, 1.0, 3);
    vec4 s2 = strokes(uv + 0.31, 30.0, 0.8, 0.07, 1.25, 1.4, 9.0, 3);
    vec3 dark = vec3(0.72, 0.84, 0.86), light = vec3(1.22, 1.2, 0.9);
    c = mix(c, dark * (0.92 + 0.16 * s2.y), s2.x * 0.85);
    c = mix(c, mix(light, vec3(1.1, 1.18, 0.95), s1.w) * (0.85 + 0.25 * s1.z), s1.x * 0.9);
    c *= 0.93 + 0.14 * vn(uv, 96.0);
    o.c = c;
    o.h = clamp(0.35 + 0.45 * s1.x * (0.4 + 0.6 * s1.z) + 0.2 * s2.x - 0.15 * (1.0 - big), 0.0, 1.0);
    vec3 fl = dots(uv, 18.0, 0.18, 0.16, 4.0);
    o.a = fl.x;
  } else if (id == 1) { // ---- clover: trefoil leaf clusters with pale chevrons, white clover heads
    vec3 c = vec3(0.8, 0.98, 0.86) * (0.9 + 0.15 * big);
    vec4 v = vor(uv, 14.0, 0.9);
    // three round leaflets around each cell centre
    vec2 p = uv * 14.0; vec2 ip = floor(p), fp = fract(p);
    float leaf = 0.0, rim = 0.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y)); vec2 cc = mod(ip + g, 14.0);
      vec2 ctr = g + 0.5 + (h22(cc) - 0.5) * 0.8 - fp;
      float rot = h21(cc + 2.0) * 6.2832;
      for (int k = 0; k < 3; k++) {
        float a = rot + float(k) * 2.0944;
        vec2 lc = ctr + vec2(cos(a), sin(a)) * 0.2;
        float d = length(lc) / 0.2;
        leaf = max(leaf, 1.0 - smoothstep(0.75, 1.0, d));
        rim = max(rim, smoothstep(0.35, 0.55, d) * (1.0 - smoothstep(0.55, 0.75, d)));
      }
    }
    c = mix(c * 0.72, c * vec3(1.02, 1.1, 0.98), leaf);
    c = mix(c, c * vec3(1.25, 1.22, 1.12), rim * leaf * 0.6);
    o.c = c;
    o.h = 0.25 + 0.6 * leaf;
    vec3 fl = dots(uv, 7.0, 0.2, 0.22, 21.0);
    o.a = fl.x;
  } else if (id == 2) { // ---- dry dusk grass: long combed strokes in gold, straw and rust over a dark thatch
    vec3 c = vec3(0.78, 0.74, 0.7) * (0.85 + 0.25 * big);
    vec4 s1 = strokes(uv, 16.0, 1.5, 0.07, 0.9, 0.7, 3.0, 3);
    vec4 s2 = strokes(uv + 0.5, 22.0, 1.3, 0.06, 1.0, 0.9, 7.0, 3);
    vec3 gold = vec3(1.28, 1.16, 0.82), rust = vec3(1.18, 0.86, 0.7), straw = vec3(1.1, 1.08, 0.92);
    c = mix(c, (s2.w < 0.5 ? straw : rust) * (0.85 + 0.2 * s2.z), s2.x * 0.8);
    c = mix(c, gold * (0.8 + 0.3 * s1.z), s1.x * 0.9);
    o.c = c;
    o.h = clamp(0.3 + 0.5 * s1.x + 0.25 * s2.x, 0.0, 1.0);
    o.a = 0.0;
  } else if (id == 3) { // ---- packed earth: mottled, foot-worn, hairline cracks, pebbles half sunk in
    // surface r2 request: big soft value only (no per-texel grit), rare cracks, a few loose stones
    float m = fbm(uv, 3.0, 3);
    vec3 c = mix(vec3(0.88, 0.89, 0.92), vec3(1.07, 1.04, 1.0), smoothstep(0.3, 0.72, m));
    vec4 cr = vor(uv + (vec2(fbm(uv, 8.0, 3), fbm(uv + 0.5, 8.0, 3)) - 0.5) * 0.06, 6.0, 1.0);
    float crack = 1.0 - smoothstep(0.0, 0.035, cr.y - cr.x);
    crack *= smoothstep(0.7, 0.82, fbm(uv + 0.2, 4.0, 3));
    c *= 1.0 - crack * 0.14;
    vec4 pv = vor(uv, 14.0, 0.9);
    float peb = (1.0 - smoothstep(0.17, 0.24, pv.x)) * step(pv.z, 0.04);
    vec3 pc = mix(vec3(1.18, 1.2, 1.22), vec3(0.95, 0.9, 0.85), pv.w) * (0.95 + 0.25 * (0.24 - pv.x) * 4.0);
    c = mix(c, pc, peb);
    vec4 pv2 = vor(uv + 0.37, 60.0, 0.9);
    float grit = 0.0 * pv2.x;
    c = mix(c, c * mix(vec3(1.2), vec3(0.75), pv2.w), grit * 0.7);
    o.c = c;
    o.h = clamp(0.4 + 0.15 * (m - 0.5) - crack * 0.2 + peb * (0.35 + 0.25 * (0.2 - pv.x) * 5.0) + grit * 0.12, 0.0, 1.0);
    o.a = peb;
  } else if (id == 4) { // ---- sand: wind ripples, fine grain, the odd shell
    float w = fbm(uv, 4.0, 4);
    float rip = sin((uv.y * 34.0 + w * 3.0 + vn(uv, 6.0) * 1.5) * 6.2832);
    float rp = 0.5 + 0.5 * rip;
    vec3 c = mix(vec3(0.9, 0.9, 0.92), vec3(1.07, 1.05, 1.0), rp) * (0.92 + 0.12 * big);
    float grain = h21(floor(uv * uSize));
    c *= 0.94 + 0.12 * grain;
    vec3 sh = dots(uv, 9.0, 0.12, 0.08, 31.0);
    c = mix(c, vec3(1.28, 1.2, 1.18), sh.x);
    o.c = c;
    o.h = clamp(0.45 + 0.25 * rip * (0.6 + 0.4 * w) + sh.x * 0.25, 0.0, 1.0);
    o.a = sh.x;
  } else if (id == 5) { // ---- river gravel: rounded stones of many colours packed in dark grit
    vec4 v = vor(uv, 18.0, 0.85);
    float stone = 1.0 - smoothstep(0.32, 0.47, v.x * 1.0 + (1.0 - (v.y - v.x)) * 0.15);
    vec3 pal = v.z < 0.3 ? vec3(1.15, 1.12, 1.08) : v.z < 0.55 ? vec3(0.92, 0.95, 1.02) : v.z < 0.8 ? vec3(1.05, 0.95, 0.85) : vec3(0.8, 0.82, 0.86);
    vec4 v2 = vor(uv + 0.29, 44.0, 0.9);
    float small = (1.0 - smoothstep(0.25, 0.4, v2.x)) * (1.0 - stone);
    vec3 c = vec3(0.62, 0.62, 0.64);
    c = mix(c, mix(vec3(0.95), vec3(1.15, 1.1, 1.05), v2.z), small * 0.85);
    c = mix(c, pal * (0.92 + 0.2 * (1.0 - v.x * 2.0)), stone);
    o.c = c * (0.95 + 0.1 * vn(uv, 80.0));
    o.h = clamp(0.2 + stone * (0.8 - v.x * 0.9) + small * 0.25, 0.0, 1.0);
    o.a = stone * step(0.85, v.w);
  } else if (id == 6) { // ---- rock (look round): NO fine strata here (the terrain shader draws few, bold beds); big chisel
    // planes with their own soft tone, a few long fissures running downhill, soft lichen, a gentle weathering gradient
    vec2 wv = uv + (vec2(fbm(uv, 3.0, 4), fbm(uv + 0.4, 3.0, 4)) - 0.5) * 0.1;
    float layerH = fbm(uv * vec2(0.5, 1.0), 2.0, 3);
    vec3 c = mix(vec3(0.9, 0.9, 0.94), vec3(1.08, 1.06, 1.02), layerH);
    vec4 fv = vor(uv, 3.0, 0.9);
    c *= 0.94 + 0.12 * fv.z;
    float ledge = smoothstep(0.0, 0.18, fv.y - fv.x);                    // facet edges: soft creases between the planes
    c *= 0.9 + 0.1 * ledge;
    vec4 cr = vor(wv * vec2(2.2, 0.7), 4.0, 1.0);
    float crack = (1.0 - smoothstep(0.0, 0.03, cr.y - cr.x)) * smoothstep(0.66, 0.8, fbm(uv + 0.37, 3.0, 3));
    c *= 1.0 - crack * 0.28;
    float lich = smoothstep(0.6, 0.8, fbm(uv + 0.7, 4.0, 4));
    c = mix(c, c * vec3(1.02, 1.08, 0.9), lich * 0.45);
    o.c = c;
    o.h = clamp(0.35 * ledge + 0.15 * fbm(uv, 6.0, 3) + 0.25 * layerH + 0.2 * fv.z - crack * 0.3, 0.0, 1.0);
    o.a = lich;
  } else if (id == 7) { // ---- snow: wind-sculpted soft drifts, blue hollows, sparkle seeds
    float d = fbm(uv + vec2(fbm(uv, 2.0, 3) * 0.2, 0.0), 4.0, 5);
    float sast = 0.5 + 0.5 * sin((uv.x * 9.0 + d * 2.5) * 6.2832);
    vec3 c = mix(vec3(0.86, 0.9, 1.0), vec3(1.03, 1.02, 1.0), smoothstep(0.25, 0.75, d * 0.7 + sast * 0.3));
    o.c = c;
    o.h = clamp(d * 0.7 + sast * 0.2, 0.0, 1.0);
    vec3 sp = dots(uv, 70.0, 0.25, 0.35, 41.0);
    o.a = sp.x * (0.4 + 0.6 * sp.y);
  } else if (id == 8) { // ---- stone paving: irregular flagstones, worn edges, recessed joints with moss
    vec4 v = vor(uv + (vec2(vn(uv, 5.0), vn(uv + 0.5, 5.0)) - 0.5) * 0.03, 5.0, 0.75);
    float edge = v.y - v.x;
    float joint = 1.0 - smoothstep(0.035, 0.075, edge);
    float body = smoothstep(0.05, 0.2, edge);
    // surface r2 request: each stone its own tone (and a slight warm / cool shift), soft wash inside, no chip dots
    vec3 sc = mix(vec3(0.8, 0.82, 0.88), vec3(1.14, 1.09, 1.02), v.z) * (0.95 + 0.1 * fbm(uv * 2.0 + v.z, 3.0, 2));
    sc *= 0.92 + 0.12 * body;                                          // worn, slightly paler centres
    sc = mix(sc, sc * 0.8, smoothstep(0.55, 0.75, fbm(uv + v.w, 9.0, 3)) * 0.5); // stains
    vec3 c = mix(sc, vec3(0.3, 0.31, 0.33), joint);
    o.c = c;
    o.h = clamp(0.35 + 0.5 * body + 0.1 * fbm(uv, 16.0, 3) - joint * 0.35, 0.0, 1.0);
    o.a = joint * smoothstep(0.35, 0.65, fbm(uv + 0.11, 6.0, 4));
  } else if (id == 9) { // ---- tilled soil: furrows along u, crumbly clods, darker damp troughs
    float f = 0.5 + 0.5 * sin((uv.y * 10.0 + vn(uv, 12.0) * 0.12) * 6.2832);
    vec3 c = mix(vec3(0.72, 0.7, 0.72), vec3(1.12, 1.08, 1.02), f);
    vec4 v = vor(uv, 40.0, 1.0);
    float clod = (1.0 - smoothstep(0.2, 0.4, v.x)) * (0.5 + 0.5 * f);
    c *= 0.9 + 0.25 * clod * v.z;
    c *= 0.92 + 0.16 * big;
    o.c = c;
    o.h = clamp(f * 0.7 + clod * 0.25, 0.0, 1.0);
    o.a = 0.0;
  } else if (id == 10) { // ---- raked / fine gravel: dense light pebbles
    vec4 v = vor(uv, 36.0, 0.95);
    float st = 1.0 - smoothstep(0.28, 0.46, v.x);
    vec3 c = mix(vec3(0.72, 0.72, 0.74), mix(vec3(0.95, 0.95, 0.97), vec3(1.15, 1.12, 1.08), v.z), st);
    vec4 v2 = vor(uv + 0.5, 70.0, 0.95);
    c = mix(c, c * mix(0.85, 1.15, v2.z), (1.0 - smoothstep(0.25, 0.42, v2.x)) * 0.6);
    o.c = c;
    o.h = clamp(st * (0.75 - v.x) + 0.2, 0.0, 1.0);
    o.a = 0.0;
  } else { // ---- leaf litter: overlapping fallen leaves on dark earth
    vec3 c = vec3(0.72, 0.68, 0.66) * (0.9 + 0.2 * big);
    vec4 s = strokes(uv, 12.0, 0.75, 0.19, 0.0, 6.2832, 5.0, 3);
    vec4 s2 = strokes(uv + 0.4, 16.0, 0.6, 0.16, 0.0, 6.2832, 15.0, 2);
    vec3 l1 = s.w < 0.3 ? vec3(1.35, 0.95, 0.7) : s.w < 0.55 ? vec3(1.3, 0.75, 0.6) : s.w < 0.8 ? vec3(1.25, 1.15, 0.75) : vec3(0.95, 0.85, 0.75);
    vec3 l2 = s2.w < 0.5 ? vec3(1.15, 0.85, 0.65) : vec3(1.0, 0.9, 0.7);
    c = mix(c, l2 * (0.85 + 0.2 * s2.z), s2.x);
    c = mix(c, l1 * (0.85 + 0.25 * s.z), s.x);
    o.c = c;
    o.h = clamp(0.3 + 0.5 * s.x + 0.3 * s2.x * (1.0 - s.x), 0.0, 1.0);
    o.a = max(s.x, s2.x);
  }
  o.c = clamp(o.c, vec3(0.0), vec3(2.0));
  return o;
}
`;

const VERT = /* glsl */`
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const FRAG_ALBEDO = GLSL_COMMON + /* glsl */`
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec2 uv = (floor(vUv * uSize) + 0.5) / uSize;
  L l = layer(uLayer, uv);
  fragColor = vec4(l.c * 0.5, l.h);
}
`;
const FRAG_NORMAL = GLSL_COMMON + /* glsl */`
uniform sampler2DArray uAlb;
uniform float uStr;
in vec2 vUv;
out vec4 fragColor;
float hAt(ivec2 p) { int n = int(uSize); p = (p % n + n) % n; return texelFetch(uAlb, ivec3(p, uLayer), 0).a; }
void main() {
  ivec2 p = ivec2(floor(vUv * uSize));
  float hx = hAt(p + ivec2(1, 0)) - hAt(p - ivec2(1, 0));
  float hy = hAt(p + ivec2(0, 1)) - hAt(p - ivec2(0, 1));
  float k = uStr * uSize / 512.0;
  vec3 n = normalize(vec3(-hx * k, -hy * k, 1.0));
  // cavity: height against the local average (radius 3 texels)
  float h0 = hAt(p), avg = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) avg += hAt(p + ivec2(i, j) * 3);
  avg /= 9.0;
  float cav = clamp(1.0 + (h0 - avg) * 2.2, 0.0, 1.0);
  vec2 uv = (vec2(p) + 0.5) / uSize;
  L l = layer(uLayer, uv);
  fragColor = vec4(n.xy * 0.5 + 0.5, cav, l.a);
}
`;

/**
 * Bake the detail arrays. size: texels per tile side (512 high/med, 256 low). Returns { albedo, normal, layers, size }.
 * Restores the renderer's render target afterwards.
 */
export function bakeDetail(renderer, size = 512, aniso = 4) {
  const mk = () => {
    const rt = new THREE.WebGLArrayRenderTarget(size, size, LAYERS, { depthBuffer: false, stencilBuffer: false });
    const t = rt.texture;
    t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.colorSpace = THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = Math.min(aniso, renderer.capabilities.getMaxAnisotropy?.() || 1);
    return rt;
  };
  const rtA = mk(), rtN = mk();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const uA = { uLayer: { value: 0 }, uSize: { value: size } };
  const uN = { uLayer: { value: 0 }, uSize: { value: size }, uAlb: { value: rtA.texture }, uStr: { value: 1 } };
  const matA = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG_ALBEDO, uniforms: uA, depthTest: false, depthWrite: false });
  const matN = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG_NORMAL, uniforms: uN, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(geo, matA);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(mesh);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prevRT = renderer.getRenderTarget();
  const prevAC = renderer.autoClear;
  const prevXR = renderer.xr?.enabled;
  renderer.autoClear = false;
  if (renderer.xr) renderer.xr.enabled = false;
  try {
    for (let l = 0; l < LAYERS; l++) {
      uA.uLayer.value = l; mesh.material = matA;
      renderer.setRenderTarget(rtA, l); renderer.render(scene, cam);
    }
    for (let l = 0; l < LAYERS; l++) {
      uN.uLayer.value = l; uN.uStr.value = NSTR[l]; mesh.material = matN;
      renderer.setRenderTarget(rtN, l); renderer.render(scene, cam);
    }
  } finally {
    renderer.setRenderTarget(prevRT);
    renderer.autoClear = prevAC;
    if (renderer.xr) renderer.xr.enabled = prevXR;
    geo.dispose(); matA.dispose(); matN.dispose();
  }
  return { albedo: rtA.texture, normal: rtN.texture, layers: LAYERS, size, targets: [rtA, rtN] };
}
