import { angleDiff, clamp, damp, dampAngle, smoothstep } from '../core/util.js';

// The nose follows the rider's steering. Momentum follows the nose more slowly
// at speed. Banking before the flight path comes around makes the outside of a
// sweeping turn visible from the saddle.
export function advanceBroomMotion(b, input, camYaw, cruise, boost, dt) {
  b.gust = damp(b.gust, b.boosting ? 1 : 0, b.boosting ? 4.2 : 2.4, dt);
  const previousSpeed = b.speed;
  if (input.my > 0) {
    const target = cruise + (boost-cruise)*b.gust;
    // A dive feeds kinetic energy into the glide. Use actual altitude change
    // here, so holding descend against the lake cannot generate extra speed.
    const exchange = -7.5 * b.riseRate / Math.max(8, Math.abs(b.speed));
    const drag = b.speed > target ? .84 : 1.25 + .92*b.gust;
    b.speed = clamp(damp(b.speed, target, drag, dt) + exchange*dt, -3.5, boost*1.18);
  } else {
    const target = input.my < 0 ? -3.5 : 0;
    const decel = input.my < 0 ? 20 : 5.5;
    b.speed += clamp(target-b.speed, -decel*dt, decel*dt);
  }
  b.acceleration = damp(b.acceleration, (b.speed-previousSpeed)/Math.max(dt,.001), 5, dt);
  const moving = smoothstep(2,cruise,Math.abs(b.speed));
  const fast = smoothstep(cruise,boost,Math.abs(b.speed));
  const steering = clamp(angleDiff(b.heading,camYaw)*3.8,-2.25,2.25);
  const desiredBank = moving*clamp(-steering*(.44+.23*fast) + .32*input.mx,-.93,.93);
  b.bank = damp(b.bank, desiredBank, 5.6, dt);
  const turnRate = -Math.tan(b.bank)*21/Math.max(cruise*.78,Math.abs(b.speed));
  // At low speed the broom can pivot. At speed its curvature comes from bank.
  const yaw = (1-moving)*steering + moving*turnRate;
  b.yawRate = damp(b.yawRate, Math.abs(b.speed)>1.5 || input.my!==0 ? yaw : 0, 8, dt);
  b.heading += b.yawRate*dt;
  b.course = dampAngle(b.course,b.heading,10-6.5*fast,dt);
  // A / D slide at walking speed and carve into a turn at full speed.
  b.strafe = damp(b.strafe,input.mx*(6.5-4.2*fast),5,dt);
}
