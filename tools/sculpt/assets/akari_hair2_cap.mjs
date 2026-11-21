// The crown and fringe are a single flowing surface. Each sector ends at a different
// position on the forehead and has a guiding crease which runs back to the side part.
// azimuth is measured from +Z toward her left. Distances are in metres.
import { V, curve, curveAt, sheet } from './akari_hair2_lib.mjs';

const CY = 1.424, CZ = -0.012;
const RX = 0.0945, RY = 0.110, RZ = 0.1135;
const RAD = Math.PI / 180;
// Right edge of each lock and height at the shared edge, then its tip and the tip height.
const sectors = [
  [-148,1.414,-164,1.394,1.049,0.969],[-121,1.414,-131,1.407,1.072,1.018],
  [-94,1.416,-108,1.404,1.095,1.032],[-67,1.428,-78,1.388,1.101,1.057],
  [-39,1.426,-56,1.402,1.080,1.045],[-15,1.440,-31,1.404,1.050,1.010],
  [27,1.428,9,1.386,1.080,1.020],[54,1.420,42,1.402,1.070,1.025],
  [77,1.412,66,1.379,1.115,1.043],[106,1.413,91,1.386,1.087,1.016],
  [137,1.414,119,1.398,1.083,1.008],[162,1.412,149,1.398,1.055,0.992],
  [180,1.413,172,1.400,1.068,1.012],
];
const ease = (a,b,x) => { const t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t); };
export function crownMesh() {
  const pos = [ -0.016, CY + RY, CZ ], at = [{ t: 0, s: 0, side: 1, depth: 0.05 }];
  const idx = [], sections = 10, rings = 25, n = sectors.length * sections;
  const clamp = (v) => Math.max(0, Math.min(1, v));
  for (let j = 1; j <= rings; j++) {
    const t = j / rings;
    for (let i = 0; i < n; i++) {
      const k = Math.floor(i / sections), u = (i % sections) / sections;
      const [end, edgeY, tip, tipY, backEdge, backTip] = sectors[k];
      const [start0, startY, , , prevBackEdge] = sectors[(k + sectors.length - 1) % sectors.length];
      const start = k === 0 ? -180 : start0;
      const a = start + (end - start) * u;
      const v = a < tip ? (tip - a) / (tip - start) : (a - tip) / (end - tip);
      const y = tipY + ((a < tip ? startY : edgeY) - tipY) * Math.pow(v, 0.84);
      const phi0 = a * RAD;
      const front = Math.exp(-((a / 80) ** 4));
      const bias = -0.46 * (1 - t) - 0.42 * Math.sin(Math.PI * t) * Math.sin(Math.PI * t);
      const phi = phi0 + bias * front;
      const pitch = Math.acos((y - CY) / RY) * t;
      const ring = Math.sin(pitch);
      const seam = Math.exp(-((1 - v) ** 2) / 0.030);
      const ridge = 0.0021 * (1 - seam) * ring;
      const near = [
        Math.sin(phi) * (RX + ridge) * ring - 0.016 * Math.max(0, 1 - ring) ** 1.5,
        CY + RY * Math.cos(pitch), CZ + Math.cos(phi) * (RZ + ridge) * ring,
      ];
      // The back panels share the crown surface all the way from the part to the
      // longest tip. Skin the portion below the nape to the hanging chains.
      const tail = ease(65, 108, Math.abs(a));
      const split = 0.45, f = Math.max(0, (t - split) / (1 - split));
      const turn = phi0 + 0.17 * Math.sin(4.8 * f + phi0) * f + 0.21 * f**3 * Math.cos(3 * phi0);
      const pc = 1.48 * Math.min(1, t / split), rr = Math.sin(pc);
      const fan = ease(0, 0.74, f), flow = Math.sin(Math.PI * 1.65 * f + phi0);
      const endY = backTip + ((a < tip ? prevBackEdge : backEdge) - backTip) * v ** (a < tip ? 0.67 : 1.21);
      const land = CY + RY * Math.cos(1.48);
      const wave = (1 - seam) * (0.002 + 0.004 * fan);
      const back = [
        Math.sin(turn) * rr * (RX + 0.056 * fan + wave) + 0.023 * fan * flow + 0.018 * f**3 - 0.016 * Math.max(0, 1 - rr) ** 1.5,
        f > 0 ? land + f * (endY - land) : CY + RY * Math.cos(pc),
        CZ + Math.cos(turn) * rr * (RZ + 0.041 * fan + wave) - 0.033 * ease(0,0.64,f) + 0.013 * Math.sin(4*phi0) * f**3,
      ];
      const p = near.map((coord,q) => coord + tail * (back[q] - coord));
      // The outer edge sweeps behind the sleeve cap before it descends past the shoulder.
      // This follows the measured cross section of the coat and its turned collar.
      if (tail > 0) {
        const shoulder = ease(1.38,1.255,p[1]);
        const shell = -0.102 - 0.074 * Math.sqrt(Math.max(0,1-(p[0]/0.185)**2));
        p[2] -= shoulder * Math.max(0, p[2] - shell);
        p[2] -= 0.024 * ease(1.38,1.287,p[1]) * (1 - 0.85*ease(1.235,1.08,p[1]));
      }
      pos.push(...p);
      const groove = (0.095 + 0.40 * seam + 0.10 * v*v) * Math.max(ring, rr);
      at.push({ t, s: 2*u - 1, side: 1, tail, depth: groove + 0.06 * (1-t) + 0.13 * tail * f });

    }
  }
  for (let i = 0; i < n; i++) {
    const ni = (i + 1) % n;
    idx.push(0, 1 + i, 1 + ni);
    for (let j = 0; j < rings - 1; j++) {
      const a = 1 + n*j + i, b = 1 + n*j + ni;
      idx.push(a,a+n,b, b,a+n,b+n);
    }
  }
  // The inner face is visible from the front and when the actor turns. Carry the same
  // alpha-free geometry around the edge, so its silhouette stays intact in all passes.
  const outer = pos.length / 3, outerTriangles = idx.length;
  for (let i = 0; i < outer; i++) {
    const k = 3 * i, p = [pos[k], pos[k+1], pos[k+2]], normal = crownNormal(p);
    const inner = V.sub(p, V.mul(normal, 0.0022));
    pos.push(...inner);
    at.push({ ...at[i], side: -1, depth: Math.min(1, 0.50 + at[i].depth * 0.67) });
  }
  for (let i = 0; i < outerTriangles; i += 3)
    idx.push(outer + idx[i], outer + idx[i+2], outer + idx[i+1]);
  const last = 1 + (rings - 1) * n;
  for (let i = 0; i < n; i++) {
    const a = last + i, b = last + (i + 1) % n;
    idx.push(a,a+outer,b, b,a+outer,b+outer);
  }
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx), at };
}

