// life — ambient small life (docs/api/life.md). G.life. Purely visual: no colliders, no gameplay, no save state.
//  * life/meshes.js   five instanced bodies (bird, insect, frog: lit cel; fish, jelly: unlit) animated in the vertex shader
//  * life/kinds.js    the species and the groups they live in (where, when, how many, how they move)
// Groups are spawned around the heroine where the land suits them (veilAt at the spot picks the land), live while she
// is near and are recycled when she leaves. They scatter from her and from blasts (spell / element / impact events),
// drift with G.elements.windAt and settle again. Counts scale with G.quality (sparse on 'low'). `?nolife=1` = off.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { buildLifeMeshes } from './life/meshes.js';
import { KINDS, GROUPS, CAPS, landWeights } from './life/kinds.js';
import { createHerds } from './life/herds.js';
import { createCityLife } from './life/city-flyers.js'; // citylife round: witches on brooms + townsfolk in the City of Magic

const _o = new THREE.Object3D();
const _p = new THREE.Vector3(), _w = new THREE.Vector3();
let S = null;

function rnd(a, b) { return a + Math.random() * (b - a); }

export const lifeSystem = {
  name: 'life',
  pausable: true,

  async init(G) {
    const api = {
      enabled: false, root: null, groups: [], meshes: null,
      /** Show / hide everything (A/B checks). */
      setEnabled(on) { if (S) { S.on = !!on; S.root.visible = !!on; if (!on) clearAll(); } api.enabled = !!on; },
      /** Make everything near `pos` flee as from a blast of radius r (m). */
      scare(pos, r = 10, k = 1) { addThreat(pos.x, pos.y ?? 0, pos.z, r, k); },
      /** Spawn a group now (tests): kind id from life/kinds.js GROUPS, at (x, z) or the best spot near it. */
      spawn(id, x, z, force = false) { const g = GROUPS.find((q) => q.id === id); return g ? trySpawn(g, x, z, true, force) : null; },
      clear() { clearAll(); },
      stats() { return stats(); },
    };
    G.life = api;
    if (G.params?.nolife === '1') return;
    const q = G.quality || { name: 'high', particles: 1, density: 1 };
    const tier = q.name === 'low' ? 0.3 : q.name === 'med' ? 0.65 : 1;
    const caps = {};
    for (const k in CAPS) caps[k] = Math.max(4, Math.round(CAPS[k] * Math.max(0.5, tier)));
    const meshes = buildLifeMeshes(caps);
    const root = new THREE.Group();
    root.name = 'life';
    for (const k in meshes) root.add(meshes[k]);
    G.scene.add(root);
    S = { on: true, tier, root, meshes, groups: [], threats: [], spawnT: 0, time: 0, offs: [], fail: new Map() };
    api.root = root; api.meshes = meshes; api.groups = S.groups; api.enabled = true;
    // map round: deer, foxes, rabbits and sheep (instanced skinned herds, life/herds.js)
    try { S.herds = createHerds(G, root, tier); api.herds = S.herds; } catch (e) { G.reportError('life:herds', e); }
    // citylife round: the City of Magic (life/city-flyers.js, life/city-crowds.js); `?nocity=1` = off
    if (G.params?.nocity !== '1') { try { S.city = createCityLife(G, root, tier); api.city = S.city; } catch (e) { G.reportError('life:city', e); } }
    const ev = G.events;
    if (ev) {
      S.offs.push(ev.on('element:applied', (e) => e?.pos && addThreat(e.pos.x, e.pos.y, e.pos.z, 6 + (e.radius || 2) * 2.5, 1)));
      S.offs.push(ev.on('element:reaction', (e) => e?.pos && addThreat(e.pos.x, e.pos.y, e.pos.z, 14, 1.2)));
      S.offs.push(ev.on('spell:cast', (e) => e?.pos && addThreat(e.pos.x, e.pos.y, e.pos.z, 7, 0.7)));
      S.offs.push(ev.on('physics:impact', (e) => e?.pos && e.speed > 4 && addThreat(e.pos.x, e.pos.y, e.pos.z, 9, 1)));
      S.offs.push(ev.on('spell:meteor', (e) => e?.pos && addThreat(e.pos.x, e.pos.y, e.pos.z, 40, 1.5)));
      S.offs.push(ev.on('enemy:killed', (e) => e?.pos && addThreat(e.pos.x, e.pos.y, e.pos.z, 10, 1)));
      S.offs.push(ev.on('prop:broken', (e) => e?.pos && addThreat(e.pos.x, e.pos.y, e.pos.z, 8, 1)));
      S.offs.push(ev.on('player:land', (e) => { const p = G.player?.pos; if (p && e?.speed > 8) addThreat(p.x, p.y, p.z, 10, 1); }));
    }
  },

  update(dt) {
    if (!S || !S.on || dt <= 0) return;
    const t0 = performance.now();
    S.time += dt;
    const P = G.player?.pos || G.camera?.position;
    if (!P) return;
    // the heroine is a moving threat: bigger when she runs, flies on the broom or glides past
    const pl = G.player;
    const fast = pl ? (pl.onBroom || pl.gliding || pl.sprinting || (pl.speed || 0) > 6) : false;
    S.player = { x: P.x, y: P.y, z: P.z, yaw: pl?.yaw || 0, fast, speed: pl?.speed || 0, broom: !!pl?.onBroom };
    // threats age out
    for (let i = S.threats.length - 1; i >= 0; i--) if ((S.threats[i].t -= dt) <= 0) S.threats.splice(i, 1);
    // spawn / recycle
    S.spawnT -= dt;
    if (S.spawnT <= 0) { S.spawnT = 0.35; manage(P); }
    // simulate
    const ctx = { dt, time: S.time, P: S.player, threats: S.threats, windAt, ground, water: G.water, life: G.life };
    for (let i = S.groups.length - 1; i >= 0; i--) {
      const g = S.groups[i];
      try { g.def.update(g, ctx); } catch (e) { G.reportError('life:' + g.def.id, e); g.dead = true; }
      // fade in on spawn, out when the group is recycled or an agent hides (scale, so no transparency is needed)
      let alive = 0;
      for (const a of g.agents) {
        const target = g.leaving ? 0 : (a.sT ?? 1);
        a.s += Math.sign(target - a.s) * Math.min(Math.abs(target - a.s), dt * (a.fadeK || 1.2));
        if (a.s > 0.001) alive++;
      }
      if (g.leaving && !alive) g.dead = true;
      if (g.dead) { S.groups.splice(i, 1); }
    }
    if (S.herds) { try { S.herds.update(dt, S.player, S.threats); } catch (e) { G.reportError('life:herds', e); S.herds = null; } }
    if (S.city) { try { S.city.update(dt, S.player, S.threats); } catch (e) { G.reportError('life:city', e); S.city.clear(); S.city = null; } } // citylife round
    write();
    S.ms = S.ms ? S.ms * 0.95 + (performance.now() - t0) * 0.05 : performance.now() - t0;
  },
};

