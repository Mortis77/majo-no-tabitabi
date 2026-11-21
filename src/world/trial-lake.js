// The eastern meadow and its flooded survey share the same geological features.
// Values are metres in the game's east/south coordinate system.
export const TRIAL_LAKE = Object.freeze({
  x: 1725,
  z: -48,
  rx: 190,
  rz: 150,
  x0: 1465,
  x1: 2100,
  z0: -266,
  z1: 170,
  inlet: { x: 1537, z: -68 },
  islands: [
    { x: 1818, z: -77, rx: 29, rz: 25, height: 19 }, // the windmill
    { x: 1664, z: -102, rx: 25, rz: 18, height: 11 },
    { x: 1747, z: 24, rx: 17, rz: 23, height: 8.5 },
    { x: 1618, z: -31, rx: 11, rz: 14, height: 5.8 }
  ]
});
let flooded = false;
export const trialLakeActive = () => flooded;
export function changeTrialLake(on) {
  const next = !!on;
  if (next === flooded) return false;
  flooded = next;
  return true;
}
const saturate = (t) => Math.max(0, Math.min(1, t));
function ease(a, b, v) {
  const t = saturate((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}
const mix = (a, b, t) => a + (b - a) * t;
export function insideTrialSurvey(x, z) {
  return x >= TRIAL_LAKE.x0 && x <= TRIAL_LAKE.x1 && z >= TRIAL_LAKE.z0 && z <= TRIAL_LAKE.z1;
}
export function trialShoreDistance(x, z) {
  const u = (x - TRIAL_LAKE.x) / TRIAL_LAKE.rx,
    v = (z - TRIAL_LAKE.z) / TRIAL_LAKE.rz;
  const a = Math.atan2(v, u);
  const shape = 1 + 0.084 * Math.sin(3 * a + 0.94) + 0.053 * Math.cos(5 * a - 0.4) + 0.037 * Math.sin(7 * a + 1.1);
  return Math.hypot(u, v) / shape;
}
function ridgeTop(x, z, terrain) {
  let h = terrain;
  for (const island of TRIAL_LAKE.islands) {
    const ix = (x - island.x) / island.rx,
      iz = (z - island.z) / island.rz;
    const a = Math.atan2(iz, ix);
    const shape = 1 + 0.138 * Math.sin(3 * a + island.rx) + 0.07 * Math.cos(5 * a + island.rz);
    const r = Math.hypot(ix, iz) / shape;
    if (r >= 1.79) continue;
    const summit = island.height + 0.63 * Math.sin((x - island.x) * 0.1) * Math.sin((z - island.z) * 0.14);
    const mill = island === TRIAL_LAKE.islands[0];
    const foot = mill ? 0.61 : 0.32;
    const shoulder = 1.34 + 0.38 * Math.sin(a - island.rz * 0.13);
    // Broken low shelves collect soil leeward of the exposed rock face.
    const ledge = 1.45 + 1.55 * (0.5 + 0.5 * Math.sin(a + island.rx)) + 0.18 * Math.sin(x * 0.33 + z * 0.14);
    const reach = 1.31 + 0.23 * Math.cos(2 * a + island.rz * 0.16);
    h = mix(h, Math.max(h, ledge), 1 - ease(reach - 0.07, reach + 0.24, r));
    h = mix(h, Math.max(h, summit), 1 - ease(foot, shoulder, r));
  }
  // A stone causeway joins the mill to the eastern shore. An old masonry bridge
  // spans its notch. The bed drops underneath while both abutments stay in place.
  if (x > 1810 && x < 1972) {
    const axis = -77 + Math.max(0, x - 1898) * 0.13;
    const shoulder = 22 + 6 * Math.sin((x - 1840) * 0.077);
    const near = 1 - ease(5.45, shoulder, Math.abs(z - axis));
    const ends = ease(1810, 1826, x) * (1 - ease(1950, 1972, x));
    const notch = ease(7.4, 13.4, Math.abs(x - 1876));
    h = mix(h, Math.max(h, 19), near * ends * notch);
  }
  return h;
}
export function dryTrialHeight(x, z, natural) {
  if (!insideTrialSurvey(x, z)) return natural;
  const r = trialShoreDistance(x, z);
  if (r > 1.39) return natural;
  const low = 8.05 + 1.12 * Math.sin((x - 1690) * 0.039) + 0.79 * Math.sin((z + 21) * 0.057 + (x - 1650) * 0.011);
  const arc = (0.5 + 0.5 * Math.sin(Math.atan2(z + 48, x - 1725) * 3 - 0.4)) ** 1.4;
  const rim = 9.6 * arc * ease(0.77, 1.03, r) * (1 - ease(1.05, 1.34, r));
  const base = mix(low + rim, natural, ease(0.82, 1.38, r));
  return ridgeTop(x, z, base);
}
export function floodedTrialHeight(x, z, dry) {
  if (!insideTrialSurvey(x, z)) return dry;
  const r = trialShoreDistance(x, z);
  // A narrow drowned ravine opens the western shore into a shallow inlet.
  let creek = Infinity;
  if (x > 1505 && x < 1578) {
    const axis = -80 + (x - 1505) * 0.39 + 2.2 * Math.sin((x - 1505) * 0.1);
    const bank = Math.abs(z - axis) / (4.7 + 0.075 * (x - 1505));
    if (bank < 1 && x > 1510) {
      const amount = ease(1510, 1527, x) * (1 - ease(0.08, 1, bank));
      creek = mix(dry, -1.4 - 0.037 * (x - 1510), amount);
    }
  }
  const a = Math.atan2(z - TRIAL_LAKE.z, x - TRIAL_LAKE.x);
  const beach = 0.5 + 0.5 * Math.sin(2 * a + 0.18);
  const bankEnd = 1.065 + 0.215 * beach;
  if (r >= bankEnd) return Math.min(dry, creek);
  const wave = 0.86 * Math.sin((x - 1700) * 0.055) * Math.sin((z + 20) * 0.041);
  let bed = -20.5 + wave + 4.3 * ease(0.13, 0.6, r) + 7.7 * ease(0.53, 0.8, r) + 8.5 * ease(0.77, 1, r);
  if (r >= 1) bed = mix(0, dry, ease(1, bankEnd, r));
  return Math.min(creek, ridgeTop(x, z, Math.min(bed, dry)));
}
// A footprint of the actual lake surface, with the surviving islands removed.
export function trialLakeContains(x, z) {
  return flooded && insideTrialSurvey(x, z) && floodedTrialHeight(x, z, 16) < 0;
}

// A break in the eastern rim lets a standing observer on the trial lawn see the
// impact point. The old mill lies just north of this natural saddle.
export function trialViewOpening(x, z) {
  const radius = 9 + 12 * ease(1855, 1980, x);
  return x > 1785 && x < 2096 && Math.abs(z + 48 + 0.096 * (x - 1725)) < radius;
}
export function trialViewHeight(x, z, height, wet) {
  if (x <= 1725 || x >= 2097) return height;
  const u = (x - 1725) / 375,
    axis = -48 - 0.096 * (x - 1725),
    off = Math.abs(z - axis);
  if (off > 29) return height;
  const mill = Math.hypot(x - 1818, z + 77);
  const abutment = ease(1820, 1839, x) * (1 - ease(1906, 1937, x)) * (1 - ease(5.2, 9.4, Math.abs(z + 77)));
  const blend = (1 - abutment) * (1 - ease(7, 28, off)) * ease(14.7, 18.4, mill) * ease(2, 19, 2100 - x);
  const sight = mix(wet ? 0.14 : 8.68, 26.45, u) - 1.35 * 4 * u * (1 - u);
  return mix(height, Math.min(height, sight), blend);
}
