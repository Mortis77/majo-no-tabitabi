// Tiny pub/sub. G.events.on('enemy:killed', fn) -> returns an unsubscribe function.
export function createEvents() {
  const map = new Map();
  return {
    on(name, fn) {
      if (!map.has(name)) map.set(name, new Set());
      map.get(name).add(fn);
      return () => map.get(name)?.delete(fn);
    },
    once(name, fn) {
      const off = this.on(name, (p) => { off(); fn(p); });
      return off;
    },
    off(name, fn) { map.get(name)?.delete(fn); },
    emit(name, payload) {
      const set = map.get(name);
      if (!set) return;
      for (const fn of [...set]) {
        try { fn(payload); } catch (e) { console.error(`[event ${name}]`, e); }
      }
    },
  };
}
