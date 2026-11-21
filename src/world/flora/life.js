// Flora life: colliders, lazy element reactors near the heroine, burning trees, felling, shattering rocks and crystals,
// crystal resonance, removal by craters / burns (plants regrow), springy giant mushroom caps.
import * as THREE from 'three';
import { flat, glow as glowMat } from '../../core/mats.js';
import { Batch, buildModelParts } from './batches.js';
import { SPECIES } from './species.js';
import { smoothstep, clamp } from '../../core/util.js';

const REG_R = 52, UNREG_R = 66, MAX_REG = 320;
const CHAR0 = [0.05, 0.035, 0.03], CHAR1 = [0.17, 0.14, 0.13];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _ax = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();

export function createLife(ctx) {
  const { G, S, species, writeInstance, CH, NC, ORG, chunkNear } = ctx;
  // every hide also drops the instance's bounce pad + cap platform (fix2: pads stay in step with removed mushrooms)
  const padOf = new Map(); // instance id -> pad
  function hideInstance(i) {
    ctx.hideInstance(i);
    const pad = padOf.get(i);
    if (pad) {
      padOf.delete(i);
      const k = bouncePads.indexOf(pad); if (k >= 0) bouncePads.splice(k, 1);
      if (pad.platform) pad.platform.dead = true;
    }
  }
  const W = G.world;
  const isTree = (i) => { const k = species[S.sp[i]].def.kind; return k === 'tree'; };
  const kindOf = (i) => species[S.sp[i]].def.kind;
  const defOf = (i) => species[S.sp[i]].def;
  const modelOf = (i) => species[S.sp[i]].model;

  // slot -> instance per species (to walk a chunk's range)
  for (const sp of species) sp.inst = new Int32Array(sp.n);
  for (let i = 0; i < S.n; i++) species[S.sp[i]].inst[S.slot[i]] = i;

  // ---- colliders, platforms on mushroom caps, bounce pads
  const colliders = new Map(); // i -> collider
  const bouncePads = [];
  let nCol = 0;
  for (let i = 0; i < S.n; i++) {
    const sp = species[S.sp[i]], d = sp.def, m = sp.model, s = S.s[i];
    const x = S.x[i], y = S.y[i], z = S.z[i];
    if (d.kind === 'tree' || d.kind === 'shroom') {
      const r = (d.trunkR || 0.3) * s;
      const top = y + m.height * s;
      if (d.kind === 'shroom') {
        const capY = y + m.box.max.y * s;
        const capR = Math.min(m.box.max.x - m.box.min.x, m.box.max.z - m.box.min.z) * 0.5 * s;
        colliders.set(i, W.addCollider({ x, z, r, y0: y - 1, y1: capY - 1.2, tag: 'flora' }));
        const platform = W.addPlatform({ x, z, r: capR * 0.55, top: capY - 0.15, thick: 1.0, tag: 'flora-cap' });
        const pad = { pos: new THREE.Vector3(x, capY - 0.15, z), radius: capR * 0.7, power: 15 + Math.min(8, capR * 1.5), id: i };
        Object.defineProperty(pad, 'platform', { value: platform, enumerable: false });
        bouncePads.push(pad); padOf.set(i, pad);
      } else colliders.set(i, W.addCollider({ x, z, r, y0: y - 1, y1: top, tag: 'flora' }));
      nCol++;
    } else if ((d.kind === 'rock' || d.kind === 'crystal') && (d.solid || d.breakable)) {
      const bw = Math.min(m.box.max.x - m.box.min.x, m.box.max.z - m.box.min.z) * 0.5 * s;
      if (bw < 0.45) continue;
      colliders.set(i, W.addCollider({ x, z, r: bw * 0.8, y0: y - 1, y1: y + m.height * s, tag: 'flora' }));
      nCol++;
    }
  }

  // ---- hidden plants that grow back
  const regrow = []; // { i, t }
  const handles = new Map();
  const reactors = new Map(); // i -> Reactor
  const anims = [];           // felling / fading / resonance
  const burn = new Map();     // i -> { p, burnTime, o0, o1, wt }
  let lastBlast = null;
  // 'element:applied' fires before apply() looks for reactors: register what stands inside the blast right now
  G.events.on('element:applied', (e) => {
    lastBlast = e;
    try { if (e?.pos) registerAround(e.pos.x, e.pos.z, (e.radius || 1) + 5); } catch (err) { G.reportError('flora:applied', err); }
  });
  function registerAround(x, z, r) {
    if (!G.elements?.register) return;
    each(x, z, r, (i, sp) => {
      const k = sp.def.kind;
      if (k === 'tree' || ((k === 'rock' || k === 'crystal') && sp.def.breakable)) register(i);
    });
  }

  function handle(i) {
    let h = handles.get(i);
    if (!h) {
      const m = modelOf(i);
      h = {
        id: i, key: species[S.sp[i]].key, pos: new THREE.Vector3(S.x[i], S.y[i], S.z[i]),
        height: m.height * S.s[i], radius: Math.max(m.crown.rx, m.crown.rz) * S.s[i],
        get burning() { return !!reactors.get(i)?.burning; }, get charred() { return S.state[i] === 2; }, get felled() { return S.state[i] === 3; },
      };
      handles.set(i, h);
    }
    return h;
  }
  const idOf = (t) => (typeof t === 'number' ? t : t?.id);

  // ---- iterate instances of given kinds in chunks overlapping a circle
  function each(x, z, r, fn) {
    const c0x = Math.max(0, Math.floor((x - r - ORG) / CH)), c1x = Math.min(NC - 1, Math.floor((x + r - ORG) / CH));
    const c0z = Math.max(0, Math.floor((z - r - ORG) / CH)), c1z = Math.min(NC - 1, Math.floor((z + r - ORG) / CH));
    const r2 = r * r;
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      const c = cx + cz * NC, near = chunkNear[c];
      if (!near) continue;
      for (const si of near) {
        const sp = species[si], b = sp.batch, s0 = b.cStart.get(c), k = b.cCount.get(c);
        for (let j = s0; j < s0 + k; j++) {
          const i = sp.inst[j];
          const dx = S.x[i] - x, dz = S.z[i] - z;
          if (dx * dx + dz * dz <= r2) fn(i, sp);
        }
      }
    }
  }

  // ---- colours while burning
  function setCol(i, c0, c1, glowAmt, hue, crown) {
    for (let j = 0; j < 3; j++) { if (c0) S.c0[i * 3 + j] = c0[j]; if (c1) S.c1[i * 3 + j] = c1[j]; }
    if (glowAmt != null) S.fx[i * 4] = glowAmt;
    if (hue != null) S.fx[i * 4 + 1] = hue;
    if (crown != null) S.fx[i * 4 + 3] = crown;
    if (S.state[i] !== 3 && S.state[i] !== 1) writeInstance(i);
  }
  const lerp3 = (a, b, t, out) => { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; return out; };
  const tc0 = [0, 0, 0], tc1 = [0, 0, 0];

  // ---- reactors
  function register(i) {
    const El = G.elements;
    if (!El?.register || reactors.size >= MAX_REG * 1.5 || reactors.has(i) || S.state[i] === 1 || S.state[i] === 3) return;
    const d = defOf(i), m = modelOf(i), s = S.s[i];
    const pos = new THREE.Vector3(S.x[i], S.y[i], S.z[i]);
    let r;
    if (d.kind === 'tree') {
      const H = m.height * s;
      r = El.register({
        owner: handle(i), kind: 'tree', material: 'wood', pos, radius: clamp(Math.max(m.crown.rx, m.crown.rz) * s * 0.7, 0.8, 4), height: H,
        burnTime: 14 + H * 1.2, team: 'neutral',
        on: {
          ignite: () => startBurn(i),
          burnTick: (rr, dt) => burnTick(i, dt),
          burnout: () => burnOut(i),
          extinguish: () => { const b = burn.get(i); if (b) setCol(i, null, null, 0, 1, null); },
          hit: (rr, el, power, info) => onTreeHit(i, el, power, info),
        },
      });
      if (S.state[i] === 2) { r.charred = true; }
    } else if (d.kind === 'rock' || d.kind === 'crystal') {
      if (!d.breakable) return;
      const bw = Math.max(m.box.max.x - m.box.min.x, m.box.max.z - m.box.min.z) * 0.5 * s;
      r = El.register({
        owner: handle(i), kind: 'structure', material: d.kind === 'crystal' ? 'crystal' : 'stone', pos, radius: Math.max(0.6, bw), height: m.height * s, team: 'neutral',
        on: {
          shatter: (rr, info) => { shatter(i, info); },
          light: (rr, power) => { if (d.kind === 'crystal') resonate(i, power); },
          hit: (rr, el, power, info) => {
            if (S.state[i] === 3) return;
            if ((el === 'earth' && (power >= 1.1 || info?.heavy)) || (info?.heavy && el !== 'water')) shatter(i, info);
            else if (el === 'sun' && d.kind === 'crystal') resonate(i, power);
          },
        },
      });
    } else return;
    if (r) reactors.set(i, r);
  }
  const pendingUnreg = [];
  function unregister(i) {
    const r = reactors.get(i);
    if (!r) return;
    reactors.delete(i);
    pendingUnreg.push(r);
  }

  // ---- burning
  function startBurn(i) {
    if (!burn.has(i)) {
      burn.set(i, { p: 0, wt: 0, o0: [S.c0[i * 3], S.c0[i * 3 + 1], S.c0[i * 3 + 2]], o1: [S.c1[i * 3], S.c1[i * 3 + 1], S.c1[i * 3 + 2]], g0: S.fx[i * 4], h0: S.fx[i * 4 + 1] });
    }
    setCol(i, null, null, 0.9, 1, null);
  }
  function burnTick(i, dt) {
    const b = burn.get(i);
    if (!b) return;
    const r = reactors.get(i);
    const bt = r ? r.burnTime || 20 : 20;
    b.p = Math.min(1, b.p + dt / bt);
    b.wt += dt;
    if (b.wt < 0.12) return;
    b.wt = 0;
    const k = smoothstep(0, 0.85, b.p);
    lerp3(b.o0, CHAR0, k, tc0); lerp3(b.o1, CHAR1, smoothstep(0.2, 1, b.p), tc1);
    const flick = 0.75 + 0.25 * Math.sin(G.time.t * 13 + i);
    setCol(i, tc0, tc1, (0.6 + 0.8 * k) * flick * (1 - smoothstep(0.8, 1, b.p)), 1, 1 - smoothstep(0.5, 1, b.p) * 0.92);
  }
  function burnOut(i) {
    burn.delete(i);
    if (S.state[i] === 0) S.state[i] = 2;
    setCol(i, CHAR0, CHAR1, 0, 1, 0);
    G.fx?.burst?.('embers', _v.set(S.x[i], S.y[i] + modelOf(i).crown.cy * S.s[i], S.z[i]));
  }

  // ---- felling
  function onTreeHit(i, el, power, info) {
    if (S.state[i] === 3) return;
    const strong = (el === 'thunder' && (info?.split || power >= 0.6)) || (el === 'earth' && power >= 0.9) || info?.heavy ||
      (el === 'fire' && power >= 2.2) || (el === 'wind' && power >= 1.6);
    if (!strong) return;
    let dir = null;
    if (info?.dir && (el === 'wind')) dir = _v2.copy(info.dir);
    else if (lastBlast?.pos) dir = _v2.set(S.x[i] - lastBlast.pos.x, 0, S.z[i] - lastBlast.pos.z);
    fell(i, dir);
  }
  function fell(tree, dir) {
    const i = idOf(tree);
    if (i == null || i < 0 || i >= S.n || !isTree(i) || S.state[i] === 3 || S.state[i] === 1) return false;
    const d = new THREE.Vector3(dir?.x ?? 0, 0, dir?.z ?? 0);
    if (d.lengthSq() < 1e-6) { const a = Math.random() * Math.PI * 2; d.set(Math.cos(a), 0, Math.sin(a)); }
    d.normalize();
    S.state[i] = 3;
    const col = colliders.get(i);
    if (col) col.dead = true;
    const H = modelOf(i).height * S.s[i];
    anims.push({ type: 'fell', i, t: 0, dur: 1.1 + H * 0.06, dir: d, H, landed: false });
    G.fx?.burst?.('wood_break', _v.set(S.x[i], S.y[i] + 1.2, S.z[i]));
    G.audio?.sfx?.('wood_break', { pos: _v });
    addStump(i);
    return true;
  }
  function fellMatrix(i, ang, dir, sink, k) {
    _e.set(S.tx[i], S.rot[i], S.tz[i]); _q.setFromEuler(_e);
    _ax.set(dir.z, 0, -dir.x).normalize();
    _q2.setFromAxisAngle(_ax, ang);
    _q.premultiply(_q2);
    return _m.compose(_v.set(S.x[i], S.y[i] + 0.3 - sink, S.z[i]), _q, _s.setScalar(S.s[i] * k));
  }

  // dynamic stumps (one shared small batch)
  let stumps = null, stumpN = 0;
  const STUMP_CAP = 48;
  function addStump(i) {
    if (stumps === null) {
      const model = (() => { try { return buildModelParts(G, SPECIES.stump); } catch (e) { return null; } })();
      if (!model) { stumps = false; return; }
      stumps = new Batch(G, model, STUMP_CAP, STUMP_CAP, { name: 'stumps', flex: 0, castShadow: true, dist: 120 });
      stumps.setRanges(new Map([['dyn', 0]]), new Map([['dyn', 0]]));
      ctx.addExtra?.(stumps);
    }
    if (!stumps) return;
    const slot = stumpN % STUMP_CAP;
    stumpN++;
    const s = clamp((defOf(i).trunkR || 0.3) * S.s[i] / 0.45, 0.5, 1.8);
    _q.setFromEuler(_e.set(0, S.rot[i], 0));
    _m.compose(_v.set(S.x[i], S.y[i] + 0.1, S.z[i]), _q, _s.set(s, s * 0.9, s));
    const st = S.state[i];
    const c1 = st === 2 || burn.has(i) ? CHAR1 : [S.c1[i * 3], S.c1[i * 3 + 1], S.c1[i * 3 + 2]];
    stumps.set(slot, _m, [0.35, 0.5, 0.25], c1, [0, 0, 0, 1]);
    stumps.cCount.set('dyn', Math.min(STUMP_CAP, stumpN));
    ctx.markDirty();
  }

  function landTree(a) {
    const i = a.i;
    a.landed = true;
    const tip = _v.set(S.x[i] + a.dir.x * a.H * 0.6, S.y[i] + 0.8, S.z[i] + a.dir.z * a.H * 0.6);
    tip.y = W.heightAt(tip.x, tip.z) + 0.8;
    G.fx?.burst?.('dust', tip, { scale: 1.6 });
    if (S.state[i] !== 2 && !burn.has(i)) G.fx?.burst?.('leaves', tip, { scale: 1.4 });
    G.fx?.shake?.(0.25, 0.3);
    G.audio?.sfx?.('rock_fall', { pos: tip, vol: 0.7, pitch: 0.7 });
    const r = reactors.get(i);
    if (r) { r.pos.set(S.x[i] + a.dir.x * a.H * 0.35, W.heightAt(S.x[i] + a.dir.x * a.H * 0.35, S.z[i] + a.dir.z * a.H * 0.35), S.z[i] + a.dir.z * a.H * 0.35); r.height = 1.6; r.moved?.(); }
    if (G.props?.spawn) {
      const yaw = Math.atan2(a.dir.x, a.dir.z);
      const n = a.H > 7 ? 2 : 1;
      let ok = 0;
      for (let k = 0; k < n; k++) {
        const f = n === 1 ? 0.35 : 0.22 + k * 0.32;
        const px = S.x[i] + a.dir.x * a.H * f, pz = S.z[i] + a.dir.z * a.H * f;
        try {
          const p = G.props.spawn('log', new THREE.Vector3(px, W.heightAt(px, pz) + 0.7, pz), { rot: yaw, yaw, burning: !!reactors.get(i)?.burning });
          if (p) ok++;
        } catch (e) { G.reportError('flora:log', e); }
      }
      if (ok) { a.type = 'vanish'; a.t = 0; a.dur = 0.5; return; }
    }
    a.type = 'lie'; a.t = 0; a.dur = 14;
  }

  // ---- rocks / crystals
  let debrisGeo = null;
  function shatter(id, info) {
    const i = idOf(id);
    if (i == null || S.state[i] === 3 || S.state[i] === 1) return false;
    const d = defOf(i);
    if (!d.breakable) return false;
    S.state[i] = 3;
    hideInstance(i);
    const col = colliders.get(i); if (col) col.dead = true;
    unregister(i);
    ctx.markDirty();
    const m = modelOf(i), s = S.s[i];
    const cy = S.y[i] + m.height * s * 0.45;
    const at = new THREE.Vector3(S.x[i], cy, S.z[i]);
    const crystal = d.kind === 'crystal';
    G.fx?.burst?.(crystal ? 'shatter_ice' : 'shatter_rock', at, { scale: Math.max(1, m.height * s * 0.6) });
    G.audio?.sfx?.(crystal ? 'crystal_chime' : 'rock_crumble', { pos: at });
    if (G.physics?.add) {
      debrisGeo = debrisGeo || new THREE.IcosahedronGeometry(1, 0);
      const size = Math.max(0.18, m.height * s * 0.22);
      const n = Math.min(7, 3 + Math.floor(m.height * s * 1.5));
      const night = W.veilAt(S.x[i], S.z[i]);
      const mat = crystal ? glowMat(0x9fd8ff, 1.6) : flat(night > 0.6 ? 0x4c4f66 : night > 0.2 ? 0x8a7a80 : 0x9a99a2);
      for (let k = 0; k < n; k++) {
        const mesh = new THREE.Mesh(debrisGeo, mat);
        const sc = size * (0.6 + Math.random() * 0.7);
        mesh.scale.set(sc, sc * (0.6 + Math.random() * 0.5), sc * (0.7 + Math.random() * 0.4));
        mesh.castShadow = true;
        const a = (k / n) * Math.PI * 2 + Math.random();
        const p = new THREE.Vector3(at.x + Math.cos(a) * size, cy + (Math.random() - 0.3) * size * 2, at.z + Math.sin(a) * size);
        mesh.position.copy(p);
        G.scene.add(mesh);
        try {
          G.physics.add({
            mesh, shape: 'hull', pos: p, type: 'dynamic', material: crystal ? 'crystal' : 'stone', group: 'debris', lifetime: 5 + Math.random() * 3,
            vel: { x: Math.cos(a) * (2 + Math.random() * 3), y: 2 + Math.random() * 4, z: Math.sin(a) * (2 + Math.random() * 3) },
          });
        } catch (e) { G.scene.remove(mesh); G.reportError('flora:debris', e); }
      }
    }
    G.events.emit('prop:broken', { type: crystal ? 'crystal' : 'rock', pos: at, by: info?.source || null });
    return true;
  }
  function resonate(i, power = 1) {
    if (S.state[i] === 3) return;
    const ex = anims.find((a) => a.type === 'chime' && a.i === i);
    if (ex) { ex.t = Math.min(ex.t, 0.3); return; }
    anims.push({ type: 'chime', i, t: 0, dur: 3.2, g0: S.fx[i * 4], k: Math.min(2, power) });
    G.audio?.sfx?.('crystal_chime', { pos: _v.set(S.x[i], S.y[i] + 1, S.z[i]), pitch: 0.85 + (S.fx[i * 4 + 1] || 0) * 0.5 });
    G.fx?.burst?.('spark', _v, { color: 0xbfe8ff });
  }

  // ---- removal
  function removeInRadius(x, z, r, opts = {}) {
    let n = 0;
    const regrowT = opts.regrow ?? 0;
    each(x, z, r, (i, sp) => {
      const k = sp.def.kind;
      if (S.state[i] === 1 || S.state[i] === 3) return;
      if (opts.plantsOnly && k !== 'plant') return;
      if (k === 'plant' && regrowT > 0) { S.state[i] = 1; regrow.push({ i, t: regrowT * (0.8 + Math.random() * 0.4) }); }
      else S.state[i] = 3;
      hideInstance(i);
      const col = colliders.get(i); if (col) col.dead = true;
      unregister(i);
      n++;
    });
    if (n) ctx.markDirty();
    return n;
  }
  const scarPlants = new Map();
  const basinOriginal = new Map();
  let lakeSubmerged = 0;
  function updateLake(e) {
    lakeSubmerged=0;
    // Only this survey changes. Remember the exact pre-event root heights and
    // live states, so resetting a run also restores both near and far batches.
    if(e.active){
      each(e.x,e.z,e.r,(i,sp)=>{
        const x=S.x[i],z=S.z[i];
        if(x<e.x0||x>e.x1||z<e.z0||z>e.z1)return;
        const h=W.heightAt(x,z),drop=h-W.baseHeightAt(x,z);
        if(Math.abs(drop)<.015)return;
        const col=colliders.get(i),r=reactors.get(i);
        basinOriginal.set(i,{y:S.y[i],state:S.state[i],dead:col?.dead,offset:drop});
        S.y[i]+=drop;
        if(col){col.y0+=drop;col.y1+=drop;}
        if(handles.has(i))handles.get(i).pos.y=S.y[i];
        if(r){r.pos.y+=drop;r.moved?.();}
        if(sp.def.kind!=='rock' && h<.45) {
          S.state[i]=3;ctx.hideInstance(i);
          if(col)col.dead=true;
          unregister(i);burn.delete(i);
          lakeSubmerged++;
        }else if(S.state[i]!==1&&S.state[i]!==3)writeInstance(i);
      });
      for(let i=anims.length-1;i>=0;i--)if(basinOriginal.has(anims[i].i)&&S.state[anims[i].i]===3)anims.splice(i,1);
    }else{
      for(const [i,prev] of basinOriginal){
        const col=colliders.get(i),delta=prev.y-S.y[i];
        S.y[i]=prev.y;S.state[i]=prev.state;
        if(handles.has(i))handles.get(i).pos.y=prev.y;
        if(col){col.y0+=delta;col.y1+=delta;col.dead=prev.dead;}
        const r=reactors.get(i);if(r){r.pos.y+=delta;r.moved?.();}
        if(prev.state!==1&&prev.state!==3)writeInstance(i);
      }
      basinOriginal.clear();
    }
    ctx.grass?.refreshField();ctx.markDirty();
  }
  G.events.on('terrain:deformed', (e) => {
    try {
      if (!e || e.r == null) return;
      if(e.kind==='trialLake'){updateLake(e);return;}
      if(e.kind==='resetSpell'){
        each(e.x,e.z,e.r*1.25,(i)=>{
          const old=scarPlants.get(i);if(!old)return;
          S.state[i]=old.state;const col=colliders.get(i);if(col)col.dead=old.dead;
          if(old.state!==1 && old.state!==3)writeInstance(i);
          scarPlants.delete(i);
        });
        for(let i=anims.length-1;i>=0;i--)if(!scarPlants.has(anims[i].i) && anims[i].type==='fell' &&
          Math.hypot(S.x[anims[i].i]-e.x,S.z[anims[i].i]-e.z)<=e.r*1.25)anims.splice(i,1);
        ctx.grass?.refreshField();ctx.markDirty();return;
      }
      each(e.x,e.z,e.r*1.25,i=>{
        if(!scarPlants.has(i))scarPlants.set(i,{state:S.state[i],dead:colliders.get(i)?.dead});
      });
      if(e.kind==='restoreSpell'){
        removeInRadius(e.x,e.z,e.r*.85);
        each(e.x,e.z,e.r*1.25,(i,sp)=>{
          if(sp.def.kind==='tree' && S.state[i]!==3){S.state[i]=3;hideInstance(i);unregister(i);
            const col=colliders.get(i);if(col)col.dead=true;}
        });
        ctx.grass?.clear(e.x,e.z,e.r*1.05,900);ctx.markDirty();return;
      }
      // trees caught in the blast fall outward; everything inside the bowl is gone
      each(e.x, e.z, e.r * 1.25, (i, sp) => {
        if (sp.def.kind === 'tree' && S.state[i] !== 3 && Math.hypot(S.x[i] - e.x, S.z[i] - e.z) > e.r * 0.55) fell(i, _v2.set(S.x[i] - e.x, 0, S.z[i] - e.z));
      });
      removeInRadius(e.x, e.z, e.r * 0.85);
      ctx.grass?.clear(e.x, e.z, e.r * 1.05, 900);
    } catch (err) { G.reportError('flora:deformed', err); }
  });
  G.events.on('terrain:scorch', (e) => {
    if (e?.kind !== 'burn') return;
    removeInRadius(e.x, e.z, e.r, { plantsOnly: true, regrow: 150 });
    registerAround(e.x, e.z, e.r + 6); // a grass fire reaching a grove can catch its trees
  });

  // ---- per-frame
  let scanT = 0;
  const _fp = new THREE.Vector3();
  const nearFire = (i) => !!G.elements?.isBurningAt?.(S.x[i], S.z[i]);
  /** Springy squash of a giant mushroom (instance id = pad.id), k 0..1. */
  function squashPad(id, k = 1) {
    if (!padOf.has(id) || S.state[id] === 3) return false;
    const ex = anims.find((a) => a.type === 'squash' && a.i === id);
    if (ex) { ex.t = 0; ex.k = Math.max(ex.k * 0.5, k); return true; }
    anims.push({ type: 'squash', i: id, t: 0, dur: 0.75, k: Math.min(1, Math.max(0.1, k)) });
    return true;
  }
  function update(dt) {
    if (G.flora && !G.flora.squashPad) G.flora.squashPad = squashPad; // G.flora is assembled in world/flora.js
    while (pendingUnreg.length) { const r = pendingUnreg.pop(); try { G.elements?.unregister?.(r); } catch (e) { /* */ } }
    if (dt <= 0) return;
    // animations
    for (let k = anims.length - 1; k >= 0; k--) {
      const a = anims[k];
      a.t += dt;
      const i = a.i;
      if (a.type === 'fell') {
        const u = Math.min(1, a.t / a.dur);
        const ang = (u * u * (1.6 - 0.6 * u)) * 1.42;
        writeInstance(i, fellMatrix(i, ang, a.dir, 0, 1));
        if (u >= 1) { landTree(a); if (a.type === 'lie' || a.type === 'vanish') continue; }
      } else if (a.type === 'lie') {
        const u = Math.min(1, a.t / a.dur);
        const k2 = u < 0.8 ? 1 : 1 - (u - 0.8) / 0.2;
        if (u < 1) writeInstance(i, fellMatrix(i, 1.42 + 0.04 * Math.sin(Math.min(1, a.t * 3) * Math.PI), a.dir, (1 - k2) * 0.8, Math.max(0.02, k2)));
        else { hideInstance(i); unregister(i); anims.splice(k, 1); }
      } else if (a.type === 'vanish') {
        const u = Math.min(1, a.t / a.dur);
        if (u < 1) writeInstance(i, fellMatrix(i, 1.42, a.dir, u * 0.5, Math.max(0.02, 1 - u)));
        else { hideInstance(i); unregister(i); anims.splice(k, 1); }
      } else if (a.type === 'squash') {
        const u = a.t / a.dur;
        if (S.state[i] === 3 || S.state[i] === 1) { anims.splice(k, 1); continue; }
        if (u >= 1) { writeInstance(i); anims.splice(k, 1); continue; }
        const w = a.k * Math.exp(-4 * u) * Math.cos(u * Math.PI * 3);
        _e.set(S.tx[i], S.rot[i], S.tz[i]); _q.setFromEuler(_e);
        const sc = S.s[i];
        writeInstance(i, _m.compose(_v.set(S.x[i], S.y[i], S.z[i]), _q, _s.set(sc * (1 + 0.16 * w), sc * (1 - 0.3 * w), sc * (1 + 0.16 * w))));
      } else if (a.type === 'chime') {
        const u = a.t / a.dur;
        S.fx[i * 4] = a.g0 + a.k * 1.6 * (1 - u) * (0.75 + 0.25 * Math.sin(a.t * 18));
        if (S.state[i] !== 3) writeInstance(i);
        if (u >= 1) { S.fx[i * 4] = a.g0; if (S.state[i] !== 3) writeInstance(i); anims.splice(k, 1); }
      }
    }
    // regrowth
    for (let k = regrow.length - 1; k >= 0; k--) {
      const g = regrow[k];
      g.t -= dt;
      if (g.t <= 0) { if (S.state[g.i] === 1) { S.state[g.i] = 0; writeInstance(g.i); ctx.markDirty(); } regrow.splice(k, 1); }
    }
    // lazy reactors around the heroine
    scanT -= dt;
    if (scanT <= 0 && G.elements?.register) {
      scanT = 0.35;
      _fp.copy(G.player?.pos || G.env.focus);
      for (const [i, r] of reactors) {
        if (r.burning || r.charred && burn.has(i) || anims.some((a) => a.i === i)) continue;
        if (Math.hypot(S.x[i] - _fp.x, S.z[i] - _fp.z) > UNREG_R && !nearFire(i)) unregister(i);
      }
      if (reactors.size < MAX_REG) {
        registerAround(_fp.x, _fp.z, REG_R);
      }
    }
  }

  function treesNear(pos, r) {
    const out = [];
    each(pos.x, pos.z, r, (i, sp) => { if (sp.def.kind === 'tree' && S.state[i] !== 3 && S.state[i] !== 1) out.push(handle(i)); });
    return out;
  }

  return {
    update, fell, shatter, removeInRadius, treesNear, bouncePads, squashPad,
    stats() {
      let trees = 0, rocks = 0, plants = 0;
      for (let i = 0; i < S.n; i++) { const k = kindOf(i); if (k === 'tree') trees++; else if (k === 'plant') plants++; else rocks++; }
      return { trees, plants, rocksEtc: rocks, lakeSubmerged, lakeResampled:basinOriginal.size, colliders: nCol, reactors: reactors.size, burning: burn.size, anims: anims.length, pads: bouncePads.length };
    },
  };
}
