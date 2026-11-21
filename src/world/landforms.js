// All walkable terrain in this itinerary, including its headlands and alpine peaks,
// belongs to the continuous terrain mesh. Keep the lookup surface shared by tools.
export const landformsSystem = {
  name: 'landforms',
  pausable: true,
  init(G) {
    G.landforms = {
      enabled: false,
      root: null,
      isles: { ids: new Set(), info: [], has: () => false },
      cliffs: null,
      coast: null,
      horizon: null,
      stats: () => ({ enabled: false, isles: 0, drawables: 0, triangles: 0 }),
      show() {}
    };
  }
};
