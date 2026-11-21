// Pose / gesture synthesiser for the VRoid humanoid (J_Bip_*; all rest rotations identity, T-pose, facing +Z).
// A clip = keyed pose parameters -> per-channel monotone Hermite splines with per-segment easing, lag (overlap) and noise
// -> per-frame solve (spine distribution, clavicles, two-bone IK arms + legs with poles, wrist twist sharing, finger poses)
// -> local rotation tracks + hips translation at 30 fps.
//
// Axes (root space): +X = her left, +Y = up, +Z = her front.
// Euler params in degrees, order YXZ: x>0 bends forward, y>0 turns to her left, z>0 leans to her right.
// Key params (all optional, sticky: a missing param keeps the previous key's value):
//   hp [x,y,z] hips offset (m)     hr [x,y,z] hips rot      sp [x,y,z] spine (spread over Spine/Chest/UpperChest)
//   hd [x,y,z] head (neck 35% / head 65%)   eye [x,y] (deg, J_Adj eyes)
//   shL/shR [x,y,z] clavicle extra rot
//   Lp/Rp [x,y,z] wrist target   Lf/Rf finger direction   Lt/Rt thumb-side direction (wand direction for the right fist)
//   Lsp/Rsp 'root' | 'chest' | 'head' | 'hips' (space the key's hand target is given in, as REST-POSE coordinates of that bone)
//   Lpole/Rpole elbow hint dir (root space)   tw L/R forearm twist share (0..1, default .5)
//   FL/FR [x,y,z] ankle offset from rest   FLr/FRr [x,y,z] foot rot   kL/kR knee pole dir   toeL/toeR deg
//   gL/gR fingers [index, middle, ring, little, thumb, spread] curl 0..1
//   e  ease of the segment that starts at this key: lin (default, smooth through) | io | in | out | out3 | in3 | hold
import fs from 'node:fs';
import path from 'node:path';
import { Quaternion, Vector3, Euler, Matrix4 } from 'three';
import { NodeIO, Document } from '@gltf-transform/core';

export const FPS = 30;
const D2R = Math.PI / 180;
const io = new NodeIO();

// ---------------- skeleton ----------------
export async function loadSkeleton(file) {
  const doc = await io.readBinary(new Uint8Array(fs.readFileSync(file)));
  const scene = doc.getRoot().listScenes()[0];
  const bones = []; const by = {};
  const walk = (n, parent) => {
    const b = { name: n.getName(), parent, t: new Vector3(...n.getTranslation()), node: n, children: [] };
    b.rp = parent ? parent.rp.clone().add(b.t) : b.t.clone();
    bones.push(b); by[b.name] = b; if (parent) parent.children.push(b);
    for (const c of n.listChildren()) walk(c, b);
  };
  for (const n of scene.listChildren()) walk(n, null);
  return { bones, by, doc };
}

// ---------------- easing / splines ----------------
const EASE = {
  lin: (u) => u, io: (u) => u * u * (3 - 2 * u), in: (u) => u * u, out: (u) => 1 - (1 - u) * (1 - u),
  in3: (u) => u * u * u, out3: (u) => 1 - (1 - u) ** 3, hold: () => 0,
  out5: (u) => 1 - (1 - u) ** 5,
};
const CH_VEC = ['hp', 'hr', 'sp', 'hd', 'eye', 'shL', 'shR', 'Lp', 'Rp', 'Lf', 'Rf', 'Lt', 'Rt', 'Lpole', 'Rpole', 'FL', 'FR', 'FLr', 'FRr', 'kL', 'kR', 'toeL', 'toeR', 'gL', 'gR', 'twL', 'twR'];
const CH_STR = ['Lsp', 'Rsp'];

