import { TRIAL_LAKE, trialViewHeight, dryTrialHeight, floodedTrialHeight, trialLakeActive, trialLakeContains, changeTrialLake } from './trial-lake.js';
import { CITY, JOURNEY_ANCHORS, JOURNEY_POI, journeyIndoor } from '../data/journey-map.js';
import { bellPaving, bellRegion } from '../data/bellcrown.js';
// Ground truth of the world: analytic terrain height, walkable platforms, colliders, regions.
// Pure logic (no meshes). Everything else — terrain mesh, flora, player physics, AI — queries this module.
import * as THREE from 'three';
import { clamp, lerp, smoothstep, noise2, fbm, ridged, distToPolyline } from '../core/util.js';
import { WORLD, VEIL, POI, MOUNTAIN, MOAT, RIVERS, ROADS, FLATTEN, ANCHORS, SKY_ISLES, BRIDGES, ROUTE_RELIEF, STONE_LANTERNS, GREAT_LANTERNS } from '../data/world.js';
import { veilAt, veilDist, moonDirAt, daylightAt, SUN_DIR } from './veil.js';

export const SEA_LEVEL = WORLD.seaLevel;

const gauss = (x, z, cx, cz, s) => Math.exp(-(((x - cx) ** 2 + (z - cz) ** 2) / (s * s)));

// Height sampling is also used by collision, foliage, fields and terrain deformation.
const ridgeBins = new Map();
const bin = v => Math.floor(v/64);
for (const [x,z,angle,length,width,height] of ROUTE_RELIEF) {
  const c=Math.cos(angle), s=Math.sin(angle);
  const rx=Math.hypot(length*c,width*s), rz=Math.hypot(length*s,width*c);
  const ridge = {x,z,c,s,along:1/length,across:1/width,height,shoulder:height>4};
  for(let i=bin(x-rx);i<=bin(x+rx);i++) for(let j=bin(z-rz);j<=bin(z+rz);j++) {
    const key=i*128+j;
    if(!ridgeBins.has(key)) ridgeBins.set(key,[]);
    ridgeBins.get(key).push(ridge);
  }
}
function routeHeight(x,z) {
  const patch = ridgeBins.get(bin(x)*128+bin(z));
  if(!patch) return 0;
  let shoulder=0, crown=0;
  for(const r of patch) {
    const dx=x-r.x,dz=z-r.z, u=(dx*r.c+dz*r.s)*r.along, v=(-dx*r.s+dz*r.c)*r.across;
    const k=1-u*u-v*v;
    if(k<=0) continue;
    const rise=r.height*k*k*(1+.16*u-.08*v);
    if(r.shoulder) shoulder+=rise; else crown+=rise;
  }
  // A footpath traverses the saddle. Roll the banks in outside its shoulders
  // instead of tipping the whole road sideways on the steep face of the knoll.
  if (shoulder>0) shoulder*=.14+.86*smoothstep(4,19,roadDist(x,z));
  return crown+shoulder;
}

/** Distance to the nearest river centreline (metres). */
export function riverDist(x, z) {
  let d = Infinity;
  for (const r of RIVERS) d = Math.min(d, distToPolyline(x, z, r.pts));
  return d;
}
/** Distance to the nearest footpath centreline (metres). Paths are ~3 m wide. */
export function roadDist(x, z) {
  let d = Infinity;
  for (const r of ROADS) d = Math.min(d, distToPolyline(x, z, r.pts));
  return d;
}

/** Mask of the northern range, 0..1. */
export function mountainMask(x, z) {
  return Math.exp(-(((x - MOUNTAIN.x) / MOUNTAIN.rx) ** 2 + ((z - MOUNTAIN.z) / MOUNTAIN.rz) ** 2));
}

// ---- deformation layer (craters, mounds) --------------------------------------------------------
// A 2 m grid of height offsets laid over the analytic terrain. Spells dig craters / raise mounds through deform().
const DG = 2, DHALF = WORLD.half, DN = 1 + 2 * DHALF / DG;
let deformGrid = null;
let deformVersion = 0;
let spellScars = [];
let restoringScars = false;
const deformListeners = [];
export const DEFORM_MIN = -14, DEFORM_MAX = 10;

