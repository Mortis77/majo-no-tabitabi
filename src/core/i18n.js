// Localisation. NO player-visible text may be written directly in code: every string lives in
// src/locales/<locale>/<namespace>.js and is fetched with t('namespace.path.to.key', { params }).
//
//   import { t, raw } from '../core/i18n.js';
//   t('ui.hud.mana')                         -> '灵力'
//   t('gameplay.got', { item: '星屑', n: 3 }) -> '获得 星屑 ×3'      (string "{item} ×{n}" in the locale file)
//   raw('story.dlg.granny_intro')            -> the untouched value (array / object), for scripts and tables
//
// Locale files:  src/locales/zh-CN/<namespace>.js   ->  export default { key: '文字', group: { key: '…' }, list: [ … ] };
// The file name is the namespace and must start with the owning system's name: ui.js, story.js, story.quests.js, spells.js …
// (core.js and world.js belong to the core). The build discovers them automatically — nothing to register by hand.
// To add a language later: copy src/locales/zh-CN to src/locales/<code>, translate the values, keep the keys.
//
// Call t() when the text is needed (render / show time), never at module top level: the language can change at runtime.

const trees = {};   // locale -> namespace -> object
const flats = {};   // locale -> { 'ns.a.b': value }
const listeners = new Set();
const warned = new Set();
export const FALLBACK = 'zh-CN';
let locale = FALLBACK;

function flatten(prefix, obj, out) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const key = prefix + '.' + k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(key, v, out);
    else out[key] = v;
  }
}

/** Called by the generated locale index for every locale file. */
export function registerLocale(loc, namespace, table) {
  (trees[loc] ||= {})[namespace] = table;
  flatten(namespace, table, (flats[loc] ||= {}));
}

/** Translate. Missing keys fall back to zh-CN, then to the key itself (with one console warning). */
export function t(key, params) {
  let s = flats[locale]?.[key];
  if (s === undefined && locale !== FALLBACK) s = flats[FALLBACK]?.[key];
  if (s === undefined) {
    if (!warned.has(key)) { warned.add(key); console.warn('[i18n] missing key', key); }
    return key;
  }
  if (typeof s === 'function') return s(params || {});
  if (typeof s !== 'string') return String(s);
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? params[k] : m));
  return s;
}

/** True if the key exists in the current or fallback locale. */
export function has(key) { return flats[locale]?.[key] !== undefined || flats[FALLBACK]?.[key] !== undefined; }

/** Untranslated structured value (array / object / string) at a key path, e.g. a dialogue script. undefined if absent. */
export function raw(key) {
  const walk = (loc) => {
    const tree = trees[loc];
    if (!tree) return undefined;
    // the namespace may itself contain dots (story.quests): try the longest matching namespace
    const parts = key.split('.');
    for (let n = parts.length; n >= 1; n--) {
      const ns = parts.slice(0, n).join('.');
      if (!(ns in tree)) continue;
      let v = tree[ns];
      for (let i = n; i < parts.length && v !== undefined && v !== null; i++) v = v[parts[i]];
      if (v !== undefined) return v;
    }
    return undefined;
  };
  const v = walk(locale);
  return v !== undefined ? v : locale !== FALLBACK ? walk(FALLBACK) : undefined;
}

export function getLocale() { return locale; }
/** [{ code, name }] of every registered language. */
export function locales() { return Object.keys(trees).map((code) => ({ code, name: flats[code]?.['core.meta.name'] || code })); }
/** Switch language. Returns false if unknown. Notifies onLocaleChange listeners (UI re-renders its texts). */
export function setLocale(loc) {
  if (!trees[loc]) return false;
  if (loc === locale) return true;
  locale = loc;
  if (typeof document !== 'undefined') document.documentElement.lang = loc;
  for (const fn of [...listeners]) { try { fn(loc); } catch (e) { console.error(e); } }
  return true;
}
export function onLocaleChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
