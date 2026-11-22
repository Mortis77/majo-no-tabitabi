// Episode itinerary. Floor-level story interactions deliberately resolve below roofs.
export const CITY = { x: -2160, z: -520, y: 30 };
const place = (x, z, face = 0, floor = 'ground') => ({ x, z, face, floor });
export const JOURNEY_ANCHORS = {
  home: place(2220, 50),
  book: place(2220, 45),
  homeDoor: place(2220, 56),
  townWitch: place(2200, 33),
  franDoor: place(2055, -27),
  franLesson: place(2080, -65),
  franTrial: place(2100, -84),
  lakeCrossing: place(1712,-42,0,'water'),
  farewell: place(2165, -110),
  wilds: place(180, -208),
  gate: place(-2160, -459),
  roof: place(-2174, -483, 0, 'roof'),
  repair: place(-2174, -481, 0, 'roof'),
  innDoor: place(-2119, -504.5),
  innDesk: place(-2119, -510),
  innRoom: place(-2116, -521),
  shop: place(-2173.55, -522.4),
  practice: place(-2202, -405)
};
export const ROAD_ACROSS = [
  [2165, -110],
  [2060, -137],
  [1975,-158],[1906,-202],[1845,-237],[1766,-243],[1685,-217],[1605,-201],[1530,-162],[1502,-105],[1500,-55],
  [1260, -123],
  [1000, -168],
  [755, -120],
  [484, -162],
  [180, -208],
  [-96, -168],
  [-335, -239],
  [-565, -288],
  [-810, -238],
  [-1060, -225],
  [-1330, -324],
  [-1510, -374],
  [-1730, -321],
  [-1910, -340],
  [-2035, -395],
  [-2105, -429],
  [-2160, -444],
  [-2160, -455],
  [-2160, -501]
];
export const JOURNEY_POI = {
  hometown: { x: 2220, z: 50, r: 58, h: 19 },
  forest: { x: 2055, z: -34, r: 88, h: 24 },
  trial: { x: 2100, z: -84, r: 29, h: 25 },
  farewell: { x: 2165, z: -110, r: 21, h: 20 },
  trialLake: {x:1725,z:-48,r:155},
  wilds: { x: 180, z: -208, r: 230 },
  bellcrown: { x: CITY.x, z: CITY.z - 90, r: 250, h: CITY.y },
  bellkeep: { x: CITY.x, z: CITY.z - 158, r: 70 },
  inn: { x: -2119, z: -514, r: 16 },
  roof: { x: -2174, z: -483, r: 9 },
  gate: { x: -2160, z: -459, r: 13 },
  practice: { x: -2202, z: -405, r: 28, h: 17 },
  lookout: { x: -2139, z: -472, r: 7 },
  highpass: { x: -1235, z: -286, r: 130 },
  eastmoor: { x: 1340, z: -110, r: 150 }
};
for (const [id, p] of Object.entries(JOURNEY_POI)) {
  p.id = id;
  p.major = 'sun';
}
export const FIELD_LIMIT = 2450;
export function journeyIndoor(x, z, pad = 0) {
  return (
    (Math.abs(x - 2220) < 10 + pad && Math.abs(z - 48) < 9 + pad) ||
    (Math.abs(x - 2055) < 10 + pad && Math.abs(z + 35) < 10 + pad)
  );
}