export function crownNormal(p) {
  const scalp = V.nrm([p[0] / RX ** 2, (p[1] - CY) / RY ** 2, (p[2] - CZ) / RZ ** 2]);
  const hang = ease(1.43, 1.34, p[1]);
  const lower = V.nrm([p[0] * 0.88, 0.012, p[2] - CZ]);
  return V.nrm(V.lerp(scalp, lower, hang));
}

// Draw secondary fringe shapes in the frontal plane. Wrap their two edges back onto
// the brow and roll up one edge, leaving a thin shadow where each rests on the main bang.
export function fringeLeaves() {
  const designs = [
    { knots: [[-0.045,1.498],[-0.034,1.468],[-0.018,1.449],[0.000,1.428],[0.013,1.405],[0.012,1.395]], widths:[0.001,0.009,0.0112,0.010,0.0051,0.0003], roll:1 },
    { knots: [[-0.065,1.480],[-0.064,1.457],[-0.060,1.438],[-0.054,1.420],[-0.053,1.408]], widths:[0.001,0.006,0.007,0.0048,0.0003], roll:-1 },
    { knots: [[0.008,1.499],[0.025,1.479],[0.043,1.460],[0.052,1.437],[0.055,1.413]], widths:[0.001,0.005,0.0062,0.0039,0.0003], roll:1 },
  ];
  return designs.map(({knots,widths,roll},index) => {
    const spine = curve(knots.map(([x,y])=>[x,y,0]), [widths], {per:18});
    const point = (u,t) => {
      const {p,T,s} = curveAt(spine,t*spine.L);
      const lateral = (u*2-1) * s[0];
      const x = p[0] - T[1]*lateral, y=p[1] + T[0]*lateral;
      const z0 = CZ + RZ*Math.sqrt(Math.max(0,1-(x/RX)**2-((y-CY)/RY)**2));
      const ridge = 0.0033*(1-(u*2-1)**2) + 0.0012*roll*(u*2-1);
      const lift = -0.004 + 0.0078*ease(0,0.4,t);
      return [x,y,z0 + lift + ridge*ease(0,0.33,t)];
    };
    const mesh = sheet({nu:6,nv:30, P:point, N:(u,t)=>crownNormal(point(u,t)), th:()=>0.0007});
    mesh.at.forEach(a=>{
      a.t=a.v; a.s=a.u*2-1; a.side=a.face===1?-1:1;
      a.depth=0.05+0.17*(1-ease(0,0.6,a.v))+0.28*ease(0.40,1,Math.abs(a.s))+0.12*ease(0.58,1,roll*a.s)+(index===0?0:0.04);
      if(a.face===1)a.depth=0.54;
    });
    return mesh;
  });
}