export const DEF = {
  hp: [0, 0, 0], hr: [0, 0, 0], sp: [0, 0, 0], hd: [0, 0, 0], eye: [0, 0], shL: [0, 0, 0], shR: [0, 0, 0],
  Lp: [0.19, 0.87, 0.03], Rp: [-0.19, 0.87, 0.03], Lf: [0.15, -1, 0.1], Rf: [-0.15, -1, 0.1], Lt: [0, 0, 1], Rt: [0, 0, 1],
  Lpole: [0.4, -0.3, -1], Rpole: [-0.4, -0.3, -1], FL: [0, 0, 0], FR: [0, 0, 0], FLr: [0, 0, 0], FRr: [0, 0, 0],
  kL: [0.1, 0, 1], kR: [-0.1, 0, 1], toeL: [0], toeR: [0], gL: [0.25, 0.3, 0.35, 0.4, 0.2, 0.15], gR: [0.25, 0.3, 0.35, 0.4, 0.2, 0.15],
  twL: [0.7], twR: [0.7], Lsp: 'root', Rsp: 'root',
};
// finger presets [index, middle, ring, little, thumb, spread]
export const G = {
  relax: [0.25, 0.3, 0.35, 0.4, 0.2, 0.15], open: [0.02, 0.02, 0.04, 0.06, 0, 0.7], flat: [0, 0, 0, 0, 0.05, 0],
  fist: [1, 1, 1, 1, 0.9, 0], wand: [0.75, 0.9, 0.95, 1, 0.75, 0], seal: [0, 0, 1, 1, 0.9, -0.2], point: [0, 1, 1, 1, 0.8, 0],
  soft: [0.12, 0.15, 0.2, 0.25, 0.1, 0.35], claw: [0.45, 0.5, 0.5, 0.55, 0.3, 0.8], card: [0.1, 0.12, 0.9, 1, 0.6, -0.1],
  cup: [0.3, 0.3, 0.3, 0.35, 0.3, 0.05], grip: [0.85, 0.9, 0.95, 1, 0.8, 0], beckon: [0.55, 0.6, 0.65, 0.7, 0.2, 0.2],
};

// monotone (Fritsch-Carlson-like per component) Hermite through keys; non-uniform time
function makeChannel(keys, name, dur, loop) {
  const n = keys.length; const dim = keys[0].v[name].length;
  const T = keys.map((k) => k.t); const V = keys.map((k) => k.v[name]);
  if (loop) { T.push(dur); V.push(V[0]); }
  const N = T.length;
  // tangents
  const M = [];
  for (let i = 0; i < N; i++) {
    const m = new Array(dim).fill(0);
    let ip, inx, tp, tn;
    if (loop) { ip = i === 0 ? N - 2 : i - 1; inx = i === N - 1 ? 1 : i + 1; tp = i === 0 ? T[N - 2] - dur : T[ip]; tn = i === N - 1 ? dur + T[1] : T[inx]; }
    else { ip = i - 1; inx = i + 1; tp = T[ip]; tn = T[inx]; }
    if ((loop || (i > 0 && i < N - 1)) && N > 2 || (loop && N === 2)) {
      for (let c = 0; c < dim; c++) {
        const a = V[i][c] - V[ip][c], b = V[inx][c] - V[i][c];
        if (a * b <= 0) { m[c] = 0; continue; }
        const da = a / Math.max(1e-4, T[i] - tp), db = b / Math.max(1e-4, tn - T[i]);
        // harmonic-ish mean keeps it monotone
        m[c] = (da * db * 2) / (da + db);
      }
    }
    M.push(m);
  }
  const ease = keys.map((k) => EASE[k.e || 'lin'] || EASE.lin);
  if (loop) ease.push(ease[0]);
  return (t) => {
    if (loop) { t = ((t % dur) + dur) % dur; } else t = Math.min(Math.max(t, T[0]), T[N - 1]);
    let i = 0; while (i < N - 2 && t >= T[i + 1]) i++;
    if (!loop && t >= T[N - 1]) return V[N - 1].slice();
    const h = Math.max(1e-6, T[i + 1] - T[i]); let u = (t - T[i]) / h; const ef = ease[i]; const warped = ef !== EASE.lin;
    u = ef(Math.min(1, Math.max(0, u)));
    const h00 = 2 * u ** 3 - 3 * u * u + 1, h10 = u ** 3 - 2 * u * u + u, h01 = -2 * u ** 3 + 3 * u * u, h11 = u ** 3 - u * u;
    const out = new Array(dim);
    for (let c = 0; c < dim; c++) {
      const m0 = warped ? 0 : M[i][c], m1 = warped ? 0 : M[i + 1][c];
      out[c] = h00 * V[i][c] + h10 * h * m0 + h01 * V[i + 1][c] + h11 * h * m1;
    }
    return out;
  };
}

