// Shared constants of the physics system: step, material table, collision groups.

/** Fixed simulation step (seconds) and the most steps one rendered frame may run. */
export const STEP = 1 / 60;
export const MAX_STEPS = 4;
/** Downward pull in m/s². Same value the player controller uses (DESIGN §3.4), so props and people fall alike. */
export const GRAVITY = 22;
/** Water surface height. Water exists wherever the terrain lies below it. */
export const SEA = 0;

/**
 * mass = density (water = 1) × volume (m³) × MASS_SCALE.
 * 100 gives "game" masses: a 0.8 m wooden crate ≈ 28, a 0.6 m boulder ≈ 235, a paper lantern ≈ 0.5.
 */
export const MASS_SCALE = 100;
/** Mass of the reference prop (a wooden crate). explode()/pushCone() strengths are "speed given to a body this heavy". */
export const M_REF = 25;
/** No impulse helper will push a body faster than this (m/s). */
export const MAX_KICK_SPEED = 45;

/**
 * Per-material defaults.
 *   density      relative to water (floats below 1, sinks above)
 *   friction / restitution   contact coefficients
 *   wind         how eagerly the material is carried by wind and gusts (paper and cloth fly furthest)
 *   slick        take the smaller friction of the pair (ice stays slippery on rough ground)
 *   linDamp / angDamp        air drag (1/s)
 */
export const MATERIALS = {
  wood:    { density: 0.55, friction: 0.62, restitution: 0.12, wind: 1.0,  linDamp: 0.05, angDamp: 0.30 },
  stone:   { density: 2.6,  friction: 0.78, restitution: 0.05, wind: 0.5,  linDamp: 0.03, angDamp: 0.25 },
  metal:   { density: 7.0,  friction: 0.42, restitution: 0.10, wind: 0.35, linDamp: 0.03, angDamp: 0.20 },
  ice:     { density: 0.9,  friction: 0.04, restitution: 0.05, wind: 0.8,  linDamp: 0.03, angDamp: 0.25, slick: true },
  paper:   { density: 0.2,  friction: 0.5,  restitution: 0.02, wind: 1.7,  linDamp: 0.6,  angDamp: 1.2 },
  cloth:   { density: 0.3,  friction: 0.85, restitution: 0.0,  wind: 1.6,  linDamp: 0.7,  angDamp: 1.5 },
  flesh:   { density: 1.02, friction: 0.6,  restitution: 0.08, wind: 0.9,  linDamp: 0.08, angDamp: 0.6 },
  // not in the §6.1 list but used by the world's material vocabulary (§3.2): accepted so nobody falls back by accident
  crystal: { density: 2.4,  friction: 0.5,  restitution: 0.16, wind: 0.5,  linDamp: 0.03, angDamp: 0.25 },
  grass:   { density: 0.25, friction: 0.8,  restitution: 0.0,  wind: 1.4,  linDamp: 0.4,  angDamp: 1.0 },
};
export const DEFAULT_MATERIAL = 'wood';

/** Contact coefficients of the mirrored world. */
export const TERRAIN_FRICTION = 0.85, TERRAIN_RESTITUTION = 0.02;
export const STATIC_FRICTION = 0.7, STATIC_RESTITUTION = 0.03;

/** Collision-group membership bits. */
export const BIT = { TERRAIN: 1, STATIC: 2, PROP: 4, DEBRIS: 8, CHAR: 16, PROJ: 32, HELD: 64 };
const ALL = 0xffff;
/** Rapier InteractionGroups: upper 16 bits = memberships, lower 16 = what it collides with. */
export const pack = (member, filter) => (((member & 0xffff) << 16) | (filter & 0xffff)) >>> 0;

export const GROUPS = {
  terrain: pack(BIT.TERRAIN, ALL),
  static: pack(BIT.STATIC, ALL),
  prop: pack(BIT.PROP, ALL),
  // shards never collide with each other (cheap, and a burst of overlapping pieces does not blow itself apart)
  debris: pack(BIT.DEBRIS, BIT.TERRAIN | BIT.STATIC | BIT.PROP | BIT.CHAR | BIT.HELD),
  // a dynamic body that stands in for a creature (rag-doll, knocked-out enemy …)
  character: pack(BIT.PROP, ALL),
  // spell projectiles hit the world and props; people are handled by the spell / combat code
  projectile: pack(BIT.PROJ, BIT.TERRAIN | BIT.STATIC | BIT.PROP | BIT.HELD),
  // something carried by 月引: still bumps into the world, but neither shoves nor is blocked by people
  held: pack(BIT.HELD, BIT.TERRAIN | BIT.STATIC | BIT.PROP | BIT.DEBRIS | BIT.PROJ | BIT.HELD),
  // kinematic capsule that follows a person
  capsule: pack(BIT.CHAR, BIT.PROP | BIT.DEBRIS),
};
/** Ray / query masks (membership = everything, filter = what the query may hit). */
export const QUERY = {
  world: pack(ALL, BIT.STATIC | BIT.PROP | BIT.DEBRIS),
  worldAndChars: pack(ALL, BIT.STATIC | BIT.PROP | BIT.DEBRIS | BIT.CHAR),
  bodies: pack(ALL, BIT.PROP | BIT.DEBRIS),
  support: pack(ALL, BIT.PROP),
};

// ---- tunables of the force models (forces.js) ------------------------------------------------------------------
/** Light bodies get at most this many times the kick of the reference crate from explode()/pushCone(). */
export const LIGHT_GAIN = 2.2;
/** Hard ceiling on any body speed (m/s): a squeezed or badly overlapped body can never shoot off like a bullet. */
export const MAX_SPEED = 70;

/** Water: drag rates (1/s at full immersion). Vertical is stronger so floating things bob a couple of times and settle. */
export const WATER = { dragH: 1.7, dragV: 4.2, dragA: 3.2, splashSpeed: 2.6 };

/**
 * Wind: acceleration = WIND.c × material.wind × (V^⅔ / mass) × |w| × w, w = wind velocity relative to the body.
 * Quadratic, so a breeze moves paper only while an updraft carries crates. Anything below WIND.min m/s² is ignored
 * (resting things are not kept awake by the breeze).
 */
export const WIND = { c: 5, min: 1.2, every: 3 };

/**
 * Rolling resistance of round bodies on the ground (soft earth, grass): `hold` = tangent of the steepest slope a ball at
 * rest stays on, `roll` = deceleration (×g) while rolling. Boxes rely on ordinary friction; `box` only calms their tumbling.
 */
export const ROLL = { hold: 0.45, roll: 0.3, box: 0.06, slow: 0.7 };

/** 'physics:impact' is emitted above this closing speed (m/s) … */
export const IMPACT_SPEED = 4;
/** … at most once per body in this many seconds, and at most IMPACT_PER_FRAME per frame. */
export const IMPACT_GAP = 0.14, IMPACT_PER_FRAME = 10;

/** Infinite collider extents of the mirrored world are cut to [ground − down, ground + up]. */
export const STATIC_INF = { up: 30, down: 2 };
