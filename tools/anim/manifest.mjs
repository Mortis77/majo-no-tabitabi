import fs from 'node:fs';
import { CLIPS } from './clips/index.mjs';
const glb = '../../assets/_incoming/anim2/anim_miko.glb';
const clips = CLIPS.map((c) => {
  const o = { name: c.name, duration: c.dur, loop: !!c.loop, desc: c.desc, upperBodyOk: !!c.upper };
  if (c.marks) o.marks = c.marks; if (c.chain) o.chainEvery = c.chain; if (c.gohei) o.gohei = c.gohei; if (c.prop) o.prop = c.prop;
  return o;
});
const frag = { anim_miko: {
  file: 'models/chars/anim_miko.glb', type: 'model', license: 'CC0',
  author: 'Moonveil Miko (original keyframed animation, anim2 pose synthesiser)', source: 'original work; skeleton = VRoid humanoid node names as in anim_ual (no third-party motion data)',
  scale: 1, size: [0, 0, 0], tris: 0, clips,
  bones: { hips: 'J_Bip_C_Hips', spine: 'J_Bip_C_Spine', chest: 'J_Bip_C_Chest', upperChest: 'J_Bip_C_UpperChest', neck: 'J_Bip_C_Neck', head: 'J_Bip_C_Head', handR: 'J_Bip_R_Hand', handL: 'J_Bip_L_Hand', footR: 'J_Bip_R_Foot', footL: 'J_Bip_L_Foot', eyeL: 'J_Adj_L_FaceEye', eyeR: 'J_Adj_R_FaceEye' },
  hipsHeight: 0.887,
  notes: 'Second clip library on the anim_ual skeleton (mesh-less: Root > J_Bip_* incl. J_Adj eyes). 30 fps, LINEAR. Every clip keys every bone (rotation) + J_Bip_C_Hips.translation; hips y is absolute for hipsHeight 0.887 -> multiply by hipsHeight/0.887 per character exactly like anim_ual. In place (hips x/z sway only, mean ~0). *_Loop clips are seamless by construction (seam <0.05 deg). marks are seconds into the clip (release = the frame the spell leaves the hand). upperBodyOk = reads correctly when only spine-and-up tracks are layered over locomotion (UPPER_BONE). gohei: hold = right fist grips the wand with the player.js GOHEI_MOVE attach (never GOHEI_IDLE during these clips); hide = hands are open or both busy, hide or sheath the gohei. prop = what an NPC holds in handR/handL (game-side). Integration table: assets/_incoming/anim2/NOTES.md.',
} };
fs.writeFileSync('../../assets/_incoming/anim2/manifest.fragment.json', JSON.stringify(frag, null, 2) + '\n');
console.log(clips.length, 'clips');
