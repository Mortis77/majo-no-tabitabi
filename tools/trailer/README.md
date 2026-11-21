# Trailer capture rig

Records one shot of the real game, frame by frame, as a 1920x1080 / 60 fps intermediate. Every frame is exactly
1/60 s of game time, however long the machine takes to draw it, and two takes of the same shot come out the same.

```
node tools/trailer/capture.mjs --shot tools/trailer/shots/test-run.js [--take 2] [--out dir]
```

Output goes to `.tmp/trailer/rig/takes/<name>/take<n>/` unless you pass `--out`:

| file | what |
|---|---|
| `<name>.mov` | ProRes 422 HQ, yuv422p10le, every frame a key frame, constant 60 fps, limited range, BT.709 primaries/transfer/matrix |
| `first.png` `middle.png` `last.png` | stills at 1920x1080, taken from the supersampled frame before it is encoded |
| `contact.jpg` | every 30th frame (no frame numbers: this ffmpeg build has no drawtext) (0, 30, 60, ...) in a grid, so you can judge the shot without playing it |
| `take.json` | settings, boot time, time per frame, a sha1 for every frame (compare takes with it), errors, ffprobe of the file |

Options:

| option | default | |
|---|---|---|
| `--take n` | 1 | take number, which only names the folder. The seed comes from the shot, so take 2 matches take 1 |
| `--ss 1\|2` | 2 | supersampling: the game renders at device scale 2 (3840x2160) |
| `--ssfilter box\|lanczos` | box | box: the GPU averages each 2x2 block before readback (fast, 8 MB/frame). lanczos: reads the full 4K frame and ffmpeg scales it down with lanczos (a little sharper, 4x the data) |
| `--master` | off | keeps a 3840x2160 master instead of scaling down, so the edit does the scaling |
| `--codec prores\|h264` | prores | h264 = all-intra x264 crf 8 yuv420p .mp4, about 1/4 the size |
| `--capture canvas\|screen` | canvas | see "What ends up in the picture" |
| `--blur n` | shot's `blur` (1) | motion blur sub-frames |
| `--frames n` `--preroll n` `--seed n` | from the shot | quick tests (`--frames 30`) |
| `--build <id>\|last` | build now | record against a saved game bundle (`.tmp/trailer/rig/builds/`) so takes match while the game is being edited |
| `--quality` `--params "k=v"` | high | game URL parameters. `autostart=1 mute=1 dynres=0 pr=<ss>` are always set |

Recordings may run side by side when each gets its own slot: `--slot n` (0–9) gives the recording its own port (47391 + n) and its own
persistent browser profile (`.tmp/trailer/rig/profile-n`). Two recordings in the SAME slot collide. Shots recorded in parallel
take longer per frame (they share the GPU) but come out the same: time is virtual.

## How it works

1. `clock.js` is injected before any game code runs (`Page.addScriptToEvaluateOnNewDocument`). Loading and boot run on
   real time. When boot sets `window.__mvReady = true` (its last line), the clock goes **virtual** inside that same call,
   so no game frame runs on real time after that point. From then on `requestAnimationFrame`, `cancelAnimationFrame`,
   `performance.now`, `Date.now`, `setTimeout`/`setInterval` and every CSS/Web animation (DOM overlays) move only when the
   rig steps them. Each step is exactly 1000/60 ms. It runs any due timers in time order, letting promise continuations
   finish between them, then advances CSS animations, then runs the frame callbacks. `Math.random` is a seeded PRNG
   (sfc32) from the first line of the page.
2. `runtime.js` (`window.__rig`, called `R` in shots) is evaluated once the clock is virtual. It wraps `G.cam.update`, so
   the shot camera is set after the heroine has moved in that frame (a follow rig has no lag). It also wraps
   `G.renderFrame`, to set the lens and roll and to read the frame back. It does not edit anything under `src/`.
3. `R.record()` does these steps in order:
   - seed the PRNG and hide place-name cards
   - `setup(G,T,R)`
   - `R.settle()`: build all terrain, wait until no network request is in flight, then step 30 quiet frames
   - reset the world's clocks to fixed values: `G.time.t = 10000`, `G.time.frame = 2^20`, page time to the next whole
     10 h, `Date.now` = 2026-11-14 06:00 UTC
   - set every shader clock uniform whose name contains "time" (grass, foliage, water, sky: `fTime gTime mvTime trTime
     uCelTime uTime wTime`) to 100, clear fx and the ambient life (they respawn from the seed; `keepFx: true` turns
     this off)
   - seed the PRNG again
   - `start(G,T,R)`
   - preroll (frames simulated but not recorded)
   - record