// ---------------- helpers ----------------
const v3 = (a) => new Vector3(a[0], a[1], a[2]);
const qE = (a, k = 1) => new Quaternion().setFromEuler(new Euler((a[0] || 0) * D2R * k, (a[1] || 0) * D2R * k, (a[2] || 0) * D2R * k, 'YXZ'));
const qAxis = (ax, deg) => new Quaternion().setFromAxisAngle(ax.clone().normalize(), deg * D2R);
const basisQ = (a, p) => { // rotation whose x' = a, y' = p, z' = a x p
  const x = a.clone().normalize(); const y = p.clone().sub(x.clone().multiplyScalar(p.dot(x))).normalize(); const z = x.clone().cross(y);
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
};
const frameMap = (a0, p0, a1, p1) => basisQ(a1, p1).multiply(basisQ(a0, p0).invert());

// ---------------- solver ----------------
export function makeSolver(S) {
  const B = S.by;
  const len = (a, b) => B[b].rp.clone().sub(B[a].rp).length();
  const arm = (s) => ({ sh: B[`J_Bip_${s}_Shoulder`], ua: B[`J_Bip_${s}_UpperArm`], la: B[`J_Bip_${s}_LowerArm`], ha: B[`J_Bip_${s}_Hand`] });
  const leg = (s) => ({ ul: B[`J_Bip_${s}_UpperLeg`], ll: B[`J_Bip_${s}_LowerLeg`], ft: B[`J_Bip_${s}_Foot`], toe: B[`J_Bip_${s}_ToeBase`] });
  const A = { L: arm('L'), R: arm('R') }, Lg = { L: leg('L'), R: leg('R') };
  const sgn = { L: 1, R: -1 };

  // pose state per frame
  function solve(P) {
    const local = new Map(); // bone name -> Quaternion
    const W = new Map(); // bone -> {q, p}
    const set = (b, q) => local.set(b.name, q);
    const fk = (b) => { // world of b from parent world + local
      const pw = b.parent ? W.get(b.parent.name) : { q: new Quaternion(), p: new Vector3() };
      const q = pw.q.clone().multiply(local.get(b.name) || new Quaternion());
      const p = b.parent ? b.t.clone().applyQuaternion(pw.q).add(pw.p) : b.t.clone();
      W.set(b.name, { q, p }); return W.get(b.name);
    };
    const hipsT = B.J_Bip_C_Hips.t.clone().add(v3(P.hp));
    // root + hips
    fk(B.Root);
    set(B.J_Bip_C_Hips, qE(P.hr));
    { const q = qE(P.hr); W.set('J_Bip_C_Hips', { q, p: hipsT.clone() }); }
    const fr = [0.32, 0.36, 0.32];
    ['J_Bip_C_Spine', 'J_Bip_C_Chest', 'J_Bip_C_UpperChest'].forEach((n, i) => { set(B[n], qE(P.sp, fr[i])); fk(B[n]); });
    set(B.J_Bip_C_Neck, qE(P.hd, 0.35)); fk(B.J_Bip_C_Neck);
    set(B.J_Bip_C_Head, qE(P.hd, 0.65)); fk(B.J_Bip_C_Head);
    for (const e of ['J_Adj_L_FaceEye', 'J_Adj_R_FaceEye']) if (B[e]) { set(B[e], qE([-(P.eye[0] || 0), P.eye[1] || 0, 0])); fk(B[e]); }
    const restW = (name) => B[name].rp;
    const spaceXf = (sp) => { // maps rest-pose root coords -> current root coords
      const bn = sp === 'chest' ? 'J_Bip_C_UpperChest' : sp === 'head' ? 'J_Bip_C_Head' : sp === 'hips' ? 'J_Bip_C_Hips' : null;
      if (!bn) return { p: (v) => v.clone(), d: (v) => v.clone() };
      const w = W.get(bn); const r = restW(bn);
      return { p: (v) => v.clone().sub(r).applyQuaternion(w.q).add(w.p), d: (v) => v.clone().applyQuaternion(w.q) };
    };
    const warn = [];
    for (const s of ['L', 'R']) {
      const a = A[s]; const sg = sgn[s];
      const X = P['_' + s]; // pre-resolved world targets {p, f, t}
      // clavicle: aim part of the way toward the target + explicit extra
      const chest = W.get('J_Bip_C_UpperChest');
      const shRestDir = new Vector3(sg, 0, 0);
      const toT = X.p.clone().sub(chest.p.clone().add(a.sh.t.clone().applyQuaternion(chest.q))).applyQuaternion(chest.q.clone().invert());
      const aim = new Quaternion().setFromUnitVectors(shRestDir, toT.clone().normalize());
      const auto = new Quaternion().slerp(aim, 0.18);
      // limit auto clavicle to ~22 deg
      const ang = 2 * Math.acos(Math.min(1, Math.abs(auto.w))) / D2R; if (ang > 22) auto.slerp(new Quaternion(), 1 - 22 / ang);
      set(a.sh, auto.multiply(qE(P['sh' + s]))); fk(a.sh);
      // two-bone IK
      const Sw = W.get(a.sh.name).p.clone().add(a.ua.t.clone().applyQuaternion(W.get(a.sh.name).q));
      const la = a.la.t.length(), lb = a.ha.t.length();
      let d = X.p.clone().sub(Sw); let dist = d.length(); const u = d.clone().normalize();
      if (dist > (la + lb) * 0.998) { warn.push(s + ' reach ' + (dist - (la + lb)).toFixed(3)); dist = (la + lb) * 0.998; }
      dist = Math.max(dist, Math.abs(la - lb) + 0.02);
      const pole = v3(P[s + 'pole']); const pp = pole.clone().sub(u.clone().multiplyScalar(pole.dot(u))).normalize();
      const cosA = (la * la + dist * dist - lb * lb) / (2 * la * dist); const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
      const E = Sw.clone().add(u.clone().multiplyScalar(la * cosA)).add(pp.clone().multiplyScalar(la * sinA));
      const Tp = Sw.clone().add(u.clone().multiplyScalar(dist));
      const a0 = a.la.t.clone().normalize(), b0 = a.ha.t.clone().normalize(), p0 = new Vector3(0, 0, -1);
      const a1 = E.clone().sub(Sw).normalize(), a2 = Tp.clone().sub(E).normalize();
      const qUA = frameMap(a0, p0, a1, pp); let qLA = frameMap(b0, p0, a2, pp);
      // hand world rotation from finger / thumb directions (rest: fingers = +-X, thumb side = +Z)
      const qH = frameMap(new Vector3(sg, 0, 0), new Vector3(0, 0, 1), X.f, X.t);
      // share the twist about the forearm axis
      let hl = qLA.clone().invert().multiply(qH);
      const ax = b0.clone(); const pr = new Vector3(hl.x, hl.y, hl.z).projectOnVector(ax);
      const twist = new Quaternion(pr.x, pr.y, pr.z, hl.w).normalize();
      const tw = P['tw' + s][0];
      qLA = qLA.multiply(new Quaternion().slerp(twist, tw));
      // locals
      const shW = W.get(a.sh.name).q;
      set(a.ua, shW.clone().invert().multiply(qUA)); fk(a.ua);
      set(a.la, qUA.clone().invert().multiply(qLA)); fk(a.la);
      hl = qLA.clone().invert().multiply(qH); set(a.ha, hl); fk(a.ha);
      { const pr2 = new Vector3(hl.x, hl.y, hl.z).projectOnVector(ax); const twq = new Quaternion(pr2.x, pr2.y, pr2.z, hl.w).normalize(); const sw = hl.clone().multiply(twq.clone().invert());
        const swing = 2 * Math.acos(Math.min(1, Math.abs(sw.w))) / D2R, twd = 2 * Math.acos(Math.min(1, Math.abs(twq.w))) / D2R;
        if (swing > 75) warn.push(s + ' wristSwing ' + swing.toFixed(0)); if (twd > 60) warn.push(s + ' wristTwist ' + twd.toFixed(0));
        const ft = 2 * Math.acos(Math.min(1, Math.abs(twist.w))) / D2R * tw; if (ft > 100) warn.push(s + ' forearmTwist ' + ft.toFixed(0)); }
      // fingers
      const g = P['g' + s]; const curlAx = new Vector3(0, 0, -sg);
      const fing = [['Index', g[0], 1], ['Middle', g[1], 0.3], ['Ring', g[2], -0.4], ['Little', g[3], -1]];
      for (const [fn, c, spr] of fing) {
        const ang = [72, 95, 62];
        for (let i = 1; i <= 3; i++) {
          const b = B[`J_Bip_${s}_${fn}${i}`]; if (!b) continue;
          let q = qAxis(curlAx, c * ang[i - 1] * (fn === 'Little' && i === 1 ? 1.05 : 1));
          if (i === 1) q = qAxis(new Vector3(0, -sg, 0), spr * g[5] * 13).multiply(q);
          set(b, q);
        }
      }
      const th = g[4]; const td = new Vector3(0.7 * sg, 0, 0.7); const k = td.clone().cross(new Vector3(0, -1, 0));
      if (B[`J_Bip_${s}_Thumb1`]) {
        set(B[`J_Bip_${s}_Thumb1`], qAxis(new Vector3(0, sg, 0), 28 * th).multiply(qAxis(k, 18 * th)));
        set(B[`J_Bip_${s}_Thumb2`], qAxis(k, 28 * th)); set(B[`J_Bip_${s}_Thumb3`], qAxis(k, 38 * th));
      }
    }
    // legs
    for (const s of ['L', 'R']) {
      const l = Lg[s];
      const hw = W.get('J_Bip_C_Hips');
      const Sw = l.ul.t.clone().applyQuaternion(hw.q).add(hw.p);
      const target = l.ft.rp.clone().add(v3(P['F' + s]));
      const la = l.ll.t.length(), lb = l.ft.t.length();
      let d = target.clone().sub(Sw); let dist = d.length(); const u = d.clone().normalize();
      if (dist > (la + lb) * 0.9995) { if (dist - (la + lb) > 0.01) warn.push(s + ' leg reach ' + (dist - la - lb).toFixed(3)); dist = (la + lb) * 0.9995; }
      const pole = v3(P['k' + s]); const pp = pole.clone().sub(u.clone().multiplyScalar(pole.dot(u))).normalize();
      const cosA = (la * la + dist * dist - lb * lb) / (2 * la * dist); const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
      const E = Sw.clone().add(u.clone().multiplyScalar(la * cosA)).add(pp.clone().multiplyScalar(la * sinA));
      const Tp = Sw.clone().add(u.clone().multiplyScalar(dist));
      const a0 = l.ll.t.clone().normalize(), b0 = l.ft.t.clone().normalize(), p0 = new Vector3(0, 0, 1);
      const qUL = frameMap(a0, p0, E.clone().sub(Sw).normalize(), pp), qLL = frameMap(b0, p0, Tp.clone().sub(E).normalize(), pp);
      const qF = qE(P['F' + s + 'r']);
      set(l.ul, hw.q.clone().invert().multiply(qUL)); set(l.ll, qUL.clone().invert().multiply(qLL)); set(l.ft, qLL.clone().invert().multiply(qF));
      set(l.toe, qE([-(P['toe' + s][0] || 0), 0, 0]));
    }
    return { local, hips: hipsT, warn, W, spaceXf };
  }

  // resolve hand targets for one frame: needs the spine FK first -> two passes (cheap)
  function frame(P) {
    // pass 1: spine only to get spaces
    const tmp = { ...P, _L: { p: v3(P.Lp), f: v3(P.Lf), t: v3(P.Lt) }, _R: { p: v3(P.Rp), f: v3(P.Rf), t: v3(P.Rt) } };
    const r1 = solve(tmp);
    for (const s of ['L', 'R']) {
      if (!P['_' + s + 'keys']) continue;
      tmp['_' + s] = P['_' + s + 'keys'](r1.spaceXf);
    }
    return solve(tmp);
  }
  return { solve, frame, A, Lg };
}