// ---- helpers shared with kinds.js through ctx ------------------------------------------------------------------------
function ground(x, z) { return G.world?.heightAt ? G.world.heightAt(x, z) : 0; }
/** walkable top (stairs, platforms) under (x, z): hero perches on built steps */
function groundAt(x, z) { const h = ground(x, z); return G.world?.groundAt ? G.world.groundAt(x, z, h + 3) : h; }
function windAt(x, y, z) { _p.set(x, y, z); _w.set(0, 0, 0); try { G.elements?.windAt?.(_p, _w); } catch { /* optional */ } return _w; }
function addThreat(x, y, z, r, k) {
  if (!S) return;
  if (S.threats.length > 12) S.threats.shift();
  S.threats.push({ x, y, z, r, k, t: 0.5 });
}

function clearAll() { if (S) { S.groups.length = 0; for (const k in S.meshes) S.meshes[k].count = 0; } }

// ---- group management -----------------------------------------------------------------------------------------------
function manage(P) {
  const sheltered=G.journeyWeather?.state.sheltered;
  if (sheltered) for (const g of S.groups) if (g.def.id==='swallows') g.leaving=true;
  // drop groups that are far behind
  for (const g of S.groups) {
    const dx = g.x - P.x, dz = g.z - P.z;
    if (dx * dx + dz * dz > g.def.keep * g.def.keep) g.leaving = true;
  }
  // one spawn attempt per tick for the group type with the largest deficit at her spot
  const wHere = landWeights(G.world.veilAt(P.x, P.z), []);
  // companions that follow her (swallows, bats) leave when she walks into another land
  for (const g of S.groups) if (g.def.follows && landMatch(g.def, wHere) < 0.2) g.leaving = true;
  // the neediest types first; a type whose spot finder fails (no shallows / lanterns / flowers in reach here) rests a
  // few seconds so it cannot starve the others
  const needs = [];
  for (const def of GROUPS) {
    if (sheltered && def.id==='swallows') continue;
    if (def.minTier && S.tier < def.minTier) continue;
    if ((S.fail.get(def) || 0) > S.time) continue;
    const want = Math.round(def.max * Math.max(S.tier, def.lowFloor ?? 0.34) * landMatch(def, wHere));
    if (want <= 0) continue;
    let have = 0;
    for (const g of S.groups) if (g.def === def && !g.leaving) have++;
    const need = (want - have) / want;
    if (need > 0) needs.push([need, def]);
  }
  needs.sort((a, b) => b[0] - a[0]);
  for (let i = 0; i < Math.min(3, needs.length); i++) {
    const def = needs[i][1];
    if (trySpawn(def, P.x, P.z, false)) break;
    S.fail.set(def, S.time + 3 + Math.random() * 3);
  }
}
function landMatch(def, w) { return def.lands[0] * w[0] + def.lands[1] * w[1] + def.lands[2] * w[2]; }

