// 灯里's travelling witch outfit. +Z is forward, +X is her left. The closed blouse, fitted shorts, open coat,
// cuff linings, boot uppers and soles are separate surfaces on the same skeleton as the other outfits.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadChar,
  Wardrobe,
  Canvas,
  grid,
  strip,
  ellipsoid,
  loft,
  lerp,
  lerp3,
  smooth,
  W1,
  wmix,
  wsum,
  add,
  sub,
  norm,
  cross,
  clamp01,
} from './garment.mjs';
import { rayNear } from './outfit.mjs';
import { fabricAtlasSize, makeFabricPainter, paletteWidth } from './traveller-fabric.mjs';
import { keepBaseSkeleton } from './keepskel.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const flag = (name) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : null;
};
const base = path.resolve(flag('base') || path.join(ROOT, 'assets/models/sculpt/akari_base.glb'));
const out = path.resolve(flag('out') || path.join(ROOT, '.tmp/wardrobe/build/witch-traveller.glb'));
const C = await loadChar(base),
  wd = new Wardrobe(C);
const TAU = Math.PI * 2,
  MAT = 'cloth_traveller';
const atlas = new Canvas(...fabricAtlasSize);
const silk = {
  mantle: [
    [56, 48, 68],
    [87, 75, 99],
  ],
  pleats: [
    [59, 50, 68],
    [93, 79, 96],
  ],
  shade: [
    [48, 42, 58],
    [73, 65, 80],
  ],
  turn: [
    [150, 133, 160],
    [205, 189, 208],
  ],
  piping: [
    [187, 128, 160],
    [232, 171, 195],
  ],
  binding: [
    [103, 84, 112],
    [146, 122, 150],
  ],
  ivory: [
    [213, 205, 183],
    [252, 248, 226],
  ],
  shirt: [
    [219, 210, 189],
    [251, 247, 229],
  ],
  gold: [
    [178, 123, 62],
    [249, 211, 122],
  ],
  leather: [
    [79, 54, 51],
    [132, 91, 74],
  ],
  edge: [
    [64, 49, 51],
    [102, 73, 66],
  ],
  brass: [
    [152, 109, 60],
    [237, 198, 117],
  ],
  lace: [
    [170, 153, 164],
    [224, 212, 209],
  ],
  deep: [
    [43, 38, 53],
    [59, 52, 63],
  ],
  sapphire: [[53, 72, 126], [139, 177, 221]],
  bag: [
    [121, 80, 70],
    [169, 116, 91],
  ],
};
const palette = Object.keys(silk);
for (const [i, name] of palette.entries()) {
  const [a, b] = silk[name];
  atlas.rect([0, i / 16, paletteWidth/atlas.w, (i + 1) / 16], (u) => lerp3(a, b, smooth(0, 1, u)));
}
const paintFabric = await makeFabricPainter(atlas, silk);
wd.textures.set('traveller_silks', atlas);
const finishes = {
  wool: { rough: .97 }, linen: { rough: .91 }, leather: { rough: .70 },
  brass: { rough: .43, metal: .56 }, glass: { rough: .32, metal: .10 },
};
const finishesByColor = {
  shirt: 'linen', ivory: 'linen', lace: 'linen', leather: 'leather', bag: 'leather',
  edge: 'leather', brass: 'brass', sapphire: 'glass',
};
for (const [finish, spec] of Object.entries(finishes)) {
  wd.material(MAT + '_' + finish, {
    tex: 'traveller_silks', doubleSided: true, shade: [.65, .61, .73],
    extras: { shadeAmbient: true, finish }, ...spec,
  });
}
const uv = (color, t) => [(0.025 + 0.95 * clamp01(t)) * paletteWidth/atlas.w, (palette.indexOf(color) + 0.5) / 16];
const bone = (name) => W1(C.ji('J_Bip_' + name));
const hips = bone('C_Hips'),
  spine = bone('C_Spine'),
  chest = bone('C_Chest'),
  upper = bone('C_UpperChest');
const part = (name, geo, color, wt, tone = 0.7, group = 'traveller_coat', gridSize) => {
  const tones = geo.pos.map((p, i) => typeof tone === 'function' ? tone(p, i) : tone);
  if (!gridSize || !paintFabric(name,geo,color,tones,...gridSize))
    geo.uv = tones.map(value => uv(color,value));
  wd.piece(
    name,
    geo,
    geo.pos.map((p, i) => (typeof wt === 'function' ? wt(p, i) : wt)),
    MAT + '_' + (finishesByColor[color] || 'wool'),
    { group },
  );
  return geo;
};
const bodiceW = (y) =>
  y < 0.97
    ? wmix(hips, spine, smooth(0.89, 0.97, y))
    : y < 1.105
      ? wmix(spine, chest, smooth(0.97, 1.105, y))
      : wmix(chest, upper, smooth(1.105, 1.205, y));
