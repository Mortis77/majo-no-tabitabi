// Low layers at the transition between open ground and existing trees, plus ribbons along real path shoulders.
import { mulberry32 } from '../../core/util.js';
import { SPECIES } from './species.js';
import { farmWeight } from '../terrain/paddyLayout.js';

const cell = 20;
const cellKey = (ix, iz) => (ix + 64) * 128 + iz + 64;

function treeMargin(records, stride) {
  const bins = new Map();
  for (const [key, a] of records) {
    if (SPECIES[key]?.kind !== 'tree') continue;
    for (let i = 0; i < a.length; i += stride) {
      const x = a[i], z = a[i + 2], id = cellKey(Math.floor(x / cell), Math.floor(z / cell));
      if (!bins.has(id)) bins.set(id, []);
      bins.get(id).push(x, z);
    }
  }
  return (x, z) => {
    const ix = Math.floor(x / cell), iz = Math.floor(z / cell);
    let n = 0, nearest = Infinity, sumX = 0, sumZ = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const trees = bins.get(cellKey(ix + dx, iz + dz));
      if (!trees) continue;
      for (let i = 0; i < trees.length; i += 2) {
        const tx = trees[i] - x, tz = trees[i + 1] - z, rr = tx * tx + tz * tz;
        if (rr > cell * cell) continue;
        nearest = Math.min(nearest, rr);
        const d = Math.sqrt(rr) || 1;
        sumX += tx / d; sumZ += tz / d; n++;
      }
    }
    // Trees must actually collect to one side. A gap within a continuous canopy has balanced directions.
    if (n < 2 || nearest < 16 || nearest > 144 || Math.hypot(sumX, sumZ) < n * .50) return null;
    return Math.atan2(sumZ, sumX) + Math.PI / 2;
  };
}

