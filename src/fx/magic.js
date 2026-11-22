// The look of magic on top of the spell system (no gameplay here — it only listens and draws):
//   · cast beats   'spell:cast' → release (flash, shock ring, light, the element's signature at the hand) and, on big
//                  casts, a ring of invented glyphs under her feet. Impact + aftermath beats live in recipes.js (kit shapes).
//   · projectiles  projStart / projDraw / projEnd (called by spells/projectiles.js): a shaped body per element —
//                  rolling fireball with a flame tail, thick water drop, faceted ice spike.
//   · beams        width / element palette / brightness of every live beam (the body is painted by fx.beam, bolts.js).
//   · struggle     对波 set piece: a churning two-colour mass, shock rings + grass flattening + visual gusts on every
//                  push, sideways arcs and sparks, ground cracks and dust, the sky graded toward the two sides
//                  (G.sky.setGrade), and on the end the loser's beam shattering back into a burst, a beat of quiet,
//                  then the loser's remains falling by element.
//   · reactions    'element:reaction' → a readable shape per reaction (steam columns, freeze crystals, charged arcs …).
// Emits 'fx:blast' { pos, radius } (visual only) for systems that want to bend grass / cloth with the struggle.
import * as THREE from 'three';
import { createCombustion } from './fireVolumes.js';
import { GRADES } from '../render/post.js';

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const COL = { fire: 0xff7a2a, water: 0x58c6ff, ice: 0xbfefff, wind: 0xb6f5d0, thunder: 0xb98cff, earth: 0xc49a6c, sun: 0xffd27a, moon: 0xb9a8ff, charm: 0xfff0c8 };
const RIVAL = 0xc87bff;
// vfx: comet trails of magic bullets — hot head colour, tail colour — by element
const CPAL = { fire: [0xffe2a0, 0xff6a1e], water: [0xeefaff, 0x2f9cf0], ice: [0xffffff, 0x6fd0ff], wind: [0xf4fff8, 0x46d69a], thunder: [0xffffff, 0x8f5cff],
  earth: [0xfff0d0, 0xc98a40], sun: [0xfff8e0, 0xffb648], moon: [0xffffff, 0x9a8cff], dark: [0xf0d8ff, 0x8a3cff] };
const _cA = new THREE.Color(), _cB = new THREE.Color();
const GLINT = { color: 0xffffff, scale: 1, grounded: false, count: 1 };
const LINGER = 0.45;      // a released charge circle waits this long for its cast before it folds away

