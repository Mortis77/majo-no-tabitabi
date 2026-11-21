#!/usr/bin/env node
// Put 灯里's LONG hair (hair 2, tools/sculpt/figure/build-hair2.mjs -> assets/models/sculpt/akari_hair2.glb) on any of her
// character files. The long hair needs spring chains the base skeleton does not have (J_Sec_HairBack_<n>_<nn>,
// J_Sec_HairSideL_1_<nn>, J_Sec_HairSideR_1_<nn> + their _end leaves). This composer:
//   1. copies every joint of the hair file that the character lacks (matched BY NAME) into the character: same name, same
//      parent (by name), same local rest transform, its inverse bind matrix; the new joints are APPENDED to the skin's joint
//      list, so every existing joint keeps its index, name, parent, rest pose and inverse bind (and every mesh's JOINTS_0,
//      every clip) — the _end leaves come along as plain nodes;
//   2. swaps the nodes akari_hair + akari_ribbon with swap-hair.mjs (unchanged, imported);
//   3. proves the old skeleton is untouched (compareSkeletonPrefix) and refuses to write otherwise.
// Idempotent: a character that already carries the chains gets none added (the hair is just re-swapped).
//
//   node tools/sculpt/figure/swap-hair2.mjs <character.glb> [<hair.glb>] <out.glb>
//   node tools/sculpt/figure/swap-hair2.mjs --install [--dry]   the three wardrobe files IN PLACE + their manifest entries
//        (secondaryChains += the hair chains, springDefaults.hair / .cape) -> makes hair 2 the shipped hair (see
//        docs/api/heroine.md "Hair 2 (long hair)"). Never run by the hair maker; the lead runs it after the judges.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { io, ROOT } from './glbio.mjs';
import { M4 } from '../rig.mjs';
import { swapHair } from './swap-hair.mjs';

export const HAIR2 = path.join(ROOT, 'assets/models/sculpt/akari_hair2.glb');
export const CHAIN_RE = /^J_Sec_Hair[A-Za-z]*_\d+_(\d\d|end)$/;

/** spring settings of the long hair (manifest springDefaults; spring.js: pull = 0.11 stiffness, damp = 0.2 drag) */
export const HAIR2_SPRINGS = {
  // the existing short chains (fringe, cheek locks = the old side-lock chains, unused tail / stray chains) and the two long
  // side locks: kind 'hair' (colliders head, neck, chest, upper arms)
  hair: { stiffness: 0.55, drag: 0.45, gravity: 0.45, hit: 0.014 },
  // the five back chains: kind 'cape' (colliders chest, upper arms, hips; angle limit 80 deg, air 0.6) — long hair streams
  cape: { stiffness: 0.25, drag: 0.6, gravity: 1.0, hit: 0.065 },
};

/** the manifest secondaryChains entries of the hair-2 chains (from the hair file's skeleton) */
export async function hairChainsOf(hairFile = HAIR2) {
  const d = await io().read(hairFile), r = d.getRoot();
  const byName = new Map(r.listNodes().map((n) => [n.getName(), n]));
  const par = new Map(); for (const n of r.listNodes()) for (const c of n.listChildren()) par.set(c, n);
  const out = [];
  for (const n of r.listNodes()) {
    const m = /^J_Sec_(Hair[A-Za-z]*)_(\d+)_01$/.exec(n.getName()); if (!m) continue;
    const joints = []; for (let i = 1; i < 10; i++) { const nm = `J_Sec_${m[1]}_${m[2]}_${String(i).padStart(2, '0')}`; if (!byName.has(nm)) break; joints.push(nm); }
    out.push({ root: joints[0], joints, tail: `J_Sec_${m[1]}_${m[2]}_end`, parent: par.get(n)?.getName() || null, kind: /Back/.test(m[1]) ? (process.env.HAIR2_BACK_KIND || 'cape') : 'hair' });
  }
  return out;
}

const worldOf = (root) => {
  const par = new Map(); for (const n of root.listNodes()) for (const c of n.listChildren()) par.set(c, n);
  const W = new Map();
  const get = (n) => { if (W.has(n)) return W.get(n); const L = M4.trs(n.getTranslation(), n.getRotation(), n.getScale()); const p = par.get(n); const w = p ? M4.mul(get(p), L) : L; W.set(n, w); return w; };
  return { get, par };
};

