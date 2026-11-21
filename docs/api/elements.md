# elements — as built

## Summary
The elements system (万物相生, G.elements) is written from scratch and replaces the stub. The previous attempt had left no code. It is split into seven modules under src/elements/. It covers: a reactor registry with a spatial hash and status timers; apply() with the full §3.2 reaction table; a 2 m ground-fire automaton over grassland; flames drawn as one instanced draw call (cel-banded, glowing, flickering, with ground firelight) plus 4 pooled flickering point lights; frost shells and sparks; rain zones with a cloud disc; wind (wandering breeze, updraft and gust fields, updraft above fires); ice floes; and lightAt/addLight. Every test in the assignment was run with --systems physics,elements and passes with no errors, at a steady 60 fps. The look was judged from screenshots by day (x≈-380), at night (290,60), at dusk on 镜湖, and in rain. Three visual bugs were found and fixed along the way: the rain streaks were invisible because their quads faced away from the camera; the flame cores were clipping to white; and the night fire did not show on the dark grass, so a ground glow and stronger night point lights were added. No core or locale changes were needed: the module shows no player-visible text, and check-i18n passes.

## Public API
G.elements = {
  ELEMENTS, MATERIALS {flammable, burnTime, conductive, freezable, living?}, STATUSES, FIRE (tunables), Reactor (class)
  ★ register({ owner, kind, material, pos|getPos, radius, height?, team?, flammable?, burnTime?, conductive?, freezable?, immune?:[status|element...], on:{ignite, extinguish, burnTick(r,dt), burnout, wet, dry, freeze, thaw, shock(r,power,info), hit(r,element,power,hinfo), light(r,power,info), shatter(r,info)}, center?, living? }) -> Reactor
     POSITION RULE: pos is the BASE (feet / foot of the trunk) and the body spans pos.y..pos.y+height. With center:true, pos is the CENTRE; this is the default for kind 'prop' (physics bodies). getPos is read every frame. A pos Vector3 is kept as a live reference and re-read on a rolling scan (256 per frame); call r.moved() to force an immediate rehash.
     Additions: on.dry, on.shatter; `living` (flesh/spirit/shade/creature: burning is a status that ends with on.extinguish({natural:true}), not burnout).
  ★ unregister(r)
  Reactor { owner, kind, material, team, pos, radius, height, burning, wet, frozen, shocked, lit (seconds left), fuel, charred, y0, cy, ignite(power,info), extinguish(info), soak(sec), freeze(sec), thaw(), shock(power,info), is(status|'charred'), moved(pos?) }
  ★ apply(element, pos, radius, power=1, info={source, team, dir?, damage?, noGround?, halfAngle?, impulse?, heavy?}) -> Reactor[] (includes thunder-chained reactors)
     on.hit gets hinfo = info + { element, power, mult, reaction?, shatter?, purify?, split?, melt?, chain?, empower? }. mult is the damage multiplier for the owner to apply: fire vs shade ×1.5, sun vs shade ×2, earth (or info.heavy) on frozen ×3.
     Lanterns (kind 'lantern') never get a burning status. Fire calls on.ignite (or on.light if there is no on.ignite), sun calls on.light, water and wind (power ≥ 0.8) call on.extinguish. Returning false from the callback means "nothing happened". Rain does not put out lanterns.
     Wind also calls G.physics.pushCone(pos, info.dir, radius, halfAngle 0.6, impulse 7×power), or explode(pos, radius, 6×power, {up:0.5}) when there is no dir. Ice on water calls freezeWater; fire melts nearby floes.
     Thunder: hits conductors (metal, water, wet, standing in water), chains up to 8 m between conductors (24 at most), and strikes on open water run through everything standing in it. Dry wood: split + ignite. Stone/crystal: shatter. Chain drawn with G.fx?.lightning.
  Events: 'element:applied' {element,pos,radius,power,team,source}. 'element:reaction' is emitted once per type per apply: {type,pos,power,count,element,team,(links,chain for conduct)}. Types are steam melt shatter conduct ignite extinguish purify freeze thaw, plus these additions: fan, floe, split, resonate, light. 'element:ignite' {reactor}, 'element:burnout' {reactor}, 'terrain:scorch' {x,z,r,kind:'burn'|'wet'|'frost'} (burn events grouped per 8 m area each 0.2 s tick).
  ★ igniteGround(x,z,r=1,power=1)->cells lit · ★ extinguishGround(x,z,r)->cells put out · ★ isBurningAt(x,z) · ★ fireCount (burning ground cells)
     Additions: canBurnAt(x,z), wetGround(x,z,r,sec), burningCount (burning reactors)
  ★ rain(x,z,r=18,duration=20)->zone{remove()} · ★ isRainingAt(x,z)
  ★ addWind({kind:'updraft'|'gust', pos, dir?, radius, height, strength, duration, swirl?})->handle{remove()} · ★ windAt(pos,out) · breeze (Vector3, read-only)
  ★ freezeWater(x,z,r=4,duration=30)->floe{x,z,r,top,platform,mesh,t,melt(sec),remove()} | null if (x,z) is not water. Added addition: the floes getter.
  ★ lightAt(pos)->0..1 · ★ addLight({pos (a passed Vector3 is kept live), radius=10, intensity=1, duration?})->{pos,radius,intensity,remove()}
  query(pos,r,cb), nearest(pos,r,filter), lastChain {links:[[V3,V3]],reactors,t}, reactors, clear(), stats()
}
Ground fire tunables: 2 m cells, cap 420, each cell burns 4.2–6.4 s and spreads faster downwind. Strength drops by about 0.055 per generation, so an unaided blaze reaches roughly 30 m and dies out on its own. Burnt grass regrows after 150 s. Ground watered by apply('water') resists fire for 25 s. Fire never starts on water/beach, roads (<2.4 m), rivers (<4.5 m), warded ground (protection > 0.35), slopes > 0.8 rad, h > 62 or high 霜见岳, craters, or the palace/moat/sea regions.

## Known issues
- Not tested with the real fx, sky/post-processing or terrain systems, because none of them are finished. I checked by code that smoke and ember emitters, burst names and lightning go through G.fx?.*, but have not seen them on screen. The bloom on flame cores (values above 1, toneMapped false) has not been checked against the real post chain.
- Ice floes do not have a separate physics body. The floe is a G.world platform, and physics mirrors platforms as fixed colliders on its own, so adding a body would duplicate it. Bobbing is visual only (±4 cm); the platform shrinks in steps while it melts. supportAt() returns null on a floe because it only sees dynamic bodies; use G.world.groundAt for the floe top.
- Ground glow quads are flat discs 0.35 m above the cell height, so they can be partly hidden on very uneven ground.
- The terrain system has to listen to 'terrain:scorch' to draw scorched ground; nothing in elements does it.
- Wind blowing out lanterns uses power >= 0.8. Rain never puts out lanterns (an assumed design choice: they are roofed).
- The 4 point lights always stay in the scene (intensity 0 when unused) so shaders do not recompile. The fx flash lights come on top of these against the §8 limit of 6 dynamic point lights.

## Look (u3, 2026-11-13) — visual side only
- Flame tongues: bright rim along the silhouette, orange body, darker red heart low in the middle; ×0.72 at night (no white cores).
- Grass-fire smoke: kit smoke puffs that rise (1.8 m/s) and fray, radius 1.0–2.2 m, two puffs per patch every 0.45 s.
- Reactions each have a shape in fx.magic (steam column, freeze crystals + frost feathers, conduct ground arcs, fire whirl, …).
- Known shortfall: burnt ground shows cream-orange patches at night (terrain scorch shading).
