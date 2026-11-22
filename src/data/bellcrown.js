// The Land of Mages (episode two, first aerial still https://majotabi.jp/assets/story/2_1.jpg): a walled city that fills
// its whole raised plateau. Coordinates are site-local metres (x east, z south) around CITY unless noted. The south
// rampart and its great gate stay where the story's anchors expect them; the ring now reaches far west, north and east,
// and an inner core (acropolis, 16 m higher, its own ring wall) carries the stained-window cathedral.
import { CITY, ROAD_ACROSS } from './journey-map.js';
// boxX / boxZ, halfW / halfD: the town's bounding box (grass stays out of it)
export const BELL = { ...CITY, boxX: CITY.x + 3, boxZ: CITY.z - 89, halfW: 234, halfD: 157 };
/** The raised inner core: full height inside r, a retaining ring wall at r + 2 hides the step down to the city. */
export const CORE = { x: 0, z: -150, r: 78, h: 46 };
export const BELL_WALL = [
  [-24, 66],
  [16, 61],
  [36, 54],
  [61, 43],
  [100, 38],
  [140, 30],
  [180, 16],
  [212, -12],
  [232, -52],
  [234, -95],
  [214, -126],
  [178, -142],
  [150, -152],
  [112, -186],
  [70, -228],
  [20, -244],
  [-35, -240],
  [-90, -228],
  [-140, -205],
  [-180, -172],
  [-210, -132],
  [-226, -88],
  [-228, -44],
  [-214, -4],
  [-188, 26],
  [-150, 46],
  [-110, 56],
  [-75, 58],
  [-47, 55]
];
export const POST_ROAD = ROAD_ACROSS;
// Streets (centre lines). 0: gate street to the market square and the foot of the core stair; 1, 2: the long east-west
// avenues; the ring arcs skirt the core; the rest open up the far districts.
const arc = (a0, a1, r, n) => Array.from({ length: n + 1 }, (_, i) => {
  const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
  return [Math.round((CORE.x + r * Math.sin(a)) * 10) / 10, Math.round((CORE.z + r * Math.cos(a)) * 10) / 10];
});
export const BELL_ROADS = [
  [[0, 64], [0, 21], [-4, 8], [-4, -11], [-3, -36]],
  [[-185, 18], [-130, 30], [-77, 15], [-25, 20], [0, 19], [25, 19], [52, 14], [72, 4], [130, 12], [196, -4]],
  [[-212, -58], [-150, -45], [-98, -29], [-58, -15], [-27, -12], [-4, -11], [27, -11], [53, -17], [89, -29], [150, -40], [220, -62]],
  [[-23, 54], [-23, 26], [-27, -12], [-39, -40], [-59, -62]],
  [[25, 50], [25, 19], [27, -11], [34, -42], [59, -60]],
  [[54, 13], [60, -10], [74, -38], [93, -52], [118, -100], [140, -135]],
  [[-67, 16], [-62, -13], [-73, -47], [-95, -100], [-128, -150], [-160, -178]],
  arc(22, 140, 90, 10),
  arc(-22, -140, 90, 10),
  [[-150, 40], [-142, -10], [-150, -45], [-160, -100], [-190, -130]],
  [[140, 25], [150, -40], [152, -95], [178, -128]],
  [[-110, 50], [-100, 0], [-98, -29]],
  [[100, 30], [118, -20], [150, -40]],
  [[-212, -58], [-200, -100]],
  [[205, -20], [222, -80]]
];
/** Squares (site-local centre, radius): fountains, wells and markets stand in them. */
export const BELL_SQUARES = [
  { id: 'market', x: -5, z: 4, r: 11 },
  { id: 'stairFoot', x: -3, z: -30, r: 9 },
  { id: 'west', x: -148, z: -44, r: 12 },
  { id: 'east', x: 150, z: -40, r: 12 },
  { id: 'parvis', x: 0, z: -110, r: 16 }
];
export const toBellWorld = (p) => [p[0] + BELL.x, p[1] + BELL.z];

// ---- the plateau: signed distance to the ring (outside positive), cached on a 2 m grid ----
const GX0 = -280, GZ0 = -300, GS = 2, GW = 291, GH = 211;
let edgeGrid = null;
function polyEdge(x, z) {
  let inside = false,
    d = 1e9;
  for (let i = 0, j = BELL_WALL.length - 1; i < BELL_WALL.length; j = i++) {
    const [ax, az] = BELL_WALL[j],
      [bx, bz] = BELL_WALL[i],
      dx = bx - ax,
      dz = bz - az;
    const f = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    d = Math.min(d, Math.hypot(x - ax - dx * f, z - az - dz * f));
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
  }
  return inside ? -d : d;
}
/** Signed distance (m) from the site-local point to the ring wall line; negative inside the town. */
export function bellEdge(X, Z) {
  if (X < GX0 || Z < GZ0 || X > GX0 + (GW - 1) * GS || Z > GZ0 + (GH - 1) * GS) return polyEdge(X, Z);
  if (!edgeGrid) {
    edgeGrid = new Float32Array(GW * GH);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) edgeGrid[j * GW + i] = polyEdge(GX0 + i * GS, GZ0 + j * GS);
  }
  const fx = (X - GX0) / GS,
    fz = (Z - GZ0) / GS,
    i = Math.min(GW - 2, Math.floor(fx)),
    j = Math.min(GH - 2, Math.floor(fz)),
    u = fx - i,
    v = fz - j,
    k = j * GW + i;
  return (edgeGrid[k] * (1 - u) + edgeGrid[k + 1] * u) * (1 - v) + (edgeGrid[k + GW] * (1 - u) + edgeGrid[k + GW + 1] * u) * v;
}
const sstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Terrain levelling for the town (world x, z, natural height h): the plateau at CITY.y out to 9 m beyond the wall
 *  line, blending back over 24 m, and the core raised to CORE.h inside its ring. Called by world/ground.js. */
