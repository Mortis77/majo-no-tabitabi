// Detail that survives simplification: an automatic unwrap (charts grown over faces of similar normal, projected flat,
// rotated to their tightest box, shelf-packed with padding), then a bake from the FULL field onto the simplified mesh:
// painted colour x AO x cavity into one sRGB atlas, the object-space normal into a second map of the same layout, the
// border texels dilated. Plus the same paint / AO / cavity into vertex colours for the texture-less LODs. Seam check.
import { toLin } from './preview.mjs';

// ---------------------------------------------------------------------------------------------------------------- unwrap
/**
 * mesh = { pos, idx, weld } where weld[v] = welded vertex id (adjacency across normal splits). Returns
 * { pos, nrm?, idx, uv, src (vertex of the input per output vertex), chart (per face), charts, scale (texels per m) }
 */
export function unwrap(mesh, size, { maxAngle = 50, pad = 4 } = {}) {
  const { pos, idx } = mesh, weld = mesh.weld || null, nf = idx.length / 3;
  const W = (v) => (weld ? weld[v] : v);
  const fn = new Float64Array(nf * 3), farea = new Float64Array(nf);
  for (let f = 0; f < nf; f++) {
    const a = idx[f * 3] * 3, b = idx[f * 3 + 1] * 3, c = idx[f * 3 + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1e-12;
    fn[f * 3] = nx / l; fn[f * 3 + 1] = ny / l; fn[f * 3 + 2] = nz / l; farea[f] = l / 2;
  }
  // face adjacency by welded edges
  const em = new Map(), nb = Array.from({ length: nf }, () => []);
  for (let f = 0; f < nf; f++) for (let k = 0; k < 3; k++) {
    const a = W(idx[f * 3 + k]), b = W(idx[f * 3 + (k + 1) % 3]), key = a < b ? a + ',' + b : b + ',' + a;
    const o = em.get(key); if (o !== undefined) { nb[f].push(o); nb[o].push(f); } else em.set(key, f);
  }
  // grow charts (largest flat regions first: seeds in order of area)
  const chart = new Int32Array(nf).fill(-1), cos = Math.cos(maxAngle * Math.PI / 180);
  const order = Array.from({ length: nf }, (_, i) => i).sort((a, b) => farea[b] - farea[a]);
  const charts = [];
  for (const seed of order) {
    if (chart[seed] >= 0) continue;
    const ci = charts.length, faces = [seed];
    let sx = fn[seed * 3] * farea[seed], sy = fn[seed * 3 + 1] * farea[seed], sz = fn[seed * 3 + 2] * farea[seed];
    chart[seed] = ci;
    for (let q = 0; q < faces.length; q++) {
      for (const g of nb[faces[q]]) {
        if (chart[g] >= 0) continue;
        const l = Math.hypot(sx, sy, sz);
        const d = (fn[g * 3] * sx + fn[g * 3 + 1] * sy + fn[g * 3 + 2] * sz) / l;
        const ds = fn[g * 3] * fn[seed * 3] + fn[g * 3 + 1] * fn[seed * 3 + 1] + fn[g * 3 + 2] * fn[seed * 3 + 2];
        if (d < cos || ds < cos * 0.7) continue;
        chart[g] = ci; faces.push(g);
        sx += fn[g * 3] * farea[g]; sy += fn[g * 3 + 1] * farea[g]; sz += fn[g * 3 + 2] * farea[g];
      }
    }
    charts.push({ faces, n: norm([sx, sy, sz]) });
  }
  // merge small charts into the neighbour with the closest normal (tiny charts waste padding)
  const minArea = (mesh.minChartArea ?? 0.0012), cosMerge = Math.cos(75 * Math.PI / 180);
  for (let pass = 0; pass < 2; pass++) {
    const area = charts.map((c) => c.faces.reduce((s, f) => s + farea[f], 0));
    for (let ci = 0; ci < charts.length; ci++) {
      const c = charts[ci]; if (!c.faces.length || area[ci] >= minArea) continue;
      let best = -1, bd = cosMerge;
      for (const f of c.faces) for (const g of nb[f]) {
        const cj = chart[g]; if (cj === ci || !charts[cj].faces.length) continue;
        const n2 = charts[cj].n, d = c.n[0] * n2[0] + c.n[1] * n2[1] + c.n[2] * n2[2];
        if (d > bd) { bd = d; best = cj; }
      }
      if (best < 0) continue;
      const tgt = charts[best];
      // every face must still face the target's projection direction
      if (c.faces.some((f) => fn[f * 3] * tgt.n[0] + fn[f * 3 + 1] * tgt.n[1] + fn[f * 3 + 2] * tgt.n[2] < 0.2)) continue;
      for (const f of c.faces) { chart[f] = best; tgt.faces.push(f); }
      area[best] += area[ci]; c.faces = [];
    }
  }
  for (let i = charts.length - 1; i >= 0; i--) if (!charts[i].faces.length) charts.splice(i, 1);
  charts.forEach((c, i) => { for (const f of c.faces) chart[f] = i; });
  // project each chart, chart-local vertex copies
  const outPos = [], outSrc = [], outUV2 = [], outIdx = new Uint32Array(nf * 3);
  for (const c of charts) {
    const n = c.n, t = norm(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), bt = cross(n, t);
    const local = new Map();
    const pts = [];
    for (const f of c.faces) for (let k = 0; k < 3; k++) {
      const v = idx[f * 3 + k];
      let li = local.get(v);
      if (li === undefined) {
        li = outSrc.length; local.set(v, li); outSrc.push(v); outPos.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
        const px = pos[v * 3] * t[0] + pos[v * 3 + 1] * t[1] + pos[v * 3 + 2] * t[2], py = pos[v * 3] * bt[0] + pos[v * 3 + 1] * bt[1] + pos[v * 3 + 2] * bt[2];
        outUV2.push(px, py); pts.push(li);
      }
      outIdx[f * 3 + k] = li;
    }
    // tightest box over 18 rotations
    let best = null;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const li of pts) { const x = outUV2[li * 2] * ca - outUV2[li * 2 + 1] * sa, y = outUV2[li * 2] * sa + outUV2[li * 2 + 1] * ca; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const ar = (x1 - x0) * (y1 - y0);
      if (!best || ar < best.ar) best = { ar, ca, sa, x0, y0, w: x1 - x0, h: y1 - y0 };
    }
    // keep charts landscape (better shelves)
    const rot = best.h > best.w;
    for (const li of pts) {
      let x = outUV2[li * 2] * best.ca - outUV2[li * 2 + 1] * best.sa - best.x0, y = outUV2[li * 2] * best.sa + outUV2[li * 2 + 1] * best.ca - best.y0;
      if (rot) { const tt = x; x = y; y = best.w - tt; }
      outUV2[li * 2] = x; outUV2[li * 2 + 1] = y;
    }
    c.w = rot ? best.h : best.w; c.h = rot ? best.w : best.h; c.verts = pts;
  }
  // pack: binary search the texel density that fits
  const sorted = charts.map((c, i) => i).sort((a, b) => charts[b].h - charts[a].h);
  const tryPack = (k) => {
    let x = pad, y = pad, rowH = 0; const at = new Array(charts.length);
    for (const i of sorted) {
      const c = charts[i], w = Math.ceil(c.w * k) + 1, h = Math.ceil(c.h * k) + 1;
      if (w + 2 * pad > size) return null;
      if (x + w + pad > size) { x = pad; y += rowH + pad; rowH = 0; }
      if (y + h + pad > size) return null;
      at[i] = [x, y]; x += w + pad; rowH = Math.max(rowH, h);
    }
    return at;
  };
  let lo = 1, hi = 1e5, at = null;
  for (let it = 0; it < 40; it++) { const mid = Math.sqrt(lo * hi); const r = tryPack(mid); if (r) { lo = mid; at = r; } else hi = mid; }
  const k = lo; at = tryPack(k);
  const uv = new Float32Array(outSrc.length * 2);
  charts.forEach((c, i) => { for (const li of c.verts) { uv[li * 2] = (at[i][0] + 0.5 + outUV2[li * 2] * k) / size; uv[li * 2 + 1] = (at[i][1] + 0.5 + outUV2[li * 2 + 1] * k) / size; } });
  return { pos: Float32Array.from(outPos), idx: outIdx, uv, src: Int32Array.from(outSrc), chart, charts: charts.length, scale: k, size, pad };
}