function deformAt(x, z) {
  if (!deformGrid) return 0;
  const fx = (x + DHALF) / DG, fz = (z + DHALF) / DG;
  if (fx < 0 || fz < 0 || fx >= DN - 1 || fz >= DN - 1) return 0;
  const ix = fx | 0, iz = fz | 0;
  const tx = fx - ix, tz = fz - iz;
  const i = iz * DN + ix;
  const a = deformGrid[i], b = deformGrid[i + 1], c = deformGrid[i + DN], d = deformGrid[i + DN + 1];
  if (a === 0 && b === 0 && c === 0 && d === 0) return 0;
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

/**
 * How strongly the ground at (x,z) is warded against destruction: 1 inside settlements / shrines / quest spots
 * (their 结界 keeps the land and its grass from being torn up or set alight), fading to 0 about 10 m outside.
 */
export function protectionAt(x,z) {
  if(bellPaving(x,z,4)||journeyIndoor(x,z,3))return 1;
  let closest=Infinity;
  for(const a of Object.values(JOURNEY_ANCHORS))closest=Math.min(closest,Math.hypot(x-a.x,z-a.z));
  return smoothstep(10,4,closest);
}

/**
 * Reshape the ground. amount < 0 digs a bowl |amount| metres deep at the centre; amount > 0 raises a mound.
 * opts.rim (default 0.22): for craters, the fraction of the depth thrown up as a raised lip just outside r.
 * Warded ground (protectionAt) resists. The total offset anywhere is clamped to [DEFORM_MIN, DEFORM_MAX].
 * Returns { x, z, r, x0, x1, z0, z1 } (the touched rectangle, world metres) or null if nothing changed.
 * Listeners registered through onDeform() (terrain mesh, physics, flora) are notified; G.events also gets 'terrain:deformed'.
 */
export function deform(x, z, r, amount, opts = {}) {
  const rim = opts.rim ?? 0.22;
  const R = amount < 0 ? r * 1.45 : r;
  const ix0 = Math.max(0, Math.floor((x - R + DHALF) / DG)), ix1 = Math.min(DN - 1, Math.ceil((x + R + DHALF) / DG));
  const iz0 = Math.max(0, Math.floor((z - R + DHALF) / DG)), iz1 = Math.min(DN - 1, Math.ceil((z + R + DHALF) / DG));
  if (ix0 > ix1 || iz0 > iz1) return null;
  let changed = false;
  for (let iz = iz0; iz <= iz1; iz++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const wx = ix * DG - DHALF, wz = iz * DG - DHALF;
      const d = Math.hypot(wx - x, wz - z);
      if (d >= R) continue;
      let delta;
      if (d < r) { const k = 1 - (d / r) * (d / r); delta = amount * k * k; }
      else { const k = (d - r) / (R - r); delta = -amount * rim * Math.sin(Math.PI * k) * (1 - k * 0.5); } // lip (craters only)
      if (amount > 0 && d >= r) continue;
      const prot = protectionAt(wx, wz);
      if (prot >= 1) continue;
      delta *= 1 - prot;
      if (Math.abs(delta) < 0.01) continue;
      if (!deformGrid) deformGrid = new Float32Array(DN * DN);
      const i = iz * DN + ix;
      const nv = clamp(deformGrid[i] + delta, DEFORM_MIN, DEFORM_MAX);
      if (nv !== deformGrid[i]) { deformGrid[i] = nv; changed = true; }
    }
  }
  if (!changed) return null;
  spellScars.push([x, z, r, amount, rim]);
  deformVersion++;
  const e = { kind: restoringScars ? 'restoreSpell' : 'spell', x, z, r: R, amount, x0: ix0 * DG - DHALF, x1: ix1 * DG - DHALF, z0: iz0 * DG - DHALF, z1: iz1 * DG - DHALF, version: deformVersion };
  for (const fn of deformListeners) { try { fn(e); } catch (err) { console.error('[deform listener]', err); } }
  return e;
}
// A cast is five numbers in the save. Replaying them in order reproduces the
// same clamped 2 m grid, including overlapping craters and their raised lips.
export function saveSpellScars() { return spellScars.map(stamp => stamp.slice()); }
export function restoreSpellScars(saved) {
  const stamps = Array.isArray(saved) ? saved.filter(s => Array.isArray(s) && s.length === 5 &&
    s.every(Number.isFinite) && Math.abs(s[0]) <= DHALF && Math.abs(s[1]) <= DHALF &&
    s[2] > 0 && s[2] <= 120 && Math.abs(s[3]) <= 60 && s[4] >= 0 && s[4] <= 2) : [];
  const prefix = spellScars.length <= stamps.length &&
    spellScars.every((s,i) => s.every((v,j) => v === stamps[i][j]));
  if (!prefix) {
    const old=spellScars;
    spellScars=[]; deformGrid=null;
    for (const [x,z,radius,depth] of old) {
      const r=radius*(depth<0 ? 1.45 : 1);
      const e={kind:'resetSpell',x,z,r,amount:0,x0:x-r,x1:x+r,z0:z-r,z1:z+r,version:++deformVersion};
      for (const listener of deformListeners) listener(e);
    }
  }
  const start=spellScars.length;
  restoringScars=true;
  try {
    for(let i=start;i<stamps.length;i++){
      const [x,z,r,amount,rim]=stamps[i];
      deform(x,z,r,amount,{rim});
    }
  } finally {restoringScars=false;}
}
/** Subscribe to ground reshaping. fn({ x, z, r, amount, x0, x1, z0, z1, version }). */
export function onDeform(fn) { deformListeners.push(fn); }
/** Net height offset currently applied at (x,z) by deformation (0 on untouched ground). */
export function deformOffsetAt(x, z) { return deformAt(x, z); }