export function bellLevel(x, z, h) {
  const X = x - BELL.x,
    Z = z - BELL.z;
  if (X < -275 || X > 280 || Z < -290 || Z > 110) return h;
  const w = sstep(33, 9, bellEdge(X, Z));
  const core = sstep(CORE.r + 4, CORE.r, Math.hypot(X - CORE.x, Z - CORE.z));
  h += (BELL.y - h) * w * (1 - core);
  return h + (CORE.h - h) * core;
}
export function bellPaving(x, z, pad = 0) {
  const X = x - BELL.x,
    Z = z - BELL.z;
  if (X < -250 - pad || X > 256 + pad || Z < -266 - pad || Z > 80 + pad) return false;
  return bellEdge(X, Z) < pad;
}
export function bellRegion(x, z) {
  if (!bellPaving(x, z, 3)) return null;
  const X = x - BELL.x,
    Z = z - BELL.z;
  if (X > 13.3 && X < 29.9 && Z > 45.6 && Z < 50) return 'lookout';
  if (Math.abs(X) < 13 && Z > 48) return 'gate';
  if (Math.hypot(X + 14, Z - 37) < 9) return 'roof';
  if (Math.abs(X - 41) < 10 && Z > -12 && Z < 19) return 'inn';
  if (Math.hypot(X - CORE.x, Z - CORE.z) < CORE.r + 3) return 'bellkeep';
  return 'bellcrown';
}

// ---- city life: where the flyers and crowds go (also re-exported by data/city-life.js) ----
// Plain WORLD coordinates (x, y, z metres). Static parts come from the plan above; balconies, roof pads, footbridges and
// shop fronts are filled in by world/builders/mage-city.js during structures init; CITY_LIFE.ready turns true then
// (also reachable as G.structures.places.landOfMages.life).
import { JOURNEY_ANCHORS } from './journey-map.js';
const LW = (x, z) => [BELL.x + x, BELL.z + z];
export const CITY_Y = BELL.y; // street level of the lower town
export const CORE_Y = CORE.h; // level of the raised core (cathedral parvis)
export const WALL_WALK = 24; // rampart walk above the street

/** The great south gate. Passage: archW wide, archH tall (from the street), depth deep along z; dir = outward (+z). */
export const GATE = (() => {
  const [x, z] = LW(0, 61);
  return { x, z, y: CITY_Y, face: 0, archW: 13, archH: 22.5, depth: 16, dir: [0, 0, 1], towerX: [x - 22, x + 22], towerTop: CITY_Y + 92 };
})();
export const PRACTICE = { x: JOURNEY_ANCHORS.practice.x, z: JOURNEY_ANCHORS.practice.z, y: 17, r: 26 };

/** Ring towers (site-local spec, used by the builder too): kind 'gem' (crenellated top, teal gem) or 'cone'. */
export function ringTowerSpecs() {
  const out = [];
  BELL_WALL.forEach(([x, z], i) => {
    if (i < 2) return; // the gate towers stand there
    out.push(i % 2 === 0 ? { x, z, kind: 'gem', r: 4.8 + (i % 3) * 0.4, h: WALL_WALK + 13 + (i % 4) * 1.5 } : { x, z, kind: 'cone', r: 4.3 + (i % 3) * 0.35, h: WALL_WALK + 17 + (i % 3) * 2, cap: 11 + (i % 2) * 3 });
    // intermediate towers on long curtains: the ring bristles with towers
    const [nx, nz] = BELL_WALL[(i + 1) % BELL_WALL.length],
      L = Math.hypot(nx - x, nz - z);
    if (i === 0 || L < 46) return;
    const n = Math.floor(L / 40);
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      out.push({ x: x + (nx - x) * t, z: z + (nz - z) * t, kind: 'gem', r: 3.6, h: WALL_WALK + 8 });
    }
  });
  return out;
}
const towerTop = (t) => (t.kind === 'gem' ? t.h + 4.2 : t.h + t.cap + 1);

