// Fitting data for the garment maker, measured on the built figure (never typed by hand): landmark heights, girths
// (plane sections of the skin), body regions per vertex (from the dominant bones), capsule colliders per bone.
//   -> assets/models/sculpt/akari_base.regions.json   and the numbers block of .tmp/sculpt/akari_base/FITTING.md
import { UNDER } from '../assets/akari_under.mjs';
import { HEAD } from '../assets/akari_head.mjs';
import { robeClear } from '../assets/akari_under.mjs';
import { skinMesh } from '../rig.mjs';
import { fkPose } from './weights.mjs';

/** perimeter of the section of mesh { pos, idx } with the plane n.p = d, counting segments whose midpoint passes keep() */
export function girth(mesh, n, d, keep = () => true) {
  const { pos, idx } = mesh; let sum = 0; const box = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  const s = (v) => n[0] * pos[v * 3] + n[1] * pos[v * 3 + 1] + n[2] * pos[v * 3 + 2] - d;
  for (let t = 0; t < idx.length; t += 3) {
    const v = [idx[t], idx[t + 1], idx[t + 2]], sv = v.map(s), pts = [];
    for (let k = 0; k < 3; k++) { const a = k, b = (k + 1) % 3; if ((sv[a] > 0) !== (sv[b] > 0)) { const u = sv[a] / (sv[a] - sv[b]); pts.push([0, 1, 2].map((c) => pos[v[a] * 3 + c] + (pos[v[b] * 3 + c] - pos[v[a] * 3 + c]) * u)); } }
    if (pts.length !== 2) continue;
    const m = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2, (pts[0][2] + pts[1][2]) / 2];
    if (!keep(m)) continue;
    sum += Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1], pts[0][2] - pts[1][2]);
    for (const p of pts) for (let c = 0; c < 3; c++) { box[c] = Math.min(box[c], p[c]); box[c + 3] = Math.max(box[c + 3], p[c]); }
  }
  return { girth: sum, box };
}

const REGION_OF = [
  [/C_Head$|FaceEye/, 'head'], [/C_Neck/, 'neck'], [/C_UpperChest|C_Chest/, 'chest'], [/C_Spine/, 'waist'], [/C_Hips/, 'hips'],
  [/_Shoulder/, 'shoulder'], [/_UpperArm/, 'upperArm'], [/_LowerArm/, 'forearm'], [/_Hand|Thumb|Index|Middle|Ring|Little/, 'hand'],
  [/_UpperLeg/, 'thigh'], [/_LowerLeg/, 'shin'], [/_Foot|_ToeBase/, 'foot'],
];
export const REGIONS = ['none', 'head', 'neck', 'chest', 'waist', 'hips', 'shoulder_L', 'shoulder_R', 'upperArm_L', 'upperArm_R', 'forearm_L', 'forearm_R', 'hand_L', 'hand_R', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'foot_L', 'foot_R'];

