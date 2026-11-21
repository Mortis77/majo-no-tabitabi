# gameplay — as built

## Summary
I replaced the gameplay stub (G.gameplay) with seven modules under src/gameplay/, plus src/data/items.js, src/data/placements.js and src/locales/zh-CN/gameplay.js. Everything in the assignment is built and works together. All headless runs ended with T.errors() empty, at 60 fps and 170–470 draw calls. Combat was mid-write and did not build, so every test used --systems fx,audio,ui,physics,elements,sky,terrain,flora,structures,props,gameplay,player,spells.

**What exists**
- **Stone lanterns:** the 12 structure handles are each registered as an elements reactor of kind 'lantern'.
  - Fire or sun lights them; you can also light one with E. Water or strong wind puts them out.
  - A lit lantern gets G.elements.addLight (radius 14) and a warm glow pool on the ground, which makes lit vs unlit easy to tell at night.
  - Lighting one shows a toast with the count (n/12), becomes a checkpoint and emits 'lantern:lit' {id, pos}. Dousing emits 'lantern:out' {id, pos}.
  - When lit, E means rest.
- **Great lanterns:** dormant (a hint toast) until setGreatLanternReady. While ready they pulse with a ring and offer an E prompt.
  - Fire, sun or E then calls G.gameplay.onGreatLanternTry(id). With no hook set it lights directly.
  - igniteGreatLantern plays the moment: fx 'greatlantern', rings, a sigil, a timed light pillar, sky flash, shake and hitstop, plus a permanent light of radius 46, then emits 'greatlantern:lit'.
- **Rest points:** shrine_save, village_save, fox_save and town_save, plus every lit stone lantern. I built a save-lantern post at the village, fox and town anchors. Resting = checkpoint + full heal and mana + G.save.write() + toast + 'checkpoint' {id, pos}.
- **Death:** on 'player:died' the screen fades out. respawnPlayer() revives her at the checkpoint, takes 10% of her 星屑 (at most 60), fades back in and shows toasts.
- **Pickups:** stardust (split into up to 8 stars), heart, mana / mana_orb, and every food and ingredient kind props drop. Shapes are an extruded star, heart and orb drawn as instanced meshes; food uses the prop models.
  - They hop out, bounce, bob and sparkle, then magnet to her. Hearts and orbs only magnet when she needs them.
  - They emit 'item:collected', and food goes into the inventory.
- **Collectibles** (deterministic data in placements.js, positions checked against colliders, water and terrain):
  - 24 月之泪 on island tops, roofs, the town tower, mushroom caps, mountain ledges, the 雾见泉 pond and the cape. You collect them by touch, including from the broom.
  - 10 绘马 lore tablets: a two-sisters legend in the locale, shown with G.ui.say.
  - 12 chests of my own, built with makeChest, with loot tables that include charm and broom upgrades.
  - 5 fox kits (ani_fox at 0.62 scale, Eating loop, yips and hops), the kite on fi_kite, 8 glow mushrooms, 6 sunflower seed heads, 3 firefly clusters and 3 lotus lamps on 镜湖 (lit by fire, sun or E from the broom).
  - 3 moon-tear altars open an openShop list: 4 tears buy +1 hp or mana level.
- **Races:** 3 courses (shrine 6 rings, dusk slalom 8, night sky-way 11).
  - Only the first ring shows until a race starts. The race has a 3-2-1 countdown with taiko and broom auto-mount.
  - The HUD timer uses setTracker, and a compass marker points to the next ring, which also pulses.
  - Medals give first-time 星屑 rewards, best times go to G.state.races, and 'race:start' / 'race:finish' are emitted.
  - A race is abandoned if she is off the broom for more than 3 s, more than 260 m off course, or very slow.
- **Updraft vents:** 3 on 霜见岳 and 1 beside the palace rock, height 175. Each has a permanent elements updraft, a stone ring base, two scrolling helix ribbons and an fx 'updraft' emitter when near.
- **Mushroom caps:** landing on a G.flora.bouncePads cap launches her at the pad's power; holding C lands softly instead.
- **月障:** a lattice dome shader over the palace (ellipsoid rx 90 / ry 185) with a ripple where she hits it.
  - It pushes her out along its surface, turns the broom outward and shows a hint.
  - When 3 great lanterns other than gl_moon are lit, it dissolves with a gold burn edge, bursts and a toast, and emits 'barrier:down'.
