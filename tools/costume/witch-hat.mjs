// Model the travelling witch's felt hat in the same bind space as the face.
// Each surface shares a painted atlas. Both sides of the turned-up brim are modelled.
import { Vector3, CatmullRomCurve3 } from 'three';
import sharp from 'sharp';
import { io } from '../sculpt/figure/glbio.mjs';
import { pathToFileURL } from 'node:url';

const TAU = Math.PI * 2;
const colors = {
  felt: [72, 61, 84],
  lining: [164, 113, 151],
  binding: [81, 61, 90],
  ribbon: [217, 181, 209],
  piping: [233, 204, 221],
  gold: [211, 167, 90],
};
const slots = Object.keys(colors);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

async function paintFelt() {
  const size = 512,
    stride = 64,
    pixels = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    const slot = Math.min(slots.length - 1, Math.floor(y / stride));
    const key = slots[slot],
      base = colors[key];
    const v = ((y % stride) - 3) / (stride - 7);
    for (let x = 0; x < size; x++) {
      const u = x / size,
        a = u * TAU;
      const grain = Math.sin((x * 79 + y * 23) * 1.428) * 0.7;
      let value = 1 + grain * 0.011;
      if (key === 'felt') {
        value *= 0.95 + 0.04 * v + 0.035 * Math.cos(5 * a + v * 0.8) + 0.028 * Math.cos(3 * a - v * 1.4);
      } else if (key === 'lining') {
        value *= 0.84 + 0.16 * v + 0.025 * Math.cos(4 * a + 0.7);
      } else if (key === 'ribbon') {
        const wave = Math.abs(((u * 18) % 1) * 2 - 1);
        const stitch = Math.exp(-Math.pow((v - (0.14 + 0.72 * wave)) / 0.027, 2));
        const crossed = Math.exp(-Math.pow((v - (0.86 - 0.72 * wave)) / 0.027, 2));
        value *=
          1 -
          0.19 * Math.max(stitch, crossed) -
          0.09 * Math.exp(-Math.pow((v - 0.08) / 0.022, 2)) -
          0.09 * Math.exp(-Math.pow((v - 0.92) / 0.022, 2));
      } else if (key === 'gold') value *= 0.81 + 0.25 * Math.max(0, Math.cos(a - 0.6));
      for (let c = 0; c < 3; c++) pixels[(y * size + x) * 3 + c] = clamp(Math.round(base[c] * value), 0, 255);
    }
  }
  return sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
    .png()
    .toBuffer();
}