/** add the joints (and _end leaves) of `hairDoc` that `charDoc` lacks; returns the names added */
export function addMissingJoints(charDoc, hairDoc) {
  const A = charDoc.getRoot(), B = hairDoc.getRoot();
  const skinA = A.listSkins()[0], skinB = B.listSkins()[0];
  const nodesA = new Map(A.listNodes().map((n) => [n.getName(), n]));
  const { par: parB } = worldOf(B);
  const jointsB = skinB.listJoints(), ibmB = skinB.getInverseBindMatrices().getArray();
  const added = [];
  // chains the character already has (an earlier hair-2 swap): take the hair file's rest transform and inverse bind, so a
  // rebuilt hair with moved chain joints never meets stale joints (only J_Sec_Hair* nodes are touched)
  {
    const jointsA = skinA.listJoints(); let ibmA = null;
    for (const nb of B.listNodes()) {
      if (!CHAIN_RE.test(nb.getName())) continue;
      const na = nodesA.get(nb.getName()); if (!na) continue;
      na.setTranslation(nb.getTranslation()).setRotation(nb.getRotation()).setScale(nb.getScale());
      const ia = jointsA.indexOf(na), ib = jointsB.indexOf(nb);
      if (ia >= 0 && ib >= 0) { ibmA = ibmA || Float32Array.from(skinA.getInverseBindMatrices().getArray()); ibmA.set(ibmB.slice(ib * 16, ib * 16 + 16), ia * 16); }
    }
    if (ibmA) { const old = skinA.getInverseBindMatrices(); skinA.setInverseBindMatrices(charDoc.createAccessor().setType('MAT4').setArray(ibmA).setBuffer(A.listBuffers()[0])); if (old.listParents().length <= 1) old.dispose(); }
  }
  // every node of B under a chain (joints + _end leaves), in an order where parents come first
  const want = B.listNodes().filter((n) => CHAIN_RE.test(n.getName()) && !nodesA.has(n.getName()));
  const depth = (n) => { let d = 0; for (let x = parB.get(n); x; x = parB.get(x)) d++; return d; };
  want.sort((a, b) => depth(a) - depth(b));
  const newIBM = [];
  for (const nb of want) {
    const p = parB.get(nb); const pa = p && nodesA.get(p.getName());
    if (!pa) throw new Error(`parent ${p?.getName()} of ${nb.getName()} is not in the character`);
    const na = charDoc.createNode(nb.getName()).setTranslation(nb.getTranslation()).setRotation(nb.getRotation()).setScale(nb.getScale());
    if (nb.getExtras() && Object.keys(nb.getExtras()).length) na.setExtras({ ...nb.getExtras() });
    pa.addChild(na); nodesA.set(na.getName(), na);
    const ji = jointsB.indexOf(nb);
    if (ji >= 0) { skinA.addJoint(na); newIBM.push(...ibmB.slice(ji * 16, ji * 16 + 16)); }
    added.push(na.getName());
  }
  if (newIBM.length) {
    const old = skinA.getInverseBindMatrices();
    const arr = new Float32Array(old.getArray().length + newIBM.length); arr.set(old.getArray()); arr.set(newIBM, old.getArray().length);
    const acc = charDoc.createAccessor().setType('MAT4').setArray(arr).setBuffer(A.listBuffers()[0]);
    skinA.setInverseBindMatrices(acc);
    if (old.listParents().length <= 1) old.dispose();
  }
  return added;
}

/** the old skeleton (all joints of `a`) must be the first joints of `b`, untouched; b's extra joints must be hair chains */
export async function compareSkeletonPrefix(a, b) {
  const [A, B] = await Promise.all([io().read(a), io().read(b)]);
  const desc = (d) => {
    const sk = d.getRoot().listSkins()[0], js = sk.listJoints();
    const par = new Map(); for (const n of d.getRoot().listNodes()) for (const c of n.listChildren()) par.set(c, n);
    return { js, names: js.map((j) => j.getName() + '<' + (par.get(j)?.getName() || '')), ibm: Float32Array.from(sk.getInverseBindMatrices().getArray()),
      trs: js.map((j) => [...j.getTranslation(), ...j.getRotation(), ...j.getScale()].map((v) => v.toFixed(6)).join()) };
  };
  const x = desc(A), y = desc(B), n = x.names.length;
  const sameJoints = x.names.join() === y.names.slice(0, n).join();
  const sameIBM = Buffer.from(x.ibm.buffer).equals(Buffer.from(y.ibm.slice(0, n * 16).buffer));
  const sameRest = x.trs.join('|') === y.trs.slice(0, n).join('|');
  const extra = y.names.slice(n).map((s) => s.split('<')[0]);
  const extraOK = extra.every((nm) => CHAIN_RE.test(nm));
  // the whole node hierarchy of a (not only joints): every node of a is in b with the same parent and rest TRS
  const nodesOf = (d) => { const par = new Map(); for (const nd of d.getRoot().listNodes()) for (const c of nd.listChildren()) par.set(c, nd); return new Map(d.getRoot().listNodes().filter((nd) => !nd.getMesh()).map((nd) => [nd.getName(), (par.get(nd)?.getName() || '') + '|' + [...nd.getTranslation(), ...nd.getRotation(), ...nd.getScale()].map((v) => v.toFixed(6)).join()])); };
  const na = nodesOf(A), nb = nodesOf(B); let nodesSame = true; for (const [k, v] of na) if (nb.get(k) !== v) { nodesSame = false; break; }
  return { joints: n, jointsAfter: y.names.length, added: extra, sameJoints, sameIBM, sameRest, extraOK, nodesSame, ok: sameJoints && sameIBM && sameRest && extraOK && nodesSame };
}