function skirtW(p) {
  const angle=(Math.atan2(p[0],p[2])+TAU)%TAU;
  const sector=angle*10/TAU-.5, first=Math.floor(sector), blend=sector-first;
  const fold=smooth(.922,.825,p[1]);
  const panel=i=>{
    const chain='J_Sec_Hakama_'+((i+10)%10+1);
    return wmix(W1(C.ji(chain+'_01')),W1(C.ji(chain+'_02')),fold);
  };
  const rings=wmix(panel(first),panel(first+1),blend);
  return wmix(hips,rings,.30+.70*smooth(1.005,.934,p[1]));
}
function clothW(p) {
  return p[1] < 1.012 ? wmix(bodiceW(p[1]), skirtW(p), 1-smooth(.944,1.012,p[1])) : bodiceW(p[1]);
}
const bead = (name, center, size, col, w, group) =>
  part(name, ellipsoid(center, size, 14, 8), col, w, 0.78, group);
function border(name, pts, normals, width, color, w, group) {
  const across = pts.map((p, i) =>
    norm(cross(normals[i], sub(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]))),
  );
  const g = strip(pts, normals, across, width, 0.0012);
  return part(name, g, color, (p, i) => w(p, Math.floor(i / 4)), 0.75, group);
}
function garmentGrid(name, rows, cols, surface, color, weight, tone, group) {
  const g = grid(rows, cols, (i, j) => ({ p: surface(i, j / (cols - 1)), u: j / (cols - 1), v: i / (rows - 1) }));
  return part(name, g, color, weight, tone, group, [rows,cols]);
}
const ringP = (th, y, rx, zf, zb, zc = 0) => [
  rx * Math.sin(th),
  y,
  zc + Math.cos(th) * (Math.cos(th) > 0 ? zf : zb),
];

// Cut the shorts from her thighs at their actual hem height. A moved hem with weights sampled farther down
// the leg would cross the skin at each triangle when she folds her knees.
const under = C.root.listNodes().find((n) => n.getName() === 'akari_under');
under.getMesh().dispose();
under.dispose();
const skin = C.body, shortsHem = 0.718;
function fittedShorts() {
  const geo = { pos: [], uv: [], idx: [] }, weights = [], vertices = new Map();
  const hemPoint = (id) => {
    const w = new Map();
    for (let k=0; k<4; k++) {
      const j=4*id+k;
      if (skin.Wt[j]) w.set(skin.J[j],skin.Wt[j]);
    }
    return { p:Array.from(skin.P.subarray(3*id,3*id+3)), n:Array.from(skin.N.subarray(3*id,3*id+3)), w };
  };
  function clip(poly,y,above) {
    const out = [];
    for (let i=0; i<poly.length; i++) {
      const a=poly[(i+poly.length-1)%poly.length], b=poly[i];
      const ina=(a.p[1]>=y)===above, inb=(b.p[1]>=y)===above;
      if (ina!==inb) {
        const t=(y-a.p[1])/(b.p[1]-a.p[1]);
        out.push({p:lerp3(a.p,b.p,t),n:norm(lerp3(a.n,b.n,t)),w:wmix(a.w,b.w,t)});
      }
      if (inb) out.push(b);
    }
    return out;
  }
  const vertex = ({p,n,w}) => {
    const key=p.map(v=>Math.round(v*1e6)).join(',');
    if (vertices.has(key)) return vertices.get(key);
    const id=geo.pos.length;
    vertices.set(key,id); weights.push(w);
    const ease=.004+.0015*(1-smooth(shortsHem, shortsHem+.011, p[1]));
    geo.pos.push(p.map((v,k)=>v+n[k]*ease)); return id;
  };
  for (let i=0;i<skin.I.length;i+=3) {
    const ids=skin.I.subarray(i,i+3);
    if (ids.every(id=>skin.P[id*3+1]<shortsHem)||ids.every(id=>skin.P[id*3+1]>.935)) continue;
    const poly=clip(clip(Array.from(ids,hemPoint),shortsHem,true),.935,false).map(vertex);
    for (let k=2;k<poly.length;k++) geo.idx.push(poly[0],poly[k-1],poly[k]);
  }
  part('lined_shorts',geo,'deep',(p,i)=>weights[i],p=>.48+.23*smooth(shortsHem+.005,shortsHem+.016,p[1]),'traveller_skirt');
}
fittedShorts();
const keep = [];
for (let i = 0; i < skin.I.length; i += 3) {
  const tri = skin.I.subarray(i, i + 3);
  const hidden = [...tri].every((id) => {
    const x = Math.abs(skin.P[id * 3]),
      y = skin.P[id * 3 + 1];
    const neckLine = x > 0.052 ? 1.314 : 1.296;
    return y < 0.383 || (y > shortsHem + 0.004 && y < neckLine && x < 0.474);
  });
  if (!hidden) keep.push(...tri);
}
skin.prim.getIndices().setArray(skin.nv < 65536 ? new Uint16Array(keep) : new Uint32Array(keep));