/** Terrain height at (x,z): the analytic land plus any craters / mounds dug by magic. Sea level is 0. */
export function heightAt(x,z) {
  const dry=baseHeightAt(x,z);
  const land=trialLakeActive()?trialViewHeight(x,z,floodedTrialHeight(x,z,dry),true):dry;
  return deformGrid ? land+deformAt(x,z) : land;
}
export function setTrialLake(on) {
  if(!changeTrialLake(on))return false;
  deformVersion++;
  const event={...TRIAL_LAKE,kind:'trialLake',active:!!on,r:435,amount:0,version:deformVersion};
  for(const listener of deformListeners)listener(event);
  return true;
}

/** The untouched, analytic terrain height at (x,z). Deterministic, no state. Sea floor is about -16. */
export function baseHeightAt(x, z) {
  // A continuous east-west landmass with a walkable meadow spine, folded ridges on the
  // northern horizon, and two coastlines outside the story route. Everything samples it.
  const end = Math.abs(x);
  const axis = -205 + .106*x + 34*Math.sin(x*.0022);
  const side = Math.abs(z-axis);
  const headland = 235 * Math.exp(-(((x + 2130) / 460) ** 2)) * smoothstep(200, 565, axis-z);
  const endCoast = 2442-end + headland - Math.max(0,side-170)*.49 + 3*Math.sin(z*.023);
  const flank = 1015 + 82*Math.sin(x*.0024+.3)+45*Math.sin(x*.006)-side;
  const coast = Math.min(endCoast,flank);
  if(coast < -43)return -17;
  let h = 19 + 12*fbm(x*.0030,z*.0027,4) + 2.4*noise2(x*.020,z*.021);
  const rural = Math.max(0,1 - Math.abs(x)/2370);
  h += rural * (11+12*Math.sin(x*.0035-z*.003)) + 17*gauss(x,z,890,-160,265);
  const ridge = (cx,cz,wx,wz,rise) => {const u=(x-cx)/wx, v=(z-cz)/wz, r=u*u+v*v;return r<5 ? rise*Math.exp(-r*1.85) : 0;};
  h += ridge(-2264,-1040,166,172,154)+ridge(-2380,-868,101,116,101)+ridge(-1950,-880,128,157,123)
    + ridge(-1745,-1192,216,203,218)+ridge(-1232,-690,191,138,115)+ridge(-790,-748,202,205,131)
    + ridge(-301,-876,197,203,97)+ridge(450,-670,237,154,106)+ridge(1296,-575,224,138,91)
    + ridge(1453,531,181,120,87)+ridge(1880,-560,182,146,85)+ridge(2228,-436,138,113,89)
    + ridge(-918,451,223,155,80)+ridge(11,541,235,154,76);
  // Closely spaced horns rise above a single broken ridge instead of reading as
  // isolated round hills from the first view over the city wall.
  if (x < -1550 && z < -740) {
    const horn = (cx, cz, sx, sz, h, skew) => {
      const v = (z - cz) / sz, u = (x - cx) / sx + skew*v;
      const r = Math.sqrt(u*u + v*v);
      return h * Math.max(0, 1-r) ** 1.37;
    };
    h += Math.max(
      horn(-2181,-1035,172,150,146,.58), horn(-2131,-1018,105,110,173,-.36),
      horn(-2081,-1065,121,105,148,.57), horn(-1910,-947,107,84,87,.54),
      horn(-2385,-889,94,91,42,.46), horn(-1789,-1180,135,105,69,-.42)
    );
    const rise = Math.max(0,h-72);
    h += rise*(.10*noise2(x*.021,z*.025)+.050*noise2(x*.050,z*.046));
  }
  const dr=riverDist(x,z);
  if(dr<55)h=lerp(h,-2.4,smoothstep(54,5,dr));
  h=lerp(-17,h,smoothstep(-42,46,coast));
  for(const f of FLATTEN){
    const dx=x-f.x,dz=z-f.z;const reach=f.r+f.blend;
    if(Math.abs(dx)<reach && Math.abs(dz)<reach)h=lerp(h,f.h,smoothstep(reach,f.r,Math.hypot(dx,dz)));
  }
  const dx=x-CITY.x,dz=z-CITY.z;
  if(Math.abs(dx)<159 && Math.abs(dz)<128) {
    const edge = Math.max(Math.abs(dx)-122,dz-67+.0036*dx*dx,-dz-96+.0015*dx*dx);
    h=lerp(h,CITY.y,smoothstep(25,1,edge));
  }
  return trialViewHeight(x,z,dryTrialHeight(x,z,h),false);
}