- **Crystal puzzle:** the three pedestals turn in 30° steps by E, by a sun or moon hit, or by a moon cast aimed at one.
  - A light beam falls from the sky onto pedestal 0, and visible beams link each pedestal that is aimed correctly.
  - The last link into 晶灯 solves it: 'puzzle:solved' {id:'crystal'} and the onPuzzleSolved hook. With no story running, it makes gl_crystal ready.
- **Shops:** the village dango stall and the town shop (food plus broom / charm / hp / mana upgrades at rising prices) through G.ui.openShop. Upgrades go into G.state.upgrades, then G.player.recalcStats().
- **UI providers:** mapMarkers (rest points, shops, altars, race starts, and discovered uncollected tears / chests / 绘马), items (inventory with names, descriptions, counts, usable flag) and lore (绘马 read so far).
- **Persistence:** everything is saved in G.state (lanterns, greatLanterns, collected, lore, races, upgrades, inventory, checkpoint) plus G.state.gp, which start() fills with defaults.

## Public API
**System**
gameplaySystem { name:'gameplay', pausable:true, init, start, update } → G.gameplay.

**★ entries (DESIGN §6.11 names kept)**
- spawnPickup(kind, pos:Vector3, n=1) -> pickup[]
  - kind: stardust (n = amount, split into ≤8 pieces) | heart (+20 HP) | mana | mana_orb (+25 mana) | any food or ingredient item id (apple roasted_apple carrot berry mushroom fish grilled_fish rice pumpkin dango sun_tea moon_mochi glowshroom sunseed); for these, n = pieces.
  - Unknown kinds warn once and return [].
- igniteGreatLantern(id, {instant?, silent?}) -> bool: plays the lighting moment, adds a permanent light of radius 46, sets G.state.greatLanterns[id] and emits 'greatlantern:lit' {id}.
- setGreatLanternReady(id, on=true) -> bool
- respawnPlayer() -> bool: revives synchronously at G.state.checkpoint (−10% 星屑, max 60), increments stats.deaths and fades in. The player system calls it about 2.8 s after death; gameplay fades out on 'player:died'.
- checkpoints (getter): [{id, pos, kind:'rest'|'lantern'}]
- startRace(id) -> Promise<{time, best, medal:'gold'|'silver'|'bronze'|null}>. time is null when the race is abandoned. ids: race_shrine, race_dusk, race_sky.
- openShop(shopId) -> Promise. shopIds: village_dango, town_shop. town_shop requires flag 'town_shop_open', but only when G.quests exists.

**Hooks (set by the story)**
- onGreatLanternTry(id): called when a ready great lantern gets fire, sun or E. Without it, the lantern lights directly.
- onPuzzleSolved(id): without it and without G.quests, solving makes gl_crystal ready.
- onBarrierDown()

**Lanterns, rest, items**
- lightLantern(id, {instant, silent}), douseLantern(id), isLanternLit(id), lanternsLit (getter), greatLit (getter, count), isGreatLanternLit(id)
- rest(id), setCheckpoint(id)
- useItem(id) -> bool: eats food from the inventory (heal / mana from ITEMS); toasts when full or not edible.
- openAltar(): moon tears → hp / mana, 4 tears per level.
- applyUpgrade(key, n=1) -> new level | 0. keys: hp, mana, broom, charm; max 5. Emits 'upgrade' {id, level}.
- openChest(id): own chests ch_01..12, or a structures chest handle such as 'broom_chest'.

**Races**
- cancelRace(), raceRunning (getter: id | null)

**Groups and finding things**
- setActive(group, on). Groups: race_shrine, race_dusk, race_sky, fireflies, lotus, kits, kite, crystal_puzzle. Missing = shown; the state is persisted in G.state.gp.active.
- isActive(group)
- find(kind) -> Vector3[] of uncollected things. kinds: moontear, ema, chest, foxkit, kite, firefly, lotus_lamp, glowshroom, sunseed, altar, lantern (unlit), greatlantern (unlit), race (starts), rest.
- debugCollectAll(kind?) -> count. 'lantern' lights all stone lanterns; no kind = everything.

