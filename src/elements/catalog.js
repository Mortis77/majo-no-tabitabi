// 元素交织 — the book of everything two (or three) elements do together. Pure data.
// Words live in src/locales/zh-CN/elements.js under elements.combo.<id>.{ name, recipe, desc, hint }.
//
//   kind  'reaction' — two elements meet on one thing or creature (damage multiplier on creatures)
//         'field'    — an element meets a lingering ground field (puddle, mud, ice sheet, steam, lava …)
//         'fusion'   — an element meets one of the heroine's own lingering spells (tornado, rain cloud, pillar …)
//   els   the elements involved, in recipe order (2–3); the first two colour the callout
//   mult  damage multiplier on creatures (shown in the callout and the notes)
//   big   a large callout (set pieces)
export const COMBOS = {
  // ---- reactions -----------------------------------------------------------------------------------------------------
  conduct:      { kind: 'reaction', els: ['water', 'thunder'], mult: 1.6 },
  steam:        { kind: 'reaction', els: ['fire', 'water'], mult: 1.3 },
  freeze:       { kind: 'reaction', els: ['water', 'ice'] },
  melt:         { kind: 'reaction', els: ['ice', 'fire'], mult: 2 },
  shatter:      { kind: 'reaction', els: ['ice', 'earth'], mult: 3 },
  overload:     { kind: 'reaction', els: ['fire', 'thunder'], mult: 1.5 },
  fan:          { kind: 'reaction', els: ['fire', 'wind'] },
  mire:         { kind: 'reaction', els: ['water', 'earth'] },
  // ---- ground --------------------------------------------------------------------------------------------------------
  charged:      { kind: 'field', els: ['water', 'thunder'] },
  icesheet:     { kind: 'field', els: ['water', 'ice'] },
  steamcloud:   { kind: 'field', els: ['water', 'fire'] },
  mud:          { kind: 'field', els: ['water', 'earth'] },
  lava:         { kind: 'field', els: ['earth', 'fire'] },
  thawground:   { kind: 'field', els: ['ice', 'fire'] },
  quench:       { kind: 'field', els: ['earth', 'fire', 'water'] },
  rime:         { kind: 'field', els: ['water', 'fire', 'ice'] },
  chargedfog:   { kind: 'field', els: ['water', 'fire', 'thunder'], mult: 1.6 },
  // ---- fusions with her own spells -----------------------------------------------------------------------------------
  firewhirl:    { kind: 'fusion', els: ['wind', 'fire'], big: true },
  thunderwhirl: { kind: 'fusion', els: ['wind', 'thunder'], big: true },
  frostwhirl:   { kind: 'fusion', els: ['wind', 'ice'], big: true },
  waterspout:   { kind: 'fusion', els: ['wind', 'water'], big: true },
  thunderstorm: { kind: 'fusion', els: ['water', 'thunder'], big: true },
  hailstorm:    { kind: 'fusion', els: ['water', 'ice'], big: true },
  squall:       { kind: 'fusion', els: ['water', 'wind'] },
  warmfog:      { kind: 'fusion', els: ['water', 'fire'] },
  fanfire:      { kind: 'fusion', els: ['wind', 'fire'] },
  lightningrod: { kind: 'fusion', els: ['earth', 'thunder'], big: true },
  steamblast:   { kind: 'fusion', els: ['ice', 'fire'], mult: 1.5, big: true },
  tidal:        { kind: 'fusion', els: ['earth', 'water'], big: true },
};

export const COMBO_IDS = Object.keys(COMBOS);
export const COMBO_KINDS = ['reaction', 'field', 'fusion'];
