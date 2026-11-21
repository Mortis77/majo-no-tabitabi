// The book of 灵诀: numbers only (costs, cooldowns, colours, damage). Every player-visible word lives in
// src/locales/zh-CN/spells.js under spells.book.<id>.*  (name, desc, small, smallDesc, big, bigDesc).
export const ELEMENT_ORDER = ['fire', 'water', 'ice', 'wind', 'thunder', 'earth', 'sun', 'moon'];
export const ARTS = ['charm', 'guard', 'shikigami', 'kinkan'];

/** Damage rule of §3.4: about cost × 2.2; the charm deals 12. */
export const DMG_K = 2.2;

export const COLORS = {
  charm: 0xfff0c8, fire: 0xff7a2a, water: 0x58c6ff, ice: 0xbfefff, wind: 0xb6f5d0, thunder: 0xb98cff,
  earth: 0xc49a6c, sun: 0xffd27a, moon: 0xb9a8ff, guard: 0xffe6a6, shikigami: 0xfff3d6, kinkan: 0xffd060,
};

/**
 * small / big: { cost (mana), cd (seconds), perSec? (mana per second while sustained), anim (player clip) }
 */
export const BOOK = {
  charm: { id: 'charm', element: 'sun', art: true, small: { cost: 0, cd: 0.3, damage: 12, anim: 'cast_throw' } },
  fire: { id: 'fire', element: 'fire', small: { cost: 12, cd: 0.42, anim: 'cast_throw' }, big: { cost: 30, cd: 2.4, anim: 'cast_lob' } },
  water: { id: 'water', element: 'water', small: { cost: 10, cd: 0.38, anim: 'cast_throw' }, big: { cost: 28, cd: 8, anim: 'cast_raise' } },
  ice: { id: 'ice', element: 'ice', small: { cost: 12, cd: 0.5, anim: 'cast_throw' }, big: { cost: 30, cd: 3.2, anim: 'cast_raise' } },
  wind: { id: 'wind', element: 'wind', small: { cost: 8, cd: 0.45, anim: 'cast_throw' }, big: { cost: 26, cd: 6, anim: 'cast_raise' } },
  thunder: { id: 'thunder', element: 'thunder', small: { cost: 16, cd: 0.7, anim: 'cast_raise' }, big: { cost: 36, cd: 4.5, anim: 'cast_raise' } },
  earth: { id: 'earth', element: 'earth', small: { cost: 14, cd: 0.9, anim: 'cast_summon' }, big: { cost: 45, cd: 8, anim: 'cast_raise' } },
  sun: { id: 'sun', element: 'sun', small: { cost: 20, cd: 2.5, anim: 'cast_summon' }, big: { cost: 6, perSec: 22, cd: 1.2, anim: 'cast_channel' } },
  moon: { id: 'moon', element: 'moon', small: { cost: 6, perSec: 4, cd: 0.35, anim: 'cast_channel' }, big: { cost: 34, cd: 8, anim: 'cast_raise' } },
  guard: { id: 'guard', element: 'sun', art: true, small: { cost: 0, cd: 0.15, anim: 'guard' } },
  shikigami: { id: 'shikigami', element: 'sun', art: true, small: { cost: 35, cd: 12, anim: 'cast_summon' } },
  kinkan: { id: 'kinkan', element: 'sun', art: true, small: { cost: 0, cd: 2, anim: 'cast_raise' } },
};

/** Base damage of a form, passed to G.elements.apply as info.damage. */
export function damageOf(id, form) {
  const d = BOOK[id];
  if (!d) return 10;
  const f = d[form] || d.small;
  if (f.damage) return f.damage;
  return Math.round(Math.max(6, f.cost) * DMG_K);
}