// The blouse has its own pin-tucked front, turned pointed collar and small plume-gold neck ribbon.
const shirtRows = [
  [1.302, 0.041, 0.038, 0.053],
  [1.278, 0.053, 0.055, 0.067],
  [1.257, 0.104, 0.08, 0.087],
  [1.226, 0.146, 0.103, 0.091],
  [1.185, 0.143, 0.115, 0.099],
  [1.144, 0.136, 0.117, 0.097],
  [1.106, 0.121, 0.099, 0.092],
  [1.057, 0.108, 0.086, 0.077],
  [1.021, 0.113, 0.09, 0.08],
  [0.993, 0.119, 0.092, 0.084],
  [0.97, 0.109, 0.083, 0.08],
  [0.942, 0.108, 0.081, 0.078],
];
function blouseP(i, u) {
  const [y, rx, zf, zb] = shirtRows[i],
    th = u * TAU;
  const ridge = 0.0018 * Math.cos(th * 30) * smooth(1.27, 1.2, y) * smooth(0.96, 1.02, y);
  return ringP(th, y, rx + ridge, zf + ridge, zb + ridge);
}
const shirt = garmentGrid(
  'pintucked_blouse',
  shirtRows.length,
  145,
  blouseP,
  'shirt',
  (p) => bodiceW(p[1]),
  (p, i) => {
    const a = ((i % 145) / 144) * TAU;
    return (
      0.86 -
      0.24 * Math.pow(0.5 + 0.5 * Math.cos(a * 30), 4) * smooth(1.254, 1.19, p[1]) -
      0.1 * smooth(1.06, 0.98, p[1])
    );
  },
  'traveller_blouse',
);
for (const sign of [-1, 1]) {
  const rows = [
    [0.026, 1.3, 0.032, 0.025],
    [0.037, 1.287, 0.045, 0.038],
    [0.043, 1.269, 0.059, 0.041],
    [0.037, 1.243, 0.092, 0.003],
  ];
  garmentGrid(
    'point_collar',
    rows.length,
    11,
    (i, u) => {
      const [x, y, z, w] = rows[i];
      return [
        sign * (x + (u - 0.5) * w),
        y + 0.008 * Math.sin(u * Math.PI),
        z + 0.005 + 0.007 * Math.sin(u * Math.PI),
      ];
    },
    'ivory',
    (p) => bodiceW(p[1]),
    (p, i) => 0.72 + 0.23 * Math.sin((Math.PI * (i % 11)) / 10),
    'traveller_blouse',
  );
}
const frontZ = (x, y, extra = 0) => {
  const h = rayNear(shirt, [x, y, 0.5], [0, 0, -1]);
  return (h > 0 ? 0.5 - h : 0.083) + extra;
};
for (const s of [-1, 1]) {
  const group = 'traveller_blouse';
  const loopRows = [
    [0.003, 1.224, 0.008, 0.007],
    [0.02, 1.226, 0.011, 0.009],
    [0.037, 1.23, 0.019, 0.01],
    [0.05, 1.232, 0.022, 0.009],
    [0.06, 1.231, 0.017, 0.005],
  ];
  const loop = loft(
    loopRows.map(([x, y, h, t]) => ({
      c: [s * x, y, frontZ(s * x, y, 0.021)],
      u: [0, 1, 0],
      v: [0, 0, 1],
      ru: h,
      rv: t,
    })),
    16,
  );
  part(
    'neck_bow_loop',
    loop,
    'gold',
    (p) => bodiceW(p[1]),
    (p, i) => 0.54 + 0.32 * Math.cos(((i % 16) / 16) * TAU),
    'traveller_blouse',
  );
  const tailRows = [
    [0.006, 1.228, 0.009],
    [0.019, 1.207, 0.01],
    [0.021, 1.179, 0.013],
    [0.032, 1.146, 0.016],
    [0.038, 1.116 - 0.013 * s, 0.013],
  ];
  garmentGrid(
    'neck_bow_tail',
    tailRows.length,
    9,
    (i, u) => {
      const [x, y, w] = tailRows[i];
      const px = s * (x + w * (u * 2 - 1)),
        py = y + 0.009 * Math.abs(2 * u - 1) * (i === tailRows.length - 1);
      return [px, py, frontZ(px, py, 0.016) + 0.008 * Math.sin(u * Math.PI)];
    },
    'gold',
    (p) => bodiceW(p[1]),
    (p, i) => 0.54 + 0.33 * Math.sin(((i % 9) / 8) * Math.PI),
    group,
  );
}
bead(
  'neck_bow_knot',
  [0, 1.224, frontZ(0, 1.224, 0.023)],
  [0.012, 0.014, 0.011],
  'gold',
  upper,
  'traveller_blouse',
);