const _n = new THREE.Vector3();
/** Terrain normal (unit, y-up) at (x,z). Writes into `out` if given. */
export function normalAt(x, z, out = new THREE.Vector3()) {
  const e = 0.7;
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  return out.set(-hx, 2 * e, -hz).normalize();
}
/** Slope in radians (0 = flat). */
export function slopeAt(x, z) { return Math.acos(clamp(normalAt(x, z, _n).y, -1, 1)); }

// ---- regions ------------------------------------------------------------------------------
const inPoi = (p, x, z, pad = 0) => Math.hypot(x - p.x, z - p.z) < p.r + pad;

/** Region id at (x,z). Display name: t('world.place.' + id). */
export function regionAt(x,z) {
  if(trialLakeContains(x,z))return 'trialLake';
  if(heightAt(x,z)<-1)return 'sea';
  const city=bellRegion(x,z);if(city)return city;
  for(const id of ['trial','farewell','hometown','forest','practice','highpass','eastmoor'])if(inPoi(JOURNEY_POI[id],x,z))return id;
  return 'wilds';
}
/** 'sun' | 'dusk' | 'night' from the Veil alone. */
export function majorAt(x, z) { const v = veilAt(x, z); return v > 0.82 ? 'night' : v > 0.1 ? 'dusk' : 'sun'; }

// ---- platforms & colliders (spatial hash) ------------------------------------------------
const CELL = 24;
const key = (ix, iz) => ix * 73856093 ^ iz * 19349663;
function gridInsert(grid, item, minX, maxX, minZ, maxZ) {
  for (let ix = Math.floor(minX / CELL); ix <= Math.floor(maxX / CELL); ix++) {
    for (let iz = Math.floor(minZ / CELL); iz <= Math.floor(maxZ / CELL); iz++) {
      const k = key(ix, iz);
      let a = grid.get(k);
      if (!a) grid.set(k, (a = []));
      a.push(item);
    }
  }
}
const platGrid = new Map();
const colGrid = new Map();
const platforms = [];
const colliders = [];

function boxExtent(b) {
  const c = Math.abs(Math.cos(b.rot || 0)), s = Math.abs(Math.sin(b.rot || 0));
  return [b.hw * c + b.hd * s, b.hw * s + b.hd * c];
}
function insideBox(b, x, z, pad = 0) {
  const dx = x - b.x, dz = z - b.z;
  const c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0);
  const lx = dx * c - dz * s, lz = dx * s + dz * c; // world -> box space (inverse of Object3D.rotation.y = rot)
  return Math.abs(lx) <= b.hw + pad && Math.abs(lz) <= b.hd + pad;
}

/**
 * Register a walkable flat surface above the terrain.
 *   disc: { x, z, r, top }            box: { box: true, x, z, hw, hd, rot?, top }
 * `rot` is a rotation about +y in radians (same sense as Object3D.rotation.y). Optional `thick` (default 1.2) is how far
 * below `top` the slab extends: a body whose feet are below top - thick passes underneath.
 * Returns the platform object; set `.dead = true` to remove it.
 */
