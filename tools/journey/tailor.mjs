// Skinned parametric pattern pieces in the shared humanoid rest pose (metres, facing +Z).
import sharp from 'sharp';
import { BufferGeometry, Float32BufferAttribute, Vector3, CatmullRomCurve3, Color } from 'three';
const V = (p) => new Vector3(...p);
export const TAU = Math.PI * 2,
  head = 'J_Bip_C_Head',
  hips = 'J_Bip_C_Hips',
  chest = 'J_Bip_C_UpperChest';
export function torso(x, y) {
  if (y < 0.83) {
    const k = Math.min(0.46, Math.max(0, (0.83 - y) * 0.84));
    return [
      [hips, 1 - k],
      ['J_Bip_' + (x > 0 ? 'L' : 'R') + '_UpperLeg', k],
    ];
  }
  if (y < 1.01) return hips;
  if (y < 1.12) {
    const k = (y - 1.01) / 0.11;
    return [
      [hips, 1 - k],
      ['J_Bip_C_Spine', k],
    ];
  }
  if (y < 1.23) {
    const k = (y - 1.12) / 0.11;
    return [
      ['J_Bip_C_Spine', 1 - k],
      [chest, k],
    ];
  }
  return chest;
}
export function arm(x) {
  const a = Math.abs(x),
    s = 'J_Bip_' + (x > 0 ? 'L' : 'R') + '_';
  if (a < 0.17) {
    const k = Math.max(0, Math.min(1, (a - 0.07) / 0.1));
    return [
      [chest, 1 - k],
      [s + 'UpperArm', k],
    ];
  }
  if (a < 0.35) {
    const k = Math.max(0, Math.min(1, (a - 0.27) / 0.08));
    return [
      [s + 'UpperArm', 1 - k],
      [s + 'LowerArm', k],
    ];
  }
  return s + 'LowerArm';
}
export const leg = (x, y) =>
  'J_Bip_' + (x > 0 ? 'L' : 'R') + '_' + (y < 0.15 ? 'Foot' : y < 0.49 ? 'LowerLeg' : 'UpperLeg');