// Box pleats splay below a quiet fitted waistband. The pale petticoat shares the exact outer rim's weight field.
const skirtRows = [
  [1.008, 0.111, 0.089, 0.084, 0],
  [0.989, 0.121, 0.097, 0.094, 0],
  [0.952, 0.138, 0.109, 0.115, 0.003],
  [0.909, 0.155, 0.122, 0.135, 0.007],
  [0.857, 0.172, 0.141, 0.152, 0.011],
  [0.8, 0.19, 0.162, 0.173, 0.015],
  [0.746, 0.208, 0.178, 0.185, 0.019],
  [0.688, 0.221, 0.188, 0.196, 0.022],
];
const pleat = (a) => {
  const t = ((((a * 16) / TAU) % 1) + 1) % 1;
  return t < 0.75 ? t / 0.75 : (1 - t) / 0.25;
};
function skirtP(i, u) {
  const [y, x, z, b, d] = skirtRows[i],
    a = TAU * u,
    f = pleat(a),
    t = i / (skirtRows.length - 1);
  return ringP(
    a,
    y + Math.cos(a) * 0.011 * t + Math.cos(3 * a + 0.4) * 0.006 * t,
    x + f * d,
    z + f * d + .026*smooth(.30,1,t),
    b + f * d + .012*smooth(.30,1,t),
  );
}
garmentGrid(
  'pleated_skirt',
  skirtRows.length,
  129,
  skirtP,
  'pleats',
  skirtW,
  (p, i) => 0.29 + 0.66 * pleat(((i % 129) / 128) * TAU),
  'traveller_skirt',
);
garmentGrid(
  'lace_petticoat',
  4,
  193,
  (i, u) => {
    const a = u * TAU,
      p = skirtP(skirtRows.length - 1, u),
      inset = [0.025, 0.013, 0.007, 0.014][i];
    return [
      p[0] - inset * Math.sin(a),
      p[1] + [0.03, -0.004, -0.019 - 0.005 * (0.5 + 0.5 * Math.cos(48 * a)), -0.016][i],
      p[2] - inset * Math.cos(a),
    ];
  },
  'lace',
  skirtW,
  (p, i) => 0.42 + 0.46 * pleat(((i % 193) / 192) * TAU),
  'traveller_skirt',
);
garmentGrid(
  'skirt_waistband',
  4,
  65,
  (i, u) =>
    ringP(
      u * TAU,
      [1.015, 1.01, 0.984, 0.977][i],
      [0.113, 0.117, 0.125, 0.119][i],
      [0.093, 0.097, 0.1, 0.098][i],
      [0.09, 0.092, 0.098, 0.096][i],
    ),
  'shade',
  (p) => bodiceW(p[1]),
  (p, i) => (i < 65 ? 0.76 : 0.55),
  'traveller_skirt',
);

// Rows run from the neckline into two long, opening coat-tails at the back. Each row carries the facing inward
// around its cut edges so there is a visible lined turn at both front edges and at the hem.
const coatRows = [
  [1.292, 1.29, 0.062, 0.057, 0.073, 0.64],
  [1.264, 1.268, 0.124, 0.083, 0.094, 0.61],
  [1.233, 1.241, 0.16, 0.11, 0.106, 0.59],
  [1.196, 1.199, 0.157, 0.133, 0.115, 0.54],
  [1.154, 1.151, 0.152, 0.139, 0.116, 0.48],
  [1.107, 1.095, 0.145, 0.129, 0.106, 0.48],
  [1.067, 1.029, 0.137, 0.113, 0.098, 0.43],
  [1.025, 0.972, 0.151, 0.127, 0.137, 0.43],
  [0.993, 0.892, 0.178, 0.149, 0.159, 0.48],
  [0.969, 0.813, 0.203, 0.169, 0.181, 0.58],
  [0.955, 0.736, 0.223, 0.188, 0.197, 0.68],
  [0.946, 0.662, 0.237, 0.202, 0.218, 0.81],
];
function coatP(i, u, inset = 0) {
  const [yf, yb, rx, zf, zb, gap] = coatRows[i],
    a = gap + u * (TAU - 2 * gap),
    s = i / (coatRows.length - 1);
  const front = (1 + Math.cos(a)) * 0.5,
    xshape = 0.005 * Math.cos(a * 6 + 0.3) * smooth(0.34, 1, s);
  const y = lerp(yb, yf, front ** 2.3) + 0.015 * Math.cos(3 * a) * smooth(0.58, 1, s);
  const swing = 0.032 * smooth(0.51, 0.9, s);
  return ringP(
    a,
    y,
    rx + xshape + swing - inset,
    zf + xshape + swing * 0.6 - inset,
    zb + xshape + swing * 1.5 - inset,
  );
}
const coat = garmentGrid(
  'open_mantle',
  coatRows.length,
  89,
  (i, u) => coatP(i, u),
  'mantle',
  clothW,
  (p, i) => 0.46 + 0.22 * Math.sin(((i % 89) / 88) * TAU * 5 + 0.8) + 0.12 * smooth(1.05, 1.26, p[1]),
);
garmentGrid(
  'mantle_lining',
  coatRows.length,
  89,
  (i, u) => coatP(i, u, 0.004),
  'turn',
  clothW,
  (p, i) => 0.47 + 0.17 * Math.cos(((i % 89) / 88) * TAU * 5),
);
for (const u of [0, 1]) {
  const pts = coatRows.map((_, i) => coatP(i, u));
  const nr = pts.map((p) => norm([p[0], 0, p[2]]));
  border('coat_front_binding', pts, nr, 0.005, 'piping', clothW, 'traveller_coat');
}
const hemPts = Array.from({ length: 89 }, (_, j) => coatP(coatRows.length - 1, j / 88));
border(
  'coat_hem_binding',
  hemPts,
  hemPts.map((p) => norm([p[0], 0, p[2]])),
  0.005,
  'piping',
  clothW,
  'traveller_coat',
);
// A folded hood lies on the shoulders, hollow at the nape, lavender on its rolled-back rim.
const hoodRows = [
  [1.307, 0.073, 0.065, 0.082],
  [1.318, 0.099, 0.063, 0.117],
  [1.301, 0.123, 0.058, 0.142],
  [1.272, 0.145, 0.063, 0.148],
  [1.224, 0.146, 0.076, 0.14],
  [1.183, 0.105, 0.066, 0.129],
];
garmentGrid(
  'folded_hood',
  hoodRows.length,
  65,
  (i, u) => {
    const [y, rx, zf, zb] = hoodRows[i],
      a = lerp(0.8, TAU - 0.8, u),
      back = (1 - Math.cos(a)) / 2;
    return ringP(a, lerp(1.248 - (0.022 * i) / 5, y, back), rx, zf, zb);
  },
  'turn',
  (p) => bodiceW(p[1]),
  (p, i) => 0.5 + 0.39 * Math.sin(((i % 65) / 64) * Math.PI),
  'traveller_coat',
);

