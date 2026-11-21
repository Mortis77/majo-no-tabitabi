// The diploma marks the change from apprenticeship to travelling witch.
export const OUTFITS = [
  {
    id: 'apprentice',
    asset: 'char_elaina_apprentice',
    name: 'ui.outfit.miko.name',
    desc: 'ui.outfit.miko.desc',
    icon: 'outfit_miko',
    pic: 'ui_outfit_miko',
  },
  {
    id: 'elaina',
    asset: 'char_elaina',
    name: 'ui.outfit.miko.name',
    desc: 'ui.outfit.miko.desc',
    icon: 'outfit_miko',
    pic: 'ui_outfit_miko',
  },
];
export const DEFAULT_OUTFIT = 'apprentice';
export const outfitById = (id) => OUTFITS.find((o) => o.id === id) || null;

export const journeyOutfit = (state) => (state?.flags?.majo_named ? 'elaina' : 'apprentice');