// ------------------------------------------------------------------------------------------------------------------ bake
/**
 * Bake colour (with AO / cavity) and object-space normals for an unwrapped mesh from the field (via the pool).
 * Returns { color: Uint8Array RGBA (sRGB), normal: Uint8Array RGBA, used (fraction), seam (mean colour step across chart
 * borders, 0..1), size }
 */
export async function bakeAtlas(pool, um, M, log = () => {}) {
  const size = um.size, N = size * size, pts = [], tex = [];
  const covered = new Int32Array(N).fill(-1);
  const { pos, idx, uv } = um;
  for (let f = 0; f < idx.length / 3; f++) {
    const a = idx[f * 3], b = idx[f * 3 + 1], c = idx[f * 3 + 2];
    const ax = uv[a * 2] * size, ay = uv[a * 2 + 1] * size, bx = uv[b * 2] * size, by = uv[b * 2 + 1] * size, cx = uv[c * 2] * size, cy = uv[c * 2 + 1] * size;
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-9) continue;
    const ha = Math.abs(area) / (Math.hypot(cx - bx, cy - by) || 1), hb = Math.abs(area) / (Math.hypot(ax - cx, ay - cy) || 1), hc = Math.abs(area) / (Math.hypot(bx - ax, by - ay) || 1);
    const ea = -0.75 / ha, eb = -0.75 / hb, ec = -0.75 / hc;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) - 1)), x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx) + 1));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy) - 1)), y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy) + 1));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      let w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area, w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area, w2 = 1 - w0 - w1;
      const inside = w0 >= 0 && w1 >= 0 && w2 >= 0;
      if (!inside && (w0 < ea || w1 < eb || w2 < ec)) continue;
      const ti = y * size + x;
      if (covered[ti] >= 0 && !inside) continue;
      w0 = Math.max(0, w0); w1 = Math.max(0, w1); w2 = Math.max(0, w2); const s = w0 + w1 + w2; w0 /= s; w1 /= s; w2 /= s;
      const X = pos[a * 3] * w0 + pos[b * 3] * w1 + pos[c * 3] * w2, Y = pos[a * 3 + 1] * w0 + pos[b * 3 + 1] * w1 + pos[c * 3 + 1] * w2, Z = pos[a * 3 + 2] * w0 + pos[b * 3 + 2] * w1 + pos[c * 3 + 2] * w2;
      if (covered[ti] >= 0) { const j = covered[ti]; pts[j * 3] = X; pts[j * 3 + 1] = Y; pts[j * 3 + 2] = Z; continue; }
      covered[ti] = tex.length; tex.push(ti); pts.push(X, Y, Z);
    }
  }
  log(`  atlas ${size}^2: ${tex.length} texels to bake (${(100 * tex.length / N).toFixed(1)} %)`);
  const res = await sampleMany(pool, Float32Array.from(pts));
  const col = new Float32Array(N * 3), nrm = new Float32Array(N * 3), has = new Uint8Array(N);
  for (let i = 0; i < tex.length; i++) {
    const t = tex[i], o = i * 8, c = compose(res.out, o, M.cfg);
    col[t * 3] = c[0]; col[t * 3 + 1] = c[1]; col[t * 3 + 2] = c[2];
    nrm[t * 3] = res.out[o + 3]; nrm[t * 3 + 1] = res.out[o + 4]; nrm[t * 3 + 2] = res.out[o + 5]; has[t] = 1;
  }
  dilate(col, has.slice(), size, um.pad + 3);
  dilate(nrm, has.slice(), size, um.pad + 3);
  const color = new Uint8Array(N * 4), normal = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < 3; k++) color[i * 4 + k] = Math.round(Math.max(0, Math.min(1, col[i * 3 + k])) * 255);
    const l = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) || 1;
    for (let k = 0; k < 3; k++) normal[i * 4 + k] = Math.round((nrm[i * 3 + k] / l * 0.5 + 0.5) * 255);
    color[i * 4 + 3] = normal[i * 4 + 3] = 255;
  }
  const seam = seamCheck(um, color, size);
  return { color, normal, used: tex.length / N, seam, size, texels: tex.length };
}

