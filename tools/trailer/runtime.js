// In-page side of the trailer capture rig (tools/trailer/README.md). Evaluated by capture.mjs after the game is ready
// and the clock (clock.js) has gone virtual. Installs window.__rig = R: shot helpers, camera rigs, the action timeline
// and the record loop. Nothing here edits the game: it only calls its public API and wraps two per-frame functions
// (G.cam.update, G.renderFrame) from the outside.
(() => {
  const G = window.__game, T = window.__T, C = window.__rigClock;
  const THREE = G.THREE;
  const FRAME = 1000 / 60;
  const R = { FRAME, G, T, C };
  window.__rig = R;
  const log = (...a) => console.log('[rig]', ...a);
  R.log = log;

  // ---------------------------------------------------------------- network in flight (streaming detector)
  let inflight = 0;
  if (!window.__rigFetch) {
    const rf = window.fetch.bind(window);
    window.__rigFetch = rf;
    window.fetch = (...a) => { inflight++; return rf(...a).finally(() => { inflight--; }); };
  }
  R.inflight = () => inflight;

  // ---------------------------------------------------------------- stepping
  /** Simulate n frames (1/60 s each) without recording. */
  R.step = async (n = 1) => { for (let i = 0; i < n; i++) { await C.step(FRAME); } };
  R.frames = R.step;
  /** Let wall-clock pass without simulating (lets async loads land; the virtual clock does not move). */
  R.idle = (ms) => new Promise((r) => C.realST(r, ms));

  // ---------------------------------------------------------------- math
  const V = (a) => (a && a.isVector3 ? a.clone() : Array.isArray(a) ? new THREE.Vector3(a[0], a[1], a[2]) : new THREE.Vector3(a.x, a.y, a.z));
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const EASE = {
    linear: (t) => t,
    in: (t) => t * t * t,
    out: (t) => 1 - Math.pow(1 - t, 3),
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    smooth: (t) => t * t * (3 - 2 * t),
    sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  };
  R.EASE = EASE;
  const ease = (e, t) => (typeof e === 'function' ? e(t) : (EASE[e] || EASE.linear)(t));

  /**
   * Time-parameterised Catmull-Rom (Hermite with tangents from the neighbours, divided by the real frame gaps, so the
   * speed is continuous across keys even when keys are unevenly spaced). keys: [{ f, v: number | number[] }].
   * Ends: the tangent is the one-sided slope, or 0 with { hold: true } (path starts / stops at rest).
   */
  function spline(keys, f, hold) {
    const n = keys.length;
    if (n === 1 || f <= keys[0].f) return keys[0].v;
    if (f >= keys[n - 1].f) return keys[n - 1].v;
    let i = 0;
    while (i < n - 2 && f > keys[i + 1].f) i++;
    const k0 = keys[i], k1 = keys[i + 1];
    const dt = k1.f - k0.f, u = (f - k0.f) / dt;
    const tan = (j) => {
      const a = keys[Math.max(0, j - 1)], c = keys[Math.min(n - 1, j + 1)];
      if ((j === 0 || j === n - 1) && hold) return null;
      return (x) => (c.v[x] - a.v[x]) / (c.f - a.f);
    };
    const t0 = tan(i), t1 = tan(i + 1);
    const u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    const out = [];
    for (let x = 0; x < k0.v.length; x++) out.push(h00 * k0.v[x] + h10 * dt * (t0 ? t0(x) : 0) + h01 * k1.v[x] + h11 * dt * (t1 ? t1(x) : 0));
    return out;
  }
  R.spline = spline;

  // smooth deterministic "hand-held" drift: a few incommensurate sines per axis, phase from the shot seed
  function drift(f, amp, speed, salt) {
    if (!amp) return [0, 0, 0];
    const t = (f / 60) * (speed || 1);
    const o = [];
    for (let a = 0; a < 3; a++) {
      const p = (salt * 7.13 + a * 3.71) % 6.283;
      o.push(amp * (0.55 * Math.sin(t * 0.73 + p) + 0.3 * Math.sin(t * 1.61 + p * 2.3) + 0.15 * Math.sin(t * 3.07 + p * 0.7)));
    }
    return o;
  }

  // ---------------------------------------------------------------- heroine tracking (for follow rigs)
  const P = () => G.player;
  const track = { pos: null, yaw: 0, init: false };
  function trackHeroine(smoothSec) {
    const p = P(); if (!p) return;
    const k = smoothSec > 0 ? 1 - Math.exp(-(1 / 60) / smoothSec) : 1;
    if (!track.init) { track.pos = p.pos.clone(); track.yaw = p.yaw || 0; track.init = true; return; }
    track.pos.lerp(p.pos, k);
    let d = (p.yaw || 0) - track.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    track.yaw += d * k;
  }

  // ---------------------------------------------------------------- camera
  /**
   * Evaluate the shot camera at (fractional) frame f. Returns { pos:Vector3, look:Vector3, fov, roll } or null (= game camera).
   * Forms:
   *   'game' | null                                   the player's own camera (driven by mouse look in the actions)
   *   { path: [{ f, pos:[x,y,z], look:[x,y,z], fov?, roll? }, ...], ease?, hold?, shake? }   keyframed world path
   *   { follow: 'behind'|'side'|'left'|'right'|'front'|'orbit'|'crane'|yawOffset, keys?: [{ f, dist, height, lookHeight, yaw, fov }],
   *     dist, height, lookHeight, yaw (extra offset, rad), orbitSpeed (rad/s), smooth (s), worldYaw (true: ignore her facing), shake? }
   *   (f, G, R) => ({ pos, look, fov?, roll? })       anything else
   * shake: { pos: metres, look: metres, speed } (hand-held drift).
   */
  R.cameraAt = function (cam, f) {
    if (!cam || cam === 'game') return null;
    let out;
    if (typeof cam === 'function') { out = cam(f, G, R); if (!out) return null; out = { pos: V(out.pos), look: V(out.look), fov: out.fov, roll: out.roll || 0 }; }
    else if (cam.path) {
      const keys = cam.path;
      const f0 = keys[0].f, f1 = keys[keys.length - 1].f;
      const fe = keys.length > 1 && f1 > f0 ? f0 + (f1 - f0) * ease(cam.ease || 'linear', clamp01((f - f0) / (f1 - f0))) : f;
      const pk = keys.map((k) => ({ f: k.f, v: [k.pos[0], k.pos[1], k.pos[2]] }));
      const lk = keys.map((k) => ({ f: k.f, v: [k.look[0], k.look[1], k.look[2]] }));
      const fk = keys.map((k, i) => ({ f: k.f, v: [k.fov ?? keys.slice(0, i).reverse().find((q) => q.fov)?.fov ?? cam.fov ?? 50] }));
      const rk = keys.map((k) => ({ f: k.f, v: [k.roll || 0] }));
      out = { pos: V(spline(pk, fe, cam.hold)), look: V(spline(lk, fe, cam.hold)), fov: spline(fk, fe, cam.hold)[0], roll: spline(rk, fe, cam.hold)[0] };
    } else if (cam.follow !== undefined) {
      const preset = { behind: Math.PI, back: Math.PI, front: 0, side: -Math.PI / 2, right: -Math.PI / 2, left: Math.PI / 2, orbit: Math.PI, crane: Math.PI };
      const base = typeof cam.follow === 'number' ? cam.follow : preset[cam.follow] ?? Math.PI;
      const def = { dist: cam.dist ?? (cam.follow === 'crane' ? 5 : 4.2), height: cam.height ?? 1.5, lookHeight: cam.lookHeight ?? 1.0, yaw: cam.yaw ?? 0, fov: cam.fov ?? 50 };
      let prm = def;
      if (cam.keys && cam.keys.length) {
        const ks = cam.keys;
        const f0 = ks[0].f, f1 = ks[ks.length - 1].f;
        const fe = ks.length > 1 && f1 > f0 ? f0 + (f1 - f0) * ease(cam.ease || 'linear', clamp01((f - f0) / (f1 - f0))) : f;
        const names = ['dist', 'height', 'lookHeight', 'yaw', 'fov'];
        const v = spline(ks.map((k) => ({ f: k.f, v: names.map((nm) => k[nm] ?? def[nm]) })), fe, cam.hold);
        prm = { dist: v[0], height: v[1], lookHeight: v[2], yaw: v[3], fov: v[4] };
      } else if (cam.follow === 'crane') {
        const u = ease(cam.ease || 'inOut', clamp01(f / Math.max(1, R._plan.frames - 1)));
        prm = { ...def, height: def.height + (cam.rise ?? 6) * u, lookHeight: def.lookHeight + (cam.lookRise ?? 0.5) * u, dist: def.dist + (cam.pull ?? 3) * u };
      }
      const hp = track.pos || P().pos;
      let yaw = (cam.worldYaw ? 0 : track.yaw) + base + prm.yaw;
      if (cam.follow === 'orbit' || cam.orbitSpeed) yaw += (cam.orbitSpeed ?? 0.35) * (f / 60);
      out = {
        pos: new THREE.Vector3(hp.x + Math.sin(yaw) * prm.dist, hp.y + prm.height, hp.z + Math.cos(yaw) * prm.dist),
        look: new THREE.Vector3(hp.x, hp.y + prm.lookHeight, hp.z), fov: prm.fov, roll: cam.roll || 0,
      };
    } else return null;
    const sh = cam.shake;
    if (sh) {
      const dp = drift(f, sh.pos ?? 0.03, sh.speed, R._plan.seed + 1), dl = drift(f, sh.look ?? 0.06, sh.speed, R._plan.seed + 2);
      out.pos.x += dp[0]; out.pos.y += dp[1]; out.pos.z += dp[2];
      out.look.x += dl[0]; out.look.y += dl[1]; out.look.z += dl[2];
    }
    if (cam.minClear !== false && out.pos) { // never below the ground (a follow rig on a slope)
      const gy = G.world.heightAt(out.pos.x, out.pos.z) + (cam.minClear ?? 0.35);
      if (out.pos.y < gy) out.pos.y = gy;
    }
    return out;
  };

  // per-frame hook: runs inside G.cam.update (after the player moved this frame), so a follow rig has zero lag
  let camFrame = null;     // fractional frame the current step represents
  let gameFov = null;
  R._view = null;
  function applyCam() {
    const plan = R._plan;
    if (!plan || camFrame === null) return;
    if (plan.camera && plan.camera !== 'game' && plan.camera.follow !== undefined) trackHeroine(plan.camera.smooth ?? 0.12);
    const v = R.cameraAt(plan.camera, camFrame);
    R._view = v;
    if (!v) { if (G.debug.fixedCam && G.debug.fixedCam.__rig) G.debug.fixedCam = null; return; }
    let fc = G.debug.fixedCam;
    if (!fc || !fc.__rig) { G.debug.setCam(0, 0, 0, 0, 0, 1, { view: true }); fc = G.debug.fixedCam; fc.__rig = true; }
    fc.pos.copy(v.pos); fc.look.copy(v.look);
    if (v.fov) { gameFov = G.camera.fov; G.camera.fov = v.fov; G.camera.updateProjectionMatrix(); }
  }
  if (G.cam && !G.cam.__rigWrapped) {
    const orig = G.cam.update;
    G.cam.update = function (dt, rdt) { const r = orig.call(this, dt, rdt); try { applyCam(); } catch (e) { log('camera error ' + (e.stack || e)); } return r; };
    G.cam.__rigWrapped = true;
  } else if (!G.cam) log('no G.cam: camera rigs need the player system');
  if (!G.__rigRender) {
    const origRender = G.renderFrame;
    G.__rigRender = origRender;
    G.renderFrame = function () {
      const v = R._view;
      if (v && v.roll) { G.camera.rotateZ(v.roll); G.camera.updateMatrixWorld(); }
      const r = origRender.apply(this, arguments);
      if (R._readNext) readBack();
      if (gameFov !== null) { G.camera.fov = gameFov; G.camera.updateProjectionMatrix(); gameFov = null; }
      return r;
    };
  }

  // canvas capture: read the frame back right after it is drawn, before the browser composites (and clears) it
  // down > 1: the GPU averages each down x down block first (glBlitFramebuffer, LINEAR, exact 2:1 = 2x2 box filter)
  let pix = null, pixReady = false, fbo = null, rb = null, fboW = 0, fboH = 0;
  function readBack() {
    R._readNext = false;
    const r = G.renderer, gl = r.getContext();
    r.setRenderTarget(null);
    let w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const down = R._plan.down || 1;
    if (down > 1) {
      const dw = Math.round(w / down), dh = Math.round(h / down);
      if (!fbo || fboW !== dw || fboH !== dh) {
        fbo = fbo || gl.createFramebuffer(); rb = rb || gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, dw, dh);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
        gl.bindRenderbuffer(gl.RENDERBUFFER, null);
        fboW = dw; fboH = dh;
      }
      r.state.setScissorTest(false);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fbo);
      gl.blitFramebuffer(0, 0, w, h, 0, 0, dw, dh, gl.COLOR_BUFFER_BIT, gl.LINEAR);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbo);
      w = dw; h = dh;
    }
    if (!pix || pix.length !== w * h * 4) pix = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pix);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); // what three.js believes is bound after setRenderTarget(null)
    pixReady = true;
  }

  // ---------------------------------------------------------------- helpers for setup()
  const ui = () => G.uiRoot || document.getElementById('ui');
  const css = (() => { const s = document.createElement('style'); s.id = 'rig-style'; document.head.appendChild(s); return s; })();
  const hidden = new Set();
  const applyCss = () => {
    const sel = [];
    if (hidden.has('all')) sel.push('#ui');
    if (hidden.has('hud')) sel.push('#ui .mv-hud', '#ui .mv-vig', '#ui .mv-saved', '#ui .mv-wheel', '#ui .mvs-layer');
    if (hidden.has('cards')) sel.push('#ui .mv-banner', '#ui .mv-toasts');
    if (hidden.has('dialogue')) sel.push('#ui .mv-dlg');
    if (hidden.has('letterbox')) sel.push('#ui .mv-lbox');
    css.textContent = sel.length ? sel.join(',') + '{visibility:hidden!important;opacity:0!important}' : '';
  };
  /** Hide / show DOM overlays. which: 'all' (the whole UI layer) | 'hud' | 'cards' (place-name banners + toasts) | 'dialogue' | 'letterbox'. */
  R.hide = (...which) => { for (const w of which.length ? which : ['all']) hidden.add(w); applyCss(); };
  R.show = (...which) => { if (!which.length) hidden.clear(); for (const w of which) hidden.delete(w); applyCss(); };
  R.hud = (on) => (on ? R.show('hud', 'all') : R.hide('all'));
  /** Place-name cards on / off (the 'region:enter' banner and toasts). */
  R.cards = (on) => (on ? R.show('cards') : R.hide('cards'));

  /** Put the heroine at (x, z) [y = ground], facing yaw (rad, 0 = +z / south; PI = north). Camera snaps behind her. */
  R.place = (x, z, yaw = null, y) => {
    T.teleport(x, z, y);
    const p = P();
    if (p && yaw !== null) { p.yaw = yaw; if (p.group) p.group.rotation.y = yaw; }
    if (G.cam) { try { if (yaw !== null) G.cam.setBehind(yaw); G.cam.snap(); } catch (e) { /* optional */ } }
    track.init = false;
  };
  /** Point the game camera: yaw (rad, same convention as G.cam.yaw), pitch (rad). */
  R.gameCam = ({ yaw, pitch, dist } = {}) => { if (!G.cam) return; if (yaw !== undefined) G.cam.yaw = yaw; if (pitch !== undefined) G.cam.pitch = pitch; if (dist !== undefined) { G.cam.dist = dist; G.cam.targetDist = dist; } G.cam.snap?.(); };
  /** Weather: R.weather('clear') | R.weather({ rain: 0..1, cloud: 0..1|null }). The sky eases to it: settle a few seconds in setup. */
  R.weather = (w = 'clear') => {
    if (w === 'clear') w = { rain: 0, cloud: null };
    G.sky?.setWeather?.(w);
    if (w.rain === 0) { try { G.elements?.clear?.('rain'); } catch (e) { /* optional */ } }
  };
  /** Light of a place (the world decides light by position: veil 0 = everlasting day, 1 = lasting night). */
  R.lightAt = (x, z) => ({ veil: G.world.veilAt(x, z), daylight: G.world.daylightAt(x, z), region: G.world.regionAt(x, z) });
  /** Find a spot with the wanted light: kind 'sun' | 'dusk' | 'night', near (x,z) along the line to the veil centre. */
  R.spotWithLight = (kind, x = -455, z = 150) => {
    const want = { sun: 0, dusk: 0.5, night: 0.95 }[kind] ?? 0;
    const cx = 380, cz = -40;
    let best = null;
    for (let i = 0; i <= 200; i++) {
      const u = i / 200, px = x + (cx - x) * u, pz = z + (cz - z) * u;
      const d = Math.abs(G.world.veilAt(px, pz) - want);
      if (!best || d < best.d) best = { d, x: px, z: pz };
    }
    return { x: best.x, z: best.z, ...R.lightAt(best.x, best.z) };
  };
  /** Grant spells: R.spells('all') or R.spells(['fire', 'wind'], level). Silent (no ceremony). */
  R.spells = (ids = 'all', level = 2) => {
    const S = G.spells; if (!S) return;
    if (ids === 'all') { S.learnAll(); return; }
    for (const id of ids) S.learn(id, level, { silent: true });
  };
  R.select = (id) => G.spells?.select?.(id);
  /** Full mana and health (and keep them full: R.keepFull(true) refills every frame). */
  R.fill = () => { const p = P(); if (!p) return; p.mana = p.maxMana; p.hp = p.maxHp; if (G.spells) G.spells.gauge = 1; };
  R.keepFull = (on = true) => { R._keepFull = on; };
  /** Idle fidgets of the heroine off (she stands still in her base idle). */
  R.freezeFidgets = (on = true) => { const r = P()?.rig; if (r) { r.fidgets = !on; r._idleT = 0; } };
  /** Spawn an enemy the way the game does (G.combat.spawn). type: paper blob blob_small wolf moth wisp golem caster. */
  R.spawn = (type, x, z, opts = {}) => G.combat?.spawn(type, new THREE.Vector3(x, G.world.heightAt(x, z), z), opts);
  /** Ambient life on/off: wild camps, nests, wildlife (clean plates) */
  R.wildlife = (on) => { const c = G.combat; if (!c) return; c.campsEnabled = on; c.nestsEnabled = on; c.wildlifeEnabled = on; };
  /** Ambient small creatures (birds, butterflies, fish ...) on / off. */
  R.life = (on) => { try { G.life?.setEnabled?.(!!on); } catch (e) { /* optional */ } };
  /** Remove every enemy / projectile / effect (clean slate). */
  R.clearCombat = () => { try { for (const e of [...(G.combat?.enemies || [])]) G.combat.despawn(e); } catch (e) { /* */ } try { G.spells?.clear?.(); } catch (e) { /* */ } try { G.fx?.clear?.(); } catch (e) { /* */ } };
  /** Story flag (G.debug.flag) and item (G.debug.give). */
  R.flag = (name, v = true) => G.debug.flag(name, v);
  R.give = (id, n = 1) => G.debug.give(id, n);

  /**
   * Wait until the land around the camera is fully built: terrain chunks (G.terrain.settle), nothing in flight on the
   * network, then `min` more frames for grass / impostors / shadows to catch up. Returns the frames it simulated.
   */
  R.settle = async ({ min = 30, max = 600 } = {}) => {
    let n = 0, quiet = 0;
    try { G.terrain?.settle?.(); } catch (e) { /* optional */ }
    while (n < max) {
      await R.step(1); n++;
      if (inflight === 0) quiet++; else { quiet = 0; await R.idle(30); }
      if (quiet >= min) break;
    }
    try { G.terrain?.settle?.(); } catch (e) { /* optional */ }
    return n;
  };

  // ---------------------------------------------------------------- actions (real inputs, the player's own path)
  /**
   * actions: [{ f, ... }] with f in output frames (negative = during the preroll). One of:
   *   { f, key: 'KeyW', down: true|false }       hold / release a key or mouse button ('Mouse0' charm, 'Mouse2' cast)
   *   { f, hold: 'KeyW', frames: 90 }            hold for n frames
   *   { f, tap: 'Space' }                        press for 2 frames (a jump, a dodge, a spell pick 'Digit3')
   *   { f, look: [dx, dy] }                      one mouse-look move (pixels)
   *   { f, lookRate: [dx, dy], frames: n }       mouse-look every frame for n frames (smooth pans of the game camera)
   *   { f, do: (G, T, R) => {} }                 anything else (story beats, spawns, a scripted spell cast)
   */
  function expand(actions = []) {
    const ev = [];
    for (const a of actions) {
      if (a.key) ev.push({ f: a.f, fn: () => T.key(a.key, a.down !== false) });
      else if (a.hold) { ev.push({ f: a.f, fn: () => T.key(a.hold, true) }); ev.push({ f: a.f + (a.frames ?? 30), fn: () => T.key(a.hold, false) }); }
      else if (a.tap) { ev.push({ f: a.f, fn: () => T.key(a.tap, true) }); ev.push({ f: a.f + (a.frames ?? 2), fn: () => T.key(a.tap, false) }); }
      else if (a.look) ev.push({ f: a.f, fn: () => T.look(a.look[0], a.look[1]) });
      else if (a.lookRate) for (let i = 0; i < (a.frames ?? 30); i++) ev.push({ f: a.f + i, fn: () => T.look(a.lookRate[0], a.lookRate[1]) });
      else if (a.do) ev.push({ f: a.f, fn: () => a.do(G, T, R) });
    }
    ev.sort((x, y) => x.f - y.f);
    return ev;
  }

  /**
   * Many systems keep their own shader clock (grass sway, foliage wind, water, sky drift: `uniform.value += dt`), which
   * has run for however long loading took. Set every numeric uniform whose name says "time" to one fixed value.
   * Finds them through the renderer's material properties, so uniforms added in onBeforeCompile are included.
   */
  R.resetTimeUniforms = (v = 100) => {
    const seen = new Set(), names = new Set();
    const props = G.renderer.properties;
    const visit = (u) => {
      if (!u) return;
      for (const k of Object.keys(u)) {
        const x = u[k];
        if (!x || seen.has(x) || typeof x.value !== 'number' || !/time/i.test(k) || /scale|speed|rate|dur|start|life|fade/i.test(k)) continue;
        seen.add(x); x.value = v; names.add(k);
      }
    };
    G.scene.traverse((o) => {
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) { visit(m.uniforms); try { visit(props.get(m).uniforms); } catch (e) { /* not compiled yet */ } }
    });
    return [...names].sort();
  };

  // ---------------------------------------------------------------- plan + record
  R.plan = (over = {}) => {
    const s = window.__rigShot;
    if (!s) throw new Error('no shot loaded');
    const plan = {
      name: s.name, frames: over.frames ?? s.frames, preroll: over.preroll ?? s.preroll ?? 60, seed: over.seed ?? s.seed ?? 1,
      blur: Math.max(1, Math.round(over.blur ?? s.blur ?? 1)), shutter: s.shutter ?? 0.5, camera: s.camera ?? 'game',
      capture: over.capture || s.capture || 'canvas', sink: over.sink || null, down: over.down || 1,
    };
    R._plan = plan;
    return { frames: plan.frames, preroll: plan.preroll, seed: plan.seed, blur: plan.blur };
  };

  const grabScreen = (frame, sub) => new Promise((res, rej) => {
    window.__rigGrabDone = (r) => (r.ok ? res() : rej(new Error('grab failed: ' + r.err)));
    window.__rigGrab(JSON.stringify({ frame, sub }));
  });
  const postCanvas = async (frame, sub) => {
    if (!pixReady) throw new Error(`frame ${frame}: nothing was drawn this step (game paused or not rendering?)`);
    pixReady = false;
    const r = await window.__rigFetch(`${R._plan.sink}?frame=${frame}&sub=${sub}`, { method: 'POST', body: pix });
    if (!r.ok) throw new Error('sink: ' + (await r.text()));
  };
  /** one captured step: simulate ms, then hand the picture to capture.mjs; returns [stepMs, presentMs, grabMs] */
  async function shoot(ms, frame, sub) {
    const rt = C.realPerfNow;
    const canvas = R._plan.capture !== 'screen';
    if (canvas) R._readNext = true;
    const a = rt(); await C.step(ms); const b = rt();
    if (canvas) { await postCanvas(frame, sub); return [b - a, 0, rt() - b]; }
    await C.present(); const c = rt();
    await grabScreen(frame, sub);
    return [b - a, c - b, rt() - c];
  }

  R.record = async (over = {}) => {
    const s = window.__rigShot;
    const plan = R._plan || R.plan(over);
    const rt = C.realPerfNow;
    const info = {};
    // a clean start that does not depend on how long loading took
    C.seed(plan.seed);
    R.hide('cards'); // place-name cards pop on region change; shots opt back in with R.cards(true)
    const tSetup = rt();
    if (s.setup) await s.setup(G, T, R);
    info.settleFrames = await R.settle(s.settle || {});
    // reset the clocks the world animates by (water, wind, sky, shaders) to fixed values, and the random sequence
    G.time.t = 10000; G.time.real = 10000; G.time.frame = 1 << 20;
    if (G.state) G.state.playTime = 10000;
    C.vNow = (Math.floor(C.vNow / 3.6e7) + 1) * 3.6e7; // next whole 10 h of page time: forward only, same value every take
    C.dateBase = Date.UTC(2026, 10, 14, 6, 0, 0) - C.vNow;
    if (s.keepFx !== true) { // ambient motes and small creatures respawn from the seed instead of carrying loading-time state
      try { G.fx?.clear?.(); if (G.fx?.ambient) G.fx.ambient.acc = 0; } catch (e) { /* optional */ }
      try { G.life?.clear?.(); } catch (e) { /* optional */ }
    }
    info.timeUniforms = R.resetTimeUniforms(100);
    C.seed(plan.seed);
    if (s.start) await s.start(G, T, R); // last synchronous placement before the preroll (teleport, yaw, camera)
    info.setupMs = Math.round(rt() - tSetup);
    const events = expand(s.actions);
    let ei = 0;
    const firstF = -plan.preroll;
    while (ei < events.length && events[ei].f < firstF) events[ei++].fn(); // anything before the preroll: at once
    track.init = false;
    let stepMs = 0, presentMs = 0, grabMs = 0, n = 0;
    const tRec0 = rt();
    for (let f = firstF; f < plan.frames; f++) {
      while (ei < events.length && events[ei].f <= f) events[ei++].fn();
      if (R._keepFull) R.fill();
      if (f === 0 && plan.capture !== 'screen' && !hidden.has('all')) log('note: canvas capture records only the 3D picture; visible DOM overlays (HUD, cards) are not in it — use capture: "screen" to keep them');
      if (s.onFrame) await s.onFrame(f, G, T, R);
      const rec = f >= 0;
      const N = rec ? plan.blur : 1;
      if (N > 1) { // motion blur: the open part of the shutter is split in N captured sub-steps, the closed part is one step
        const open = FRAME * plan.shutter, gap = FRAME - open;
        camFrame = f - plan.shutter;
        if (gap > 0) await C.step(gap);
        for (let k = 0; k < N; k++) {
          camFrame = f - plan.shutter + (plan.shutter * (k + 1)) / N;
          const t = await shoot(open / N, f, k);
          stepMs += t[0]; presentMs += t[1]; grabMs += t[2];
        }
      } else if (rec) {
        camFrame = f;
        const t = await shoot(FRAME, f, 0);
        stepMs += t[0]; presentMs += t[1]; grabMs += t[2];
      } else { camFrame = f; await C.step(FRAME); }
      if (rec) n++;
      if (rec && (f % 60 === 59 || f === plan.frames - 1)) log(`frame ${f + 1}/${plan.frames}  ${Math.round((rt() - tRec0) / n)} ms/frame`);
    }
    camFrame = null;
    for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'Space', 'Mouse0', 'Mouse2']) T.key(k, false);
    const subs = n * plan.blur;
    return {
      timing: { stepMs: Math.round(stepMs / subs), presentMs: Math.round(presentMs / subs), grabRoundTripMs: Math.round(grabMs / subs), subFramesPerFrame: plan.blur, capture: plan.capture },
      info: { ...info, look: (() => { try { return { sky: G.sky.info, post: G.post.flags, quality: G.quality.name }; } catch (e) { return null; } })(), region: G.env.region, veil: +G.env.veil.toFixed(3), heroine: P() ? [P().pos.x, P().pos.y, P().pos.z].map((x) => +x.toFixed(3)) : null },
      errors: [...G.debug.errors(), ...C.errors],
    };
  };
})();