export async function addWitchHat(doc) {
  const root = doc.getRoot(),
    face = root.listNodes().find((n) => n.getName() === 'akari_face');
  const skin = face.getSkin(),
    head = skin.listJoints().findIndex((j) => j.getName() === 'J_Bip_C_Head');
  if (head < 0) throw new Error('A head joint is required to fit the hat.');
  const cranium = face
    .getMesh()
    .listPrimitives()
    .find((p) => p.getMaterial().getName() === 'Face');
  const crownY = cranium.getAttribute('POSITION').getMax([])[1] - 0.026;
  const P = [],
    N = [],
    UV = [],
    J = [],
    W = [],
    I = [];

  // u always goes around the hat. The finite differences produce a continuous normal
  // through the UV seam, including on the rolled edge and curved crown.
  function surface(key, rows, columns, sample, flip = false) {
    const offset = P.length / 3,
      eps = 0.00015;
    const vrow = slots.indexOf(key);
    for (let row = 0; row <= rows; row++)
      for (let col = 0; col <= columns; col++) {
        const u = col / columns,
          v = row / rows,
          pt = sample(u, v);
        const du = sample(u + eps, v).sub(sample(u - eps, v));
        const dv = sample(u, Math.min(1, v + eps)).sub(sample(u, Math.max(0, v - eps)));
        const normal = du.cross(dv).normalize();
        if (flip) normal.negate();
        P.push(pt.x, pt.y + crownY, pt.z);
        N.push(...normal.toArray());
        UV.push(u, (vrow * 64 + 3.5 + v * 56) / 512);
        J.push(head, 0, 0, 0);
        W.push(1, 0, 0, 0);
        if (row < rows && col < columns) {
          const i = offset + row * (columns + 1) + col,
            k = i + columns + 1;
          if (flip) I.push(i, k, i + 1, i + 1, k, k + 1);
          else I.push(i, i + 1, k, i + 1, k + 1, k);
        }
      }
  }
  const v3 = (x, y, z) => new Vector3(x, y, z);
  function brim(u, v) {
    const a = u * TAU,
      s = Math.sin(a),
      c = Math.cos(a);
    const width = 0.313 * (1 + 0.055 * s - 0.026 * Math.cos(3 * a + 0.4));
    const depth = 0.234 * (1 + 0.065 * c + 0.035 * Math.sin(3 * a));
    const lift = 0.034 * Math.sin(2 * a + 0.48) + 0.036 * s + 0.025 * c + 0.016 * Math.sin(3 * a - 0.8);
    const x = s * (0.087 + (width - 0.087) * v);
    const z = -0.008 + c * (0.081 + (depth - 0.081) * v);
    const y = 0.003 + 0.012 * c - 0.007 * s - 0.022 * Math.sin(Math.PI * v) + lift * v * v + 0.006 * v ** 8;
    return v3(x, y, z);
  }
  surface('felt', 8, 72, brim, true);
  surface('lining', 8, 72, (u, v) => brim(u, v).add(v3(0, -0.003, 0)));
  surface(
    'binding',
    4,
    72,
    (u, v) => {
      const a = u * TAU,
        angle = Math.PI * v;
      return brim(u, 1).add(
        v3(
          Math.sin(a) * 0.0025 * Math.sin(angle),
          -0.0015 + 0.0016 * Math.cos(angle),
          Math.cos(a) * 0.0025 * Math.sin(angle),
        ),
      );
    },
    true,
  );
  // Cross sections follow the tangent of a bent felt cone. The last few rings turn
  // down and back, giving the crown a soft broken tip when read in silhouette.
  const path = new CatmullRomCurve3(
    [
      v3(0, -0.004, -0.008),
      v3(0.004, 0.057, -0.012),
      v3(0.01, 0.111, -0.019),
      v3(0.016, 0.148, -0.024),
      v3(0.003, 0.185, -0.03),
      v3(-0.044, 0.218, -0.036),
      v3(-0.092, 0.225, -0.035),
      v3(-0.139, 0.212, -0.026),
      v3(-0.172, 0.193, -0.014),
      v3(-0.195, 0.178, -0.009),
    ],
    false,
    'catmullrom',
    0.42,
  );
  const radii = [0.113, 0.105, 0.086, 0.075, 0.058, 0.041, 0.031, 0.022, 0.013, 0.0012];
  function crown(u, v) {
    const a = u * TAU,
      t = clamp(v, 0, 1);
    const pos = path.getPoint(t),
      tan = path.getTangent(t).normalize();
    const side = v3(tan.y, -tan.x, 0).normalize(),
      front = side.clone().cross(tan).normalize();
    const i = Math.min(radii.length - 2, Math.floor(t * (radii.length - 1)));
    const f = t * (radii.length - 1) - i,
      radius = radii[i] * (1 - f) + radii[i + 1] * f;
    const creases =
      0.033 * Math.sin(5 * a + 2 * t) +
      0.022 * Math.sin(3 * a - 5 * t) +
      0.032 * Math.sin(17 * t + 2 * Math.cos(a));
    // Two diagonal compression folds run underneath the bent point. Each has a ridge
    // and a recessed side. Their width varies around the crown like folded wool.
    const creaseAt = 0.29 + 0.07 * Math.sin(a + 0.3);
    const tuckAt = 0.49 + 0.065 * Math.sin(a - 1.6);
    const fold = (level, depth) =>
      depth * (Math.exp(-(((t - level) / 0.037) ** 2)) - 0.82 * Math.exp(-(((t - level - 0.042) / 0.029) ** 2)));
    const r = radius * (1 + creases) + fold(creaseAt, 0.008) + fold(tuckAt, 0.006);
    return pos.addScaledVector(side, r * Math.sin(a)).addScaledVector(front, r * 0.92 * Math.cos(a));
  }
  surface('felt', 32, 48, crown);
  function band(u, v, upper = false) {
    const a = u * TAU;
    const level = upper
      ? 0.167 + 0.049 * v + 0.026 * Math.sin(a - 0.8)
      : 0.048 + 0.078 * v + 0.012 * Math.sin(a + 0.4) - 0.004 * Math.sin(2 * a);
    const p = crown(u, level);
    p.x += Math.sin(a) * (0.0023 + 0.0007 * Math.sin(Math.PI * v));
    p.z += Math.cos(a) * (0.0023 + 0.0007 * Math.sin(Math.PI * v));
    return p;
  }
  surface('ribbon', 5, 72, band);
  surface('ribbon', 4, 72, (u, v) => band(u, v, true));
  for (const edge of [0, 1])
    surface(
      'piping',
      3,
      72,
      (u, v) => {
        const a = u * TAU,
          h = Math.PI * v,
          p = band(u, edge);
        p.y += 0.0009 * Math.cos(h);
        p.x += 0.0012 * Math.sin(h) * Math.sin(a);
        p.z += 0.0012 * Math.sin(h) * Math.cos(a);
        return p;
      },
      true,
    );
  // A small brass clasp and a hanging moonstone move with the tip, and echo the
  // heroine's lantern at the other end of the silhouette.
  const tip = path.getPoint(1);
  function ring(u, v, center, r, tube) {
    const a = u * TAU,
      b = v * TAU,
      rr = r + tube * Math.cos(b);
    return center.clone().add(v3(rr * Math.cos(a), rr * Math.sin(a), tube * Math.sin(b)));
  }
  surface('gold', 8, 22, (u, v) => ring(u, v, tip.clone().add(v3(-0.002, -0.007, 0)), 0.007, 0.0017));
  const jewel = tip.clone().add(v3(-0.002, -0.029, 0));
  surface(
    'gold',
    7,
    10,
    (u, v) => {
      const a = u * TAU;
      const rad = 0.008 * Math.max(0.002, 1 - Math.abs(v - 0.39) / (v < 0.39 ? 0.39 : 0.61));
      return jewel.clone().add(v3(rad * Math.sin(a), 0.015 - 0.029 * v, rad * 0.78 * Math.cos(a)));
    },
    true,
  );

  const buffer = root.listBuffers()[0];
  const attribute = (type, data) => doc.createAccessor().setType(type).setArray(data).setBuffer(buffer);
  const tex = doc
    .createTexture('Travel_hat_felt')
    .setMimeType('image/png')
    .setImage(await paintFelt());
  const mat = doc
    .createMaterial('cloth_witch_hat')
    .setBaseColorTexture(tex)
    .setRoughnessFactor(1)
    .setMetallicFactor(0)
    .setDoubleSided(false)
    .setExtras({ shadeColor: [0.66, 0.61, 0.79], shadeAmbient: true, garment: true, finish: 'wool' });
  const prim = doc
    .createPrimitive()
    .setMaterial(mat)
    .setIndices(attribute('SCALAR', new Uint16Array(I)));
  for (const [name, type, data] of [
    ['POSITION', 'VEC3', new Float32Array(P)],
    ['NORMAL', 'VEC3', new Float32Array(N)],
    ['TEXCOORD_0', 'VEC2', new Float32Array(UV)],
    ['JOINTS_0', 'VEC4', new Uint16Array(J)],
    ['WEIGHTS_0', 'VEC4', new Float32Array(W)],
  ])
    prim.setAttribute(name, attribute(type, data));
  const node = doc
    .createNode('akari_witch_hat')
    .setSkin(skin)
    .setMesh(doc.createMesh('akari_witch_hat').addPrimitive(prim));
  (face.getParentNode() || root.listScenes()[0]).addChild(node);
  return node;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output = input] = process.argv.slice(2);
  if (!input) throw new Error('Usage: node witch-hat.mjs dressed.glb [out.glb]');
  const engine = io(),
    doc = await engine.read(input);
  await addWitchHat(doc);
  await engine.write(output, doc);
}
