// The journey's episodes and the countries she visits in them: the one registry every UI surface reads (journal chapters,
// the map's travel stamps, country title cards, stamp art). Adding an episode = adding data here (+ its text in the
// locale + its quest in src/story/questdefs.js); no UI code changes. docs/api/ui.md "Adding an episode".
//
// episode: { id, n (1-based order), title: loc key, quests: [quest ids from questdefs.js] , countries: [country ids] }
// country: { id, episode (episode id), name: loc key, sub: loc key | null, regions: [region ids that belong to it],
//            anchor: JOURNEY_ANCHORS / world anchor id the map centres on (null = not on the map yet),
//            stamp: { seed, ink?, shape?, motif? } (src/ui/stamps.js draws the art; the seed picks shape, border, motif,
//            layout, ink and tilt; ink / shape / motif override its pick) }
// Every name is a locale key: player-visible text stays in src/locales/<locale>/.

const EPISODES = [
  { id: 'ep1', n: 1, title: 'story.quests.apprentice.title', quests: ['apprentice'], countries: ['hometown', 'forest'] },
  { id: 'ep2', n: 2, title: 'story.quests.mages.title', quests: ['mages'], countries: ['wilds', 'bellcrown'] },
];

const COUNTRIES = [
  { id: 'hometown', episode: 'ep1', name: 'world.place.hometown', sub: 'world.sub.hometown', regions: ['hometown', 'farewell'], anchor: 'hometown', stamp: { seed: 26, ink: '#8b3343' } },
  { id: 'forest', episode: 'ep1', name: 'world.place.forest', sub: 'world.sub.forest', regions: ['forest', 'trial', 'trialLake'], anchor: 'forest', stamp: { seed: 52, ink: '#2f5a4a' } },
  { id: 'wilds', episode: 'ep2', name: 'world.place.wilds', sub: 'world.sub.wilds', regions: ['wilds', 'eastmoor', 'highpass'], anchor: 'wilds', stamp: { seed: 24, ink: '#7a5a24' } },
  { id: 'bellcrown', episode: 'ep2', name: 'world.place.bellcrown', sub: 'world.sub.bellcrown',
    regions: ['bellcrown', 'gate', 'lookout', 'roof', 'inn', 'bellkeep', 'practice'], anchor: 'bellcrown', stamp: { seed: 106, ink: '#34467a' } },
];

const reg = { episodes: EPISODES.slice(), countries: COUNTRIES.slice(), byRegion: null, version: 0 };
function index() {
  if (reg.byRegion) return;
  reg.byRegion = new Map();
  for (const c of reg.countries) for (const r of c.regions || [c.id]) if (!reg.byRegion.has(r)) reg.byRegion.set(r, c);
}

/** Episodes in story order. */
export const episodes = () => reg.episodes;
/** Countries in journey order (episode order, then the order listed). */
export const countries = () => reg.countries;
export const episodeById = (id) => reg.episodes.find((e) => e.id === id) || null;
export const countryById = (id) => reg.countries.find((c) => c.id === id) || null;
/** The country a region id belongs to (region ids: G.env.region / 'region:enter'), or null. */
export function countryOfRegion(regionId) { index(); return reg.byRegion.get(regionId) || null; }
/** The episode a quest belongs to, or null (side quests, errands). */
export const episodeOfQuest = (questId) => reg.episodes.find((e) => (e.quests || []).includes(questId)) || null;
/** Bumped on every registerEpisodes(): views that cache registry-derived DOM compare it. */
export const registryVersion = () => reg.version;

/** Add or replace episodes and countries at run time (future data packs, probes and tests). Same shapes as above;
 *  an entry with an existing id replaces it. Keeps story order by `n`. */
export function registerEpisodes({ episodes: eps = [], countries: cs = [] } = {}) {
  for (const e of eps) { const i = reg.episodes.findIndex((x) => x.id === e.id); if (i >= 0) reg.episodes[i] = e; else reg.episodes.push(e); }
  reg.episodes.sort((a, b) => (a.n || 0) - (b.n || 0));
  for (const c of cs) { const i = reg.countries.findIndex((x) => x.id === c.id); if (i >= 0) reg.countries[i] = c; else reg.countries.push(c); }
  const order = new Map(reg.episodes.map((e, i) => [e.id, i]));
  reg.countries.sort((a, b) => (order.get(a.episode) ?? 999) - (order.get(b.episode) ?? 999));
  reg.byRegion = null;
  reg.version++;
}
