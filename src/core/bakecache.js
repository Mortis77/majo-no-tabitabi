// Bake cache (docs/api/perf.md "Boot and loading"): keeps deterministic, expensive boot products (typed arrays) in
// IndexedDB between runs, keyed by the BUILD HASH, so a cached bake can never be stale: any code change makes a new
// hash, and entries of other builds are deleted on open. Every failure (no IndexedDB, private mode, quota, a slow or
// blocked open) degrades to "not cached": callers always have the compute path. ?nocache=1 turns it off.
//   const buf = await bakeGet('terrain-data');            // ArrayBuffer | null
//   bakePut('terrain-data', typedArray.buffer);           // fire and forget
import { G } from './game.js';

// replaced by build.mjs with a hash of the bundle (a string literal survives minification)
const BUILD = '__MV_BUILD_HASH__';
const DB = 'majo-survey', STORE = 'b';
let dbP = null;

function off() { return G.params?.nocache === '1' || typeof indexedDB === 'undefined' || BUILD.startsWith('__MV_'); }

function openDb() {
  if (dbP) return dbP;
  dbP = new Promise((resolve) => {
    let done = false;
    const finish = (db) => { if (!done) { done = true; resolve(db); } };
    setTimeout(() => finish(null), 800); // a blocked / hanging open never holds the boot
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { try { req.result.createObjectStore(STORE); } catch (e) { /* exists */ } };
      req.onerror = () => finish(null);
      req.onblocked = () => finish(null);
      req.onsuccess = () => {
        const db = req.result;
        finish(db);
        // drop the bakes of other builds
        try {
          const tx = db.transaction(STORE, 'readwrite'), st = tx.objectStore(STORE);
          const kr = st.getAllKeys();
          kr.onsuccess = () => { for (const k of kr.result) if (!String(k).startsWith(BUILD + ':')) st.delete(k); };
        } catch (e) { /* ignore */ }
      };
    } catch (e) { finish(null); }
  });
  return dbP;
}

export async function bakeGet(name) {
  if (off()) return null;
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(BUILD + ':' + name);
      r.onsuccess = () => resolve(r.result instanceof ArrayBuffer ? r.result : null);
      r.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

export function bakePut(name, buf) {
  if (off()) return;
  openDb().then((db) => {
    if (!db) return;
    try { db.transaction(STORE, 'readwrite').objectStore(STORE).put(buf, BUILD + ':' + name); } catch (e) { /* quota etc. */ }
  });
}

export const bakeBuild = BUILD;
