// Safe readers of live game state for the views. Every other system may be absent or half-built: nothing here throws,
// and nothing here allocates per call (the returned objects are reused).
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { ELEMENTS, EL_COLOR, STATUS } from './icons.js';

// ---- player vitals ---------------------------------------------------------------------------------
const V = { has: false, hp: 100, maxHp: 100, mana: 100, maxMana: 100, onBroom: false, gliding: false, dead: false,
  burning: false, wet: false, frozen: false, shocked: false };

function flag(s, k) {
  if (!s) return false;
  if (typeof s === 'string') return s === k;
  if (Array.isArray(s)) return s.includes(k);
  if (typeof s.has === 'function') return s.has(k);
  return !!s[k];
}
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** { has, hp, maxHp, mana, maxMana, onBroom, gliding, dead, burning, wet, frozen, shocked } — one shared object. */
export function vitals() {
  const p = G.player, st = G.state;
  const up = (st && st.upgrades) || {};
  if (p && typeof p.hp === 'number') {
    V.has = true;
    V.maxHp = Math.max(1, num(p.maxHp, 100)); V.hp = Math.max(0, num(p.hp, V.maxHp));
    V.maxMana = Math.max(1, num(p.maxMana, 100)); V.mana = Math.max(0, num(p.mana, V.maxMana));
    V.onBroom = !!p.onBroom || p.state === 'broom'; V.gliding = !!p.gliding || p.state === 'glide'; V.dead = !!p.dead;
  } else {
    V.has = false;
    V.maxHp = 100 + 20 * (up.hp | 0); V.maxMana = 100 + 20 * (up.mana | 0);
    V.hp = Math.min(V.maxHp, num(st && st.player && st.player.hp, V.maxHp));
    V.mana = Math.min(V.maxMana, num(st && st.player && st.player.mana, V.maxMana));
    V.onBroom = V.gliding = V.dead = false;
  }
  const s = p && p.status, r = p && p.reactor;
  for (let i = 0; i < STATUS.length; i++) { const k = STATUS[i]; V[k] = flag(s, k) || !!(r && r[k]); }
  return V;
}

// ---- the eight 灵诀 ------------------------------------------------------------------------------
const slots = ELEMENTS.map((id, i) => ({ id, index: i, element: id, color: EL_COLOR[id], name: '', level: 0, cost: 0, costBig: 0, cd: 0, cdBig: 0, desc: '', small: '', big: '' }));
let slotsFrame = -100;
let dirty = true;
export function touchSpells() { dirty = true; }

function findSpell(list, id) {
  if (!Array.isArray(list)) return null;
  for (let i = 0; i < list.length; i++) { const x = list[i]; if (x && x.id === id) return x; }
  return null;
}

/** The eight element slots in wheel order, merged from G.spells.list and G.state.spells. Refreshed a few times a second. */
export function spellSlots(force) {
  const f = G.time.frame;
  if (!force && !dirty && f - slotsFrame < 12) return slots;
  slotsFrame = f; dirty = false;
  const list = G.spells && G.spells.list;
  const st = (G.state && G.state.spells) || {};
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    const e = findSpell(list, s.id);
    s.level = (e && typeof e.level === 'number' ? e.level : st[s.id]) | 0;
    s.name = (e && e.name) || t('core.element.' + s.id);
    s.desc = (e && e.desc) || '';
    s.small = (e && (e.small || e.smallName)) || '';
    s.big = (e && (e.big || e.bigName)) || '';
    if (s.small && typeof s.small === 'object') s.small = s.small.name || '';
    if (s.big && typeof s.big === 'object') s.big = s.big.name || '';
    const c = e && e.cost;
    if (c && typeof c === 'object') { s.cost = num(c.small ?? c[0], 0); s.costBig = num(c.big ?? c[1], 0); }
    else { s.cost = num(c, 0); s.costBig = num(e && (e.costBig ?? e.bigCost), 0); }
    const d = e && e.cd;
    if (d && typeof d === 'object') { s.cd = num(d.small, 0); s.cdBig = num(d.big, 0); } else { s.cd = num(d, 0); s.cdBig = 0; }
  }
  return slots;
}

/** id of the selected 灵诀 (or null). */
export function selectedId() {
  let s = G.spells ? G.spells.selected : undefined;
  if (s && typeof s === 'object') s = s.id;
  if (s === undefined || s === null) s = G.state ? G.state.selectedSpell : null;
  return s || null;
}

/** Select a 灵诀 through the spells system; without one, remember the choice ourselves. */
export function selectSpell(id) {
  dirty = true;
  if (G.spells && typeof G.spells.select === 'function') { try { G.spells.select(id); } catch (e) { G.reportError('ui:select', e); } return; }
  if (G.state) G.state.selectedSpell = id;
  G.events.emit('spell:select', { id });
}

/** 0..1: how much of the selected 灵诀's longer cooldown is still left (0 = ready). Short (< 1 s) cooldowns are ignored. */
export function cooldownLeft(slot) {
  const sp = G.spells;
  if (!slot || !sp || typeof sp.cooldown !== 'function') return 0;
  let f = 0;
  try {
    if (slot.cd >= 1) f = Math.max(f, num(sp.cooldown(slot.id, 'small'), 0) / slot.cd);
    if (slot.cdBig >= 1) f = Math.max(f, num(sp.cooldown(slot.id, 'big'), 0) / slot.cdBig);
  } catch (e) { return 0; }
  return Math.max(0, Math.min(1, f));
}

/** 0..1 readers with fallbacks. */
export const gauge = () => Math.max(0, Math.min(1, num(G.spells ? G.spells.gauge : undefined, num(G.state && G.state.gauge, 0))));
export const charge = () => Math.max(0, Math.min(1, num(G.spells && G.spells.charge, 0)));
export const inv = (id) => (G.state && G.state.inventory && G.state.inventory[id]) || 0;
export const ability = (id) => !!(G.state && G.state.abilities && G.state.abilities[id]);
