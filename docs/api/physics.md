# physics — as built

## Summary
I replaced the physics stub with a working Rapier 0.21 system (G.physics) and tested it in headless play.mjs runs with physics as the only system. The earlier attempt had already written consts.js, terrain.js, statics.js, body.js, forces.js, queries.js and characters.js; I kept them because they turned out to be good. This time I wrote physics.js and debug.js:
- physics.js: Rapier init, the fixed 1/60 step (accumulator, at most 4 steps per frame, nothing when dt = 0), body bookkeeping, debris budget, lifetime fade-out, collision events turned into throttled 'physics:impact' events and onImpact callbacks, splash fx/sfx calls, lazy ground coverage around the focus and every awake body, a rescue for bodies that fall through the ground, and render interpolation.
- debug.js: a wireframe overlay drawn from Rapier's own debugRender, limited to colliders within about 70 m of the focus.

The heightfield row/column convention is proven: rays agree with the stored facets to 1e-5 m, and spheres dropped at 10 asymmetric sites settle within 4 mm (mean) of heightAt + r. All tests in the assignment pass, with numbers in the tests field. I tuned rolling resistance up (0.2 to 0.3 g) so logs stop sooner. I also added a shove clamp: a prop that a character capsule bumps into leaves at no more than 5 m/s, instead of being batted away at the walker's full speed. i18n check passes; physics has no player-visible text.

## Public API
G.physics (all ★ entries keep the names and parameters from DESIGN §6.1):

Properties
- RAPIER, world.
- maxDynamic = 260. count (getter): number of dynamic bodies. bodies (getter): all PhysBodies.
- timeBubbles = [{ pos, radius, scale }].
- PhysBody: the class.
- rotSense (getter): +1 or -1. It says which way a G.world box `rot` turns compared with Object3D.rotation.y. It is measured at init; in this world it is -1, the opposite of what the ground.js comment says.

★ add(o) -> PhysBody, or null on bad input (reported through G.reportError)
- Options from the spec: mesh, shape ('box'|'sphere'|'cylinder'|'capsule'|'hull'), size, pos, quat, type, material, density|mass, friction, restitution, ccd, lifetime, group, owner, onImpact.
- Extra options:
  - vel, angvel: Vector3-like start velocities.
  - sleeping: start asleep.
  - offset: [x,y,z] or {x,y,z}, collider offset in body space.
  - onRemove(body, reason): reason is 'lifetime' | 'budget' | 'lost' | 'removed'.
  - keepMesh: when the body is removed automatically, its mesh is normally taken out of its parent; true leaves it alone.
- Shapes and sizes:
  - box: [hx,hy,hz], or a number for a cube.
  - sphere: r.
  - cylinder / capsule: {r,h}, h is the total height.
  - hull: built from the mesh geometry, which must be in mesh space (scale is honoured). Without usable geometry it falls back to a box.
- Materials: wood stone metal ice paper cloth flesh, plus crystal and grass. Mass = density × volume × 100 (a 0.8 m wooden crate ≈ 28).
- Meshes are driven in WORLD space: keep them as direct children of the scene.
- When the budget is exceeded, the oldest debris goes first, then the expiring body with the least lifetime left.

★ remove(body): the mesh stays where it is.

★ explode(pos, radius, impulse, { up = 0.35, exclude })
- impulse = launch speed in m/s that a 25-mass reference crate gets at the centre; it falls off linearly to 0 at radius.
- Heavier bodies get proportionally less; light ones at most 2.2× more. Capped at 45 m/s.
- exclude can be a body, an array, a Set or a function.

★ pushCone(origin, dir, range, halfAngle, impulse): impulse is again a reference-crate speed, scaled by the material's wind factor.

★ raycast(origin, dir, maxDist = 100, { dynamicOnly, exclude, characters, out }) -> { dist, point, normal, body|null, surface, owner } | null
- surface is 'terrain' | 'static' | 'body' | 'character'.
- The land is ray-marched analytically, so rays work beyond the built chunks.

★ overlapSphere(pos, r, cb(body)) -> number of bodies found.

★ supportAt(x, z, y, maxDrop = 1.6) -> { y, body, normal } | null
- Returns ONE shared object that the next call overwrites.
- Only props and fixed/kinematic bodies count (not debris, not held bodies).
- Allows a 0.55 m step up. Returns null when the foot is inside something, or the surface is steeper than normal.y 0.55.

★ addCharacter({ getPos, radius, height, owner }) -> { owner, radius, height, pos, vel, enabled, setEnabled(on), remove() }
- getPos returns the feet position.
- The capsule starts 0.2 m above the feet, so a character standing on a crate does not press it into the ground.
- A jump of more than 2.5 m in one step is treated as a teleport.

