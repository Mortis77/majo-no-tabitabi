// Paint the large pattern pieces in their own UV islands. The left 128 px remain the base-colour ramps
// for cords, jewelry, and other narrow pieces. All finishes share the existing character atlas.
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { clamp01, smooth } from './garment.mjs';

export const fabricAtlasSize = [1536, 1024];
export const paletteWidth = 128;
const layout = {
  open_mantle: [128, 0, 760, 410, 'wool'],
  pleated_skirt: [128, 410, 760, 699, 'wool'],
  boot_upper: [128, 699, 538, 1024, 'leather'],
  folded_hood: [538, 699, 760, 1024, 'wool'],
  bell_sleeve: [760, 0, 1148, 340, 'wool'],
  pintucked_blouse: [1148, 0, 1536, 340, 'linen'],
  satchel_flap: [760, 340, 1030, 575, 'leather'],
  satchel_body: [1030, 340, 1295, 575, 'leather'],
  boot_cuff: [1295, 340, 1536, 575, 'leather'],
  mantle_lining: [760, 575, 1225, 890, 'lining'],
  turned_cuff: [1225, 575, 1536, 890, 'lining'],
  lace_petticoat: [760, 890, 1536, 1024, 'lace'],
};
const TAU = Math.PI * 2;
const wrap = (x) => x - Math.floor(x);
const bump = (d, r) => Math.max(0, 1 - Math.abs(d) / r);
const mix = (a, b, t) => a + (b - a) * t;

async function grainTile(name) {
  const file = fileURLToPath(new URL('./textures/' + name + '.jpg', import.meta.url));
  const image = await sharp(file).resize(384, 384, { fit: 'fill' }).greyscale().raw().toBuffer();
  let sum = 0,
    squares = 0;
  for (const n of image) {
    sum += n;
    squares += n * n;
  }
  const mean = sum / image.length,
    dev = Math.sqrt(squares / image.length - mean * mean);
  return (u, v) => {
    const x = wrap(u) * 384,
      y = wrap(v) * 384,
      i = Math.floor(x),
      j = Math.floor(y);
    const p = (a, b) => image[(b % 384) * 384 + (a % 384)];
    const n = mix(mix(p(i, j), p(i + 1, j), x - i), mix(p(i, j + 1), p(i + 1, j + 1), x - i), y - j);
    return Math.max(-2, Math.min(2, (n - mean) / dev));
  };
}
function leatherWear(piece, u, v) {
  const side = Math.min(u, 1 - u),
    front = Math.max(0, Math.cos(TAU * u));
  if (piece === 'boot_upper') {
    const toe = front * front * (1 - smooth(0.12, 0.43, v));
    const folds = [0.27, 0.37, 0.47].reduce((s, h, i) => {
      const line = v - h - 0.105 * side * side + 0.015 * Math.sin(TAU * (u + i * 0.23));
      return s + front * (bump(line + 0.009, 0.012) * 2.8 - bump(line, 0.009) * 5.4);
    }, 0);
    return toe * (10.2 + 2.5 * Math.cos(13 * u)) + folds;
  }
  if (piece === 'satchel_flap') {
    const edge = Math.min(side, v, 1 - v),
      rim = 1 - smooth(0.008, 0.065, edge);
    const edgeSeam =
      bump(side - 0.035, 0.006) * (wrap(v * 25) > 0.38) + bump(v - 0.948, 0.008) * (wrap(u * 33 + 0.2) > 0.42);
    const corner = Math.pow(1 - smooth(0, 0.17, side), 2) * smooth(0.64, 0.96, v);
    const crease = bump(v - 0.82 + side * 0.68 - 0.026 * Math.cos(u * 15), 0.015);
    return 5.5 * rim + 27 * edgeSeam + corner * (5 - 6.2 * crease);
  }
  return (1 - smooth(0.008, 0.12, Math.min(v, 1 - v))) * 3;
}
function fibre(piece, finish, u, v, scans) {
  if (finish === 'leather') {
    const grain = scans.leather(u * (piece === 'satchel_flap' ? 0.56 : 1.1), v * 0.68);
    return 4.7 * grain + leatherWear(piece, u, v);
  }
  if (finish === 'lace') {
    const dx = (wrap(u * 40) - 0.5) * 2,
      dy = (v - 0.63) * 3.15;
    const oval = Math.sqrt(dx * dx + dy * dy);
    return (
      2.7 * scans.linen(u * 4, v * 0.24) +
      6 * bump(oval - 0.53, 0.2) -
      10.5 * (1 - smooth(0.08, 0.37, oval)) +
      3 * bump(v - 0.84, 0.05)
    );
  }
  if (finish === 'linen') {
    return (
      4.3 * scans.linen(u * 1.2, v * 1.5) +
      1.3 * Math.sin(TAU * (u * 72 + 0.15 * Math.sin(v * 9))) +
      1.1 * Math.cos(TAU * (v * 57 + 0.15 * Math.sin(u * 9)))
    );
  }
  if (finish === 'lining')
    return 2.4 * scans.linen(u * 1.7, v * 1.15) + 1.2 * Math.cos(TAU * (u * 43 + 0.17 * Math.sin(v * 13)));
  const across = piece === 'bell_sleeve' ? 8 : piece === 'open_mantle' ? 16 : 13;
  const zig = Math.abs(2 * wrap(u * across) - 1);
  const twill = Math.cos(TAU * (v * 49 + zig * 1.65));
  return 3.1 * scans.wool(u * 1.1, v * 0.82) + 3.25 * twill + 0.9 * Math.cos(TAU * (u * across * 2));
}
export async function makeFabricPainter(atlas, swatches) {
  const [wool, linen, leather] = await Promise.all(
    ['poly_wool_herringbone', 'rough_linen', 'brown_leather'].map(grainTile),
  );
  const scans = { wool, linen, leather },
    painted = new Set();
  return function paint(name, geometry, color, values, rows, cols) {
    const key = name.replace(/_[LR]$/, '');
    const tile = layout[key];
    if (!tile) return false;
    const [x0, y0, x1, y1, finish] = tile,
      w = x1 - x0,
      h = y1 - y0,
      pad = 4;
    if (!painted.has(key)) {
      painted.add(key);
      const [dark, light] = swatches[color];
      atlas.rect([x0 / atlas.w, y0 / atlas.h, x1 / atlas.w, y1 / atlas.h], (ru, rv) => {
        const u = clamp01((ru * w - pad) / (w - 2 * pad)),
          v = clamp01((rv * h - pad) / (h - 2 * pad));
        const x = u * (cols - 1),
          y = v * (rows - 1),
          i = Math.min(cols - 2, Math.floor(x)),
          j = Math.min(rows - 2, Math.floor(y)),
          a = j * cols + i;
        const tone = smooth(
          0,
          1,
          mix(mix(values[a], values[a + 1], x - i), mix(values[a + cols], values[a + cols + 1], x - i), y - j),
        );
        const grain = fibre(key, finish, u, v, scans);
        const patina = finish === 'leather' ? Math.max(0, leatherWear(key, u, v)) * 0.42 : 0;
        return [
          mix(dark[0], light[0], tone) + grain * 1.08 + patina,
          mix(dark[1], light[1], tone) + grain + patina * 0.36,
          mix(dark[2], light[2], tone) + grain * 0.9,
        ];
      });
    }
    geometry.uv = geometry.uv.map(([u, v]) => [
      (x0 + pad + u * (w - 2 * pad)) / atlas.w,
      (y0 + pad + v * (h - 2 * pad)) / atlas.h,
    ]);
    return true;
  };
}