export function addPlatform(p) {
  p.thick = p.thick ?? 1.2;
  platforms.push(p);
  if (p.box) { const [ex, ez] = boxExtent(p); gridInsert(platGrid, p, p.x - ex, p.x + ex, p.z - ez, p.z + ez); }
  else gridInsert(platGrid, p, p.x - p.r, p.x + p.r, p.z - p.r, p.z + p.r);
  return p;
}

/**
 * Register a solid obstacle (pushes bodies out sideways).
 *   cylinder: { x, z, r, y0?, y1? }     box: { box: true, x, z, hw, hd, rot?, y0?, y1? }
 * y0/y1 = vertical extent in world y (default: infinite). Optional `tag`. Set `.dead = true` to remove it.
 */
export function addCollider(c) {
  c.y0 = c.y0 ?? -Infinity; c.y1 = c.y1 ?? Infinity;
  colliders.push(c);
  if (c.box) { const [ex, ez] = boxExtent(c); gridInsert(colGrid, c, c.x - ex, c.x + ex, c.z - ez, c.z + ez); }
  else gridInsert(colGrid, c, c.x - c.r, c.x + c.r, c.z - c.r, c.z + c.r);
  return c;
}

/**
 * Height of the surface to stand on at (x,z) for a body whose feet are at height y.
 * Terrain, or the highest platform top that is not more than `step` above y. Call with y = Infinity for "topmost".
 */
export function groundAt(x, z, y = Infinity, step = 0.7) {
  let g = heightAt(x, z);
  const a = platGrid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (a) {
    for (let i = 0; i < a.length; i++) {
      const p = a[i];
      if (p.dead || p.top <= g || p.top > y + step) continue;
      if (p.box ? insideBox(p, x, z) : (x - p.x) ** 2 + (z - p.z) ** 2 <= p.r * p.r) g = p.top;
    }
  }
  return g;
}

/**
 * Lowest platform underside above height y at (x,z), or Infinity. Lets flyers avoid passing up through islands.
 */
export function ceilingAt(x, z, y) {
  let c = Infinity;
  const a = platGrid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (a) {
    for (let i = 0; i < a.length; i++) {
      const p = a[i];
      if (p.dead) continue;
      const under = p.top - p.thick;
      if (under < y || under >= c) continue;
      if (p.box ? insideBox(p, x, z) : (x - p.x) ** 2 + (z - p.z) ** 2 <= p.r * p.r) c = under;
    }
  }
  return c;
}

/**
 * True when a platform slab covers (x,z) with its top above yLo and its underside below yHi — i.e. a raised floor or
 * deck a walker at that height would push into side-on (too tall to step onto, too low to pass beneath).
 */
export function slabAt(x, z, yLo, yHi) {
  const a = platGrid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!a) return false;
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    if (p.dead || p.top <= yLo || p.top - p.thick >= yHi) continue;
    if (p.box ? insideBox(p, x, z) : (x - p.x) ** 2 + (z - p.z) ** 2 <= p.r * p.r) return true;
  }
  return false;
}

/**
 * Push a vertical capsule (centre x/z = pos.x/pos.z, feet at pos.y, given radius and height) out of all colliders.
 * Mutates pos.x / pos.z. Returns true if anything was touched.
 */
