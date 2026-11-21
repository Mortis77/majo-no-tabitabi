#!/usr/bin/env node
// Writes assets/_incoming/costume/manifest.fragment.json from the v1 entries + the built _v2 files + their chain lists.
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8'));
const IDS = ['akari', 'granny', 'himawari', 'ushio', 'kokonoe', 'kuzunoha', 'rikka', 'naru', 'shoku', 'kagami', 'oboroyo', 'banou', 'villager_a', 'villager_b', 'villager_c', 'fox_a', 'fox_b', 'town_a', 'town_b'];
const LOOK = {
  akari: 'White kosode with wide hanging sode (closed sleeve bag, open wrist, red cord + tsuyu tails, sun-ray / flower dye at the sleeve corner), crossed collar with red inner line, ankle-length vermilion hakama with 18 knife pleats + front/back box pleat, red sash with back bow and two hanging tails, bell + paper charm at the left front, white tabi + red-strapped zori, big red hair bow with two tails.',
  granny: 'Layered formal shrine robes: white kimono, pale-purple pleated robe skirt and wide sleeves, deep-purple obi, wide lavender collar and pale kasuri weave on the kimono (round 2: shawl removed), hair bun + pin kept.',
  himawari: 'Senior shrine maiden: white kosode, deep-orange pleated hakama, sleeves tied up (tasuki cord crossing on the back), orange sash with back bow, sunflower kept.',
  ushio: 'River spirit: two layered knee/above-knee tunics in teal (wave dye) and green (open front), wide water-drop bell sleeves, aqua leggings, dish kept.',
  kokonoe: 'Fox trickster: short red-orange happi coat (open front, dot dye) over a cream inner, loose indigo trousers (calf), fox mask on the right side of the head, ears kept, big tail rebuilt on a 3-joint chain.',
  kuzunoha: 'Fox elder: long white formal robe with crimson hem band and seam, trailing back hem, long wide sleeves, crimson obi with back bow, ears kept, five tails each on its own chain.',
  rikka: 'Snow woman: long pure-white kimono with ice-blue hem lining and seam, long furisode sleeves (0.5 m bag) with ice-blue dye, ice-blue obi + bow, wide collar and pale-blue asanoha frost weave on the kimono (round 2: frost shawl removed), snow-crystal dye at hems and sleeves, snowflake kept.',
  naru: 'Thunder kid: short indigo festival happi with yellow stripes and edges, rolled sleeves, yellow inner, navy momohiki, headband with two tails on chains, drum-stick holster at the back, drum kept.',
  shoku: 'Lantern-maker: knee-length kasuri work kimono, navy apron, sleeves tied up with a tasuki cord, tool pouch on the right hip, dark leggings, lantern kept.',
  kagami: 'Ferrywoman of the moon lake: long silver-blue robe with wave dye and pleats, wide sleeves, navy obi, straw sugegasa hanging on her back on a neck cord, crescent kept.',
  oboroyo: 'Moon priestess, the heroine mirrored: black-violet kosode with silver cords, silver-lavender pleated hakama with a long trailing back hem, silver sash + back bow + long tails, moon crown kept.',
  banou: 'Stone-mason elder (new file, built on char_granny like the runtime dressBanou): open brown work coat over a striped grey kimono (knee), grey leggings, long beard + moustache on a chain, woven kasa hat, mason hammer at the right hip. Bun and hairpin removed.',
  villager_a: 'Farmer preset (short kimono + trousers): indigo kasuri kimono above the knee, short sleeves, brown trousers, waraji; straw hat kept (scaled to a believable kasa). Female base body with the round-2 male envelope (flat chest, broader shoulders, straight waist).',
  villager_b: 'Village woman preset (apron dress): striped calf-length kimono, white apron, sleeves tied with a red tasuki, green obi; neck towel kept.',
  villager_c: 'Haori preset: olive haori coat (open) over a beige knee kimono, grey trousers; basket kept. Female base body, male-ish through clothes.',
  fox_a: 'Fox folk (happi + trousers): red-orange happi with cream edges over a cream inner, brown loose trousers; ears kept, tail on a chain.',
  fox_b: 'Fox folk (apron dress): rose dotted knee kimono, white apron, tied sleeves, small obi bow; ears kept, tail on a chain.',
  town_a: 'Night-town man preset (long kimono + haori): striped navy ankle kimono, plum-black haori, lantern kept. Female base body, male-ish through clothes.',
  town_b: 'Night-town woman preset (long kimono + wide obi): plum asanoha kimono, wide sleeves with dye, wide gold obi with a big back bow; hair bow kept.',
};
const SPRING = {
  sleeve: { stiffness: 0.35, gravityPower: 1.0, dragForce: 0.45, hitRadius: 0.035, colliders: ['hips', 'thighs', 'chest'] },
  skirt: { stiffness: 0.6, gravityPower: 0.5, dragForce: 0.5, hitRadius: 0.05, colliders: ['thighs', 'shins'] },
  tail: { stiffness: 0.4, gravityPower: 0.4, dragForce: 0.4, hitRadius: 0.025, colliders: ['hips', 'thighs'] },
  cape: { stiffness: 0.7, gravityPower: 0.6, dragForce: 0.5, hitRadius: 0.04, colliders: ['chest', 'upperArms'] },
  charm: { stiffness: 0.2, gravityPower: 1.0, dragForce: 0.3, hitRadius: 0.015, colliders: ['hips', 'thighs'] },
  beard: { stiffness: 0.8, gravityPower: 0.3, dragForce: 0.5, hitRadius: 0.02, colliders: ['chest'] },
};
const io = new NodeIO(); const frag = {};
for (const id of IDS) {
  const v1 = man['char_' + (id === 'banou' ? 'granny' : id)]; const file = id === 'banou' ? 'char_banou.glb' : `char_${id}_v2.glb`;
  const f = path.join(ROOT, '.tmp/costume/out', file); const doc = await io.read(f); const root = doc.getRoot();
  let tris = 0; const mn = [9, 9, 9], mx = [-9, -9, -9]; const mats = new Set(); const meshes = [];
  for (const nd of root.listNodes()) { const m = nd.getMesh(); if (!m) continue; meshes.push(nd.getName());
    for (const p of m.listPrimitives()) { mats.add(p.getMaterial().getName()); const ix = p.getIndices(); tris += ix.getCount() / 3; const P = p.getAttribute('POSITION').getArray(); const used = new Uint8Array(P.length / 3); const I = ix.getArray(); for (const i of I) used[i] = 1;
      for (let i = 0; i < used.length; i++) if (used[i]) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], P[i * 3 + a]); mx[a] = Math.max(mx[a], P[i * 3 + a]); } } }
  const info = JSON.parse(fs.readFileSync(path.join(ROOT, '.tmp/costume/out', id + '.chains.json'), 'utf8'));
  const chains = info.chains.map((c) => ({ root: c.joints[0], joints: c.joints, tail: c.joints[0].replace(/_01$/, '_end'), parent: c.parent, kind: c.kind, ...(c.theta !== undefined ? { theta: c.theta } : {}), ...(c.restRotation ? { restRotation: c.restRotation } : {}) }));
  const kinds = [...new Set(chains.map((c) => c.kind))];
  const outId = id === 'banou' ? 'char_banou' : `char_${id}_v2`;
  frag[outId] = { ...v1, file: `models/chars/${file}`, replaces: id === 'banou' ? null : 'char_' + id,
    author: v1.author.replace(/;.*$/, '') + '; procedural garments (original geometry + textures, .tmp/costume generator), add-ons and conversion by Moonveil Miko',
    size: mx.map((v, a) => +(v - mn[a]).toFixed(3)), tris, bytes: fs.statSync(f).size,
    meshes, materials: [...mats].sort(),
    secondaryChains: chains, ...(id === 'banou' ? { morphMesh: 'banou_face' } : {}), springDefaults: Object.fromEntries(kinds.map((k) => [k, SPRING[k]])),
    notes: (id === 'banou' ? 'Stone-mason elder 磐翁 as a real file (replaces the runtime dressBanou on char_granny). ' : `Costume v2 of ${'char_' + id}; same skeleton/bones/morphs/hipsHeight/clipsFrom as v1 plus new J_Sec_ chains. `) + LOOK[id] +
      ' Garment materials: cloth_* (A = shell texture on body UVs, B = loft atlas). Rest pose = T-pose with cloth hanging; the J_Sec_ chains are NOT animated by anim_ual and must be driven by the spring solver (see secondaryChains + springDefaults).' };
}
const out = path.join(ROOT, 'assets/_incoming/costume/manifest.fragment.json');
fs.writeFileSync(out, JSON.stringify(frag, null, 1)); console.log('wrote', out, Object.keys(frag).length);
for (const [k, v] of Object.entries(frag)) console.log(k, v.tris, v.bytes, v.size.join('x'), v.secondaryChains.length, v.materials.join(' '));
