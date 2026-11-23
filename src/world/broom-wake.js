import { clamp, smoothstep } from '../core/util.js';

// Cruise barely parts the surface. It can reach full downwash before top
// speed, including on a downhill glide with the boost key already released.
export function wakeDrive(speed) {
  return 0.38 * smoothstep(2, 16, speed) + 0.62 * smoothstep(16, 28, speed);
}

// Positive yaw bends toward (dz, -dx), so the outside is (-dz, dx).
export function wakeTurn(broom) {
  const arc = broom.yawRate / 1.05;
  const load = Number.isFinite(broom.bank) ? -Math.sin(broom.bank)/.72 : arc;
  return clamp(.45*arc+.55*load,-1,1);
}