export function resolveCollisions(pos, radius = 0.4, height = 1.6) {
  const edge=WORLD.half-radius;
  const x=clamp(pos.x,-edge,edge),z=clamp(pos.z,-edge,edge);
  let hit=x!==pos.x||z!==pos.z;
  pos.x=x;pos.z=z;
  for (let pass = 0; pass < 2; pass++) {
    const ix0 = Math.floor((pos.x - radius) / CELL), ix1 = Math.floor((pos.x + radius) / CELL);
    const iz0 = Math.floor((pos.z - radius) / CELL), iz1 = Math.floor((pos.z + radius) / CELL);
    let moved = false;
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const a = colGrid.get(key(ix, iz));
      if (!a) continue;
      for (let i = 0; i < a.length; i++) {
        const c = a[i];
        if (c.dead || pos.y >= c.y1 || pos.y + height <= c.y0) continue;
        if (c.box) {
          const dx = pos.x - c.x, dz = pos.z - c.z;
          const cs = Math.cos(c.rot || 0), sn = Math.sin(c.rot || 0);
          let lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
          const qx = clamp(lx, -c.hw, c.hw), qz = clamp(lz, -c.hd, c.hd);
          let ex = lx - qx, ez = lz - qz;
          const d2 = ex * ex + ez * ez;
          if (d2 >= radius * radius) continue;
          if (d2 > 1e-9) { const d = Math.sqrt(d2); const k = (radius - d) / d; lx += ex * k; lz += ez * k; }
          else { // centre inside the box: leave by the nearest face
            const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
            if (px < pz) lx = Math.sign(lx || 1) * (c.hw + radius); else lz = Math.sign(lz || 1) * (c.hd + radius);
          }
          pos.x = c.x + lx * cs + lz * sn; pos.z = c.z - lx * sn + lz * cs;
          hit = moved = true;
        } else {
          const dx = pos.x - c.x, dz = pos.z - c.z;
          const rr = radius + c.r;
          const d2 = dx * dx + dz * dz;
          if (d2 >= rr * rr) continue;
          const d = Math.sqrt(d2);
          if (d > 1e-5) { pos.x = c.x + (dx / d) * rr; pos.z = c.z + (dz / d) * rr; }
          else pos.x = c.x + rr;
          hit = moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return hit;
}

const _rp = new THREE.Vector3();
/**
 * March a ray against terrain + platforms. Returns the distance to the first point below ground, or maxDist.
 * Cheap (used by the camera boom and projectiles).
 */
export function raycastGround(origin, dir, maxDist, step = 0.75) {
  for (let t = step; t <= maxDist; t += step) {
    _rp.copy(origin).addScaledVector(dir, t);
    if (_rp.y < groundAt(_rp.x, _rp.z, _rp.y + 0.5, 0.5)) return Math.max(0, t - step);
  }
  return maxDist;
}

/** True if (x,z) is open water deep enough to swim in. */
export function isWater(x, z) { return heightAt(x, z) < SEA_LEVEL - 0.9; }

/** One-stop sample for scatterers: { h, veil, slope, road, river, region, water } */
export function sample(x, z) {
  const h = heightAt(x, z);
  return { h, veil: veilAt(x, z), slope: slopeAt(x, z), road: roadDist(x, z), river: riverDist(x, z), region: regionAt(x, z), water: h < SEA_LEVEL };
}

/** True if nothing may be scattered here (settlements, anchors, roads, bridges, lantern spots). pad widens the zones. */
export function isReserved(x,z,pad=0) {
  if(bellPaving(x,z,2+pad)||journeyIndoor(x,z,2+pad)||roadDist(x,z)<3.2+pad)return true;
  for(const key of ['hometown','trial','practice']){
    const p=JOURNEY_POI[key];
    if(Math.hypot(x-p.x,z-p.z)<p.r+pad)return true;
  }
  for(const a of Object.values(JOURNEY_ANCHORS))if(Math.hypot(x-a.x,z-a.z)<4+pad)return true;
  return false;
}

/** Facade handed to the rest of the game as G.world. */
export const world = {
  WORLD, VEIL, POI, ANCHORS, ROADS, RIVERS, BRIDGES, SKY_ISLES, STONE_LANTERNS, GREAT_LANTERNS, MOUNTAIN, MOAT,
  seaLevel: SEA_LEVEL, SUN_DIR,
  heightAt, baseHeightAt, normalAt, slopeAt, groundAt, ceilingAt, slabAt, raycastGround, isWater, sample, isReserved,
  deform, onDeform, deformOffsetAt, protectionAt, saveSpellScars, restoreSpellScars,
  trialLake:TRIAL_LAKE, setTrialLake, trialLakeActive, trialLakeContains,
  /** True where the land is fully warded (no ground fire, no craters). */
  isProtected(x, z) { return protectionAt(x, z) >= 0.999; },
  veilAt, veilDist, moonDirAt, daylightAt, regionAt, majorAt, riverDist, roadDist, mountainMask,
  addPlatform, addCollider, resolveCollisions, platforms, colliders,
  /** Position of an anchor as a Vector3 on the ground (topmost surface). */
  anchor(id, out = new THREE.Vector3()) {
    const a = ANCHORS[id];
    if (!a) { console.warn('[world] unknown anchor', id); return out.set(0, 0, 0); }
    const surface = a.floor === 'water' && trialLakeActive() ? SEA_LEVEL+.2 : a.floor === 'ground' || a.floor === 'water' ? groundAt(a.x,a.z,heightAt(a.x,a.z)+1.25) : groundAt(a.x,a.z);
    return out.set(a.x, surface, a.z);
  },
  /** Vector3 on the ground at (x,z). */
  at(x, z, out = new THREE.Vector3()) { return out.set(x, groundAt(x, z), z); },
};
