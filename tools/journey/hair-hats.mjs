// Fran's over-eye side part, Saya's layered blunt bob, the householder's pinned chignon.
import { head, TAU } from './tailor.mjs';
const sin = Math.sin,
  cos = Math.cos,
  pi = Math.PI;
function lock(g, tone, points, width, guide, bulk = 1, glint = false) {
  const profile = (t) =>
    Math.max(
      0.018,
      (0.12 + 1.42 * Math.pow(Math.sin(Math.PI * Math.min(0.99, t * 0.83)), 0.62)) * Math.pow(1 - t, 0.72),
    );
  g.sweep(
    tone,
    points,
    (t) => width * profile(t),
    (t) => Math.min(0.015, width * 0.32) * profile(t) * bulk,
    guide,
    head,
    23,
    10,
  );
  if (glint) {
    const p = points
      .slice(0, -1)
      .map(([x, y, z], i) => [x + guide[0] * 0.006, y + 0.001, z + guide[2] * 0.009]);
    if (p.length >= 3)
      g.sweep('hairGlint', p, (t) => 0.001 + 0.004 * Math.sin(t * pi), 0.0015, guide, head, 10, 5);
  }
}
export function hair(g, who) {
  const bob = who === 'saya',
    bun = who === 'mother' || who === 'innkeeper' || who === 'exam',
    long = !bob && !bun;
  g.surface(
    'hair',
    18,
    68,
    (u, v) => {
      const a = u * TAU,
        front = Math.max(0, cos(a)),
        end = 1.97 - 0.94 * front * front,
        t = 0.015 + v * end;
      return [0.095 * sin(t) * sin(a), 1.429 + 0.113 * cos(t), -0.012 + 0.098 * sin(t) * cos(a)];
    },
    head,
  );
  for (let i = 0; i <= 20; i++) {
    const a = 0.71 + (i * (TAU - 1.42)) / 20,
      s = sin(a),
      c = cos(a),
      side = Math.abs(s);
    const y = bob
      ? 1.276 + 0.032 * (1 - side) + 0.01 * cos(i * 2)
      : bun
        ? 1.326 + 0.027 * side
        : 1.003 + 0.16 * side + 0.022 * cos(i * 2.4);
    const x = (long ? 0.155 : bob ? 0.105 : 0.084) * s + 0.008 * cos(i * 0.8),
      z = (long ? 0.145 : bob ? 0.107 : 0.071) * c - 0.027;
    const p = [
      [0.048 * s, 1.522, -0.011 + 0.054 * c],
      [0.09 * s, 1.467, -0.009 + 0.093 * c],
      [0.099 * s, 1.4, -0.011 + 0.103 * c],
      [x, (1.4 + y) * 0.5, z],
      [x + (bob ? -0.014 * s : long ? 0.027 * cos(i) : -0.01 * s), y, z + (long ? 0.014 : 0)],
    ];
    lock(
      g,
      i % 5 === 1 ? 'hairShade' : 'hair',
      p,
      bob ? 0.026 : long ? 0.035 : 0.031,
      [s, 0, c],
      1,
      i % 4 === 1,
    );
  }
  if (bob) {
    for (let i = -4; i <= 4; i++) {
      const a = i / 4,
        dx = i === 0 ? 0.022 : 0.01 * Math.sign(i);
      lock(
        g,
        i % 3 ? 'hair' : 'hairShade',
        [
          [a * 0.03, 1.523, 0.026],
          [a * 0.057 - 0.003, 1.499, 0.064 - 0.008 * a * a],
          [a * 0.073 - 0.006, 1.467, 0.085 - 0.018 * a * a],
          [a * 0.076 + dx * 0.4, 1.436, 0.094 - 0.024 * a * a],
          [
            a * 0.081 + dx,
            1.406 + 0.027 * (1 - Math.abs(a)) + 0.012 * Math.cos(i * 1.72),
            0.091 - 0.026 * a * a,
          ],
        ],
        0.021,
        [a * 0.4, 0, 1],
        0.72,
        i === -2 || i === 2,
      );
    }
    for (const s of [-1, 1])
      lock(
        g,
        'hairShade',
        [
          [s * 0.079, 1.486, 0.047],
          [s * 0.097, 1.425, 0.057],
          [s * 0.096, 1.369, 0.052],
          [s * 0.093, 1.332, 0.052],
        ],
        0.023,
        [s * 0.6, 0, 0.8],
      );
    lock(
      g,
      'hairShade',
      [
        [-0.03, 1.512, 0.044],
        [-0.029, 1.483, 0.08],
        [-0.02, 1.451, 0.094],
        [-0.009, 1.423, 0.099],
        [0.001, 1.396, 0.091],
      ],
      0.02,
      [-0.1, 0, 1],
      0.5,
    );
    lock(
      g,
      'hair',
      [
        [0.011, 1.501, 0.063],
        [0.015, 1.469, 0.089],
        [0.027, 1.443, 0.091],
        [0.03, 1.418, 0.087],
      ],
      0.014,
      [0.2, 0, 1],
      0.52,
    );
    // Small alternating plaits against the cheek, closed with the student's rose cord.
    for (let i = 0; i < 8; i++)
      g.orb(
        i % 2 ? 'hairShade' : 'hair',
        [-0.088 + (i % 2 ? 0.005 : -0.003), 1.413 - i * 0.012, 0.057 + i * 0.0014],
        [0.011, 0.011, 0.008],
        head,
      );
    g.orb('accent', [-0.088, 1.319, 0.071], [0.01, 0.005, 0.009], head);
    lock(
      g,
      'hair',
      [
        [-0.089, 1.32, 0.07],
        [-0.093, 1.304, 0.071],
        [-0.087, 1.288, 0.069],
      ],
      0.011,
      [-0.4, 0, 1],
    );
    lock(
      g,
      'hair',
      [
        [0.016, 1.513, 0.031],
        [-0.006, 1.551, 0.021],
        [-0.042, 1.565, 0.02],
        [-0.066, 1.55, 0.021],
      ],
      0.008,
      [0, 0, 1],
    );
  } else if (long) {
    // Deep asymmetric diagonal fringe. The open eye sits on the far side of the part.
    for (let i = 0; i < 5; i++) {
      const d = i * 0.009;
      lock(
        g,
        i % 2 ? 'hair' : 'hairShade',
        [
          [-0.05 + d, 1.514, 0.048],
          [-0.008 + d, 1.477, 0.081],
          [0.018 + d, 1.442, 0.097],
          [0.037 + d, 1.398, 0.092],
          [0.066 + d * 0.8, 1.35 - i * 0.003, 0.074],
          [0.083 + d * 0.6, 1.299 - i * 0.005, 0.052],
        ],
        0.026,
        [0.12, 0, 1],
        0.77,
        i === 1 || i === 4,
      );
    }
    lock(
      g,
      'hair',
      [
        [-0.044, 1.508, 0.052],
        [-0.071, 1.472, 0.079],
        [-0.088, 1.399, 0.069],
        [-0.11, 1.295, 0.087],
        [-0.093, 1.189, 0.12],
        [-0.144, 1.124, 0.11],
      ],
      0.031,
      [-0.45, 0, 0.9],
      1,
      true,
    );
    lock(
      g,
      'hairShade',
      [
        [0.084, 1.461, 0.035],
        [0.104, 1.369, 0.046],
        [0.119, 1.262, 0.075],
        [0.151, 1.167, 0.073],
        [0.125, 1.118, 0.102],
      ],
      0.03,
      [0.65, 0, 0.7],
    );
  } else {
    for (let i = -3; i <= 3; i++) {
      const s = i < 0 ? -1 : 1,
        k = Math.abs(i) / 3;
      lock(
        g,
        i % 2 ? 'hair' : 'hairShade',
        [
          [i * 0.011, 1.521, 0.024],
          [s * (0.014 + 0.05 * k), 1.48, 0.073],
          [s * (0.044 + 0.033 * k), 1.448 - 0.011 * k, 0.076 - 0.008 * k],
          [s * (0.079 + 0.013 * k), 1.401 - 0.02 * k, 0.038 + 0.012 * (1 - k)],
        ],
        0.029,
        [s * 0.36, 0, 0.9],
        0.7,
        i === -1 || i === 2,
      );
    }
    g.orb('hairShade', [0, 1.369, -0.103], [0.07, 0.059, 0.048], head);
    for (let i = -2; i <= 2; i++)
      g.sweep(
        'hair',
        [
          [i * 0.017, 1.416, -0.116],
          [i * 0.023, 1.386, -0.148],
          [i * 0.021, 1.348, -0.15],
          [i * 0.013, 1.321, -0.123],
        ],
        0.012,
        0.005,
        [0, 0, -1],
        head,
      );
    for (const s of [-1, 1])
      lock(
        g,
        'hair',
        [
          [s * 0.076, 1.46, 0.052],
          [s * 0.089, 1.394, 0.055],
          [s * 0.079, 1.35, 0.048],
          [s * 0.079, 1.319, 0.046],
        ],
        0.012,
        [s * 0.5, 0, 1],
      );
  }
}
export function hat(g, who, w = head) {
  const fran = who === 'fran',
    saya = who === 'saya',
    r = fran ? 0.317 : saya ? 0.273 : 0.245;
  const wave = (a, v) =>
    v *
    (0.019 * sin(a + 0.4) +
      0.025 * cos(2 * a + 0.7) +
      0.013 * sin(3 * a) +
      0.018 * Math.pow((1 + sin(a)) * 0.5, 3));
  const brim = (material, r1, r2, y1, y2, off = 0) =>
    g.surface(
      material,
      5,
      66,
      (u, v) => {
        const a = TAU * u,
          r0 = r1 + (r2 - r1) * v;
        return [r0 * sin(a), y1 + (y2 - y1) * v + wave(a, r0 / r) + off, -0.013 + r0 * 0.84 * cos(a)];
      },
      w,
      true,
    );
  brim('hatUnder', 0.081, r, 1.497, 1.49, -0.005);
  brim('hat', r, 0.082, 1.492, 1.511);
  brim('hatEdge', r + 0.0008, r - 0.009, 1.493, 1.494);
  const p = fran
    ? [
        [0, 1.497, -0.014],
        [-0.019, 1.568, -0.026],
        [-0.01, 1.644, -0.028],
        [0.016, 1.721, -0.033],
        [0.053, 1.786, -0.04],
        [0.09, 1.784, -0.037],
        [0.127, 1.74, -0.034],
        [0.169, 1.731, -0.031],
        [0.192, 1.752, -0.027],
        [0.172, 1.76, -0.026],
      ]
    : saya
      ? [
          [0, 1.5, -0.011],
          [-0.018, 1.578, -0.02],
          [-0.032, 1.65, -0.03],
          [-0.08, 1.696, -0.044],
          [-0.123, 1.699, -0.04],
          [-0.152, 1.668, -0.04],
        ]
      : [
          [0, 1.497, -0.01],
          [0.014, 1.58, -0.02],
          [0.039, 1.65, -0.034],
          [0.06, 1.711, -0.048],
          [0.103, 1.695, -0.052],
        ];
  g.sweep(
    'hat',
    p,
    (t) => 0.09 * Math.pow(1 - t, 0.99) + 0.001,
    (t) => 0.086 * Math.pow(1 - t, 0.99) + 0.001,
    [0, 0, 1],
    w,
    32,
    42,
  );
  if (fran) {
    for (let i = 0; i < 108; i++) {
      const angle = i * 2.399963,
        rr = r * (0.39 + 0.56 * Math.sqrt(((i * 79) % 107) / 107)),
        sz = 0.00065 + (0.00095 * ((i * 13) % 7)) / 7;
      g.surface(
        'starDust',
        1,
        4,
        (u, v) => {
          const a = TAU * u;
          return [
            rr * sin(angle) + sz * v * sin(a),
            1.49 + wave(angle, rr / r) - 0.0085,
            -0.013 + rr * 0.84 * cos(angle) + sz * v * cos(a),
          ];
        },
        w,
      );
    }
  }
  const bands = fran
    ? [
        [0.025, 0.078],
        [0.109, 0.155],
        [0.193, 0.224],
        [0.268, 0.287],
      ]
    : [[0.025, 0.105]];
  for (const [lo, hi] of bands) {
    const diagonal = (u, v) => lo + (hi - lo) * v + 0.019 * Math.sin(TAU * u + 0.6);
    g.sweep(
      'hatRibbon',
      p,
      (t) => 0.09 * Math.pow(1 - t, 0.99) + 0.003,
      (t) => 0.086 * Math.pow(1 - t, 0.99) + 0.003,
      [0, 0, 1],
      w,
      4,
      60,
      diagonal,
    );
  }
  if (saya)
    for (const side of [-1, 1])
      g.sweep(
        'hatRibbon',
        [
          [0.065, 1.527, -0.055],
          [0.083 + side * 0.018, 1.528, -0.076],
          [0.11 + side * 0.017, 1.502, -0.088],
          [0.076, 1.519, -0.068],
        ],
        (t) => 0.008 + 0.007 * sin(pi * t),
        0.003,
        [0.55, 0, -0.8],
        w,
      );
}
