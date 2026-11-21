// Pooled flash lights: four PointLights that live in the scene for ever (intensity 0 while idle), so the number of
// lights never changes and no material is ever recompiled because of an explosion.
import * as THREE from 'three';

export const MAX_FLASH = 4;

/** Flash-light HDR budget: linear up to 30 cd, logarithmic above (50 -> 43, 120 -> 65, 500 -> 100). */
export const budgetCandela = (I) => (I <= 30 ? Math.max(0, I) : 30 + 25 * Math.log(1 + (I - 30) / 30));

export class FlashLights {
  constructor(scene) {
    this.items = [];
    for (let i = 0; i < MAX_FLASH; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 12, 2);
      light.castShadow = false;
      light.name = 'fxFlash' + i;
      scene.add(light);
      this.items.push({ light, t: 0, dur: 0, peak: 0, follow: null, followId: 0 });
    }
  }

  /** color: THREE.Color (linear). Steals the dimmest light when all four are busy; ignored if every one is brighter. */
  flash(x, y, z, color, intensity, dur, distance) {
    // HDR budget: callers ask in candela, but a 300-500 cd point light a few metres from a toon surface lights it at
    // 30-50x the night ambient and the frame goes white. Soft-compress above ~30 cd (500 -> ~100 cd) and keep the
    // reach proportional to the compressed strength.
    intensity = budgetCandela(intensity);
    distance = Math.min(distance || 12, 6 + Math.sqrt(intensity) * 3.2);
    let best = null, bestI = Infinity;
    for (let i = 0; i < MAX_FLASH; i++) {
      const it = this.items[i];
      const cur = it.dur > 0 ? it.light.intensity : -1;
      if (cur < bestI) { bestI = cur; best = it; }
    }
    if (!best || bestI > intensity) return null;
    best.follow = null;
    best.light.position.set(x, y, z);
    best.light.color.copy(color);
    best.light.distance = distance;
    best.light.intensity = intensity;
    best.peak = intensity; best.dur = Math.max(dur, 0.02); best.t = 0;
    return best;
  }

  /** A flying cast may borrow a normal flash slot; any brighter hit can still replace it. */
  trackProjectile(p, color) {
    const large = p.size > 0.6;
    const it = this.flash(p.pos.x, p.pos.y, p.pos.z, color, large ? 27 : 12, 0.12, large ? 7 : 4);
    if (it) { it.follow = p; it.followId = p.id; }
  }

  update(dt) {
    for (let i = 0; i < MAX_FLASH; i++) {
      const it = this.items[i];
      if (it.dur <= 0) continue;
      if (it.follow?.alive && it.follow.id === it.followId) {
        it.light.position.copy(it.follow.pos);
        it.light.intensity = it.peak * (0.89 + 0.11 * Math.sin(it.follow.age * 24.0 + it.followId));
        continue;
      }
      it.follow = null;
      it.t += dt;
      const k = 1 - it.t / it.dur;
      if (k <= 0) { it.dur = 0; it.light.intensity = 0; } else it.light.intensity = it.peak * k * k;
    }
  }

  get active() { let n = 0; for (const it of this.items) if (it.dur > 0) n++; return n; }

  clear() { for (const it of this.items) { it.follow = null; it.dur = 0; it.light.intensity = 0; } }
}
