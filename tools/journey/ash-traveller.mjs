import { TAU, hips, torso, leg } from './tailor.mjs';
// A second, cutaway coat panel falls from the back waist to the calves. Its front
// corners stop sooner so the pleated skirt and both knees read from straight ahead.
export function ashTravellingCoat(g) {
  Object.assign(g.palette, {
    overcoat: ['#483d57'],
    turnback: ['#91829e'],
    hemWelt: ['#725b79'],
    ankle: ['#403443', 'leather'],
    roseToe: ['#9a728f', 'leather'],
    outsole: ['#4d4248', 'leather'],
  });
  const rows = [
    [0.99, 0.147, 0.128, -0.024, 0.67],
    [0.914, 0.175, 0.15, -0.027, 0.7],
    [0.834, 0.201, 0.177, -0.034, 0.75],
    [0.755, 0.229, 0.199, -0.037, 0.78],
    [0.653, 0.263, 0.219, -0.042, 0.83],
    [0.531, 0.292, 0.239, -0.053, 0.89],
    [0.409, 0.331, 0.254, -0.067, 0.96],
    [0.295, 0.365, 0.273, -0.078, 1.05],
  ];
  const cut = (angle, v) => {
    const forward = (1 + Math.cos(angle)) * 0.5;
    return v * v * v * (0.215 * forward + 0.021 * Math.cos(angle * 5 - 0.4) + 0.016 * Math.sin(angle * 2));
  };
  const relax = (x, y) => (y > 0.91 ? torso(x, y) : hips);
  for (const [tone, size, offset] of [
    ['overcoat', 1, 0],
    ['turnback', 0.985, 0.003],
  ])
    g.rings(
      tone,
      rows.map(([y, rx, rz, cz, a]) => [y + offset, rx * size, rz * size, cz, a]),
      { weight: relax, fold: 0.063, pleats: 10, seg: 76, warp: cut },
    );
  g.rings(
    'hemWelt',
    rows.slice(-1).flatMap(([y, rx, rz, cz, a]) => [
      [y + 0.009, rx * 0.997, rz * 0.998, cz, a],
      [y, rx * 1.003, rz * 1.003, cz, a],
    ]),
    { weight: relax, fold: 0.063, pleats: 10, seg: 76, warp: (t) => cut(t, 1) },
  );
  for (const s of [-1, 1]) {
    const edge = rows.map(([y, rx, rz, cz, a], i) => {
      const v = i / (rows.length - 1),
        f = 1 + 0.063 * (0.16 + 0.84 * v) * Math.cos(10 * a + 0.4 * v);
      return [s * rx * Math.sin(a) * f, y + cut(s * a, v), cz + rz * Math.cos(a) * f];
    });
    g.wire('hemWelt', edge, 0.0035, relax);
  }
  const fold = (x, y, z) => {
    const t = Math.max(0, Math.min(1, (0.9 - y) / 0.52)),
      k = t * t * (3 - 2 * t);
    return [Math.sign(x) * 0.054 * k, 0.283 * k, -0.24 * k];
  };
  g.morphs = { overcoat: fold, turnback: fold, hemWelt: fold };
  for (const s of [-1, 1]) {
    const fixedLeg = (_x, y) => leg(s, y);
    const x = s * 0.047,
      shoe = [
        [0.179, 0.036, 0.042, -0.025],
        [0.15, 0.036, 0.044, -0.022],
        [0.126, 0.038, 0.048, -0.018],
        [0.095, 0.042, 0.051, -0.012],
        [0.077, 0.046, 0.067, 0.001],
        [0.055, 0.05, 0.099, 0.031],
        [0.038, 0.05, 0.1, 0.032],
      ];
    g.rings('ankle', shoe, {
      center: x,
      weight: fixedLeg,
      seg: 34,
      warp: (a, v) => -0.014 * (1 - v) * Math.max(0, Math.cos(a)),
    });
    g.rings(
      'outsole',
      [
        [0.044, 0.051, 0.101, 0.031],
        [0.029, 0.051, 0.101, 0.031],
        [0.024, 0.047, 0.096, 0.031],
      ],
      { center: x, weight: fixedLeg },
    );
    g.surface(
      'roseToe',
      4,
      24,
      (u, v) => {
        const a = -1.26 + u * 2.52;
        return [
          x + Math.sin(a) * (0.05 + v * 0.001),
          0.06 - v * 0.014 - 0.007 * Math.abs(Math.sin(a)),
          0.03 + Math.cos(a) * (0.099 + v * 0.005),
        ];
      },
      fixedLeg,
    );
    g.rings(
      'roseToe',
      [
        [0.174, 0.0375, 0.044, -0.025],
        [0.166, 0.038, 0.045, -0.024],
      ],
      { center: x, weight: fixedLeg, warp: (a) => -0.014 * Math.max(0, Math.cos(a)) },
    );
    g.orb('metal', [x, 0.151, 0.02], [0.011, 0.013, 0.005], fixedLeg);
    g.orb('gem', [x, 0.151, 0.024], [0.006, 0.008, 0.002], fixedLeg);
  }
}
