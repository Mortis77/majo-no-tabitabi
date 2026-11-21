// Fit the upper hair shell against the actual triangulated underside of Elaina's hat.
// The apprentice keeps the full loose crown. The traveller's hair is tucked into
// a smooth opening and the section in contact with the band follows the head.
import { BufferGeometry, Float32BufferAttribute } from 'three';
const smooth = (a, b, x) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const softMin = (a, b, k) => Math.min(a, b) - Math.max(0, k - Math.abs(a - b)) ** 2 / (4 * k);
export function hatSurfaces(doc) {
  const root = doc.getRoot(),
    prim = root
      .listMeshes()
      .find((m) => m.getName() === 'akari_witch_hat')
      .listPrimitives()[0];
  const pos = prim.getAttribute('POSITION').getArray(),
    uv = prim.getAttribute('TEXCOORD_0').getArray(),
    index = prim.getIndices().getArray(),
    brim = [],
    crown = [];
  const start = 9 * 73 * 2 + 5 * 73,
    end = start + 33 * 49;
  for (let i = 0; i < index.length; i += 3) {
    const ids = [index[i], index[i + 1], index[i + 2]],
      pts = ids.map((k) => [pos[3 * k], pos[3 * k + 1], pos[3 * k + 2]]);
    if (ids.every((k) => uv[2 * k + 1] > 64 / 512 && uv[2 * k + 1] < 128 / 512)) brim.push(pts);
    else if (ids.every((k) => k >= start && k < end) && Math.min(...pts.map((p) => p[1])) < 1.545)
      crown.push(pts);
  }
  const topY = (x, z) => {
    let h = Infinity;
    for (const [p, q, r] of brim) {
      if (
        x < Math.min(p[0], q[0], r[0]) ||
        x > Math.max(p[0], q[0], r[0]) ||
        z < Math.min(p[2], q[2], r[2]) ||
        z > Math.max(p[2], q[2], r[2])
      )
        continue;
      const ax = q[0] - p[0],
        az = q[2] - p[2],
        bx = r[0] - p[0],
        bz = r[2] - p[2],
        det = ax * bz - bx * az;
      if (Math.abs(det) < 1e-12) continue;
      const u = ((x - p[0]) * bz - (z - p[2]) * bx) / det,
        v = (ax * (z - p[2]) - az * (x - p[0])) / det;
      if (u >= -1e-6 && v >= -1e-6 && u + v <= 1.000001)
        h = Math.min(h, p[1] + u * (q[1] - p[1]) + v * (r[1] - p[1]));
    }
    return h;
  };
  const crownR = (y, s, c) => {
    let h = Infinity;
    for (const tri of crown) {
      if (y < Math.min(...tri.map((p) => p[1])) || y > Math.max(...tri.map((p) => p[1]))) continue;
      const [p, q, r] = tri.map(([x, y, z]) => [x * c - (z + 0.008) * s, y, x * s + (z + 0.008) * c]),
        ax = q[0] - p[0],
        ay = q[1] - p[1],
        bx = r[0] - p[0],
        by = r[1] - p[1],
        det = ax * by - bx * ay;
      if (Math.abs(det) < 1e-11) continue;
      const u = (-p[0] * by - (y - p[1]) * bx) / det,
        v = (ax * (y - p[1]) + ay * p[0]) / det;
      if (u >= -1e-5 && v >= -1e-5 && u + v <= 1.00001) {
        const d = p[2] + u * (q[2] - p[2]) + v * (r[2] - p[2]);
        if (d > 0.035) h = Math.min(h, d);
      }
    }
    return h;
  };
  return { topY, crownR };
}
export function fitWornHair(doc) {
  const r = doc.getRoot(),
    hair = r
      .listMeshes()
      .find((m) => m.getName() === 'akari_hair')
      .listPrimitives()[0];
  const { topY, crownR } = hatSurfaces(doc),
    a = hair.getAttribute('POSITION').getArray(),
    orig = a.slice(),
    js = hair.getAttribute('JOINTS_0').getArray(),
    ws = hair.getAttribute('WEIGHTS_0').getArray(),
    joint = r
      .listSkins()[0]
      .listJoints()
      .findIndex((b) => b.getName() === 'J_Bip_C_Head');
  const m = [];
  for (let i = 0; i < a.length; i += 3) {
    let [x, y, z] = a.slice(i, i + 3);
    if (y < 1.394) continue;
    const rr = Math.max(0.00001, Math.hypot(x, z + 0.008)),
      s = x / rr,
      c = (z + 0.008) / rr,
      press = 0.093 * smooth(1.427, 1.514, y),
      rad = rr * (1 - press);
    x = s * rad;
    z = c * rad - 0.008;
    // Under the open part of the crown there is still room for a shallow rounded dome.
    const h = topY(x, z),
      rim = Number.isFinite(h) ? h : topY(s * 0.108, c * 0.108 - 0.008),
      limit = rim - 0.011 + 0.044 * (1 - smooth(0.061, 0.087, rad));
    if (Number.isFinite(limit)) y = softMin(y, limit, 0.009);
    if (y > 1.465) {
      const cone = crownR(y, s, c);
      if (Number.isFinite(cone) && rad > cone - 0.009) {
        const tuck = softMin(rad, cone - 0.009, 0.004);
        x = s * tuck;
        z = c * tuck - 0.008;
      }
    }
    a.set([x, y, z], i);
    const d = Math.hypot(x - orig[i], y - orig[i + 1], z - orig[i + 2]);
    if (d > 0.00001) m.push(d);
    const k = smooth(1.397, 1.438, orig[i + 1]);
    if (k > 0) {
      const base = (i / 3) * 4,
        map = new Map([[joint, k]]);
      for (let j = 0; j < 4; j++) {
        const b = js[base + j];
        map.set(b, (map.get(b) || 0) + (1 - k) * ws[base + j]);
      }
      const w = [...map]
          .filter((x) => x[1] > 1e-8)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4),
        total = w.reduce((sum, v) => sum + v[1], 0);
      for (let j = 0; j < 4; j++) {
        js[base + j] = w[j]?.[0] || 0;
        ws[base + j] = (w[j]?.[1] || 0) / total;
      }
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(a, 3));
  geo.setIndex(Array.from(hair.getIndices().getArray()));
  geo.computeVertexNormals();
  const normals = hair.getAttribute('NORMAL').getArray(),
    computed = geo.getAttribute('normal').array;
  for (let i = 0; i < a.length; i += 3) {
    const k = 0.75 * smooth(1.429, 1.47, orig[i + 1]);
    if (!k) continue;
    const nx = normals[i] * (1 - k) + computed[i] * k,
      ny = normals[i + 1] * (1 - k) + computed[i + 1] * k,
      nz = normals[i + 2] * (1 - k) + computed[i + 2] * k,
      len = Math.hypot(nx, ny, nz) || 1;
    normals.set([nx / len, ny / len, nz / len], i);
  }
  return { moved: m.length, maxMoveMm: +(Math.max(...m) * 1000).toFixed(1) };
}