/** paint x AO x cavity, in sRGB 0..1 (the atlas stores sRGB) */
export function compose(out, o, cfg) {
  const ao = out[o + 6], cav = out[o + 7];
  const k = (1 - (cfg.aoStrength ?? 0.7) * (1 - ao)) * (1 - (cfg.cavityDark ?? 0.45) * cav);
  return [out[o] * k, out[o + 1] * k, out[o + 2] * k];
}

/** samples at points via the pool (chunked) -> { out: Float32Array 8 per point, part: Int16Array } */
export async function sampleMany(pool, pts) {
  const n = pts.length / 3, per = Math.max(256, Math.ceil(n / (pool.size * 8)));
  const chunks = [];
  for (let i = 0; i < n; i += per) chunks.push({ pts: pts.slice(i * 3, Math.min(n, i + per) * 3) });
  const rs = await pool.map('samples', chunks);
  const out = new Float32Array(n * 8), part = new Int16Array(n);
  let o = 0; for (const r of rs) { out.set(r.out, o * 8); part.set(r.part, o); o += r.part.length; }
  return { out, part };
}

/** vertex colours (linear, for COLOR_0) for a mesh from the field */
export async function bakeVertexColors(pool, pos, M) {
  const res = await sampleMany(pool, pos);
  const n = pos.length / 3, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const c = compose(res.out, i * 8, M.cfg); for (let k = 0; k < 3; k++) col[i * 3 + k] = toLin(Math.max(0, Math.min(1, c[k]))); }
  return { col, part: res.part, raw: res.out };
}

