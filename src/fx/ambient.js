// Ambient motes that sell the three lands. Every spawn picks a random spot around the player (biased a little ahead of
// the camera), reads the veil THERE and chooses what to grow from it, so the mix blends naturally across borders:
//   曦光 (sun)  : pollen sparkling in the light + a few drifting petals
//   薄暮 (dusk) : maple and ginkgo leaves tumbling down
//   常夜 (night): fireflies and softly glowing spores
// Counts scale with G.quality.particles; motion follows G.elements.windAt (via ctx wind) like every other particle.
import { G } from '../core/game.js';
import { spec, ctx, emit, GLOW, SOFT, FLUTTER } from './particles.js';
import { S } from './atlas.js';
import { SPECS } from './recipes.js';
import { smoothstep } from '../core/util.js';

const A = {
  pollen: spec({ pool: GLOW, sprite: S.DOT, col: [0xfff3c0, 0xffe9a0, 0xfffbe0], size: [0.05, 0.09], h: [0.3, 3.2], speed: [0.05, 0.25], turb: [0.45, 0.55],
    life: [6, 9], I: [2.6, 2], flicker: [0.55, 3.2], fadeIn: 0.15, fadeOut: 0.8, wind: 1, drag: 1, g: -0.03 }),
  petal: spec({ pool: SOFT, sprite: S.PETAL, mode: FLUTTER, col: [0xffc1d6, 0xffe4ee, 0xffd0e0, 0xffffff], add: [0.12, 0.12], size: [0.12, 0.2], stretch: 3.2,
    h: [2.5, 6.5], speed: [0.1, 0.4], g: -0.55, drag: 1.4, wind: 1, turb: [0.5, 0.9], spin: [0.3, 1.2], life: [8, 11], I: 1, fadeIn: 0.05, fadeOut: 0.88 }),
  maple: SPECS.eMaple,
  ginkgo: SPECS.eGinkgo,
  firefly: SPECS.eFirefly,
  spore: SPECS.eSpore,
};
// per land: [spec, base rate per second at quality 1]
const LANDS = [
  [[A.pollen, 22], [A.petal, 4]],
  [[A.maple, 6], [A.ginkgo, 2.5], [A.pollen, 3]],
  [[A.firefly, 9], [A.spore, 11]],
];
const LAND_RATE = LANDS.map((l) => l.reduce((s, e) => s + e[1], 0));
const MAX_RATE = Math.max(...LAND_RATE);
const R = 24;
const W3 = [0, 0, 0];

export class Ambient {
  constructor(pools) {
    this.pools = pools;
    this.acc = 0;
    this.enabled = true;
    this.density = 1;     // extra multiplier (G.fx.ambient.density)
    this.weights = [1, 0, 0];   // land weights at the focus (for tests / other systems)
  }

  static weights(v, out) {
    const sun = 1 - smoothstep(0.05, 0.18, v), night = smoothstep(0.74, 0.9, v);
    out[0] = sun; out[2] = night; out[1] = Math.max(0, 1 - sun - night);
    return out;
  }

  update(dt, now, wind) {
    const W = G.world;
    if (!this.enabled || dt <= 0 || !W?.veilAt) return;
    const f = G.env.focus, cam = G.camera;
    Ambient.weights(G.env.veil, this.weights);
    // centre a little ahead of where the camera looks
    const e = cam.matrixWorld.elements;
    let fx = -e[8], fz = -e[10];
    const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const cx = f.x + fx * 7, cz = f.z + fz * 7;
    const q = (G.quality?.particles ?? 1) * this.density;
    this.acc += MAX_RATE * q * dt;
    if (this.acc > 40) this.acc = 40;
    const c = ctx;
    c.now = now; c.sweep = false; c.delay = 0; c.scale = 1; c.speed = 1; c.area = 0; c.hk = 1;
    c.nx = 0; c.ny = 1; c.nz = 0; c.dx = 0; c.dy = 1; c.dz = 0; c.vx = c.vy = c.vz = 0; c.c0 = -1; c.c1 = -1;
    c.wx = wind.x; c.wy = wind.y; c.wz = wind.z;
    const w = W3;
    while (this.acc >= 1) {
      this.acc -= 1;
      const r = R * Math.pow(Math.random(), 0.8), th = Math.random() * 6.2832;
      const x = cx + Math.cos(th) * r, z = cz + Math.sin(th) * r;
      Ambient.weights(W.veilAt(x, z), w);
      // choose a land by weight × its total rate (relative to the busiest land: rejection keeps rates exact)
      let u = Math.random() * MAX_RATE, land = -1;
      for (let i = 0; i < 3; i++) { const k = w[i] * LAND_RATE[i]; if (u < k) { land = i; break; } u -= k; }
      if (land < 0) continue;
      const list = LANDS[land];
      let v = Math.random() * LAND_RATE[land], pick = list[0][0];
      for (let i = 0; i < list.length; i++) { if (v < list[i][1]) { pick = list[i][0]; break; } v -= list[i][1]; }
      const gy = W.groundAt ? W.groundAt(x, z, f.y + 4) : W.heightAt(x, z);
      c.x = x; c.y = Math.max(gy, f.y - 6); c.z = z;
      emit(this.pools, pick, 1);
    }
  }
}