for (const [side, s] of [
  ['L', 1],
  ['R', -1],
]) {
  const ua = bone(side + '_UpperArm'),
    la = bone(side + '_LowerArm'),
    sh = bone(side + '_Shoulder');
  const aw = (p) => {
    const x = Math.abs(p[0]);
    return x < 0.18 ? wmix(sh, ua, smooth(0.085, 0.165, x)) : wmix(ua, la, smooth(0.256, 0.359, x));
  };
  const sleeveP = (t, u, grow = 0) => {
    const a = u * TAU,
      x = lerp(0.06, 0.507, t);
    const radius = 0.044 + 0.025 * smooth(0, 0.14, t) - 0.018 * smooth(0.14, 0.38, t) + 0.059 * smooth(0.36, 1, t);
    const y = lerp(1.252, 1.213, t) - 0.012 * Math.sin(t * Math.PI),
      z = lerp(-0.004, 0.009, t);
    const d = radius + grow + 0.003 * Math.cos(4 * a + 0.8) * smooth(0.4, 1, t);
    return [s * x, y + d * Math.sin(a) - 0.021 * t * t, z + d * 0.91 * Math.cos(a)];
  };
  garmentGrid(
    'bell_sleeve_' + side,
    18,
    49,
    (i, u) => sleeveP(i / 17, u),
    'mantle',
    aw,
    (p, i) => 0.48 + 0.2 * Math.sin(((i % 49) / 48) * TAU * 3 + 0.3),
    'traveller_sleeves',
  );
  // Four petals of the turned cuff have peaks and valleys. The lip is rolled toward the hand, with a fully lined interior.
  const cuffT = (u) => 0.8 + 0.064 * Math.cos(4 * TAU * u + 0.12) + 0.015 * Math.sin(TAU * u);
  garmentGrid(
    'turned_cuff_' + side,
    7,
    81,
    (i, u) => sleeveP(lerp(cuffT(u), 1, i / 6), u, 0.004 + 0.006 * Math.sin((i / 6) * Math.PI)),
    'turn',
    aw,
    (p, i) => 0.56 + 0.32 * Math.cos(((i % 81) / 80) * TAU * 4),
    'traveller_sleeves',
  );
  garmentGrid(
    'cuff_underfold_' + side,
    4,
    81,
    (i, u) => sleeveP([1, 0.999, 0.96, 0.8][i], u, [0.004, -0.003, -0.006, -0.006][i]),
    'binding',
    aw,
    (p, i) => 0.35 + 0.18 * Math.cos(((i % 81) / 80) * TAU * 4),
    'traveller_sleeves',
  );
  const scallop = Array.from({ length: 81 }, (_, j) => sleeveP(cuffT(j / 80), j / 80, 0.0065));
  border(
    'cuff_edging_' + side,
    scallop,
    scallop.map((p, i) => [0, Math.sin((i / 80) * TAU), Math.cos((i / 80) * TAU)]),
    0.0036,
    'binding',
    aw,
    'traveller_sleeves',
  );
}