4. Each recorded frame: step the clock, the game draws, `gl.readPixels` straight after `G.renderFrame` (before the
   browser composites), POST the raw RGBA to a sink in capture.mjs, then pipe it into ffmpeg. Colour conversion is
   `scale=...:flags=lanczos+accurate_rnd+full_chroma_int:out_color_matrix=bt709:out_range=tv`, and `setparams` tags
   the frames BT.709 / tv range.

## Writing a shot

A shot is a JS file with `export default { ... }`. capture.mjs imports it in node to read the plain fields, then
evaluates the same source inside the page, so `setup`, `actions` and `camera` functions run in the page with the game.
Do not import anything in a shot file.

```js
export default {
  name: 'meadow-run',      // folder and file name
  frames: 180,             // recorded length (frames at 60 fps; one beat = 36, one bar = 144)
  preroll: 90,             // simulated before frame 0 so grass, cloth, hair, particles and the camera have settled
  seed: 7,                 // Math.random seed (wind gusts, particles, NPC choices). Same seed = same take
  blur: 1,                 // motion blur sub-frames (4–8 for the broom flight); shutter: 0.5 = 180°
  capture: 'canvas',       // or 'screen' when the HUD / a game card must be in the picture
  params: '',              // extra URL parameters for the game, e.g. 'allspells=1'
  async setup(G, T, R) {   // may step frames (await R.step(n)), spawn, story state ...
    R.hud(false); R.wildlife(false); R.weather('clear'); R.freezeFidgets();
    R.place(-505, 120, -2.2);
  },
  start(G, T, R) {         // last placement right before the preroll (keep it synchronous)
    R.place(-505, 120, -2.2);
    R.gameCam({ yaw: -2.2 + Math.PI - 0.45, pitch: -0.12 });
  },
  camera: 'game',          // see Cameras
  actions: [               // f = output frame; negative = during the preroll
    { f: -40, key: 'KeyW', down: true },
    { f: 60, tap: 'Space' },
    { f: 175, key: 'KeyW', down: false },
  ],
  onFrame(f, G, T, R) {},  // optional, before every frame (preroll included)
};
```

### Actions (real input, the same path as a player's keys and mouse)

Every action goes through `G.input.sim`, the same input sets the keyboard and mouse fill, so what you record is real
gameplay: movement is relative to the game camera, spells cost mana, and so on.

| action | effect |
|---|---|
| `{ f, key: 'KeyW', down: true\|false }` | hold or release a key or button. Mouse: `'Mouse0'` charm, `'Mouse2'` cast, `'Mouse1'` lock |
| `{ f, hold: 'Mouse2', frames: 50 }` | hold for n frames (a charged big cast) |
| `{ f, tap: 'Digit3' }` | press for 2 frames (jump `Space`, dodge `KeyQ`, guard `KeyR`, broom `KeyF`, spell pick `Digit1..8`) |
| `{ f, look: [dx, dy] }` | one mouse-look move in pixels (about 0.0024 rad per pixel) |
| `{ f, lookRate: [dx, dy], frames: n }` | mouse-look every frame: a smooth pan of the game camera |
| `{ f, do: (G, T, R) => {} }` | anything else, such as `R.spawn(...)`, a story flag, or `G.spells.cast(...)` |

Keys are listed in DESIGN.md §3.1. Remember that in the game, W runs toward where the game camera looks. When a shot
uses its own camera, point the game camera first with `R.gameCam({ yaw })` in `start`, so W still means "that way".

### Cameras

