import { G } from '../core/game.js';
import { t } from '../core/i18n.js';

export function makeQuests(S) {
  const talk = (id, npc, anchor = id, options = {}) => ({ id, npc, anchor, action: 'talk', ...options });
  const at = (anchor, radius) => S.near(S.anchor(anchor), radius);
  const seen = (id) => ({ id, anchor: id, prompt: id, action: 'object' });
  const wind = { spells: { wind: 1 }, abilities: { broom: true, guard: true } };
  const magic = { spells: { wind: 1, water: 1, fire: 1, ice: 1 }, abilities: { broom: true, guard: true } };
  const step = (s) => ({ ...s, target: (c) => [S.target(c.step)] });
  return {
    apprentice: {
      main: true,
      chapter: 0,
      next: 'mages',
      steps: [
        { ...seen('book'), grant: wind },
        talk('refusal', 'exam', 'townWitch'),
        talk('request', 'fran', 'franDoor'),
        { ...seen('chores'), anchor: 'franLesson' },
        talk('invitation', 'fran', 'franLesson'),
        {
          id: 'storm',
          anchor: 'franTrial',
          progress: (c) => [c.vars.evaded || 0, 2],
          check: (c) => c.vars.evaded >= 2 || c.vars.stormHits >= 3,
        },
        talk('honest', 'fran', 'franTrial', { grant: magic }),
        {
          id: 'practice',
          anchor: 'franTrial',
          progress: (c) => [c.vars.stars || 0, 3],
          check: (c) => c.vars.stars >= 3,
        },
        {
          id: 'duel',
          anchor: 'franTrial',
          check: (c) => !!c.vars.franResult && !!G.state.flags.majo_trial_lake && !S.finale.active,
        },
        talk('invest', 'fran', 'franTrial', { grant: { spells: { earth: 2 }, flags: ['majo_named', 'majo_brooch'] } }),
        talk('promise', 'mother', 'farewell', {
          done: () => G.ui?.banner?.(t('story.ui.next'), t('story.ui.road')),
        }),
      ].map(step),
    },
    mages: {
      main: true,
      chapter: 1,
      prev: 'apprentice',
      steps: [
        {
          id: 'lake',
          anchor: 'lakeCrossing',
          check(c) {
            if (!c.vars.overLake && G.player.onBroom && at('lakeCrossing', 86)) {
              c.vars.overLake = true;
              G.journeyWeather.beginEclipse();
              G.ui?.toast?.(t('story.ui.observe'), { icon: 'sun', dur: 5 });
              S.save();
            }
            return c.vars.overLake && G.state.flags.journey_eclipse_peak;
          },
        },
        { id: 'wilds', anchor: 'wilds', check: () => G.player.onBroom && at('wilds', 115) },
        {
          id: 'gate',
          anchor: 'gate',
          check: () => {
            const a = S.anchor('gate'),
              p = G.player.pos;
            return (
              G.player.onBroom && Math.abs(p.x - a.x) < 5.2 && Math.abs(p.z - a.z) < 6 && p.y < a.y + 9
            );
          },
        },
        {
          id: 'collision',
          anchor: 'roof',
          check: (c) => {
            if (
              !S.busy &&
              G.player.onBroom &&
              at('roof', 18) &&
              Math.abs(G.player.pos.y - S.anchor('roof').y - 4) < 11.5
            )
              S.crash(c);
            return false;
          },
        },
        { ...seen('repair'), after: () => G.ui?.toast?.(t('story.ui.lost'), { icon: 'item', dur: 3.5 }) },
        talk('inquire', 'innkeeper', 'shop'),
        talk('lodge', 'saya', 'innDesk'),
        talk('teach', 'saya', 'practice'),
        {
          id: 'course',
          anchor: 'practice',
          progress: (c) => [c.vars.rings || 0, 3],
          check: (c) => c.vars.rings >= 3,
        },
        talk('praise', 'saya', 'practice'),
        talk('clue', 'innkeeper', 'shop'),
        talk('return', 'saya', 'innRoom', { grant: { flags: ['majo_brooch', 'majo_brooch_returned'] } }),
        talk('hat', 'saya', 'innRoom', { prompt: 'hat', grant: { flags: ['majo_saya_hat'] } }),
        talk('depart', 'saya', 'gate'),
      ].map(step),
      onComplete() {
        S.grant({ flags: ['majo_finished'] });
        G.ui?.banner?.(t('story.ui.end'), t('story.ui.paths'));
      },
    },
  };
}