// Rounded leather boots with separate stacked welts and a raised, rolled cuff. The toe shares foot/toe skinning
// and the upper shaft follows the shin. The ankle bends through three rings instead of folding the whole boot.
for (const [s, side] of [
  [1, 'L'],
  [-1, 'R'],
]) {
  const shin = bone(side + '_LowerLeg'),
    foot = bone(side + '_Foot'),
    toe = bone(side + '_ToeBase'),
    group = 'traveller_boots';
  const bootW = (p) => {
    const fw = wmix(foot, toe, smooth(0.065, 0.125, p[2]) * 0.72);
    return wmix(fw, shin, smooth(0.103, 0.186, p[1]));
  };
  // y, centre x, centre z, half width, half length. A gently squared toe and a narrower heel.
  const rows = [
    [0.025, 0.046, 0.028, 0.044, 0.11],
    [0.038, 0.046, 0.028, 0.046, 0.111],
    [0.053, 0.046, 0.029, 0.048, 0.111],
    [0.071, 0.046, 0.026, 0.046, 0.105],
    [0.092, 0.045, 0.01, 0.044, 0.086],
    [0.114, 0.044, -0.016, 0.039, 0.06],
    [0.14, 0.044, -0.025, 0.037, 0.046],
    [0.159, 0.044, -0.027, 0.04, 0.045],
    [0.17, 0.044, -0.026, 0.037, 0.044],
    [0.19, 0.044, -0.025, 0.04, 0.047],
    [0.246, 0.046, -0.023, 0.043, 0.05],
    [0.309, 0.05, -0.023, 0.05, 0.06],
    [0.364, 0.053, -0.024, 0.054, 0.064],
    [0.397, 0.054, -0.024, 0.055, 0.065],
  ];
  const bootP = (i, u, pad = 0) => {
    const [y, cx, cz, rx, rz] = rows[i],
      a = u * TAU,
      cs = Math.cos(a),
      sn = Math.sin(a);
    const power = y < 0.11 ? 0.78 : 1;
    return [
      s * cx + (rx + pad) * Math.sign(sn) * Math.abs(sn) ** power * (y < 0.1 ? 0.9 + 0.1 * cs : 1),
      y,
      cz + (rz + pad) * Math.sign(cs) * Math.abs(cs) ** power,
    ];
  };
  garmentGrid(
    'boot_upper_' + side,
    rows.length,
    49,
    (i, u) => bootP(i, u),
    'leather',
    bootW,
    (p, i) => 0.44 + 0.17 * Math.cos(((i % 49) / 48) * TAU * 2 - 0.4) + 0.27 * smooth(0.08, 0.038, p[1]),
    group,
  );
  // Both ankle and shaft are open tubes at rest; cap the sole and fold the upper cuff in to the leg.
  const soleRows = [
    [0.02, 0.002],
    [0.024, 0.0045],
    [0.034, 0.0045],
    [0.039, 0.002],
  ];
  garmentGrid(
    'sole_welt_' + side,
    soleRows.length,
    49,
    (i, u) => {
      const p = bootP(0, u, soleRows[i][1]);
      p[1] = soleRows[i][0];
      return p;
    },
    'edge',
    bootW,
    0.44,
    group,
  );
  const bottom = grid(2, 49, (i, u) => {
    const p = bootP(0, u / 48, 0.002);
    p[1] = 0.02;
    return { p: i ? p : [s * 0.046, 0.02, 0.028], u: 0, v: 0 };
  });
  part('boot_sole_' + side, bottom, 'edge', bootW, 0.3, group);
  const cuff = [
    [0.367, 0.004],
    [0.372, 0.009],
    [0.404, 0.008],
    [0.408, 0.004],
    [0.402, -0.003],
    [0.391, -0.008],
  ];
  garmentGrid(
    'boot_cuff_' + side,
    cuff.length,
    49,
    (i, u) => {
      const p = bootP(rows.length - 1, u, cuff[i][1]);
      p[1] = cuff[i][0] + 0.006 * s * Math.sin(TAU * u);
      return p;
    },
    'bag',
    bootW,
    (p, i) => 0.39 + 0.22 * Math.cos(((i % 49) / 48) * TAU * 2),
    group,
  );
  const tab = Array.from({ length: 11 }, (_, i) => {
    const y = 0.19 + i * 0.017;
    return [s * (0.085 + (0.012 * i) / 10), y, -0.005];
  });
  border(
    'boot_panel_seam_' + side,
    tab,
    tab.map(() => [s, 0, 0]),
    0.0024,
    'edge',
    bootW,
    group,
  );
  const strap = Array.from({ length: 49 }, (_, i) => {
    const p = bootP(7, i / 48, 0.003);
    p[1] += 0.01 * Math.sin((i / 48) * TAU * s);
    return p;
  });
  border(
    'boot_ankle_strap_' + side,
    strap,
    strap.map((p, i) => [Math.sin((i / 48) * TAU), 0, Math.cos((i / 48) * TAU)]),
    0.008,
    'edge',
    bootW,
    group,
  );
  bead(
    'boot_buckle_' + side,
    [s * 0.082, 0.164, -0.011],
    [0.004, 0.01, 0.011],
    'brass',
    bootW([0, 0.164, 0]),
    group,
  );
}