export function fittingData(fig) {
  const { rig, skin } = fig, J = (n) => rig.bone('J_Bip_' + n).head, mm = (v) => Math.round(v * 1000);
  const names = rig.jointNames;
  const regionOfJoint = names.map((nm) => { for (const [re, r] of REGION_OF) if (re.test(nm)) { const side = /_L_/.test(nm) ? '_L' : /_R_/.test(nm) ? '_R' : ''; return REGIONS.indexOf(REGIONS.includes(r + side) ? r + side : r); } return 0; });
  const regionOf = (p) => { const n = p.pos.length / 3, out = new Array(n); for (let v = 0; v < n; v++) { const acc = {}; for (let k = 0; k < 4; k++) { const r = regionOfJoint[p.J[v * 4 + k]]; acc[r] = (acc[r] || 0) + p.W[v * 4 + k]; } let best = 0, bw = -1; for (const r in acc) if (acc[r] > bw) { bw = acc[r]; best = +r; } out[v] = best; } return out; };
  const body = fig.prims.find((p) => p.material === 'Body'), under = fig.prims.find((p) => p.material === 'cloth_white');
  // ---- girths on the welded skin
  const torso = (m) => Math.abs(m[0]) < 0.17 && m[1] < 1.3;
  const H = (y, keep = torso) => girth(skin, [0, 1, 0], y, keep);
  let waist = { girth: 9 }, hip = { girth: 0 };
  for (let y = 0.97; y <= 1.09; y += 0.004) { const g = H(y); if (g.girth < waist.girth) waist = { ...g, y }; }
  for (let y = 0.852; y <= 0.93; y += 0.004) { const g = H(y); if (g.girth > hip.girth) hip = { ...g, y }; }
  const along = (a, b, t, r = 0.11) => { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d), n = d.map((v) => v / l), c = a.map((v, i) => v + d[i] * t); return girth(skin, n, n[0] * c[0] + n[1] * c[1] + n[2] * c[2], (m) => m[0] > 0.0005 && Math.hypot(m[0] - c[0], m[1] - c[1], m[2] - c[2]) < r).girth; };   // her left limb only
  const maxAlong = (a, b, t0, t1, fn = Math.max) => { let best = null; for (let t = t0; t <= t1 + 1e-9; t += 0.04) { const g = along(a, b, t); if (best === null || fn(g, best.g) === g) best = { g, t }; } return best; };
  const hipJ = J('L_UpperLeg'), knee = J('L_LowerLeg'), ank = J('L_Foot'), sh = J('L_UpperArm'), el = J('L_LowerArm'), wr = J('L_Hand');
  let top = -1, sole = 9, crotch = 9, shoulderX = 0, shoulderY = 0;
  for (let v = 0; v < skin.pos.length / 3; v++) { const x = skin.pos[v * 3], y = skin.pos[v * 3 + 1]; top = Math.max(top, y); sole = Math.min(sole, y); if (Math.abs(x) < 0.0004 && y > 0.7 && y < 0.9) crotch = Math.min(crotch, y); /* on the mid-plane only: the inner thighs run beside it */ if (y > 1.2 && y < 1.3 && Math.abs(x) > 0.1 && Math.abs(x) < 0.16 && y > shoulderY) { shoulderY = y; shoulderX = Math.abs(x); } }
  let neck = { girth: 9 }; for (let y = 1.284; y <= 1.312; y += 0.002) { const g = girth(skin, [0, 1, 0], y, (q) => Math.hypot(q[0], q[2] + 0.012) < 0.056); if (g.box[3] - g.box[0] < 0.08 && g.box[5] - g.box[2] < 0.08 && g.girth > 0.15 && g.girth < neck.girth) neck = { ...g, y }; }
  // the width she shows in game: shoulders with the arms hanging (78 degrees down from the bind pose)
  const down = skinMesh(skin.pos, skin.nrm, skin.J, skin.W, fkPose(rig, { J_Bip_L_UpperArm: [0, 0, -78], J_Bip_R_UpperArm: [0, 0, 78] })).pos; let shW = 0;
  for (let v = 0; v < down.length / 3; v++) if (down[v * 3 + 1] > 1.16 && down[v * 3 + 1] < 1.3) shW = Math.max(shW, Math.abs(down[v * 3]));
  const calf = maxAlong(knee, ank, 0.1, 0.6), ankle = maxAlong(knee, ank, 0.7, 0.98, Math.min), thighTop = along(hipJ, knee, 0.14), fore = maxAlong(el, wr, 0.05, 0.5), wrist = maxAlong(el, wr, 0.8, 0.98, Math.min);
  const m = {
    stature_bare_mm: mm(top - sole), stature_on_zori_mm: mm(top), heads: +((top - sole) / (HEAD.topY - fig.faceLandmarks.chinY)).toFixed(2), head_height_mm: mm(HEAD.topY - fig.faceLandmarks.chinY),
    heights_m: { sole: +sole.toFixed(3), ankle_joint: +ank[1].toFixed(3), knee_joint: +knee[1].toFixed(3), crotch: +crotch.toFixed(3), hip_joint: +hipJ[1].toFixed(3), hip_fullest: +hip.y.toFixed(3), waist_narrowest: +waist.y.toFixed(3), under_bust: 1.115, bust: 1.156, armpit: 1.19, shoulder_top: +shoulderY.toFixed(3), neck_base: 1.268, neck_narrowest: +neck.y.toFixed(3), chin: +fig.faceLandmarks.chinY.toFixed(3), mouth: +fig.faceLandmarks.mouthY.toFixed(3), eye_line: +fig.faceLandmarks.eyeY.toFixed(3), crown: +top.toFixed(3) },
    girths_mm: { neck: mm(neck.girth), bust: mm(H(1.156).girth), under_bust: mm(H(1.115).girth), waist: mm(waist.girth), hip: mm(hip.girth), thigh_top: mm(thighTop), thigh_mid: mm(along(hipJ, knee, 0.5)), knee: mm(along(hipJ, knee, 1.0)), calf: mm(calf.g), ankle: mm(ankle.g), upper_arm: mm(along(sh, el, 0.45)), elbow: mm(along(sh, el, 1.0)), forearm: mm(fore.g), wrist: mm(wrist.g) },
    widths_mm: { shoulders_arms_down: mm(2 * shW), shoulder_joints: mm(2 * sh[0]), neck: mm(neck.box[3] - neck.box[0]), waist: mm(waist.box[3] - waist.box[0]), waist_depth: mm(waist.box[5] - waist.box[2]), hip: mm(hip.box[3] - hip.box[0]), hip_depth: mm(hip.box[5] - hip.box[2]) },
    lengths_mm: { upper_arm: mm(Math.hypot(el[0] - sh[0], el[1] - sh[1], el[2] - sh[2])), forearm: mm(Math.hypot(wr[0] - el[0], wr[1] - el[1], wr[2] - el[2])), hand: mm(rig.bone('J_Bip_L_Middle3_end').head[0] - wr[0]), thigh: mm(hipJ[1] - knee[1]), shin: mm(knee[1] - ank[1]), inseam: mm(crotch - sole), foot: 190, back_neck_to_waist: mm(1.268 - waist.y) },
    undergarment: { robe_clearance_mm: UNDER.robe * 1000, robe_clearance_at_cord_mm: UNDER.cinch * 1000, robe_clearance_at_hem_mm: +(robeClear(UNDER.hemY) * 1000).toFixed(1), shorts_clearance_mm: UNDER.shorts * 1000, robe_hem_y: UNDER.hemY, sleeve_end_x: UNDER.sleeveX, shorts_top_y: UNDER.shortsTopY, shorts_leg_y: UNDER.legY, cord_y: UNDER.tieY, cord_width_mm: UNDER.tieHalf * 2000, cord_outer_mm: (UNDER.cinch + UNDER.tieLift) * 1000, collar_apex: UNDER.neckApex },
  };
  // ---- colliders: one capsule per limb / trunk bone, radius = 80th percentile distance of its dominant vertices from the axis
  const col = [];
  for (const [a, b] of [['C_Hips', 'C_Spine'], ['C_Spine', 'C_Chest'], ['C_Chest', 'C_UpperChest'], ['C_UpperChest', 'C_Neck'], ['C_Neck', 'C_Head'], ...['L', 'R'].flatMap((s) => [[`${s}_UpperArm`, `${s}_LowerArm`], [`${s}_LowerArm`, `${s}_Hand`], [`${s}_UpperLeg`, `${s}_LowerLeg`], [`${s}_LowerLeg`, `${s}_Foot`], [`${s}_Foot`, `${s}_ToeBase`]])]) {
    const A = J(a), B = J(b), d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], l = Math.hypot(...d), n = d.map((v) => v / l), ja = names.indexOf('J_Bip_' + a), ds = [];
    for (let v = 0; v < skin.pos.length / 3; v++) { if (skin.J[v * 4] !== ja || skin.W[v * 4] < 0.5) continue; const p = [skin.pos[v * 3] - A[0], skin.pos[v * 3 + 1] - A[1], skin.pos[v * 3 + 2] - A[2]], t = p[0] * n[0] + p[1] * n[1] + p[2] * n[2]; if (t < 0 || t > l) continue; ds.push(Math.hypot(p[0] - n[0] * t, p[1] - n[1] * t, p[2] - n[2] * t)); }
    ds.sort((x, y) => x - y);
    col.push({ bone: 'J_Bip_' + a, to: 'J_Bip_' + b, length: +l.toFixed(4), radius: +(ds[Math.floor(ds.length * 0.8)] || 0.03).toFixed(4), radius_max: +(ds[ds.length - 1] || 0.03).toFixed(4) });
  }
  col.push({ bone: 'J_Bip_C_Head', sphere: true, centre: [0, 1.428, -0.01], radius: 0.082 });
  const count = (arr) => { const c = {}; for (const r of arr) c[REGIONS[r]] = (c[REGIONS[r]] || 0) + 1; return c; };
  const rb = regionOf(body), ru = under ? regionOf(under) : [];
  const regions = { about: 'akari_base.glb: body region id per vertex, in the vertex order of the primitive as written (node / material). ids index `names`.', names: REGIONS, akari_body: { material: 'Body', verts: rb.length, region: rb }, akari_under: under ? { material: 'cloth_white', verts: ru.length, region: ru } : null, colliders: col, measurements: m };
  return { regions, measurements: m, colliders: col, counts: { body: count(rb), under: count(ru) } };
}