The shot camera is view-only (it uses the game's `fixedCam` with `view: true`). It decides where the frame is drawn from.
Aim, movement and the game's own orbit camera behave as if it were not there.

- `'game'`: the player's own camera, driven by `look`/`lookRate` actions. Point it in `start` with `R.gameCam({ yaw, pitch, dist })`.
- A keyframed world path:
  ```js
  camera: { path: [ { f: 0, pos: [x,y,z], look: [x,y,z], fov: 40, roll: 0 }, { f: 150, pos: [...], look: [...] }, ... ],
            ease: 'inOut', hold: true, shake: { pos: 0.02, look: 0.04, speed: 1 } }
  ```
  Interpolation is time-based Catmull–Rom (Hermite), so speed stays continuous across keys even when they are unevenly
  spaced. `ease` remaps the whole path in time (`linear in out inOut smooth sine`, or a function). `hold: true` starts
  and ends at rest. A key without `fov` keeps the previous one.
- Follow rigs around the heroine. They track her position and facing with a `smooth` lag in seconds (default 0.12):
  ```js
  camera: { follow: 'behind'|'front'|'side'|'left'|'right'|'orbit'|'crane'|<angle rad>, dist, height, lookHeight, yaw, fov,
            keys: [ { f, dist, height, lookHeight, yaw, fov } ...], ease, smooth, worldYaw, orbitSpeed, shake }
  ```
  `orbit` circles her at `orbitSpeed` rad/s (default 0.35). `crane` rises by `rise` m (default 6), tilts by `lookRise`
  and pulls back by `pull` over the shot. `keys` animate any of the numbers (spline plus `ease`). `worldYaw: true`
  measures angles from world south instead of from her facing.
- `(f, G, R) => ({ pos, look, fov, roll })`: anything else. `f` is fractional when motion blur is on.
- All rigs: `shake` adds smooth, deterministic hand-held drift (metres). The camera never goes below the ground plus
  `minClear` (default 0.35 m; set `minClear: false` to turn this off).

`R.cameraAt(camera, f)` returns the pose for a frame, so you can preview a path with `--probe` without recording.

## Helpers (R)

| helper | |
|---|---|
| `R.hud(false)` / `R.hud(true)` | hide or show the whole DOM UI layer (HUD, cards, dialogue, fades, vignettes) |
| `R.hide('hud'\|'cards'\|'dialogue'\|'letterbox'\|'all')`, `R.show(...)` | finer control. Cards (place-name banners and toasts) are hidden by default. `R.cards(true)` brings them back |
| `R.place(x, z, yaw, y?)` | teleport her to ground level at x,z, facing yaw (0 = south, +z; PI = north), with the game camera snapped behind |
| `R.gameCam({ yaw, pitch, dist })` | point the player's camera |
| `R.weather('clear')`, `R.weather({ rain: 0..1, cloud: 0..1\|null })` | the sky eases toward it, so give it a few seconds in setup (`await R.step(240)`) |
| `R.lightAt(x, z)` | `{ veil, daylight, region }`: light is decided by place (veil 0 = everlasting day, 1 = lasting night) |
| `R.spotWithLight('sun'\|'dusk'\|'night', x, z)` | the point on the line from (x,z) to the Veil centre with that light |
| `R.spells('all')`, `R.spells(['fire','wind'], 2)` | grant spells silently (no ceremony). `R.select(id)` selects one |
| `R.fill()`, `R.keepFull(true)` | full health, mana and gauge, once or every frame |
| `R.freezeFidgets()` | no idle fidget animations, so she stands still in her base idle |
| `R.spawn(type, x, z, opts)` | `G.combat.spawn`, the game's own spawn: paper blob blob_small wolf moth wisp golem caster |
| `R.wildlife(false)` | no camps, nests or wildlife spawning (clean plates) |
| `R.life(false)` | no ambient small creatures (birds, butterflies ...) |
| `R.clearCombat()` | remove enemies, projectiles and effects |
| `R.flag(name)`, `R.give(id, n)` | story flag or item |
| `await R.step(n)` | simulate n frames (not recorded) |
| `await R.settle({ min, max })` | wait for streaming: all terrain built, no network in flight, `min` quiet frames. Runs automatically after setup. Call it again after a long teleport inside setup |
| `R.log(...)` | print in the capture log |
| `G`, `T` | the game and the play.mjs helpers (`T.key`, `T.look`, `T.teleport` ...), as in tools/play.mjs scripts |

`--probe file.js` boots the game, runs that file's body in the page (`R`, `G`, `T` in scope, return value printed)
and records nothing. Use it to find coordinates and check paths.

## What ends up in the picture

- `capture: 'canvas'` (default) records the WebGL canvas only: the 3D world with the game's full post-processing.
  DOM overlays are **not** in it: HUD, place-name cards, dialogue box, letterbox, `G.ui.fade`, damage numbers drawn in
  the DOM. For the trailer, put titles and captions in the edit.
- `capture: 'screen'` uses `Page.captureScreenshot` of the composited page, DOM included. At 4K it takes about 3 s
  per frame, so use it only for the shots that need the game's own UI.

## Determinism: what is pinned, what is not

Pinned by the rig: frame time (exactly 1/60 s), every page clock, timers, CSS animations, `Math.random` (seeded, then
re-seeded after settling), the world clocks `G.time.t` and `G.time.frame`, the start position and facing, and the inputs.
Dynamic resolution is off (`dynres=0`).

What can still differ between takes, and what to do about it:

- **State from before the shot.** Boot runs on real time, so how many frames the ui, fx and audio systems ran while
  loading varies, and so does anything that kept running during setup (NPC schedules, drifting clouds that keep their
  own accumulator). `R.settle()` also runs a variable number of frames when something is still loading. The fixes:
  put the heroine and the camera in `start` (after settling), use a preroll of at least 60 frames, and keep wildlife
  off. Compare two takes with `node tools/trailer/compare.mjs <takeA> <takeB>`.
- **Measured** (shots/test-run.js, two takes with the same bundle): the heroine's path, animation, camera and land are
  identical, and her final position matches to the millimetre. The pixels are not bit-identical: PSNR between the takes is 40–48 dB
  (mean 44.6). The remaining differences are small and local: ambient motes and falling petals (particle state that
  outlives `fx.clear`), the tips of her skirt and sleeves (spring and cloth history), and grass-blade tips at the
  horizon. Before the rig reset the shader clocks and cleared fx and life, the PSNR was 36 dB, and birds were in
  different places.
- **The game is being edited.** Two runs a few minutes apart can use different code, and that changes the look
  completely (the measured case was a sky edit: 23 dB). Every run saves its bundle, so re-takes and matching takes
  should use `--build <id>` (or `--build last`). take.json records the bundle id.
- **Audio clocks** (`AudioContext.currentTime`) run on real time. Nothing visual reads them, and recordings are muted.
- **`new Date()` with no argument** is real time; only `Date.now()` is virtual. Nothing visual in the game uses it.
- **GPU timing queries and `requestIdleCallback`** (the audio loader) are real time. They have no effect on the picture.
- **Asynchronous loads during the shot** (a model loaded the first time an enemy type spawns) arrive on real time, on
  whichever frame they land. Spawn that type once in `setup` (or let `R.settle` run after it) so it is cached before
  frame 0.
- **CSS animations** are virtualised, but only while they exist in `document.getAnimations()`. A `transitionend` or
  `animationend` fires when the stepped time reaches the end (the rig calls `finish()`).

## Timings

All measurements were taken on this machine while other jobs shared the GPU (load average 60–290), so a quiet machine
should be faster. These are per recorded frame, rendering at 3840x2160 internally:

| path | per frame (measured) |
|---|---|
| canvas + GPU 2x2 box (default) | 0.4–1.3 s in total (render + readback 0.27–0.6 s, hand-off to ffmpeg 0.07–0.5 s). 180 frames take about 2–4 min plus boot |
| canvas + lanczos (`--ssfilter lanczos`, 33 MB per frame) | about 2.9 s (the 4K POST dominates). Running ffmpeg alone (lanczos + ProRes) costs 0.33 s/frame at 1080p and 1.0 s/frame for a 4K master |
| screen (`captureScreenshot` PNG 4K) | about 3 s for the grab alone |
| motion blur `blur: n` | n times the per-frame cost (n=4: about 4.3 s) |
| boot | 35–125 s. The bake cache in the profile helps |

Chosen default: render at 4K, average 2x2 on the GPU, and record a 1080p ProRes intermediate. It is about 3x faster
than lanczos from 4K, and it makes the edit's job easier. The 2x2 box filter is a real 4-sample supersample per output pixel. Lanczos
is slightly crisper on fine grass. Use `--ssfilter lanczos` or `--master` for hero close-ups if time allows.

Sizes: ProRes 422 HQ at 1080p60 is about 0.95 MB per frame (3 s = 170 MB, 5 s = 290 MB). A 4K master is about
3.8 MB per frame. `--codec h264` is about a quarter of the ProRes size.

Motion blur: with 4 sub-frames, fast close objects show 4 distinct copies (a 180° shutter at 60 fps is 1/120 s). For
the broom flight and whip pans, use 8–16.

## Pitfalls

- W runs where the **game** camera faces, not where the shot camera is. Point `R.gameCam` in `start`.
- `T.cam` (play.mjs) moves the real camera and turns her. Do not use it in shots: the rig uses the view-only camera.
- Shots that need the HUD must use `capture: 'screen'`. In canvas mode the rig logs a note when the UI layer is visible.
- A teleport far away needs `R.settle()` before the shot (the rig runs it after setup). A teleport inside `actions`
  shows pop-in.
- Cards: entering a new region shows a place-name card. Cards are hidden by default.
- If the run fails inside a game file, a colleague is probably mid-edit: capture.mjs retries the build 4 times, one
  minute apart. Retry the whole run a minute later.
- `G.debug.errors()` and page console errors are recorded in take.json. A shot with game errors exits with code 2,
  but the video is still written.

## Files

- `capture.mjs`: the recorder (node). `clock.js`: the virtual clock (page, injected first). `runtime.js`: `R`, cameras,
  actions, the record loop (page). `compare.mjs`: compares two takes.
- `shots/test-run.js`: the determinism proof (3 s, game camera). `shots/showcase-orbit.js`: a follow rig with keyed
  angle, distance, height and lens (5 s).
- `score/` belongs to the composer and is not part of the rig.