Additions beyond §6.1
- nearest(pos, r, filter?) -> body | null.
- groundAt(x, z): height of the surface the solver actually collides with.
- wakeArea(x, z, r).
- syncStatics(): mirror everything pending right now.
- debug(on?) -> bool: toggles the collider wireframe overlay.
- stats() -> { bodies, dynamic, awake, sleeping, debris, chunks, chunksBuilt, statics, staticsPending, characters, steps, stepMs, rescued, impacts, colliders }.

PhysBody
- From the spec: rb, mesh, mass, material, owner, pos, vel, sleeping, submerged, applyImpulse(v), applyImpulseAt(v, p), setVelocity(v), setPosition(v), setKinematicTarget(pos, quat?), wake(), held.
- Also: col, quat, angvel, shape, group, type, volume, radius, grounded, alive, age, lifetime, timeScale, onRemove, setRotation(q), setAngularVelocity(v), sleep(), setGroup(g), remove().
- setKinematicTarget on a dynamic body chases the target with velocity, so a carried body still collides with walls; call it every frame while carrying.
- held = true: no gravity and no wind, extra damping, CCD on, and it no longer collides with character capsules.

Events
- 'physics:impact' { body, other, speed, pos, surface } when speed > 4 m/s, at most once per body every 0.14 s and at most 10 per frame.
- onImpact(other, speed, { pos, surface, owner }) is called on both bodies of a body-body hit.

Fixed numbers
- Gravity 22 m/s². Water surface = SEA 0. Bodies in time bubbles run at `scale` speed and their gravity is scaled by scale².
- Wind reads G.elements.windAt(pos, out).
- Splashes call G.fx?.burst('splash', pos, { size, power }) and G.audio?.sfx('splash', { pos, vol, pitch }).

## Known issues
- Ice on slopes steeper than about 5° keeps sliding for a long time, because ice uses the lower friction of the pair (0.04). This is intended, but on ice-covered hills it delays sleep.
- Box buoyancy uses an eight-part approximation: a floating ice slab reports about 97% under water instead of 90%. Wood cubes float corner-up, which is how real cubes of that density float.
- A character capsule is kinematic, so it pushes a prop in its path along at walking speed for as long as it keeps walking, because the player controller does not know about props. The new clamp (5 m/s at most) only limits the first bump.
- Changes made through rb directly, or by other bodies, only reach the mirrored pos/vel at the next fixed step. Rapier scene queries likewise only see a collider created or moved after the next world.step().
- statics.js puts one dead probe platform at (-893,-893) into G.world.platforms during init, to measure which way box `rot` turns. Systems that loop over platforms must skip `.dead` entries, which they have to do anyway.
- The debug overlay uses Rapier's own colours and refreshes every 4 frames. It is a test aid only.
- Ground drawing: I could not judge craters visually from the fallback ground mesh. The crater test was checked numerically only.
- G.world.protectionAt is 1 around (-500,150), so deform() does nothing there. Tests that dig craters must pick warded-free ground.


## As-built updates (fix-systems + fix2, 2026-11)
- `G.physics.add({ ..., rolling?: number | { roll?, hold?, box? } })`; `PhysBody.setRolling(r)`, `PhysBody.rolling`. A number is the deceleration in ×g while rolling (round shapes); boxes get 0.2× that.
- `onImpact(other, speed, info)` info: `{ pos, surface, owner, relSpeed, impulse }`; `'physics:impact'` payload: `{ body, other, speed, pos, surface, relSpeed, impulse, owner, bodyOwner }`. `owner` = owner of what was hit (character capsule's / partner body's owner, e.g. an enemy, or null for terrain); `bodyOwner` = owner of the moving body. relSpeed = closing speed before the step (m/s), impulse = mass × speed (N·s).
- fix2 CPU: a fixed step is skipped when the world is at rest — no awake dynamic body, no kinematic body moved, no collider / body / chunk / static added or removed since the last real step (`P.quiet()`), and every moving capsule is farther than its reach from every dynamic body (capsules only collide with props / debris; queries skip capsules unless `characters: true`). After a skipped step capsules are placed exactly (no sweep) on the next real one. `setPosition`, `setRotation` and kinematic `setKinematicTarget` stir the world for 2 steps.
- fix2: creeping bodies are put to sleep: grounded, |v| < 0.3 m/s and rim speed < 0.3 m/s for 1.2 s, not held, not in water, not touched by a capsule (light apples nudged by wind never reached Rapier's own threshold and kept the whole world awake). Any hit / blast / push wakes them as before.
- `stats()` gains `skips` (steps skipped since boot) and `prof { sync, house, steps, interp }` (ms per frame, smoothed). Measured at the fox village (185 bodies, 167 dynamic): idle 1.40 → 0.035 ms, walking 1.41 → 0.04 ms; a falling crate, blasts, raycasts and capsule pushes behave as before. `stepMs` only averages real steps.