export class Tailor {
  constructor(doc, skin, namespace) {
    this.doc = doc;
    this.skin = skin;
    this.prefix = namespace;
    this.parts = new Map();
    this.palette = {};
    this.joints = new Map(skin.listJoints().map((j, i) => [j.getName(), i]));
    this.buffer = doc.getRoot().listBuffers()[0];
  }
  switchJoint(name, parent) {
    const p = this.skin.listJoints()[this.joints.get(parent)],
      j = this.doc.createNode(name);
    p.addChild(j);
    const a = this.skin.getInverseBindMatrices(),
      arr = a.getArray(),
      p0 = this.joints.get(parent) * 16;
    const data = new Float32Array(arr.length + 16);
    data.set(arr);
    data.set(arr.slice(p0, p0 + 16), arr.length);
    a.setArray(data);
    this.joints.set(name, this.skin.listJoints().length);
    this.skin.addJoint(j);
    return name;
  }
  surface(mat, n, m, point, weight, reverse = false) {
    let part = this.parts.get(mat);
    if (!part) {
      part = { p: [], j: [], w: [], uv: [], i: [] };
      this.parts.set(mat, part);
    }
    const start = part.p.length / 3;
    for (let row = 0; row <= n; row++) {
      for (let col = 0; col <= m; col++) {
        const u = col / m,
          v = row / n,
          p = point(u, v);
        part.p.push(...p);
        part.uv.push(u, 1 - v);
        const rw = typeof weight === 'function' ? weight(...p) : weight,
          w = typeof rw === 'string' ? [[rw, 1]] : rw;
        for (let k = 0; k < 4; k++) {
          const pair = w[k];
          if (pair && !this.joints.has(pair[0])) throw Error('Unknown bone ' + pair[0]);
          part.j.push(pair ? this.joints.get(pair[0]) : 0);
          part.w.push(pair ? pair[1] : 0);
        }
        if (col < m && row < n) {
          const a = start + row * (m + 1) + col,
            b = a + 1,
            c = a + m + 1,
            d = c + 1;
          part.i.push(...(reverse ? [a, b, c, b, d, c] : [a, c, b, b, c, d]));
        }
      }
    }
  }
  // Rows are [height, X radius, Z radius, Z centre, optional half-opening angle].
  rings(mat, rows, opt = {}) {
    const { weight = torso, fold = 0, pleats = 10, center = 0, seg = 48, offset = 0, warp = () => 0 } = opt;
    this.surface(
      mat,
      rows.length - 1,
      seg,
      (u, v) => {
        const row = rows[Math.round(v * (rows.length - 1))],
          [y, rx, rz, cz = 0, gap = 0] = row,
          t = gap + (TAU - gap * 2) * u + offset;
        const f = 1 + fold * (0.16 + 0.84 * v) * Math.cos(pleats * t + 0.4 * v);
        return [center + Math.sin(t) * rx * f, y + warp(t, v), Math.cos(t) * rz * f + cz];
      },
      weight,
    );
  }
  // A closed oval section swept along a curved axis, with a supplied outward guide in the rest frame.
  sweep(mat, points, width, depth, guide = [0, 0, 1], weight = head, segments = 14, sides = 8, range = null) {
    const path = new CatmullRomCurve3(points.map(V));
    this.surface(
      mat,
      segments,
      sides,
      (u, v) => {
        const t = range ? range(u, v) : v,
          p = path.getPoint(t),
          tan = path.getTangent(t),
          out = V(guide);
        out.addScaledVector(tan, -out.dot(tan));
        if (out.lengthSq() < 0.003) {
          out.set(0, 1, 0);
          out.addScaledVector(tan, -out.dot(tan));
        }
        out.normalize();
        const side = new Vector3().crossVectors(tan, out).normalize(),
          r = TAU * u,
          wt = typeof width === 'function' ? width(t) : width,
          dt = typeof depth === 'function' ? depth(t) : depth;
        p.addScaledVector(side, wt * Math.cos(r));
        p.addScaledVector(out, dt * Math.sin(r));
        return p.toArray();
      },
      weight,
    );
  }
  orb(mat, c, rad, w) {
    this.surface(
      mat,
      10,
      18,
      (u, v) => {
        const a = TAU * u,
          t = 0.002 + v * (Math.PI - 0.004);
        return [
          c[0] + rad[0] * Math.sin(a) * Math.sin(t),
          c[1] + rad[1] * Math.cos(t),
          c[2] + rad[2] * Math.cos(a) * Math.sin(t),
        ];
      },
      w,
    );
  }
  wire(mat, pts, r, w, guide = [0, 0, 1]) {
    this.sweep(mat, pts, r, r, guide, w, Math.max(10, pts.length * 2), 7);
  }
  star(mat, [x, y, z], size, w) {
    this.surface(
      mat,
      1,
      10,
      (u, v) => {
        const i = Math.round(u * 10),
          a = (i * Math.PI) / 5,
          r = (i % 2 ? 0.43 : 1) * size * v;
        return [x + Math.sin(a) * r, y + Math.cos(a) * r, z + 0.0015 * (1 - v)];
      },
      w,
      true,
    );
  }
  async bake() {
    const d = this.doc,
      maps = {};
    for (const type of ['hair', 'cloth']) {
      const size = 192,
        pixels = Buffer.alloc(size * size * 3);
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const u = x / size,
            v = y / size;
          const grain = Math.sin(x * 11.3 + y * 7.1) * Math.cos(y * 4.3 - x * 9.7);
          const val =
            type === 'hair'
              ? 0.94 +
                0.024 * Math.sin(TAU * u * 18 + v * 2) +
                0.018 * Math.cos(TAU * u * 7 - v * 3) +
                0.015 * Math.sin(13 * v)
              : 0.981 + 0.01 * grain + 0.006 * Math.cos(TAU * u * 9 + v * 0.4);
          const a = (y * size + x) * 3;
          for (let k = 0; k < 3; k++) pixels[a + k] = Math.max(0, Math.min(255, Math.round(255 * val)));
        }
      const image = await sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
        .png()
        .toBuffer();
      maps[type] = d
        .createTexture(this.prefix + '_' + type + '_surface')
        .setImage(image)
        .setMimeType('image/png');
    }
    for (const [name, part] of this.parts) {
      const mesh = d.createMesh(this.prefix + '_' + name),
        p = d.createPrimitive(),
        geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(part.p, 3));
      geo.setIndex(part.i);
      geo.computeVertexNormals();
      const prop = (t, a) => d.createAccessor().setType(t).setArray(a).setBuffer(this.buffer);
      p.setAttribute('POSITION', prop('VEC3', new Float32Array(part.p)))
        .setAttribute('NORMAL', prop('VEC3', geo.getAttribute('normal').array))
        .setAttribute('TEXCOORD_0', prop('VEC2', new Float32Array(part.uv)))
        .setAttribute('JOINTS_0', prop('VEC4', new Uint16Array(part.j)))
        .setAttribute('WEIGHTS_0', prop('VEC4', new Float32Array(part.w)))
        .setIndices(
          prop('SCALAR', part.p.length / 3 > 65535 ? new Uint32Array(part.i) : new Uint16Array(part.i)),
        );
      if (this.morphs?.[name]) {
        const delta = new Float32Array(part.p.length);
        for (let i = 0; i < delta.length; i += 3)
          delta.set(this.morphs[name](part.p[i], part.p[i + 1], part.p[i + 2]), i);
        p.addTarget(d.createPrimitiveTarget('sideSaddleFold').setAttribute('POSITION', prop('VEC3', delta)));
        mesh.setWeights([0]).setExtras({ targetNames: ['sideSaddleFold'] });
      }
      const [hex, finish = 'woven'] = this.palette[name];
      const c = new Color(hex),
        m = d
          .createMaterial((name.startsWith('hair') ? 'Hair_' : 'cloth_') + this.prefix + '_' + name)
          .setBaseColorFactor([...c.toArray(), 1])
          .setMetallicFactor(finish === 'brass' ? 0.42 : 0)
          .setRoughnessFactor(finish === 'brass' ? 0.36 : 0.91)
          .setDoubleSided(true)
          .setExtras({ finish });
      if (finish === 'woven') m.setBaseColorTexture(maps[name.startsWith('hair') ? 'hair' : 'cloth']);
      mesh.addPrimitive(p.setMaterial(m));
      d.getRoot().listScenes()[0].addChild(d.createNode(mesh.getName()).setMesh(mesh).setSkin(this.skin));
    }
  }
}