export const CITY_LIFE = {
  ready: false,
  /** town bounds (world): centre, radius and half extents; ground = street level of the lower town */
  bounds: { x: BELL.x + 3, z: BELL.z - 89, r: 285, halfW: 234, halfD: 157 },
  center: { x: BELL.x + 3, z: BELL.z - 89 },
  ground: CITY_Y,
  cityY: CITY_Y,
  coreY: CORE_Y,
  gate: GATE,
  practice: PRACTICE,
  /** Spire and tower tips to circle: { x, y, z, r } (r = clearance radius around the tip). */
  spires: [
    ...ringTowerSpecs().map((t) => {
      const [x, z] = LW(t.x, t.z);
      return { x, z, y: CITY_Y + towerTop(t), r: t.r + 3 };
    }),
    ...[-22, 22].map((dx) => ({ x: GATE.x + dx, z: GATE.z + 0.6, y: GATE.towerTop, r: 10 }))
  ],
  /** Ring and gate towers: { x, z, r, top } (world; top = highest solid point). */
  towers: [
    ...ringTowerSpecs().map((t) => {
      const [x, z] = LW(t.x, t.z);
      return { x, z, r: t.r * 1.2, top: CITY_Y + towerTop(t) };
    }),
    ...[-22, 22].map((dx) => ({ x: GATE.x + dx, z: GATE.z + 0.6, r: 8.5, top: GATE.towerTop }))
  ],
  /** Squares at street level: { id, x, y, z, r }. */
  squares: BELL_SQUARES.map((s) => {
    const [x, z] = LW(s.x, s.z);
    return { id: s.id, x, z, y: s.id === 'parvis' ? CORE_Y : CITY_Y, r: s.r };
  }),
  /** Street centre lines at street level (walkable ground), world [x, z] points; y = cityY. */
  streets: BELL_ROADS.map((r) => r.map(([x, z]) => LW(x, z))),
  /** The ring wall's walk (closed polyline, world [x, z]) at y = cityY + WALL_WALK: a long perch for landings. */
  wallWalk: { y: CITY_Y + WALL_WALK, pts: BELL_WALL.map(([x, z]) => LW(x, z)) },
  /** Open sky lanes (polylines with a flight height): above the broad avenues between the house fronts, and the
   *  high ring above the roofs. Keep fliers on them between hops. */
  skyLanes: [
    { y: CITY_Y + 14, width: 8, pts: BELL_ROADS[0].map(([x, z]) => LW(x, z)) },
    { y: CITY_Y + 16, width: 8, pts: BELL_ROADS[1].map(([x, z]) => LW(x, z)) },
    { y: CITY_Y + 18, width: 8, pts: BELL_ROADS[2].map(([x, z]) => LW(x, z)) },
    { y: CITY_Y + 52, width: 30, loop: true, pts: [LW(-150, 10), LW(0, 30), LW(150, 0), LW(190, -90), LW(120, -200), LW(0, -215), LW(-150, -180), LW(-190, -80)] },
    { y: CITY_Y + 30, width: 20, pts: [LW(0, 95), LW(0, 61), LW(0, 20)] } // through the gate arch (archH 22.5) and up the gate street
  ],
  /** The same sky lanes as plain [x, y, z] point lists. */
  get lanes() {
    return this.skyLanes.map((l) => l.pts.map(([x, z]) => [x, l.y, z]));
  },
  /** Places fliers must not use (story): { x, z, r, y0, y1, why }. */
  keepOut: [
    { ...xz(-14, 39), r: 13, y0: CITY_Y, y1: CITY_Y + 30, why: 'accident roof and repair (story)', id: 'roof' },
    // the crash flight: gate -> 13 m inside -> over the gate street -> up onto the roof
    { ...xz(0, 48), r: 9, y0: CITY_Y, y1: CITY_Y + 25, why: 'crash flight path', id: 'crash1' },
    { ...xz(-6, 37), r: 10, y0: CITY_Y, y1: CITY_Y + 25, why: 'crash flight path' },
    { ...xz(-13.5, 8), r: 11, y0: CITY_Y, y1: CITY_Y + 22, why: 'flight to the jeweller and dismount', id: 'shop' },
    { ...xz(41, 5), r: 12, y0: CITY_Y, y1: CITY_Y + 10, why: 'inn (interior)', id: 'inn' }
  ],
  /** Filled by the builder: balconies / terraces { x, y, z, face (yaw the balcony looks out to: direction
   *  (sin face, cos face)), r, w, d, kind: 'balcony' }; roof pads and footbridges are appended too (kind 'roof' / 'bridge'). */
  balconies: [],
  /** Filled by the builder: shop fronts at street level { x, z, face }. */
  shopFronts: [],
  /** Filled by the builder: roof gardens and landing pads on flat roofs { x, y, z, r }. */
  roofPads: [],
  /** Filled by the builder: footbridges between facing houses { x, y, z, yaw, len }. */
  bridges: []
};
function xz(x, z) {
  const [a, b] = LW(x, z);
  return { x: a, z: b };
}