export function scatterVerges(W, density, records, stride, place) {
  const woodlandDirection = treeMargin(records, stride);
  const distance = (p, x, z) => Math.hypot(x - p.x, z - p.z);
  function accepts(x, z, road) {
    if (road < 4.35 || distance(W.MOAT, x, z) < W.MOAT.r1 + 10 ||
        W.isReserved(x, z, 1.1) || W.riverDist(x, z) < 10) return false;
    const h = W.heightAt(x, z);
    if (h < 1.15 || h > 70) return false;
    const slope = W.slopeAt(x, z);
    if (slope > .52) return false;
    if (farmWeight(x,z,h,slope,road,W.riverDist(x,z))>.15) return false;
    return true;
  }
  function patch(x, z, angle, forest, rng, outside = -1) {
    if (!accepts(x, z, W.roadDist(x, z))) return;
    const ax = Math.cos(angle), az = Math.sin(angle);
    const type = rng(), paletteChoice = rng(), length = 2.8 + 2.8 * rng();
    const flower = rng() < .6 ? 'flower4' : 'flower2';
    function plant(key, along, across, scale) {
      const px = x + ax * along - az * across, pz = z + az * along + ax * across;
      if (accepts(px, pz, W.roadDist(px, pz))) place(key, px, pz, scale, paletteChoice, rng);
    }
    const isStony = type < (forest ? .48 : .24);
    const main = isStony ? 'boulder2' : rng() < .5 ? 'bush1' : 'bush2';
    const centerSize = isStony ? .38 + .4 * rng() : .56 + .32 * rng();
    plant(main, -length * .45, 0, centerSize);
    plant(isStony ? 'boulder2' : 'fern1', -length * .65 - .5, .55, isStony ? .20 + .18 * rng() : .78 + .36 * rng());
    if (density >= .7) {
      plant('fern1', -length * .42, -.65, .88 + .38 * rng());
      plant(forest || type > .48 ? 'bush1' : 'boulder2', -.2 * length, .88, .38 + .18 * rng());
      plant('fern1', length * .72, -.52, .68 + .31 * rng());
    }
    const n = Math.floor(2 + density * 8 + rng() * 5);
    const ears = !forest && type > .75;
    for (let i = 0; i < n; i++) {
      // A dense central group, a gap, then a smaller spray following the same tangent.
      const t = i / n, first = t < .68, along = length * (first ? (rng() - .38) : .85 + rng() * .65);
      const across = (rng() - .5) * (first ? 2.25 : 1.55);
      const species = forest && i % 3 === 0 ? 'fern1' : ears && i % 3 !== 2 ? 'reed2' : i % 4 ? flower : 'flower1';
      const s = species === 'reed2' ? .53 + .23 * rng() : species === 'fern1' ? .8 + .37 * rng() : .72 + .53 * rng();
      plant(species, along, across, first ? s : s * .86);
    }

    // Keep the taller silhouette on the outer shoulder. Test its footprint as well as its centre
    // so a spreading shrub cannot extend over the walking lane or a cultivated plot.
    const feature = mulberry32((Math.round(x * 13) * 71293 + Math.round(z * 13) * 49663) ^ 0x4bd31);
    if (feature() > (forest ? .88 : .70)) return;
    const deep = (forest ? 1.9 : 3.8) + feature() * 1.4;
    const centerX = x - az * outside * deep, centerZ = z + ax * outside * deep;
    const stone = feature() < (forest ? .58 : .48);
    function mass(key, along, across, size, footprint) {
      const px = centerX + ax * along - az * across, pz = centerZ + az * along + ax * across;
      for (const [ox, oz] of [[0, 0], [footprint, 0], [-footprint, 0], [0, footprint], [0, -footprint]]) {
        const xx = px + ox, zz = pz + oz, road = W.roadDist(xx, zz);
        if (road < 6.6 || !accepts(xx, zz, road)) return;
      }
      place(key, px, pz, size, paletteChoice, feature);
    }
    if (stone) {
      const rockSize = 1.62 + .45 * feature();
      mass('boulder2', -.30, 0, rockSize, .50 * rockSize);
      mass('moss2', .58, -.12, 1.0 + .30 * feature(), .50);
      mass('boulder2', -1.22, .47, .78 + .19 * feature(), .45);
      mass('bushBerry', 1.85, .36, .71 + .18 * feature(), .80);
    } else {
      const shrubSize = 1.05 + .20 * feature();
      mass('bushBerry', -.54, 0, shrubSize, 1.05);
      mass('bush2', .72, .19, .74 + .21 * feature(), 1.0);
      mass('boulder2', -1.8, .13, .70 + .24 * feature(), .50);
    }
    if (density >= .7) {
      mass('fern1', 2.4, -.43, 1.32, .95);
      mass('flower4', -1.06, -outside * .88, 1.16, .4);
      mass('flower4', -.34, -outside * 1.23, 1.06, .4);
    }
  }
  // Each side has an independent spacing sequence. Reducing quality thins sites before their local children.
  for (const [ri, road] of W.ROADS.entries()) for (let si = 1; si < road.pts.length; si++) {
    const [x0, z0] = road.pts[si - 1], [x1, z1] = road.pts[si];
    const len = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / len, dz = (z1 - z0) / len;
    for (const side of [-1, 1]) {
      const spacing = mulberry32((ri * 7159 + si * 49531 + side * 8191) ^ 0x62b350);
      for (let d = 3 + spacing() * 8; d < len; d += 9 + spacing() * 14) {
        const rng = mulberry32((spacing() * 0xffffffff) >>> 0);
        if (rng() > Math.min(.98, 1.25 * density - .16)) continue;
        let shoulder = 4.7 + Math.pow(rng(), 1.65) * 4.4;
        const cx = x0 + d * dx, cz = z0 + d * dz;
        if (distance(W.POI.village, cx, cz) < 194) shoulder = 4.7 + rng() * .45;
        patch(x0 + d * dx - side * shoulder * dz, z0 + d * dz + side * shoulder * dx,
          Math.atan2(dz, dx) + (rng() - .5) * .45, false, rng, side);
      }
    }
  }
  for (let iz = -740; iz < 740; iz += 23) for (let ix = -740; ix < 740; ix += 23) {
    const rng = mulberry32((ix * 71293 + iz * 49663) ^ 0x5e82a0);
    if (rng() > .34 * density) continue;
    const x = ix + rng() * 23, z = iz + rng() * 23;
    if (x * x + z * z > 745 * 745 || W.roadDist(x, z) < 10) continue;
    const angle = woodlandDirection(x, z);
    if (angle !== null) patch(x, z, angle, true, rng);
  }
}