// A pierced brass witch brooch sits on the open lapel. Its star and three glass drops
// are part of the coat mesh, so the open spaces show the fabric beneath at every angle.
{
  const x0 = 0.084, y0 = 1.161, group = 'traveller_coat';
  const hit = rayNear(coat, [x0, y0, 0.5], [0, 0, -1]);
  const z0 = (hit > 0 ? 0.5 - hit : 0.112) + 0.008;
  const badgeP = (x,y,depth=0) => [x0+x, y0+y, z0-0.58*x+depth];
  const wire = (name, coords, width, tone='brass') => {
    const pts = coords.map(([x,y])=>badgeP(x,y));
    border(name,pts,pts.map(()=>[0.5,0,0.86]),width,tone,clothW,group);
  };
  const around=(k,n,rx,ry,shift=0)=>[rx*Math.sin(TAU*k/n+shift),ry*Math.cos(TAU*k/n+shift)];
  wire('brooch_bezel',Array.from({length:33},(_,i)=>around(i,32,.019,.022)),.0028);
  for (const offset of [0, Math.PI])
    wire('brooch_open_star',Array.from({length:4},(_,i)=>around(i,3,.015,.018,offset)),.00155,'gold');
  const cab = badgeP(0,.018,.0015);
  bead('brooch_cabochon',cab,[.0032,.003,.0021],'sapphire',clothW(cab),group);
  for (const side of [-1,0,1]) {
    const x=side*.012, y=side===0 ? -.032 : -.023;
    wire('brooch_chain',[[x,y+.006],[x,y]],.00085);
    const drop=badgeP(x,y-.003,.001);
    bead('brooch_glass_drop',drop,[.0024,.0041,.0018],'sapphire',clothW(drop),group);
  }
}

// A leather field satchel sits opposite the equipped hip light. Its strap runs over the shoulder across both panels
// of the coat. Ray fitting lets the belt rest directly on the actual shirt/coat after changing a cut.
const bagGroup = 'traveller_satchel';
const bagAngle = -0.98,
  nr = [Math.sin(bagAngle), 0, Math.cos(bagAngle)],
  across = [Math.cos(bagAngle), 0, -Math.sin(bagAngle)];