**Barrier and puzzle**
- barrierUp (getter), setBarrier(on, {instant})
- puzzleSolved (getter), rotatePedestal(i, dir=1)

**Misc**
- restore(): re-applies everything from G.state (used by start and tests).
- pillar(pos, dur), markersDirty(), setRaceMarker(m|null), _m (internals for tests).

**Events emitted**
- §5.4: lantern:lit {id,pos}, lantern:out {id,pos}, greatlantern:lit {id}, checkpoint {id,pos}, item:collected {id,kind,pos}, race:start {id}, race:finish {id,time,best,medal|aborted}, player:respawn (via player.revive), inventory:changed (via addItem).
- item:collected kinds: stardust, heart, mana, <food id>, moontear, ema, chest, foxkit, kite, firefly, lotus_lamp, glowshroom, sunseed.
- New: puzzle:solved {id:'crystal'}, barrier:down {id:'palace'}, upgrade {id,level}.

**State**
- Existing G.state fields used: lanterns, greatLanterns, collected (all collectible / chest ids), lore, races (best seconds), upgrades, inventory (stardust moontear dango foods glowshroom sunseed firefly kite foxkit), checkpoint {id,x,z}, stats.deaths.
- New G.state.gp = { glReady, pedestals[3], puzzles, active, barrierDown, tearPoints, shopBought, seen, checkpointId, raceMedal }, filled with defaults in start().

**Data**
- data/items.js: ITEMS, PICKUPS, UPGRADES, TEARS_PER_POINT=4, SHOPS, LOOT, DEATH_TOLL.
- data/placements.js: MOONTEARS(24), EMA(10), CHESTS(12), FOXKITS(5), KITE, INGREDIENTS(14), FIREFLIES(3), LOTUS(3), ALTARS(3), RESTS(4), RACES(3), VENTS(4), BARRIER, CRYSTAL_PUZZLE.

**UI providers set**
- G.ui.providers.mapMarkers, .items (adds a `usable` flag), .lore

## Tests
**Checks**
- node build.mjs --check on all gameplay/data files: OK.
- check-i18n on src/gameplay and on the locale file: OK. I fixed one hard-coded '、' separator by moving it into the locale.

**t1 – placements**
- I resolved every spot and checked it with resolveCollisions, ignoring my own colliders, plus terrain and water.
- Five spots collided or sat in water (ch_06, ch_08, gs_8, altar_fox, ema_04); I moved them and the re-run reported none.
- Race ring clearance above the ground: 4–137 m. Course lengths: 233 / 268 / 933 m.

**t2 – lanterns, death, pickups**
- sl_07 at night: elements.apply fire lit it (lightAt 0.99 at its foot); water put it out; a real G.spells.cast('sun') relit it.
- The checkpoint was set; resting healed from 30 to 100.
- Death: dead=true, then she respawned 1.8 m from the lantern with full HP, 200 → 180 星屑, and 'player:respawn' fired.
- I spawned all 12 pickup kinds (19 pieces). All were magnetised and collected within 2.5 s and landed in the inventory; HP and mana went up.
- useItem('fish') returned true. useItem when full returned false with a toast.

**t4 – collectibles, altar, shop**
- One of each type collected by teleport plus the real interact: tear, 绘马 (G.ui.say dismissed with Space/Enter), chest (loot spawned 星屑 and dango), fox kit, glowshroom, sunflower seed, firefly, kite, and a lotus lamp lit by a fire apply.
- Altar: 8 tears → hp 1, 4 tears left, maxHp 120.
- Dango stall: bought one dango with Enter, 1000 → 988 星屑.

**t5 – puzzle, great lantern, barrier, race, restore**
- Puzzle: a sun hit turned pedestal 0 and a moon apply turned pedestal 1 (pedestal steps went from start [3,8,5] to [4,9,5]); the rest were turned with rotatePedestal until the target [7,3,10]. 'puzzle:solved' fired.
- gl_crystal lit, then gl_dusk and gl_mirror were lit; 'barrier:down' fired.
- Barrier pushback works while up. After it dissolved she flew in to x=449.
- Shrine race by teleporting through the rings: 7.57 s, gold, best saved, medal rewards spawned.
- Restore: G.save.write(), then a deep copy of G.state put back and gp.restore(). Great lantern, barrier, puzzle, races and pedestals all came back correctly.