// ---------------- clip build ----------------
// clip = { name, dur, loop, keys:[{t, ...params, e}], lag:{ch:sec}, noise:{ch:[amp, freq]}, breath:deg, desc, marks, upper }
export function sampleClip(S, solver, clip) {
  const dur = clip.dur; const loop = !!clip.loop;
  // per-channel keys: a channel only has keys where a key mentions it (hand groups Lp/Lf/Lt/Lsp are sticky within the group)
  const base = { ...DEF, ...(clip.base || {}) };
  const arr = (x) => (Array.isArray(x) ? x : [x]);
  const ks = clip.keys.slice().sort((a, b) => a.t - b.t);
  const chanKeys = (c) => {
    let kc = ks.filter((k) => k[c] !== undefined).map((k) => ({ t: k.t, e: (k.ee && k.ee[c]) || k.e, v: { [c]: arr(k[c]) } }));
    if (!kc.length) kc = [{ t: 0, v: { [c]: arr(base[c]) } }];
    if (loop && kc[0].t > 0) kc.unshift({ t: 0, e: kc[kc.length - 1].e, v: kc[kc.length - 1].v });
    return kc;
  };
  const chans = {};
  for (const c of CH_VEC) { if (/^[LR](p|f|t)$/.test(c)) { chans[c] = () => arr(base[c]).slice(); continue; } const kc = chanKeys(c); chans[c] = kc.length === 1 ? (() => kc[0].v[c].slice()) : makeChannel(kc, c, dur, loop); }
  const handKeys = {};
  for (const s of ['L', 'R']) {
    let prev = { p: base[s + 'p'], f: base[s + 'f'], t: base[s + 't'], sp: base[s + 'sp'] }; const hk = [];
    for (const k of ks) {
      if (k[s + 'p'] === undefined && k[s + 'f'] === undefined && k[s + 't'] === undefined && k[s + 'sp'] === undefined) continue;
      const v = { p: k[s + 'p'] ?? prev.p, f: k[s + 'f'] ?? prev.f, t: k[s + 't'] ?? prev.t, sp: k[s + 'sp'] ?? prev.sp };
      hk.push({ t: k.t, e: (k.ee && k.ee[s]) || k.e, v }); prev = v;
    }
    if (!hk.length) hk.push({ t: 0, v: prev });
    if (loop && hk[0].t > 0) hk.unshift({ t: 0, e: hk[hk.length - 1].e, v: hk[hk.length - 1].v });
    handKeys[s] = hk;
  }
  const lag = clip.lag || {}; const noise = clip.noise || {};
  const qf = (f) => (loop ? Math.max(1, Math.round(f * dur)) / dur : f); // loop-periodic frequencies
  const evalAt = (c, t) => {
    const tt = t - (lag[c] || 0);
    const v = chans[c](tt);
    if (noise[c]) { const [amp, fr] = noise[c]; for (let i = 0; i < v.length; i++) v[i] += amp * (Math.sin(t * qf(fr) * 6.283 + i * 1.7 + c.length) * 0.6 + Math.sin(t * qf(fr * 2.71) * 6.283 + i * 0.6) * 0.4); }
    return v;
  };
  // per-key hand targets evaluated in their own spaces each frame, then splined in root space
  const handFn = (s, t) => (xf) => {
    const hk = handKeys[s];
    const tmpKeys = hk.map((k) => { const X = xf(k.v.sp); return { t: k.t, e: k.e, v: { p: X.p(v3(k.v.p)).toArray(), f: X.d(v3(k.v.f)).toArray(), t: X.d(v3(k.v.t)).toArray() } }; });
    const out = {};
    for (const nm of ['p', 'f', 't']) { out[nm] = tmpKeys.length === 1 ? v3(tmpKeys[0].v[nm]) : v3(makeChannel(tmpKeys, nm, dur, loop)(t - (lag[s + nm] ?? lag[s] ?? 0))); }
    if (noise[s + 'p']) { const [amp, fr] = noise[s + 'p']; out.p.add(new Vector3(Math.sin(t * qf(fr) * 6.283), Math.sin(t * qf(fr * 1.13) * 6.283 + 1), Math.sin(t * qf(fr * 0.84) * 6.283 + 2)).multiplyScalar(amp)); }
    out.f.normalize(); out.t.normalize(); return out;
  };
  const allRoot = (s) => handKeys[s].every((k) => k.v.sp === 'root');
  const nF = Math.round(dur * FPS) + 1;
  const times = new Float32Array(nF); const tracks = new Map(); const hips = new Float32Array(nF * 3);
  const warns = new Set();
  const breath = clip.breath ?? 0.8; const bp0 = clip.breathPer || 3.2; const bPer = loop ? dur / Math.max(1, Math.round(dur / bp0)) : bp0;
  for (let f = 0; f < nF; f++) {
    const t = Math.min(dur, f / FPS); times[f] = t;
    const P = {};
    for (const c of CH_VEC) P[c] = evalAt(c, t);
    P.sp = P.sp.slice(); P.sp[0] += breath * Math.sin(t / bPer * 6.283); P.hd = P.hd.slice(); P.hd[0] -= breath * 0.6 * Math.sin(t / bPer * 6.283 - 0.4);
    for (const s of ['L', 'R']) {
      const hf = handFn(s, t);
      if (allRoot(s)) { const X = hf((sp) => ({ p: (v) => v.clone(), d: (v) => v.clone() })); P['_' + s + 'keys'] = () => X; }
      else P['_' + s + 'keys'] = hf;
    }
    const r = solver.frame(P);
    r.warn.forEach((w) => warns.add(w));
    for (const [n, q] of r.local) {
      if (!tracks.has(n)) tracks.set(n, new Float32Array(nF * 4));
      const arr = tracks.get(n);
      if (f > 0) { const o = (f - 1) * 4; if (arr[o] * q.x + arr[o + 1] * q.y + arr[o + 2] * q.z + arr[o + 3] * q.w < 0) { q.x = -q.x; q.y = -q.y; q.z = -q.z; q.w = -q.w; } }
      arr.set([q.x, q.y, q.z, q.w], f * 4);
    }
    hips.set([r.hips.x, r.hips.y, r.hips.z], f * 3);
  }
  return { name: clip.name, times, tracks, hips, dur, warns: [...warns] };
}

