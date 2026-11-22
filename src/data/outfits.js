// Elaina's wardrobe (docs/api/heroine.md "Wardrobe (journey)"): what she can wear and when the player may choose it.
//   id      saved in G.state.outfit          asset   manifest model (same skeleton, face and hair rig for all four)
//   name / desc  locale keys (ui.wardrobe.*) icon    pictogram in src/ui/icons.js (the card's fallback picture)
//   pic     manifest id of the 衣装 page's painted picture (tools/costume/wardrobe-pics.mjs)
//   unlock  the story flag after which the player may pick it on the 衣装 page (the story itself may dress her in any)
// Until both episodes are done the story chooses: her everyday clothes in episode one, the witch's travelling clothes from
// her naming on (storyOutfit). After the credits (majo_finished) her own choice is kept, on load too.
export const OUTFITS = [
  {
    id: 'apprentice',
    asset: 'char_elaina_apprentice',
    name: 'ui.wardrobe.apprentice.name',
    desc: 'ui.wardrobe.apprentice.desc',
    icon: 'outfit_apprentice',
    pic: 'ui_outfit_apprentice',
    unlock: 'majo_named',
  },
  {
    id: 'elaina',
    asset: 'char_elaina',
    name: 'ui.wardrobe.elaina.name',
    desc: 'ui.wardrobe.elaina.desc',
    icon: 'outfit_witch',
    pic: 'ui_outfit_elaina',
    unlock: 'majo_named',
  },
  {
    id: 'swim_a',
    asset: 'char_elaina_swim_a',
    name: 'ui.wardrobe.swim_a.name',
    desc: 'ui.wardrobe.swim_a.desc',
    icon: 'outfit_swim_a',
    pic: 'ui_outfit_swim_a',
    unlock: 'majo_finished',
  },
  {
    id: 'swim_b',
    asset: 'char_elaina_swim_b',
    name: 'ui.wardrobe.swim_b.name',
    desc: 'ui.wardrobe.swim_b.desc',
    icon: 'outfit_swim_b',
    pic: 'ui_outfit_swim_b',
    unlock: 'majo_finished',
  },
];
export const DEFAULT_OUTFIT = 'apprentice';
export const outfitById = (id) => OUTFITS.find((o) => o.id === id) || null;
/** Every model that is her (rig.js treats these as the heroine; assets.js gives them the flight cloth). */
export const HEROINE_ASSETS = new Set(OUTFITS.map((o) => o.asset));
/** May the player pick this outfit on the 衣装 page now? */
export const outfitUnlocked = (o, state) => !!o && (!o.unlock || !!state?.flags?.[o.unlock]);
/** The outfit the story puts her in, or null once both episodes are done and the choice is the player's. */
export const storyOutfit = (state) =>
  state?.flags?.majo_finished ? null : state?.flags?.majo_named ? 'elaina' : 'apprentice';
/** What she wears when a save is loaded: the story's outfit, else her saved choice (if it is unlocked), else the witch's. */
export function journeyOutfit(state) {
  const story = storyOutfit(state);
  if (story) return story;
  const own = outfitById(state?.outfit);
  return own && outfitUnlocked(own, state) ? own.id : 'elaina';
}