**t6 – mechanics**
- Mushroom cap bounce: rose 7.3 m (power 20).
- Vent: an updraft of 15 m/s lifted her 13.8 m while gliding.
- Barrier tracking: she stays on the shell and gets pushed up and out along the normal.

**Screenshots** (each one read)
- Lit vs unlit lantern at night: the warm ground pool reads clearly.
- Great lantern ignition: after I toned it down, the dais and pillar stay readable.
- Barrier dome: lattice plus hit ripple.
- Crystal light path: sky beam plus three linked beams.
- Race course and vent swirl.

**Art fixes made after reading the screenshots**
- Pickup glow was blowing out; toned down.
- The ignition flash was a white-out; toned down.
- The puzzle's sky beam was too strong; toned down.
- Added the lantern ground pool.

T.errors() was empty in every run. Stats: fps 60, calls 173–467, triangles 0.64–0.91 M.

## Known issues
- Not tested with combat or story: combat currently fails to build (missing duel.js / bosses.js / wildlife.js), so every test used an explicit --systems list without them.
- A fireball from G.spells.cast('fire', …) with a fake caster object landed about 17 m off target, so the fire-lights-lantern test uses G.elements.apply('fire') at the lantern, which is what a fireball impact does. Real sun casts were tested. Aiming real fireballs with the camera was not tested.
- The ready-great-lantern hook path (onGreatLanternTry) was not exercised in a test: by then gl_crystal had already been lit through the no-story fallback (solving the puzzle with no G.quests makes it ready, and the fire hit lit it directly). The hook call is a single line of code.
- The race was 'flown' by teleporting through the rings, so the medal times (shrine 20/26/34 s, dusk 24/30/40 s, sky 52/64/82 s) are estimates from course length and broom speed, not from real flights. The dusk slalom rings at 4 m above ground were not checked against trees along the road.
- No waterfalls exist in the world, so nothing is hidden 'behind a waterfall'. The closest substitute is mt_23 under the torii in the 雾见泉 pond.
- Map markers do not include stone lanterns, because ui/map.js already draws all 12 from STONE_LANTERNS and G.state.lanterns. I record 'seen' lanterns in G.state.gp.seen, but the map does not use it yet.
- Compass markers: during a race gameplay calls G.ui.setMarkers([next ring]), and when the race ends it calls setMarkers([]). This overwrites any quest markers the story has set. The story should re-push its markers on 'race:finish', or ui should support marker layers.
- The altar is built on openShop, which always shows the stardust icon next to prices, so the altar's '4' price appears with a stardust icon even though it costs moon tears.
- The items menu has no 'use' action yet. useItem(id) exists, and the items provider marks food with usable:true, but ui does not call it.
- Barrier: a player who starts inside the dome (for example teleported there by the story) is not pushed out. Only crossing from outside is blocked. On contact she is pushed out along the dome's normal, which on the upper half lifts her a few metres.
- The vent swirls are pale blue additive ribbons; over the snow of 霜见岳 they are subtle. The lit-lantern ground pool is a flat plane 0.12 m above the lantern base and can clip on slopes.
- Fox kits use THREE.AnimationMixer directly, because ani_fox is not a humanoid. Their idle is the 'Eating' clip, since the model has no plain idle.
- Timers for the death fade, the barrier delay and the ignition rings use setTimeout (real time), so they also run while the game is paused.


## As-built updates (fix2, 2026-11)
- `G.gameplay.litLanterns(near?, range = Infinity)` → `[{ id, kind: 'stone'|'lotus', pos, firePos, reactor, dist, douse(info) }]`, nearest first when `near` is given. Great lanterns are never listed. The moth boss uses it to fly to a lamp and eat it (douse); lotus lamps relight by fire or by hand.
- `G.gameplay.useItem(id)` is called by the items menu.
