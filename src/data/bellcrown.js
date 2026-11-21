// First aerial view of the Land of Mages, https://majotabi.jp/assets/story/2_1.jpg
// The town wall bows around dense hill districts and the civic window rises above the roofs.
import { CITY, ROAD_ACROSS } from './journey-map.js';
export const BELL = { ...CITY, halfW: 127, halfD: 98 };
export const BELL_WALL = [
  [-24, 66],
  [16, 61],
  [36, 54],
  [61, 43],
  [74, 23],
  [92, 5],
  [112, -10],
  [122, -39],
  [114, -69],
  [87, -81],
  [45, -86],
  [-8, -95],
  [-47, -88],
  [-76, -75],
  [-105, -63],
  [-123, -37],
  [-115, -15],
  [-85, 3],
  [-66, 32],
  [-47, 55]
];
export const POST_ROAD = ROAD_ACROSS;
export const BELL_ROADS = [
  [
    [0, 64],
    [0, 21],
    [-4, 8],
    [-4, -11],
    [-4, -34]
  ],
  [
    [-77, 15],
    [-25, 20],
    [0, 19],
    [25, 19],
    [52, 14],
    [72, 4]
  ],
  [
    [-98, -29],
    [-58, -15],
    [-27, -12],
    [-4, -11],
    [27, -11],
    [53, -17],
    [89, -29]
  ],
  [
    [-23, 54],
    [-23, 26],
    [-27, -12],
    [-39, -40],
    [-59, -62]
  ],
  [
    [25, 50],
    [25, 19],
    [27, -11],
    [34, -42],
    [59, -60]
  ],
  [
    [54, 13],
    [60, -10],
    [74, -38],
    [93, -52]
  ],
  [
    [-67, 16],
    [-62, -13],
    [-73, -47]
  ],
  [
    [-88, -48],
    [-67, -47],
    [-42, -51],
    [-20, -68],
    [4, -72],
    [42, -62],
    [74, -57],
    [99, -54]
  ]
];
export const toBellWorld = (p) => [p[0] + BELL.x, p[1] + BELL.z];
export function bellPaving(x, z, pad = 0) {
  if (((x + 2085) / (57 + pad)) ** 2 + ((z + 682) / (39 + pad)) ** 2 < 1) return true;
  const dx = x - BELL.x,
    dz = z - BELL.z;
  if (Math.abs(dx) > 129 + pad || Math.abs(dz + 14) > 83 + pad) return false;
  // Broad level castle district; the curved southern corners return to forest outside the rampart.
  return dz < 68 + pad - 0.0036 * dx * dx && dz > -96 - pad + 0.0015 * dx * dx;
}
export function bellRegion(x, z) {
  if (!bellPaving(x, z, 3)) return null;
  const X = x - BELL.x,
    Z = z - BELL.z;
  if (X > 13.3 && X < 29.9 && Z > 45.6 && Z < 50) return 'lookout';
  if (Math.abs(X) < 13 && Z > 48) return 'gate';
  if (Math.hypot(X + 14, Z - 37) < 9) return 'roof';
  if (Math.abs(X - 41) < 10 && Z > -12 && Z < 19) return 'inn';
  if (Math.abs(X + 5) < 22 && Z < -32) return 'bellkeep';
  return 'bellcrown';
}