function trySpawn(def, px, pz, forced, exact = false) {
  let yaw = G.player ? G.player.yaw : 0;
  if (G.camera) { G.camera.getWorldDirection(_w); yaw = Math.atan2(_w.x, _w.z); }
  for (let i = 0; i < (forced ? 24 : 6); i++) {
    const a = forced && i === 0 ? 0 : (Math.random() < 0.6 ? yaw + rnd(-1.2, 1.2) : rnd(0, Math.PI * 2));
    const d = forced && i === 0 ? 0 : forced ? rnd(1, 14) : rnd(def.near, def.far);
    const x = px + Math.sin(a) * d, z = pz + Math.cos(a) * d;
    const w = landWeights(G.world.veilAt(x, z), []);
    if (!forced && landMatch(def, w) < 0.5) continue;
    const spot = exact ? { x, z } : def.find(x, z, { ground, groundAt, P: S.player || { x: px, z: pz }, world: G.world, water: G.water, lamps: G.sky?.lampList?.() || null });
    if (!spot) continue;
    // no two groups of the same type on top of each other
    let close = false;
    for (const g of S.groups) if (g.def === def && Math.hypot(g.x - spot.x, g.z - spot.z) < def.spacing) { close = true; break; }
    if (close && !forced) continue;
    const g = { def, x: spot.x, z: spot.z, y: spot.y ?? ground(spot.x, spot.z), spot, agents: [], t: 0, leaving: false, dead: false, land: w };
    def.init(g, { ground, groundAt, tier: S.tier, P: S.player || { x: px, y: 0, z: pz } });
    if (def.interval) S.fail.set(def, S.time + def.interval + Math.random() * 18);
    S.groups.push(g);
    return g;
  }
  return null;
}

// ---- write instance buffers -------------------------------------------------------------------------------------------
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
function write() {
  const counts = { bird: 0, insect: 0, frog: 0, fish: 0, jelly: 0, leaper: 0 };
  for (const g of S.groups) for (const a of g.agents) {
    if (a.hide || a.s <= 0.001) continue;
    const mesh = S.meshes[a.body];
    const i = counts[a.body];
    if (i >= mesh.userData.cap) continue;
    counts[a.body] = i + 1;
    _o.position.set(a.x, a.y, a.z);
    _e.set(a.pitch || 0, a.yaw || 0, a.bank || 0, 'YXZ');
    _o.quaternion.setFromEuler(_e);
    _o.scale.setScalar(a.size * a.s);
    _o.updateMatrix();
    mesh.setMatrixAt(i, _o.matrix);
    const A = mesh.userData.attrs;
    A.iColA.setXYZ(i, a.colA.r, a.colA.g, a.colA.b);
    A.iColB.setXYZ(i, a.colB.r, a.colB.g, a.colB.b);
    A.iAnim.setXYZW(i, a.phase, a.amp, a.fold, a.glow);
    A.iShape.setXYZW(i, a.sh0, a.sh1, a.sh2, a.sh3);
  }
  for (const k in counts) {
    const mesh = S.meshes[k];
    mesh.count = counts[k];
    mesh.visible = counts[k] > 0;
    if (!counts[k]) continue;
    mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, counts[k] * 16); mesh.instanceMatrix.needsUpdate = true;
    const A = mesh.userData.attrs;
    for (const n in A) { A[n].clearUpdateRanges(); A[n].addUpdateRange(0, counts[k] * A[n].itemSize); A[n].needsUpdate = true; }
  }
  S.counts = counts;
}

function stats() {
  if (!S) return { enabled: false };
  const by = {};
  for (const g of S.groups) by[g.def.id] = (by[g.def.id] || 0) + g.agents.length;
  return { enabled: S.on, groups: S.groups.length, counts: S.counts, by, herds: S.herds?.stats(), city: S.city?.stats(), ms: +(S.ms || 0).toFixed(3), drawCalls: Object.values(S.meshes).filter((m) => m.visible).length, threats: S.threats.length };
}

export { KINDS };