export async function writeLibrary(S, sampled, outFile, copyright) {
  const out = new Document(); const buffer = out.createBuffer(); const scene = out.createScene('Scene'); out.getRoot().setDefaultScene(scene);
  const nodeOf = new Map();
  (function copy(b, parent) { const n = out.createNode(b.name).setTranslation(b.t.toArray()); (parent || scene).addChild(n); nodeOf.set(b.name, n); b.children.forEach((c) => copy(c, n)); })(S.bones[0], null);
  for (const c of sampled) {
    const a = out.createAnimation(c.name);
    const tAcc = out.createAccessor().setType('SCALAR').setArray(c.times).setBuffer(buffer);
    const t1 = out.createAccessor().setType('SCALAR').setArray(new Float32Array([0])).setBuffer(buffer);
    for (const b of S.bones) {
      if (b.name === 'Root') continue;
      let arr = c.tracks.get(b.name); if (!arr) arr = new Float32Array([0, 0, 0, 1]);
      let isConst = true; for (let i = 4; i < arr.length && isConst; i++) if (Math.abs(arr[i] - arr[i % 4]) > 1e-4) isConst = false;
      const sm = out.createAnimationSampler().setInput(isConst ? t1 : tAcc).setOutput(out.createAccessor().setType('VEC4').setArray(isConst ? arr.slice(0, 4) : arr).setBuffer(buffer)).setInterpolation('LINEAR');
      a.addSampler(sm).addChannel(out.createAnimationChannel().setTargetNode(nodeOf.get(b.name)).setTargetPath('rotation').setSampler(sm));
    }
    const hs = out.createAnimationSampler().setInput(tAcc).setOutput(out.createAccessor().setType('VEC3').setArray(c.hips).setBuffer(buffer)).setInterpolation('LINEAR');
    a.addSampler(hs).addChannel(out.createAnimationChannel().setTargetNode(nodeOf.get('J_Bip_C_Hips')).setTargetPath('translation').setSampler(hs));
  }
  out.getRoot().getAsset().generator = 'moonveil anim2 synth.mjs';
  out.getRoot().getAsset().copyright = copyright;
  const glb = await io.writeBinary(out);
  fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, glb);
  return glb.length;
}

// mirror a clip's keys left <-> right
export function mirrorKeys(keys) {
  const mp = (a) => (a ? [-a[0], a[1], a[2]] : a); const mr = (a) => (a ? [a[0], -a[1], -a[2]] : a);
  return keys.map((k) => {
    const o = { t: k.t, e: k.e };
    for (const [c, v] of Object.entries(k)) {
      if (c === 't' || c === 'e') continue;
      const SW = { FLr: 'FRr', FRr: 'FLr' };
      const sw = SW[c] || c.replace(/^L(?=[a-z]|$)/, '#').replace(/^R(?=[a-z]|$)/, 'L').replace(/^#/, 'R')
        .replace(/L$/, '#').replace(/R$/, 'L').replace(/#$/, 'R');
      let nv = v;
      if (/^(hp|Lp|Rp|Lf|Rf|Lt|Rt|Lpole|Rpole|FL|FR|kL|kR)$/.test(c)) nv = mp(v);
      else if (/^(hr|sp|hd|shL|shR|FLr|FRr)$/.test(c)) nv = mr(v);
      else if (c === 'eye') nv = [v[0], -v[1]];
      o[sw] = nv;
    }
    return o;
  });
}