const leatherClearance = 0.013;
const bagOrigin = [-0.236 + leatherClearance * nr[0], 0.852, 0.062 + leatherClearance * nr[2]];
const bp = (x, y, z) => [
  bagOrigin[0] + across[0] * x + nr[0] * z,
  bagOrigin[1] + y,
  bagOrigin[2] + across[2] * x + nr[2] * z,
];
// Fit the soft leather against the same moving panels as the mantle. Sampling every corner keeps the
// outside face and its hardware visible when a lifted thigh moves the two adjacent panels by different amounts.
const bagWt = (p) => skirtW([p[0] - leatherClearance * nr[0], p[1], p[2] - leatherClearance * nr[2]]);
for (const facing of [1, -1]) {
  const strap = [];
  const anchor = bp(.065*facing,.055,.012);
  for (let i = 0; i < 42; i++) {
    const t = i / 41, y = lerp(1.264,anchor[1],t);
    const x = lerp(.091,-.19,t) + .016*Math.sin(t*Math.PI);
    const ds = [rayNear(coat,[x,y,facing*.55],[0,0,-facing]), rayNear(shirt,[x,y,facing*.55],[0,0,-facing])].filter(v=>v>0);
    const z = ds.length ? facing*(.55-Math.min(...ds)+.007) : facing*.085;
    const wrap=smooth(.60,1,t);
    if (!wrap) { strap.push([x,y,z]); continue; }
    let from=Math.atan2(x,z), to=Math.atan2(anchor[0],anchor[2]);
    if (from-to>Math.PI) from-=TAU;
    const angle=lerp(from,to,wrap), nx=Math.sin(angle), nz=Math.cos(angle);
    const hit=rayNear(coat,[nx*.6,y,nz*.6],[-nx,0,-nz]);
    const surface=hit>0 ? .6-hit+.008 : Math.hypot(x,z);
    const r=lerp(surface,Math.hypot(anchor[0],anchor[2]),smooth(.78,1,t));
    strap.push([nx*r,y,nz*r]);
  }
  const ns = strap.map(([x,y,z],i) => i < 24 ? [0,0,facing] : norm([x,0,z]));
  const strapW = (p) => wmix(clothW(p), bagWt(p), 1 - smooth(anchor[1], .976, p[1]));
  border('crossbody_strap', strap, ns, 0.012, 'edge', strapW, bagGroup);
  const stitching = strap.map(([x,y,z],i) => [x+.005*ns[i][2]+ns[i][0]*.0017,y+.004,z-.005*ns[i][0]+ns[i][2]*.0017]);
  border('saddle_stitch', stitching, ns, 0.00105, 'bag', strapW, bagGroup);
}
const shoulderStrap = Array.from({ length: 17 }, (_, i) => {
  const a = (i / 16) * Math.PI;
  return [0.091 + 0.012 * Math.sin(a), 1.258 + 0.043 * Math.sin(a), 0.092 * Math.cos(a)];
});
border(
  'shoulder_strap',
  shoulderStrap,
  shoulderStrap.map((_, i) => [0, Math.sin((i / 16) * Math.PI), Math.cos((i / 16) * Math.PI)]),
  0.012,
  'edge',
  (p) => bodiceW(p[1]),
  bagGroup,
);
const rounded = (x, n) => Math.sign(x) * Math.abs(x) ** n;
const bagRows = [
  [-0.071, 0.066, 0.023],
  [-0.062, 0.083, 0.03],
  [-0.047, 0.09, 0.032],
  [0.035, 0.09, 0.032],
  [0.052, 0.085, 0.03],
  [0.062, 0.077, 0.023],
];
garmentGrid(
  'satchel_body',
  bagRows.length,
  57,
  (i, u) => {
    const [y, w, d] = bagRows[i],
      a = u * TAU;
    return bp(w * rounded(Math.sin(a), 0.45), y, d * rounded(Math.cos(a), 0.48));
  },
  'leather',
  bagWt,
  (p, i) => 0.4 + 0.28 * Math.cos(((i % 57) / 56) * TAU),
  bagGroup,
);
for (const [name, y, w, d] of [
  ['bottom', -0.07, 0.067, 0.024],
  ['top', 0.061, 0.077, 0.024],
]) {
  garmentGrid(
    'satchel_' + name,
    2,
    57,
    (i, u) => {
      const a = u * TAU;
      return bp(w * i * rounded(Math.sin(a), 0.45), y, d * i * rounded(Math.cos(a), 0.48));
    },
    'edge',
    bagWt,
    0.45,
    bagGroup,
  );
}
const flapRows = [
  [0.048, -0.03, 0.084],
  [0.063, -0.008, 0.087],
  [0.058, 0.025, 0.089],
  [0.047, 0.04, 0.09],
  [-0.012, 0.04, 0.087],
  [-0.025, 0.037, 0.08],
];
garmentGrid(
  'satchel_flap',
  flapRows.length,
  19,
  (i, u) => {
    const [y, z, w] = flapRows[i],
      v = 2 * u - 1;
    return bp(v * w, y + 0.007 * v * v * (i >= 4), z - 0.004 * v * v);
  },
  'bag',
  bagWt,
  (p, i) => 0.5 + 0.26 * Math.sin(((i % 19) / 18) * Math.PI),
  bagGroup,
);
for (const sign of [-1, 1]) {
  const x = sign * 0.049;
  garmentGrid(
    'satchel_buckle_tab',
    5,
    7,
    (i, u) =>
      bp(x + (u - 0.5) * 0.015, [0.031, 0.017, -0.002, -0.025, -0.041][i], 0.043 + 0.002 * Math.sin(Math.PI * u)),
    'edge',
    bagWt,
    0.59,
    bagGroup,
  );
  const pts = [
    [-0.009, 0.008],
    [0.009, 0.008],
    [0.009, -0.006],
    [-0.009, -0.006],
    [-0.009, 0.008],
  ].map(([dx, dy]) => bp(x + dx, dy + 0.002, 0.047));
  border(
    'brass_buckle',
    pts,
    pts.map(() => nr),
    0.0019,
    'brass',
    bagWt,
    bagGroup,
  );
}
bead('satchel_stud', bp(0, 0.029, 0.042), [0.006, 0.006, 0.005], 'brass', bagWt, bagGroup);

// All skinning uses the original joint names and bind transforms. Other outfits and the spring solver can reuse them.
// Sample the two lowest cut edges where a horizontal shaft can leave the skirt.
const ridingHem = [];
for(let i=0; i<96; i++) {
  const u=i/96, a=u*TAU, p=skirtP(skirtRows.length-1,u);
  ridingHem.push([p[0]-.009*Math.sin(a),p[1]-.025,p[2]-.009*Math.cos(a)], coatP(coatRows.length-1,u));
}
C.top.setExtras({...C.top.getExtras(),travellerPanelFit:1,travellerRidingHem:ridingHem.map(p=>p.map(v=>Math.round(v*10000)/10000))});
const result = await wd.finish(out, {jpegQ: 92});
const { check } = await keepBaseSkeleton(out, base);
if (!check.sameJoints || !check.sameIBM || !check.sameRest)
  throw new Error('Base skeleton mismatch ' + JSON.stringify(check));
console.log('Travelling witch outfit:', result.tris, 'garment triangles;', check.joints, 'joints retained;', out);