export function installMagic(G, fx, X) {
  const kit = () => fx.kit;
  const camD = (p) => p.distanceTo(G.camera.position);
  const ground = (p) => X.ground(p.x, p.z, p.y);
  const q = () => Math.min(1, G.quality?.particles ?? 1);

  const combustion = createCombustion((o) => fx.shape(o), q);

  // ---- 1. cast beats ---------------------------------------------------------------------------------------------
  function feetOf(caster, out) {
    const p = caster?.pos || caster?.group?.position;
    if (!p) return null;
    out.set(p.x, 0, p.z); out.y = X.ground(p.x, p.z, p.y + 0.5) + 0.06;
    return out;
  }
  function onCast(e) {
    const K = kit(); if (!K || !e?.pos) return;
    const el = e.spell === 'charm' || e.spell === 'guard' || e.spell === 'shikigami' || e.spell === 'kinkan' ? 'sun' : e.spell;
    const big = e.form === 'big' || e.spell === 'shikigami' || e.spell === 'kinkan';
    if (e.spell === 'guard' && e.pos && camD(e.pos) < 60) {   // vfx: the ward snaps open in a ring of runes
      _d.copy(e.dir || UP).setY(0); if (_d.lengthSq() < 1e-4) _d.set(0, 0, 1); _d.normalize();
      _e.copy(e.pos).addScaledVector(_d, 0.55);
      fx.ward?.(_e, _d, { radius: 1.3, dur: 0.24, intensity: 1.1 });
      fx.circle?.(_e, { normal: _d, radius: 1.05, color: COL.sun, layers: 9, dur: 0.32, draw: 0.07, outDur: 0.16, out: 'flare', spin: 3, intensity: 1.15 });
      return;
    }
    if (e.spell === 'guard' || e.spell === 'charm') return;           // too frequent: they keep their own look
    const P = _a.copy(e.pos), D = _b.copy(e.dir || UP).normalize();
    if (camD(P) > 90) return;
    const col = COL[el] ?? 0xffffff;
    // vfx: the magic circle at the wand — a quick small one on a tap; on a charged cast the circle that grew there
    // flares out, or (no charge: rivals, scripted casts) a barrel of three circles blooms down the line of the cast
    if (!flareLinger(P, big)) castCircles(P, D, col, big);
    // release: a shock ring around the hand, facing the cast, and a short light
    K.shock(P, big ? 1.1 : 0.6, col, { up: D, dur: big ? 0.35 : 0.22, width: 0.3, I: 2 });
    fx.flash(P, col, big ? 40 : 14, big ? 0.3 : 0.16, big ? 9 : 5);
    switch (el) {
      case 'fire': combustion.bloom(P, D, big ? 0.58 : 0.29, false); break;
      case 'water': K.sheet(P, D, big ? 1.1 : 0.6, { dur: 0.35 }); break;
      case 'ice': K.frostBloom(P,.20,big?.60:.35,{dur:.43}); break;
      case 'wind': K.windWake(P,D,big?2.6:1.45,big?.80:.46,{dur:.32}); break;
      case 'thunder': for (let i = 0; i < (big ? 3 : 2); i++) { _c.set(rnd(-1, 1), rnd(-0.2, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(0.6, 1.3)).add(P); fx.lightning(P, _c, { impact: false, branches: 0, dur: 0.12, width: 0.1, intensity: 2 }); } break;
      case 'earth': break;
      case 'sun': K.petals(P, big ? 0.7 : 0.45, { up: D, n: 6, dur: 0.3, I: 1.2 }); break;
      case 'moon': K.crescents(P, big ? 0.9 : 0.6, { n: 1, dir: D, dur: 0.4 }); break;
    }
    // gather / sigil: a ring of glyphs under her for the big casts (and for every earth cast: it rises from the ground)
    if (big || el === 'earth') {
      const F = feetOf(e.caster, _c);
      const cp = e.caster?.pos || e.caster?.group?.position;
      if (F && (!cp || cp.y - F.y < 2.5)) {      // vfx: no ground circle far below a flier
        // vfx: the layered circle on the ground under her (the charge's own ground circle already flared, if any)
        if (!groundFlared) fx.circle(F, { radius: big ? 2.3 : 1.25, color: col, layers: big ? 15 : 9, dur: big ? 1.35 : 0.8, draw: big ? 0.22 : 0.14, out: 'fade', spin: big ? 1.1 : 1.6, intensity: big ? 1.15 : 1.0 });
        if (big) {
          K.shock(F, 2.6, col, { dur: 0.45, width: 0.1, I: 1.6, delay: 0.08 });
          fx.burst('dust_ring', F, { scale: 0.9 });          // vfx: the release kicks a ring of dust off the ground
          // hair and robe lift in the rush of the release; sparkle hangs in the air after it
          fx.duel?.gust(_e.set(F.x, F.y + 1, F.z), _d.set(-D.x * 0.55, 0.85, -D.z * 0.55), 11, 0.9, 3.2);
          fx.burst('sparkle_hang', P, { color: col, scale: 1 });
          if (e.caster === G.player) fx.duel?.shake('light');
          // a column of light rising through her
          fx.shape({ kind: 'cyl', pos: F, r0: 0.8, r1: 0.5, h: 2.2, dur: 0.5, grow: [0.6, 1.1], erode: [0.2, 0.95], tex: 'streak', tile: [6, 1], scroll: [0, -2.2],
            color: col, color2: 0xffffff, mode: 'glow', add: 0.8, I: 0.8, soft: 0.12, body: 0.3 });
        }
        if (el === 'earth') K.dustSkirt(F, 1.4, { dur: 1.1, h: 0.6 });
      }
    }
  }

  // ---- 1b. magic circles: the charge, its linger, the cast ----------------------------------------------------------
  // The charge emitter (spells.js) drives a circle growing at her wand (its layers drawing on one by one as the charge
  // builds), a ground circle under her from a third of the way, and a visual-only updraft that lifts her hair and robe.
  // When the charge ends the circles linger LINGER s: the cast that follows flares them out; otherwise they fold away.
  const LG = [];             // { h, ground, t }
  let groundFlared = false;
  function charge(em, dt, hex) {
    if (!em || !(dt > 0) || !fx.circle) return;
    const P = G.player;
    em.chargeT = (em.chargeT || 0) + dt;
    const k = Math.min(1, em.chargeT / 0.9);
    const col = hex >= 0 ? hex : 0xffe6a8;
    const D = _d;
    if (P?.aim?.dir && em.pos.distanceToSquared(P.pos) < 9) D.copy(P.aim.dir); else G.camera.getWorldDirection(D);
    if (D.lengthSq() < 1e-6) D.set(0, 0, 1);
    D.normalize();
    if (!em.circles) {     // once per charge
      const v = fx.circle(em.pos, { normal: D, radius: 0.45, color: col, handle: true, charge: 0, spin: 1.7, intensity: 1.45, layers: 15 });
      const onFoot = P && !P.onBroom && P.pos.y - ground(P.pos) < 1.5;
      const g = onFoot && em.pos.distanceToSquared(P.pos) < 9 ? fx.circle(P.pos, { ground: true, radius: 1.3, color: col, handle: true, charge: 0, spin: 0.8, intensity: 0.95, layers: 15 }) : null;
      em.circles = [v && v !== true ? v : null, g && g !== true ? g : null];
      if (P) em.gust = fx.duel?.gust(P.pos, UP, 2, Infinity, 2.6) || null;
    }
    const e = 1 - (1 - k) * (1 - k);
    const v = em.circles[0], g = em.circles[1];
    if (v) { v.pos.copy(em.pos).addScaledVector(D, 0.62 + 0.18 * e); v.pos.y += 0.06; v.normal.copy(D); v.radius = 0.42 + 0.48 * e; v.charge = k * 1.04; }
    if (g && P) { g.pos.set(P.pos.x, ground(P.pos) + 0.07, P.pos.z); g.radius = 1.25 + 1.05 * e; g.charge = Math.max(0, (k - 0.3) / 0.7) * 1.04; }
    if (em.gust) { em.gust.pos.copy(P ? P.pos : em.pos); em.gust.strength = 2 + 7 * e; }
    if (k >= 1 && !em.vfxFull) { em.vfxFull = true; v?.setIntensity(1.85); g?.setIntensity(1.15); }
  }
  function lingerCircle(h) {
    if (!h || h === true || !h.alive) return false;
    LG.push({ h, ground: h.normal.y > 0.97 && h.radius > 1, t: LINGER });
    return true;
  }
  /** A cast at P: flare the lingering charge circles near it. True when the wand circle flared (no new one needed). */
  function flareLinger(P, big) {
    let wand = false; groundFlared = false;
    for (let i = LG.length - 1; i >= 0; i--) {
      const it = LG[i];
      if (!it.h.alive) { LG.splice(i, 1); continue; }
      if (it.h.pos.distanceTo(P) > (it.ground ? 3.5 : 2.2)) continue;
      if (it.ground) { it.h.release('fade', 0.7); groundFlared = true; }
      else { it.h.release('flare', big ? 0.42 : 0.26); wand = true; }
      LG.splice(i, 1);
    }
    return wand;
  }
  function updateLinger(dt) {
    for (let i = LG.length - 1; i >= 0; i--) {
      const it = LG[i];
      it.t -= dt;
      if (!it.h.alive) { LG.splice(i, 1); continue; }
      if (it.t <= 0) { it.h.release('collapse', 0.22); LG.splice(i, 1); }
    }
  }
  /** Circles of an uncharged cast: one quick small circle, or (big) three down the line of the cast, largest first. */
  function castCircles(P, D, col, big) {
    if (!fx.circle) return;
    if (!big) {
      fx.circle(_e.copy(P).addScaledVector(D, 0.3), { normal: D, radius: 0.5, color: col, layers: 9, dur: 0.38, draw: 0.08, outDur: 0.17, out: 'flare', spin: 2.6, intensity: 1.5 });
      return;
    }
    for (let i = 0; i < 3; i++) {
      fx.circle(_e.copy(P).addScaledVector(D, 0.35 + i * 0.7), { normal: D, radius: [1.15, 0.8, 0.52][i], color: col, layers: [15, 3, 9][i], dur: 0.8 - i * 0.08,
        draw: 0.16, outDur: 0.32, out: 'flare', spin: i === 1 ? -2.2 : 1.6, intensity: 1.45, delay: i * 0.05 });
    }
  }

  // ---- 1c. comet trails: every magic bullet streams a long bright trail with a soft core, and sheds glints ----------------
  const GL = new Map();      // projectile -> { next, own trail | null }
  function comet(p) {
    const pal = CPAL[p.el]; if (!pal) return;
    const s = p.size || 0.4;
    const tr = p.trail;
    let own = null;
    const tail = typeof p.color === 'number' ? p.color : pal[1];     // the caster's own colour streams behind the hot head
    _cA.setHex(pal[0]); _cB.setHex(tail);
    if (tr && tr.restyle) {
      if (p.el !== 'fire' || p.shape !== 'orb') {    // the fireball keeps its own streaks under the flame tail
        tr.restyle({ style: 3, c0: _cA, c1: _cB, width: Math.max(tr.width || 0.2, s * 1.05), life: Math.min(0.75, Math.max(0.36, (tr.life || 0.25) * 2.6)), intensity: 1.7, taper: 0.7 });
      }
    } else if (!tr && fx.trail) {
      own = fx.trail({ style: 3, color: pal[0], color2: tail, width: s * 1.05, life: 0.45, intensity: 1.6, taper: 0.7, pos: p.pos });
    }
    GL.set(p, { next: 0, own, glint: tail });
  }

  // ---- 2. projectile bodies ----------------------------------------------------------------------------------------
  const PB = new Map();    // projectile -> [handles]
  function projStart(p) {
    if (!p) return;
    try { if (!GL.has(p)) comet(p); } catch (e) { G.reportError('fx.magic.comet', e); }
    if (!fx.shape || PB.has(p)) return;
    let hs = [];
    const s = p.size || 0.4;
    const base = { pos: p.pos, dur: 1, grow: [1, 1], handle: true };
    if (p.el === 'fire' && p.shape === 'orb') {
      hs = combustion.flight(p);
      X.fireLight(p);
    } else if (p.el === 'water' && p.shape === 'orb') {
      hs.push(fx.shape({ ...base, kind: 'sphere', r0: s * 1.2, h: s * 1.1, erode: [0.1, 0.1], tex: 'billow', tile: [2, 1.5], scroll: [1.2, -0.4],
        color: 0x2d8fe0, color2: 0xf2fbff, core: 0.75, mode: 'sheet', body: 0.7, I: 1.1, soft: 0.03 }));
      hs.push(fx.shape({ ...base, kind: 'tongue', r0: s * 0.8, h: s * 3.2, erode: [0.18, 0.18], tex: 'streak', tile: [2, 1], scroll: [0, -2.5],
        color: 0x3aa8f0, color2: 0xffffff, core: 0.8, mode: 'sheet', body: 0.55, I: 1.1, soft: 0.04, wobble: 10 }));
    } else if (p.el === 'ice' && p.shape === 'lance') {
      hs.push(fx.shape({ ...base, kind: 'frostPrism', r0: s * 0.54, h: s * 3.6, erode: [-0.3, -0.3], tex: 'cells', tile: [1, 1],
        color: 0x317bbc, color2: 0xe9ffff, core: 1, mode: 'sheet', body:.94, add: 0.08, I: 1.15, soft: 0.02 }));
    } else return;
    const list = hs.filter((h) => h && h !== true);
    if (list.length) PB.set(p, list);
  }
  function projDraw(p) {
    const gl = GL.get(p);
    if (gl) {
      gl.own?.push(p.pos);
      const t = G.time.t;
      if (t >= gl.next && p.pos.distanceToSquared(G.camera.position) < 2025) {
        gl.next = t + 0.045;
        GLINT.color = gl.glint; GLINT.scale = Math.max(0.6, (p.size || 0.4) * 2);
        fx.burst('bullet_glints', p.pos, GLINT);
      }
    }
    const hs = PB.get(p); if (!hs) return;
    const v = p.vel, l = v.length();
    if (l > 1e-4) _d.copy(v).divideScalar(l); else _d.set(0, 0, 1);
    for (let i = 0; i < hs.length; i++) {
      const h = hs[i];
      if (!h.alive) continue;
      h.pos.copy(p.pos);
      if (p.el === 'fire') { h.up.copy(_d).negate(); h.pos.addScaledVector(_d, (i === 0 ? 1.03 : 0.69) * p.size); }
      else if (p.el === 'ice') { h.up.copy(_d); h.pos.addScaledVector(_d, -(p.size || 0.4) * 2.2); }
      else if (i === 1) { h.up.copy(_d).negate(); h.pos.addScaledVector(_d, (p.size || 0.4) * 0.2); }   // tail streams back
      else h.up.set(0, 1, 0);
    }
  }
  function projEnd(p) {
    const gl = GL.get(p);
    if (gl) { gl.own?.stop(); GL.delete(p); }
    const hs = PB.get(p); if (!hs) return;
    for (const h of hs) h.kill?.(0.06);
    PB.delete(p);
  }

  // ---- 3. beams + 4. struggle -----------------------------------------------------------------------------------
  // The beam body is painted by fx.beam itself (bolts.js: element palette, outline, heart, rolling surface, root flare,
  // narrowed near the lens). Here: width / element / brightness per frame, and the struggle set piece.
  function updateBeams() {
    const arr = G.spells?.beams;
    if (!Array.isArray(arr)) return;
    const nk = 1 - 0.3 * Math.min(1, Math.max(0, G.env?.veil ?? 0));
    for (const b of arr) {
      const h = b.alive && b.fx; if (!h || !h.setWidth) continue;
      if (b.lookEl && h.el !== b.lookEl) h.setElement?.(b.lookEl);
      h.setWidth(b.struggling ? 1.15 * Math.pow(Math.max(0.5, b.power || 1), 0.25) : 0.8 * Math.sqrt(Math.max(0.3, b.power || 1)));   // locked beams read as equals
      h.setIntensity(nk);
    }
  }
  // sky tint: the grade hook of the sky (G.sky.setGrade) with a grade fx writes every frame: the land's own grade, its
  // vignette and shadow tone pulled toward the two sides' colours, a little darker at the edges
  const GR = GRADES.fxStruggle = JSON.parse(JSON.stringify(GRADES.sun));
  const tint = { k: 0, prev: undefined, on: false, a: new THREE.Color(), b: new THREE.Color() };
  const _g0 = JSON.parse(JSON.stringify(GRADES.sun));
  function mixGrade(A, B, t, out) {
    for (const key of Object.keys(A)) {
      const x = A[key], y = B[key] ?? x;
      if (Array.isArray(x)) for (let i = 0; i < x.length; i++) out[key][i] = x[i] + (y[i] - x[i]) * t;
      else out[key] = x + (y - x) * t;
    }
    return out;
  }
  function updateTint(dt, want) {
    tint.k += ((want ? 1 : 0) - tint.k) * Math.min(1, dt * (want ? 2.2 : 1.4));
    const sky = G.sky;
    if (!sky?.setGrade || !sky.state) return;
    if (tint.k < 0.01 && !want) {
      if (tint.on) { tint.on = false; sky.setGrade(tint.prev || 'auto'); }
      tint.k = 0; return;
    }
    if (!tint.on) { tint.prev = sky.state.grade; tint.on = true; }
    // the land grade the sky would use (same blend as world/sky.js), unless something else set a fixed grade
    const v = sky.info?.veil ?? G.env?.veil ?? 0;
    const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    if (tint.prev && GRADES[tint.prev]) mixGrade(GRADES[tint.prev], GRADES[tint.prev], 0, _g0);
    else if (v < 0.5) mixGrade(GRADES.sun, GRADES.dusk, sm(0.05, 0.5, v), _g0);
    else mixGrade(GRADES.dusk, GRADES.night, sm(0.5, 0.92, v), _g0);
    mixGrade(_g0, _g0, 0, GR);
    const k = tint.k;
    const m = _tc.copy(tint.a).lerp(tint.b, 0.5);
    const lum = Math.max(1e-3, (m.r + m.g + m.b) / 3);
    for (let i = 0; i < 3; i++) {
      const c = [m.r, m.g, m.b][i] / lum;                      // hue of the mix, unit brightness
      GR.vigCol[i] = _g0.vigCol[i] + (Math.min(1.2, 0.55 * c) - _g0.vigCol[i]) * k;
      GR.sh[i] = _g0.sh[i] * (1 + (c - 1) * 0.16 * k);
      GR.gain[i] = _g0.gain[i] * (1 + (c - 1) * 0.04 * k);
    }
    GR.vig = _g0.vig + 0.22 * k;
    GR.contrast = _g0.contrast + 0.04 * k;
    if (sky.state.grade !== 'fxStruggle') sky.setGrade('fxStruggle');
  }

  let st = null;       // struggle look state
  let after = null;    // the beat after a break: { t, pos, col, el }
  function onStruggle(e) {
    if (e?.state === 'start') {
      const s = G.spells?.struggle; if (!s) return;
      st = { s, t: 0, ring: 0, crack: 0, arc: 0, dust: 0, lastV: s.v, lastMash: 0, balls: [], a: new THREE.Vector3(), b: new THREE.Vector3(), p: new THREE.Vector3(),
        teamA: s.a.team, teamB: s.b.team, colA: colOf(s.a), colB: colOf(s.b), elA: s.a.lookEl, elB: s.b.lookEl, gustA: null, gustB: null, kick: 0 };
      tint.a.set(st.colA); tint.b.set(st.colB);
      const K = kit();
      if (K) {
        // the churning mass: each side's colour rolls on its own half, the two meet in a bright seam
        const ball = (r, col, rim, scroll, erode, add, I) => fx.shape({ kind: 'sphere', pos: s.pos, r0: r, h: r, dur: 1, grow: [1, 1], erode: [erode, erode], tex: 'billow', tile: [3, 2], scroll,
          color: col, color2: rim, core: 0.5, mode: 'flame', add, I, soft: 0.04, handle: true });
        st.balls = [
          ball(1.25, st.colA, lite(st.colA), [1.6, -2.4], 0.12, 0.15, 1.0),
          ball(1.25, st.colB, lite(st.colB), [-1.9, 2.0], 0.12, 0.15, 1.0),
          ball(0.95, st.colA, 0xffffff, [-2.6, -3.1], 0.3, 0.3, 0.9),
          ball(0.95, st.colB, 0xffffff, [2.8, 2.7], 0.3, 0.3, 0.9),
          fx.shape({ kind: 'sphere', pos: s.pos, r0: 0.45, h: 0.45, dur: 1, grow: [1, 1], erode: [-0.3, -0.3], tex: 'billow', tile: [2, 2], scroll: [0, -3],
            color: 0xfff1d6, color2: 0xffffff, mode: 'glow', add: 0.6, I: 0.55, soft: 0.25, handle: true }),
        ].filter((h) => h && h !== true);
        K.dome(s.pos, 4, lite(st.colA), { dur: 0.45, I: 1.1 });
        K.shock(s.pos, 6, st.colB, { up: _d.subVectors(s.b.origin, s.a.origin).normalize(), dur: 0.5, width: 0.1, I: 1.6 });
      }
      // a visual-only gust from the clash toward each caster: cloth, grass and motes whip, bodies never feel it
      const aw = G.elements?.addWind;
      if (aw) {
        st.gustA = aw({ kind: 'gust', visual: true, pos: s.pos, dir: _d.subVectors(s.a.origin, s.pos), radius: 10, strength: 9 });
        st.gustB = aw({ kind: 'gust', visual: true, pos: s.pos, dir: _d.subVectors(s.b.origin, s.pos), radius: 10, strength: 9 });
      }
    } else if (e?.state === 'end' && st) {
      endLook(e);
    }
  }
  function lite(c) { return _tc.set(c).lerp(_tw.set(0xffffff), 0.55).getHex(); }
  function colOf(b) { return b.lookColor ?? (b.team === 'player' ? COL.sun : RIVAL); }
  function dropGusts() { st?.gustA?.remove?.(); st?.gustB?.remove?.(); }
  function endLook(e) {
    const K = kit();
    for (const h of st.balls) h.kill(0.08);
    dropGusts();
    if (K && e.why !== 'stopped') {
      const toA = e.loser === st.teamA;
      const L = toA ? st.a : st.b, col = toA ? st.colA : st.colB, wcol = toA ? st.colB : st.colA, lel = toA ? st.elA : st.elB;
      // the loser's beam shatters backwards along its length into the loser: shards of its colour thrown off, the
      // winner's colour racing down the line behind them
      const n = 7;
      _d.subVectors(L, st.p);
      const len = _d.length(); _d.normalize();
      for (let i = 1; i <= n; i++) {
        _c.copy(st.p).addScaledVector(_d, (len * i) / n);
        const dl = i * 0.035;
        K.shock(_c, 1.1 + i * 0.2, col, { up: _d, dur: 0.28, width: 0.22, I: 1.6, delay: dl });
        fx.shape({ kind: 'sphere', pos: _c, r0: 0.7 + i * 0.1, h: 0.7 + i * 0.1, dur: 0.32, delay: dl, grow: [0.3, 1.3], erode: [0.05, 1], tex: 'billow', tile: [2, 2], scroll: [0, -1],
          color: wcol, color2: lite(wcol), core: 0.8, mode: 'flame', add: 0.3, I: 1.2, soft: 0.04 });
        fx.burst('struggle_spray', _c, { color: col, color2: col, dir: _d, scale: 0.8 });
        if (i % 2 === 0) K.mirrors(_c, 2, 1.1, { dur: 0.7 });
      }
      // the burst on the loser: a painted fireball of the winner's colour, a dome, a ground ring, scorch and cracks
      const bd = n * 0.035;
      fx.shape({ kind: 'sphere', pos: L, r0: 2.6, h: 2.6, dur: 0.95, delay: bd, grow: [0.25, 1.5], erode: [-0.1, 1], tex: 'billow', tile: [3, 2], scroll: [0.4, -1.4],
        color: wcol, color2: lite(wcol), core: 0.7, mode: 'flame', add: 0.25, I: 1.25, soft: 0.04 });
      fx.shape({ kind: 'sphere', pos: L, r0: 1.6, h: 1.6, dur: 0.7, delay: bd + 0.04, grow: [0.3, 1.3], erode: [0.1, 1], tex: 'billow', tile: [2, 2], scroll: [-0.8, 1.2],
        color: col, color2: lite(col), core: 0.6, mode: 'flame', add: 0.2, I: 1.1, soft: 0.04 });
      K.smoke(_e.copy(L).setY(L.y + 0.6), 1.4, { n: 3, dur: 2.2, rise: 2.2, delay: bd + 0.35 });
      K.dome(L, 6, wcol, { dur: 0.6, I: 1.0, delay: bd });
      _c.set(L.x, ground(L) + 0.1, L.z);
      K.shock(_c, 10, wcol, { dur: 0.7, width: 0.08, I: 1.6, delay: bd });
      K.mark(_c, 3.6, 'scorch', 12);
      K.mark(_c, 5, 'crack', 12);
      K.dustSkirt(_c, 4.5, { dur: 2.2, h: 1.8 });
      fx.burst('struggle_spray', L, { color: wcol, color2: col, dir: _d, scale: 1.6 });
      G.events.emit('fx:blast', { pos: L.clone(), radius: 10 });
      // a short visual gust out of the blast
      G.elements?.addWind?.({ kind: 'gust', visual: true, pos: L, dir: _e.set(0, 0.4, 0).sub(_d), radius: 12, strength: 14, duration: 0.9 });
      after = { t: 0, pos: L.clone(), col, el: lel, done: false };
    }
    st = null;
  }
  function updateAfter(dt) {
    if (!after) return;
    after.t += dt;
    // a beat of quiet, then the loser's remains fall: embers, drops, shards, petals by element
    if (!after.done && after.t > 0.85) {
      after.done = true;
      const P = _c.copy(after.pos); P.y += 2.6;
      const el = after.el;
      fx.burst(el === 'water' || el === 'ice' ? 'remains_drops' : 'remains', P, { color: after.col, scale: 1.2 });
      const K = kit();
      if (K) {
        const g = _e.set(after.pos.x, ground(after.pos) + 0.05, after.pos.z);
        if (el === 'ice') K.crystals(g, 6, 2.2, 0.6, { dur: 2.2, outward: 0.3 });
        else if (el === 'earth') K.shards(g, 6, 2.2, 0.7, { dur: 2.2 });
        else if (el === 'sun' || el === 'moon') K.petals(P, 1.6, { n: 8, dur: 1.2, col: after.col });
      }
    }
    if (after.t > 1.2) after = null;
  }
  function updateStruggle(dt) {
    const s = G.spells?.struggle;
    const K = kit();
    updateTint(dt, !!(st && s));
    updateAfter(dt);
    if (!st || !s || !K) return;
    st.t += dt;
    st.a.copy(s.a.origin); st.b.copy(s.b.origin); st.p.copy(s.pos);
    const P = s.pos;
    const axis = _d.subVectors(s.b.origin, s.a.origin); const AL = axis.length(); axis.divideScalar(Math.max(AL, 1e-3));
    const pulse = 1 + 0.12 * Math.sin(st.t * 17) + 0.08 * Math.sin(st.t * 31);
    // the mass churns: each colour bulges on its own side, pushed by the side that is winning
    const lead = Math.max(-1, Math.min(1, (s.v - st.lastV) * 60));
    const B = st.balls;
    for (let i = 0; i < B.length; i++) {
      const h = B[i]; if (!h.alive) continue;
      const sideA = i === 0 || i === 2;
      const ph = st.t * (7 + i * 2.3) + i * 1.7;
      const r = i < 2 ? 1.25 : i < 4 ? 0.95 : 0.45;
      const k = i < 4 ? (sideA ? pulse : 2.1 - pulse) * (1 + 0.1 * Math.sin(ph)) : pulse;
      h.pos.copy(P);
      if (i < 4) h.pos.addScaledVector(axis, (sideA ? -1 : 1) * (0.45 + 0.15 * Math.sin(ph) - 0.2 * lead * (sideA ? -1 : 1)));
      h.up.set(Math.sin(ph * 0.3), 1, Math.cos(ph * 0.37)).normalize();
      h.dims(r * k, undefined, r * k * (i < 4 ? 1.15 : 1));
    }
    // gusts follow the clash
    for (const [g, o] of [[st.gustA, s.a.origin], [st.gustB, s.b.origin]]) {
      if (!g || g.dead) continue;
      g.pos.copy(P); g.dir.subVectors(o, P).setY(0);
      if (g.dir.lengthSq() > 1e-4) g.dir.normalize(); else g.dir.set(1, 0, 0);
      g.dir.y = 0.15; g.dir.normalize();
      g.strength = 8 + 5 * (pulse - 1) * 5;
    }
    // a push (mash press or the clash point moving): a shock ring around the beam line, the grass flattens, a shake
    const dv = Math.abs(s.v - st.lastV); st.lastV = s.v;
    st.ring -= dt;
    const pushed = (s.mash || 0) > st.lastMash + 0.6; st.lastMash = s.mash || 0;
    const gy = ground(P);
    const low = P.y - gy < 6;
    if (st.ring <= 0 || pushed || dv > 0.02) {
      st.ring = 0.32;
      const side = Math.random() < 0.5;
      K.shock(P, rnd(2.4, 3.4), side ? st.colA : st.colB, { up: axis, dur: 0.36, width: 0.14, I: 1.7 });
      K.shock(P, rnd(1.4, 1.9), side ? st.colB : st.colA, { up: axis, dur: 0.26, width: 0.2, I: 1.4, delay: 0.05 });
      fx.shake(0.05 + Math.min(0.08, dv * 4), 0.25);
      if (low) G.events.emit('fx:blast', { pos: _c.set(P.x, gy, P.z).clone(), radius: 7 });
      if (st.gustA) st.gustA.strength = 16; if (st.gustB) st.gustB.strength = 16;
    }
    // arcs leap sideways in both colours
    st.arc -= dt;
    if (st.arc <= 0) {
      st.arc = 0.11 / Math.max(0.4, q());
      _e.set(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)); _e.addScaledVector(axis, -_e.dot(axis)).normalize();
      _c.copy(P).addScaledVector(_e, rnd(2.2, 4)).addScaledVector(axis, rnd(-1.2, 1.2));
      fx.lightning(P, _c, { color: Math.random() < 0.5 ? st.colA : st.colB, impact: false, branches: 1, dur: 0.14, width: 0.13, intensity: 1.5 });
    }
    // the ground under the clash cracks, dust rolls out
    st.crack -= dt; st.dust -= dt;
    if (low && st.crack <= 0) {
      st.crack = 0.5;
      _c.set(P.x, gy + 0.05, P.z);
      K.mark(_c, rnd(2.2, 3.2), 'crack', 9);
    }
    if (low && st.dust <= 0) {
      st.dust = 0.6;
      K.dustSkirt(_c.set(P.x, gy, P.z), rnd(2.6, 3.6), { dur: 1.6, h: 1.2 });
    }
  }
  const _tc = new THREE.Color(), _tw = new THREE.Color();

  // ---- 5. reactions -------------------------------------------------------------------------------------------------
  function onReaction(e) {
    const K = kit(); if (!K || !e?.pos) return;
    const P = _a.copy(e.pos);
    if (camD(P) > 110) return;
    const g = _b.set(P.x, ground(P) + 0.05, P.z);
    const pw = Math.min(2, Math.max(0.6, e.power || 1));
    switch (e.type) {
      case 'steam':
        K.smoke(P, 1.7 * pw, { n: 5, dur: 2.4, rise: 2.8, dark: 0xc9d4dc, light: 0xffffff, delay: 0 });
        K.whirl(P, 0.9 * pw, 3.2 * pw, { col: 0xf2f8ff, dur: 1.0, twist: 1.5, I: 0.9 });
        K.shock(P, 1.6, 0xffffff, { up: UP, dur: 0.35, width: 0.3, add: 0.3, I: 1.2 }); break;
      case 'melt':
        K.mark(g, 1.6, 'wet', 8); K.smoke(P, 0.7, { n: 2, dur: 1.6, rise: 2.6, dark: 0xe6edf2, delay: 0 }); break;
      case 'freeze':
        K.crystals(g, 7, 0.9 * pw, 1.3 * pw, { dur: 2.4, outward: 0.25, I: 1.15 });
        K.coldMist(g, 2.2); K.mark(g, 2.4, 'frost', 10);
        K.shock(g, 2.6, 0xd8f4ff, { dur: 0.45, width: 0.12 }); break;
      case 'ignite':
        combustion.bloom(g, UP, 0.66, false); combustion.soot(_c.copy(P).setY(P.y + 0.5), UP, 0.7, false); break;
      case 'extinguish':
        K.smoke(P, 0.9, { n: 3, dur: 2.4, rise: 3, dark: 0x8d8a90, delay: 0 }); K.mark(g, 1.4, 'wet', 6); break;
      case 'fan':   // wind feeds fire: a fire whirl
        K.whirl(g, 1.6 * pw, 4.5 * pw, { col: 0xff7a2a, dur: 1.8, twist: 5, I: 1.4, flame: true });
        K.tongues(g, 4, 0.9, 1.8, { dur: 1.1 }); K.smoke(_c.copy(g).setY(g.y + 3.5), 1.4, { n: 2, dur: 3, rise: 3.5 }); break;
      case 'shatter':
        K.crystals(P, 9, 1.4, 1.3, { dur: 0.7, outward: 1.6, delay: 0 }); K.coldMist(_c.copy(P).setY(ground(P) + 0.05), 1.8); K.shock(P, 2.2, 0xd8f4ff, { up: _c.subVectors(G.camera.position, P).normalize(), dur: 0.3 }); break;
      case 'purify':
        K.petals(P, 2.2, { n: 10, dur: 0.8, col: 0xffe39a }); K.glyphs(g, 2.4, 0xffd98a, { dur: 1.4 }); break;
      case 'resonate':
        K.shock(P, 2.4, 0xd9c8ff, { up: UP, dur: 0.6, width: 0.2, I: 2.4 }); K.shock(P, 3.6, 0xffffff, { up: UP, dur: 0.7, width: 0.12, I: 2, delay: 0.15 }); K.glyphs(g, 1.8, 0xd9c8ff, { dur: 1.4 });
        fx.shape({ kind: 'cyl', pos: g, r0: 0.7, r1: 0.35, h: 4.5, dur: 0.9, grow: [0.4, 1], erode: [0.15, 0.95], tex: 'streak', tile: [5, 1], scroll: [0, -2], color: 0xb9a8ff, color2: 0xffffff, mode: 'glow', add: 0.8, I: 1.2, soft: 0.1, body: 0.4 }); break;
      case 'conduct':   // charged water / metal: arcs crawl over the ground around it
        K.shock(g, 2.4 * pw, 0xb98cff, { dur: 0.4, width: 0.1, I: 2.4 });
        for (let i = 0; i < 4; i++) {
          const a0 = Math.random() * TAU, a1 = a0 + rnd(0.8, 1.8), r0 = rnd(0.5, 2), r1 = rnd(0.8, 2.6);
          _c.set(g.x + Math.cos(a0) * r0, g.y + 0.15, g.z + Math.sin(a0) * r0); _e.set(g.x + Math.cos(a1) * r1, g.y + 0.15, g.z + Math.sin(a1) * r1);
          fx.lightning(_c, _e, { color: 0xc9b0ff, impact: false, branches: 1, dur: 0.45, width: 0.14, intensity: 2.2 });
        }
        K.mark(g, 2.2 * pw, 'glow', 0.9); break;
      case 'thaw':      // the ice gives: drips, a breath of steam, a wet ring
        K.mark(g, 1.4, 'wet', 7); K.smoke(P, 0.6, { n: 1, dur: 1.4, rise: 1.6, dark: 0xdde8f0, light: 0xffffff, delay: 0 });
        K.crystals(g, 3, 0.6, 0.5, { dur: 0.6, outward: 0.9 }); break;
      case 'floe':      // water freezes over: a frost disc spreading, a few crystals, cold mist
        K.mark(g, 4.5, 'frost', 12); K.coldMist(g, 3.2); K.crystals(g, 4, 2.2, 0.7, { dur: 1.6, outward: 0.3 });
        K.shock(g, 4.2, 0xd8f4ff, { dur: 0.6, width: 0.08 }); break;
      case 'light':     // a lantern catches: a petal flower of light and a soft glow on the ground
        K.petals(P, 0.9, { n: 8, dur: 0.6, col: 0xffd27a }); K.mark(g, 1.6, 'glow', 1.2); break;
      case 'split':
        K.shards(g, 5, 1.0, 1.2, { dur: 0.9 }); K.mark(g, 2.2, 'crack', 9); K.dustSkirt(g, 2, { dur: 1.4 }); break;
    }
  }

  G.events.on('spell:cast', (e) => { try { onCast(e); } catch (err) { G.reportError('fx.magic.cast', err); } });
  G.events.on('element:reaction', (e) => { try { onReaction(e); } catch (err) { G.reportError('fx.magic.reaction', err); } });
  G.events.on('beam:struggle', (e) => { try { onStruggle(e); } catch (err) { G.reportError('fx.magic.struggle', err); } });

  return {
    combustion, hasBody: (p) => PB.has(p), projStart, projDraw, projEnd, charge, lingerCircle,
    update(dt) {
      if (!(dt > 0)) return;
      try { updateBeams(); updateStruggle(dt); updateLinger(dt); } catch (err) { G.reportError('fx.magic.update', err); }
    },
    clear() {
      if (st) { for (const h of st.balls) h.kill?.(0.01); dropGusts(); }
      PB.clear(); GL.clear(); LG.length = 0; st = null; after = null;
      tint.k = 0; if (tint.on) { tint.on = false; G.sky?.setGrade?.(tint.prev || 'auto'); }
    },
    rebase() {},
  };
}