/** character + hair 2 -> out. Throws (and writes nothing) if the old skeleton would change. */
export async function swapHair2(charFile, hairFile, outFile, { log = console.log } = {}) {
  const tmp = path.join(os.tmpdir(), `swap-hair2-${process.pid}-${Date.now()}.glb`);
  const C = await io().read(charFile), H = await io().read(hairFile);
  const added = addMissingJoints(C, H);
  fs.writeFileSync(tmp, await io().writeBinary(C));
  const tmp2 = tmp.replace(/\.glb$/, '.b.glb');
  let r;
  try {
    r = await swapHair(tmp, hairFile, tmp2, { log: () => {} });
    const sk = await compareSkeletonPrefix(charFile, tmp2);
    if (!sk.ok) throw new Error('skeleton check failed: ' + JSON.stringify(sk));
    fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
    fs.copyFileSync(tmp2, outFile);
    log(`swap-hair2: ${path.basename(charFile)} + ${path.basename(hairFile)} -> ${outFile}: ${r.nodes.join(', ')} (${r.tris} tris), +${added.filter((n) => !/_end$/.test(n)).length} joints (${sk.joints} -> ${sk.jointsAfter}), old skeleton identical`);
    return { ...r, added, skeleton: sk, bytes: fs.statSync(outFile).size };
  } finally { for (const f of [tmp, tmp2]) try { fs.unlinkSync(f); } catch { /* gone */ } }
}

/** manifest fields a character entry needs for hair 2 (merged into an existing entry's fields) */
export async function entryFields(entry, hairFile = HAIR2) {
  const chains = await hairChainsOf(hairFile);
  const keep = (entry.secondaryChains || []).filter((c) => !CHAIN_RE.test(c.root));
  const sd = { ...(entry.springDefaults || {}) };
  for (const k of Object.keys(HAIR2_SPRINGS)) sd[k] = { ...HAIR2_SPRINGS[k] };
  return { secondaryChains: [...keep, ...chains], springDefaults: sd };
}

// ------------------------------------------------------------------------------------------------ CLI
const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('swap-hair2.mjs');
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--install')) {
    // the three wardrobe outfits (tools/costume/wardrobe-build.mjs OUTFITS): file in place + manifest entry
    const dry = args.includes('--dry');
    const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8'));
    const ids = ['char_akari', 'char_akari_swim_a', 'char_akari_swim_b'];
    const frag = {};
    for (const id of ids) {
      const e = man[id]; if (!e) { console.log(`  ${id}: no entry, skipped`); continue; }
      const file = path.join(ROOT, 'assets', e.file);
      if (!dry) {
        const r = await swapHair2(file, HAIR2, file);
        frag[id] = { ...(await entryFields(e)), bytes: r.bytes, tris: undefined };
        // triangle count of the whole file
        const d = await io().read(file); let t = 0; for (const nd of d.getRoot().listNodes()) { const m = nd.getMesh(); if (m) for (const p of m.listPrimitives()) t += p.getIndices().getCount() / 3; }
        frag[id].tris = t;
      } else console.log(`  would swap ${e.file} and add ${(await hairChainsOf()).length} chains to ${id}`);
    }
    if (!dry) {
      const f = path.join(ROOT, '.tmp/akari-hair2/install.fragment.json'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(frag, null, 1));
      console.log(execFileSync('node', [path.join(ROOT, 'tools/manifest-patch.mjs'), f], { encoding: 'utf8' }).trim());
    }
  } else {
    const files = args.filter((a) => !a.startsWith('--'));
    const [c, h, o] = files.length === 2 ? [files[0], HAIR2, files[1]] : files;
    if (!c || !o) { console.error('usage: node tools/sculpt/figure/swap-hair2.mjs <character.glb> [<hair.glb>] <out.glb> | --install [--dry]'); process.exit(1); }
    await swapHair2(path.resolve(c), path.resolve(h), path.resolve(o));
  }
}
