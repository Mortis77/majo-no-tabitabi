// Shared helpers for the gameplay modules: spot resolution, instanced props, gameplay state, groups.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { bakeStatic } from '../core/geo.js';

/** Persistent gameplay-only state (G.state.gp). Never cache the returned object across frames. */
export function gp() {
  const st = G.state;
  if (!st) return DEFAULT_GP();
  if (!st.gp || typeof st.gp !== 'object') st.gp = DEFAULT_GP();
  return st.gp;
}
export const DEFAULT_GP = () => ({
  glReady: {},          // great lantern id -> true when the story says it may be lit
  pedestals: null,      // crystal puzzle: step index per pedestal (null = start layout)
  puzzles: {},          // puzzle id -> true when solved
  active: {},           // group -> false when the story hides it (missing = shown)
  barrierDown: false,   // 月障 dissolved
  tearPoints: { hp: 0, mana: 0 },   // upgrade points bought with moon tears
  shopBought: {},       // shop item -> count bought (for display)
  seen: {},             // stone lantern id -> true once seen (map)
  checkpointId: null,
});
/** Fill missing gameplay fields in G.state (call from start()). */
export function ensureState() {
  const st = G.state;
  if (!st) return;
  const d = DEFAULT_GP();
  st.gp = Object.assign(d, st.gp && typeof st.gp === 'object' ? st.gp : {});
  for (const k of ['lanterns', 'greatLanterns', 'collected', 'races', 'lore', 'upgrades', 'inventory', 'flags']) if (!st[k] || typeof st[k] !== 'object') st[k] = {};
  for (const k of ['hp', 'mana', 'broom', 'charm']) if (typeof st.upgrades[k] !== 'number') st.upgrades[k] = 0;
  if (!st.gp.tearPoints || typeof st.gp.tearPoints !== 'object') st.gp.tearPoints = { hp: 0, mana: 0 };
}
export const isActive = (group) => !group || !G.state || !G.state.gp || !G.state.gp.active || G.state.gp.active[group] !== false;

const _v = new THREE.Vector3();
/** Resolve a placement record (see data/placements.js) to a world position. */
export function resolveSpot(s, lift = 0, out = new THREE.Vector3()) {
  const W = G.world;
  let x = s.x, z = s.z, y;
  if (s.isle) {
    const isle = W.SKY_ISLES.find((i) => i.id === s.isle);
    x = (isle ? isle.x : 0) + (s.dx || 0); z = (isle ? isle.z : 0) + (s.dz || 0);
    y = W.groundAt(x, z, (isle ? isle.top : 0) + 0.6);
  } else if (s.pad) {
    const pads = G.flora?.bouncePads || [];
    let best = null, bd = Infinity;
    for (const p of pads) { const d = (p.pos.x - s.pad[0]) ** 2 + (p.pos.z - s.pad[1]) ** 2; if (d < bd) { bd = d; best = p; } }
    if (best) { x = best.pos.x; z = best.pos.z; y = best.pos.y + 0.15; }
    else { x = s.pad[0]; z = s.pad[1]; y = W.groundAt(x, z, W.heightAt(x, z) + 1); }
  } else if (typeof s.y === 'number') y = s.y;
  else if (s.top) y = W.groundAt(x, z);
  else y = W.groundAt(x, z, W.heightAt(x, z) + 1.2);
  if (W.isWater?.(x, z) && !s.isle && !s.pad && !s.top && typeof s.y !== 'number') y = Math.max(y, W.seaLevel ?? 0);
  return out.set(x, y + (s.lift ?? lift), z);
}

/**
 * Turn a prototype Group of primitives into InstancedMeshes (one per material) holding `count` copies.
 * Returns { meshes, group, set(i, pos, yaw, scale), hide(i) }. Instances start hidden (scale 0).
 */
export function makeInstanced(proto, count, { castShadow = true, receiveShadow = false, name = 'gp' } = {}) {
  const baked = bakeStatic(proto);
  const group = new THREE.Group(); group.name = name;
  const meshes = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  baked.updateMatrixWorld(true);
  for (const c of baked.children) {
    if (!c.isMesh) continue;
    const geo = c.geometry.clone(); geo.applyMatrix4(c.matrix);
    const im = new THREE.InstancedMesh(geo, c.material, count);
    im.castShadow = castShadow && !c.material.isMeshBasicMaterial; im.receiveShadow = receiveShadow;
    im.frustumCulled = false;
    m4.makeScale(0, 0, 0);
    for (let i = 0; i < count; i++) im.setMatrixAt(i, m4);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(im); meshes.push(im);
  }
  const api = {
    meshes, group,
    set(i, pos, yaw = 0, scale = 1) {
      q.setFromAxisAngle(up, yaw); sc.setScalar(scale);
      m4.compose(pos, q, sc);
      for (const im of meshes) { im.setMatrixAt(i, m4); im.instanceMatrix.needsUpdate = true; }
    },
    hide(i) { m4.makeScale(0, 0, 0); for (const im of meshes) { im.setMatrixAt(i, m4); im.instanceMatrix.needsUpdate = true; } },
  };
  return api;
}

/** Squared horizontal distance from the player (Infinity when there is no player). */
export function playerDist2(p) {
  const pl = G.player; if (!pl) return Infinity;
  const dx = p.x - pl.pos.x, dz = p.z - pl.pos.z; return dx * dx + dz * dz;
}
/** 3D distance from the player's chest. */
export function playerDist3(p) {
  const pl = G.player; if (!pl) return Infinity;
  _v.copy(pl.pos); _v.y += 0.9; return _v.distanceTo(p);
}
export const sfx = (name, o) => { try { G.audio?.sfx?.(name, o); } catch (e) { /* optional */ } };
export const toast = (text, o) => { try { G.ui?.toast?.(text, o); } catch (e) { /* optional */ } };