function dilate(buf, has, size, passes) {
  for (let p = 0; p < passes; p++) {
    const add = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x; if (has[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        const j = yy * size + xx; if (!has[j]) continue; r += buf[j * 3]; g += buf[j * 3 + 1]; b += buf[j * 3 + 2]; n++;
      }
      if (n) add.push(i, r / n, g / n, b / n);
    }
    for (let k = 0; k < add.length; k += 4) { const i = add[k]; buf[i * 3] = add[k + 1]; buf[i * 3 + 1] = add[k + 2]; buf[i * 3 + 2] = add[k + 3]; has[i] = 1; }
  }
}

/** mean colour difference across chart borders (same 3D edge midpoint looked up in both charts) */
function seamCheck(um, color, size) {
  const { idx, uv, src, chart } = um, map = new Map();
  let sum = 0, n = 0;
  const at = (u, v) => { const x = Math.min(size - 1, Math.max(0, Math.floor(u * size))), y = Math.min(size - 1, Math.max(0, Math.floor(v * size))); const i = (y * size + x) * 4; return [color[i], color[i + 1], color[i + 2]]; };
  for (let f = 0; f < idx.length / 3; f++) for (let k = 0; k < 3; k++) {
    const a = idx[f * 3 + k], b = idx[f * 3 + (k + 1) % 3], sa = src[a], sb = src[b], key = sa < sb ? sa + ',' + sb : sb + ',' + sa;
    const mu = (uv[a * 2] + uv[b * 2]) / 2, mv = (uv[a * 2 + 1] + uv[b * 2 + 1]) / 2;
    const o = map.get(key);
    if (!o) { map.set(key, [chart[f], mu, mv]); continue; }
    if (o[0] === chart[f]) continue;
    const c1 = at(o[1], o[2]), c2 = at(mu, mv);
    sum += (Math.abs(c1[0] - c2[0]) + Math.abs(c1[1] - c2[1]) + Math.abs(c1[2] - c2[2])) / (3 * 255); n++;
  }
  return n ? sum / n : 0;
}

function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
