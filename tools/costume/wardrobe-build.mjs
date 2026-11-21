#!/usr/bin/env node
// 灯里's wardrobe — ONE command rebuilds the three shipped outfits from the CURRENT base figure and hair (docs/api/heroine.md
// "Wardrobe"). No hand steps: the lead re-runs it when a new face (akari_base.glb) or new hair lands.
//   node tools/costume/wardrobe-build.mjs --install    dress every outfit that is stale, put the hair on, check, write the
//                                                      three files + their manifest entries (tools/manifest-patch.mjs, these ids)
//   node tools/costume/wardrobe-build.mjs              the same without the manifest
//   flags: --full            re-dress every outfit from its sources even when nothing changed
//          --hair <file.glb> the hair to put on (default assets/models/sculpt/akari_hair2.glb). A hair that brings its own
//                            spring joints (J_Sec_Hair*, the long hair of tools/sculpt/figure/build-hair2.mjs) is put on with
//                            the hair maker's composer swap-hair2.mjs: the joints are APPENDED to the skeleton (the base's
//                            175 stay first and untouched) and --install adds their chains + springs to the manifest entries
//          --rebuild-hair   first rebuild akari_hair2.glb (tools/sculpt/figure/build-hair2.mjs)
//          --out-dir <dir>  write the three files there instead (a trial: nothing in assets/, no manifest)
//          --only miko,swim_a,swim_b   --no-check (skip the swim coverage checks: never with --install)
//
// Outputs (assets/models/chars/):
//   char_akari_miko.glb    travelling witch outfit (tools/costume/witch-traveller.mjs + witch-hat.mjs)      -> manifest id char_akari
//   char_akari_swim_a.glb  swimsuit A 潮祭        (dressed by tools/costume/swim_a.mjs)  -> char_akari_swim_a
//   char_akari_swim_b.glb  swimsuit B 暮海        (dressed by tools/costume/swim_b.mjs)  -> char_akari_swim_b
// Dressing: each outfit's own build dresses the base figure (assets/models/sculpt/akari_base.glb: body, FACE + its 13 shapes,
// undergarment) into .tmp/wardrobe/build/<key>_dressed.glb. A dressed file is re-made whenever the base figure or one of
// that outfit's source files differs from what it was made from (a stamp <key>_dressed.stamp.json holds their hashes), so
// a new face always reaches every outfit through its own build: the face is never copied by hand.
// Hair: swap-hair.mjs replaces the nodes akari_hair + akari_ribbon by name and keeps everything else (swap-hair2.mjs for a
// hair with its own joints, see --hair).
// Checks (the build exits 1 on any, and writes nothing for that outfit): skeleton identical to the base figure (175 joints,
// names/parents, inverse binds, rest; with a hair that brings joints: the base's joints first and identical, the extra ones
// J_Sec_Hair* only); the face node and its 13 shapes identical to the base's (same vertices, same shapes); every manifest
// chain joint + the hair chains present; the hair is the sculpted one (Hair extras.hairBand, no stock hair texture);
// swimsuits: their own coverage checks pass on the FINAL file.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { swapHair } from '../sculpt/figure/swap-hair.mjs';
import { compareSkeleton } from '../sculpt/figure/writer.mjs';
import { io } from '../sculpt/figure/glbio.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const optv = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };
const A = (...p) => path.join(ROOT, ...p);
const CH = 'assets/models/chars/';
const BASE = A('assets/models/sculpt/akari_base.glb');
const HAIR = optv('hair') ? path.resolve(optv('hair')) : A('assets/models/sculpt/akari_hair2.glb');
const WORK = A('.tmp/wardrobe/build'); fs.mkdirSync(WORK, { recursive: true });
const OUT_DIR = optv('out-dir') ? path.resolve(optv('out-dir')) : null;
const MORPHS = 13;
/** spring for the sculpted tails (hair maker, .tmp/akari-hair/PROGRESS.md R6): spring.js keys stiffness/drag/gravity/hit */
export const HAIR_SPRING = { stiffness: 0.55, drag: 0.32, gravity: 0.3, hit: 0.026 };
/** joints a hair may bring (hair 2: J_Sec_HairBack_<n>_<nn>, J_Sec_HairSideL_1_<nn> … + _end leaves) */
const HAIR_CHAIN_RE = /^J_Sec_Hair[A-Za-z]*_\d+_(\d\d|end)$/;

const dressedOf = (key) => path.join(WORK, `${key}_dressed.glb`);
// what each outfit's dressing reads besides the base figure (a change in any of them re-dresses that outfit)
const COMMON_SRC = ['tools/costume/garment.mjs', 'tools/costume/outfit.mjs', 'tools/costume/cull.mjs', 'assets/models/sculpt/akari_base.regions.json'];
export const OUTFITS = {
  miko: { id: 'char_akari', file: CH + 'char_akari_miko.glb',
    src: ['tools/costume/witch-traveller.mjs', 'tools/costume/traveller-fabric.mjs', 'tools/costume/textures/*.jpg', 'tools/costume/witch-hat.mjs', 'tools/costume/keepskel.mjs', 'tools/costume/recipes.mjs'],
    dress: (out) => {
      run(['tools/costume/witch-traveller.mjs', '--out', out]);
      run(['tools/costume/witch-hat.mjs', out]);
    } },
  swim_a: { id: 'char_akari_swim_a', file: CH + 'char_akari_swim_a.glb',
    src: ['tools/costume/swim_a.mjs', 'tools/costume/swim_a_coreful.mjs', 'tools/costume/swim-a-ride.mjs', 'tools/sculpt/assets/akari_swim_a.mjs'],
    dress: (out) => run(['tools/costume/swim_a.mjs', '--out', out, '--no-install']),   // its build ends with its coverage check (exit 1)
    check: async (f) => { const { coverage } = await import('./swim_a.mjs'); const c = await coverage({ file: f, log: () => {} }); return { pass: !!c.ok, info: { poses: c.results?.length ?? null, fails: (c.results || []).filter((r) => r.visible || r.holeFail).length } }; } },
  swim_b: { id: 'char_akari_swim_b', file: CH + 'char_akari_swim_b.glb',
    src: ['tools/costume/swim_b.mjs', 'tools/sculpt/assets/akari_swim_b*.mjs'],
    dress: (out) => run(['tools/costume/swim_b.mjs', '--out', out]),                   // its build ends with its coverage check (exit 1)
    check: async (f) => { const { coverage } = await import('./swim_b.mjs'); const c = await coverage(f, () => {}); return { pass: !!c.pass, info: { poses: c.summary?.poses, fails: c.summary?.fails?.length } }; } },
};

const sha = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
/** the files a dressing reads (globs: one * in the file name) */
function srcFiles(key) {
  const out = [];
  for (const p of [...COMMON_SRC, ...OUTFITS[key].src]) {
    if (!p.includes('*')) { out.push(p); continue; }
    const dir = path.dirname(p), re = new RegExp('^' + path.basename(p).replace(/\./g, '\\.').replace('*', '.*') + '$');
    for (const f of fs.readdirSync(A(dir)).sort()) if (re.test(f)) out.push(path.join(dir, f));
  }
  return out;
}
/** hashes of the base figure + the outfit's sources: what its dressed file was made from */
function stampOf(key) { const s = { base: sha(BASE) }; for (const f of srcFiles(key)) s[f] = sha(A(f)); return s; }
function staleness(key) {
  const f = dressedOf(key), sf = f.replace(/\.glb$/, '.stamp.json');
  if (!fs.existsSync(f) || !fs.existsSync(sf)) return 'no dressed file yet';
  const had = JSON.parse(fs.readFileSync(sf, 'utf8')), now = stampOf(key);
  if (had.base !== now.base) return 'the base figure changed (face / body)';
  const ch = Object.keys(now).filter((k) => had[k] !== now[k]); return ch.length ? 'changed: ' + ch.join(', ') : null;
}
/** dress the base figure in this outfit (the outfit's own build, which fails on its own checks) */
function dress(key) {
  const out = dressedOf(key), tmp = out.replace(/\.glb$/, '.new.glb'), stamp = stampOf(key);
  OUTFITS[key].dress(tmp);
  if (stampOf(key).base !== stamp.base) throw new Error(`${key}: the base figure changed while it was being dressed; run again`);
  fs.renameSync(tmp, out);
  fs.writeFileSync(out.replace(/\.glb$/, '.stamp.json'), JSON.stringify(stamp, null, 1));
}

function run(cmd) {
  console.log('  $ node ' + cmd.map((c) => path.relative(ROOT, c) || c).join(' '));
  execFileSync('node', cmd, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, SCULPT_THREADS: process.env.SCULPT_THREADS || '2' } });
}

/** what the file holds: meshes, materials, morph count, node names, tris, size */
async function inspect(file) {
  const doc = await io().read(file), r = doc.getRoot();
  const nodes = new Set(r.listNodes().map((n) => n.getName()));
  let tris = 0, morphs = 0; const mn = [9, 9, 9], mx = [-9, -9, -9], mats = new Set(), meshes = [], texNames = [];
  for (const nd of r.listNodes()) { const m = nd.getMesh(); if (!m) continue; meshes.push(nd.getName());
    for (const p of m.listPrimitives()) { mats.add(p.getMaterial().getName()); tris += p.getIndices().getCount() / 3; morphs = Math.max(morphs, p.listTargets().length);
      const P = p.getAttribute('POSITION').getArray(); for (let i = 0; i < P.length; i += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], P[i + a]); mx[a] = Math.max(mx[a], P[i + a]); } } }
  for (const t of r.listTextures()) texNames.push(t.getName() || t.getURI() || '');
  const hairMat = r.listMaterials().find((m) => m.getName() === 'Hair');
  return { nodes, tris, morphs, meshes, materials: [...mats].sort(), size: mx.map((v, a) => +(v - mn[a]).toFixed(3)), texNames, hairBand: hairMat?.getExtras()?.hairBand || null, bytes: fs.statSync(file).size };
}

/** the face node of a file: every primitive's material, vertices and each of its shapes (hashes) */
async function faceOf(file) {
  const doc = await io().read(file), nd = doc.getRoot().listNodes().find((n) => n.getName() === 'akari_face');
  if (!nd || !nd.getMesh()) return null;
  const h = (a) => (a ? crypto.createHash('sha1').update(Buffer.from(a.getArray().buffer, a.getArray().byteOffset, a.getArray().byteLength)).digest('hex').slice(0, 16) : '-');
  return nd.getMesh().listPrimitives().map((p) => ({ mat: p.getMaterial()?.getName(), pos: h(p.getAttribute('POSITION')), idx: h(p.getIndices()),
    shapes: p.listTargets().map((t) => h(t.getAttribute('POSITION'))) }));
}
let BASE_FACE = null;

/** the hair file's own spring joints that the base lacks (hair 2): [] for the plain sculpted hair */
async function hairExtraJoints(hairFile) {
  const [h, b] = await Promise.all([io().read(hairFile), io().read(BASE)]);
  const have = new Set(b.getRoot().listNodes().map((n) => n.getName()));
  return h.getRoot().listNodes().map((n) => n.getName()).filter((n) => HAIR_CHAIN_RE.test(n) && !have.has(n));
}
/** the hair maker's composer for a hair with its own joints (tools/sculpt/figure/swap-hair2.mjs), or a clear error */
async function hair2Kit() {
  const f = A('tools/sculpt/figure/swap-hair2.mjs');
  if (!fs.existsSync(f)) throw new Error(`the hair ${path.relative(ROOT, HAIR)} brings its own joints (J_Sec_Hair*), and the composer that adds them (tools/sculpt/figure/swap-hair2.mjs, the hair maker's) is not there yet`);
  return import('../sculpt/figure/swap-hair2.mjs');
}

async function checkFile(key, file, man, extra) {
  const fails = [];
  let sk;
  if (extra.length) {          // the base's joints first and identical, the hair's J_Sec_Hair* after them
    const { compareSkeletonPrefix } = await hair2Kit();
    sk = await compareSkeletonPrefix(BASE, file);
    if (!(sk.joints === 175 && sk.ok)) fails.push('skeleton: the base part differs or a non-hair joint was added: ' + JSON.stringify(sk));
  } else {
    sk = await compareSkeleton(BASE, file);
    if (!(sk.joints === 175 && sk.sameJoints && sk.sameIBM && sk.sameRest)) fails.push('skeleton differs from the base: ' + JSON.stringify(sk));
  }
  const old = man.char_akari_old || man.char_akari;      // the shipped v2 file has the same skeleton (verified by the base build)
  const info = await inspect(file);
  if (info.morphs !== MORPHS) fails.push(`face shapes: ${info.morphs} (want ${MORPHS})`);
  // the face is the base's, taken at build time: same vertices, same 13 shapes
  BASE_FACE = BASE_FACE || JSON.stringify(await faceOf(BASE));
  const face = JSON.stringify(await faceOf(file));
  if (face !== BASE_FACE) fails.push('the face (akari_face) is not the current base figure\'s: re-dress (the dressed file is older than the base?)');
  if (!info.hairBand) fails.push('Hair material has no extras.hairBand: not the sculpted hair');
  if (info.texNames.some((n) => /HairSample|Hair_\d|_Hair_/i.test(n))) fails.push('a stock hair texture is still in the file: ' + info.texNames.join(','));
  for (const nm of ['akari_hair', 'akari_ribbon', 'akari_body', 'akari_face']) if (!info.nodes.has(nm)) fails.push('node missing: ' + nm);
  const entry = man[OUTFITS[key].id] || old;
  const missing = [];
  for (const c of entry.secondaryChains || []) if (!HAIR_CHAIN_RE.test(c.root)) for (const j of [...c.joints, c.tail].filter(Boolean)) if (!info.nodes.has(j)) missing.push(j);
  for (const j of ['J_Sec_RibbonL_1_01', 'J_Sec_RibbonR_1_01', ...extra]) if (!info.nodes.has(j)) missing.push(j);
  const hj = [...info.nodes].filter((n) => n.startsWith('HairJoint-')).length; if (hj < 16) missing.push(`HairJoint x${hj} (want 16)`);
  if (missing.length) fails.push('chain joints missing: ' + missing.slice(0, 8).join(' '));
  let cov = null;
  if (OUTFITS[key].check && !has('--no-check')) { cov = await OUTFITS[key].check(file); if (!cov.pass) fails.push('COVERAGE CHECK FAILED ' + JSON.stringify(cov.info)); }
  return { file: path.relative(ROOT, file), skeleton: sk, morphs: info.morphs, faceFromBase: face === BASE_FACE, tris: info.tris, bytes: info.bytes, meshes: info.meshes, materials: info.materials, size: info.size, hairBand: info.hairBand, coverage: cov, fails };
}

async function build() {
  const keys = optv('only') ? optv('only').split(',') : Object.keys(OUTFITS);
  for (const k of keys) if (!OUTFITS[k]) throw new Error('unknown outfit ' + k + ' (have ' + Object.keys(OUTFITS).join(', ') + ')');
  if (has('--install') && (has('--no-check') || OUT_DIR)) throw new Error('--install needs the coverage checks and the asset tree (no --no-check / --out-dir)');
  if (has('--rebuild-hair')) run(['tools/sculpt/figure/build-hair2.mjs']);
  if (!fs.existsSync(HAIR)) throw new Error('no hair file ' + HAIR + (optv('hair') ? '' : ' (run with --rebuild-hair)'));
  const extra = await hairExtraJoints(HAIR);
  const hairKit = extra.length ? await hair2Kit() : null;
  console.log(`base ${path.relative(ROOT, BASE)} (${sha(BASE).slice(0, 10)}), hair ${path.relative(ROOT, HAIR)}${extra.length ? ` (+${extra.filter((n) => !/_end$/.test(n)).length} joints of its own: swap-hair2)` : ''}`);
  const man = JSON.parse(fs.readFileSync(A('assets/manifest.json'), 'utf8'));
  const report = {};
  for (const key of keys) {
    const o = OUTFITS[key], out = OUT_DIR ? path.join(OUT_DIR, path.basename(o.file)) : A(o.file);
    console.log(`[${key}]`);
    const why = has('--full') ? 'asked (--full)' : staleness(key);
    if (why) { console.log(`  dressing (${why})`); dress(key); } else console.log('  dressed file up to date with the base figure and its sources');
    const tmp = path.join(WORK, path.basename(o.file));
    if (hairKit) await hairKit.swapHair2(dressedOf(key), HAIR, tmp, { log: (s) => console.log('  ' + s) });
    else await swapHair(dressedOf(key), HAIR, tmp, { log: (s) => console.log('  ' + s) });
    const r = await checkFile(key, tmp, man, extra);
    r.hair = path.relative(ROOT, HAIR); r.base = sha(BASE);
    report[key] = r;
    if (r.fails.length) { console.error(`  ${key} FAILS:\n    ` + r.fails.join('\n    ')); continue; }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.copyFileSync(tmp, out);
    console.log(`  ok -> ${path.relative(ROOT, out)}: ${r.tris} tris, ${(r.bytes / 1e6).toFixed(2)} MB, skeleton ${extra.length ? 'base + hair joints' : 'same'}, face + ${r.morphs} shapes = base${r.coverage ? ', coverage ' + JSON.stringify(r.coverage.info) : ''}`);
  }
  fs.writeFileSync(path.join(WORK, OUT_DIR ? 'build.trial.json' : 'build.json'), JSON.stringify(report, null, 1));
  const bad = Object.entries(report).filter(([, r]) => r.fails.length);
  if (bad.length) { console.error('WARDROBE BUILD FAILED for ' + bad.map(([k]) => k).join(', ') + ' (nothing written for those)'); process.exit(1); }
  if (has('--install')) await install(report, keys, hairKit);
}

const AUTHOR = (tool) => `sculpted / generated for this project (tools/sculpt/figure, ${tool}, tools/costume/wardrobe-build.mjs); skeleton: pixiv Inc. (VRoid Project) CC0`;

/** manifest entries, through tools/manifest-patch.mjs (only these ids), then read back */
async function install(report, keys, hairKit) {
  const man = JSON.parse(fs.readFileSync(A('assets/manifest.json'), 'utf8'));
  const frag = {};
  const hairRel = path.relative(ROOT, HAIR), swapTool = hairKit ? 'swap-hair2.mjs' : 'swap-hair.mjs';
  // the old shipped heroine stays reachable for comparison pictures (?akari=old) until it is deleted
  if (!man.char_akari_old && /char_akari_v2\.glb$/.test(man.char_akari.file)) {
    frag.char_akari_old = { ...man.char_akari, preload: false, notes: 'comparison only, to be deleted. The heroine as shipped until 2026-11-18 (v2 costume on the VRoid body + hair), behind ?akari=old. ' + man.char_akari.notes };
  }
  const tmpl = man.char_akari_v3 || man.char_akari;     // v3 = the base-figure fields (bones, hipsHeight, clipsFrom, morphs, chains)
  const common = (r) => ({ tris: r.tris, bytes: r.bytes, size: r.size, meshes: r.meshes, materials: r.materials });
  if (keys.includes('miko')) {
    const old = man.char_akari_old || man.char_akari;
    const e = { ...tmpl, ...common(report.miko), file: OUTFITS.miko.file.replace('assets/', ''),
      springDefaults: { ...(tmpl.springDefaults || {}), hair: HAIR_SPRING },
      license: 'Original mesh, pattern and painted texture atlas. Fabric detail from Poly Haven (CC0): Poly Wool Herringbone and Rough Linen by colormass and Rico Cilliers, Brown Leather by Rob Tuytel. Skeleton: pixiv VRoid HairSample_Female (CC0). Costume design visual reference: Elaina from Wandering Witch.', author: AUTHOR('tools/costume/witch-traveller.mjs, tools/costume/witch-hat.mjs'),
      source: 'tools/costume/wardrobe-build.mjs: witch-traveller.mjs and witch-hat.mjs on assets/models/sculpt/akari_base.glb + ' + hairRel + ' (' + swapTool + ')',
      notes: '灯里 in her travelling witch outfit. Default wardrobe save id: miko. The hat follows the head joint. '
        + 'The body, face and 13 expression shapes are shared across all outfits. Rebuild with tools/costume/wardrobe-build.mjs --install.' };
    delete e.preload;                                   // the shipped heroine preloads (as the old entry)
    for (const k of ['fileV1', 'costume']) delete e[k];
    if (old.hipsHeight !== e.hipsHeight) console.warn('hipsHeight differs from the old entry:', old.hipsHeight, e.hipsHeight);
    frag.char_akari = e;
  }
  for (const key of ['swim_a', 'swim_b']) if (keys.includes(key)) {
    const id = OUTFITS[key].id, cur = man[id];
    frag[id] = { ...cur, ...common(report[key]), preload: false, springDefaults: { ...(cur.springDefaults || {}), hair: HAIR_SPRING },
      license: 'Project-made mesh and textures. Skeleton: pixiv VRoid HairSample_Female (CC0). Costume design visual reference: Elaina from Wandering Witch, TAITO figure adaptation.', author: AUTHOR(`tools/costume/${key}.mjs`),
      source: `tools/costume/wardrobe-build.mjs: tools/costume/${key}.mjs on assets/models/sculpt/akari_base.glb + ${hairRel} (${swapTool})`,
      notes: key === 'swim_a'
        ? 'Tide-festival swim outfit. Costume reference: TAITO Coreful Elaina Swimsuit (2025), https://www.taito.co.jp/taito-prize/0451877100. Shares the player face, body and silver hair.'
        : 'Dusk-sea swim outfit. Costume reference: TAITO Aqua Float Girls Elaina (2022), https://www.taito.co.jp/taito-prize/0451504900. Shares the player face, body and silver hair.' };
  }
  // a hair with its own joints: its chains (kind hair / cape) + springs into every entry (the hair maker's entryFields)
  for (const key of keys) {
    const entry = frag[OUTFITS[key].id];
    if (hairKit) Object.assign(entry, await hairKit.entryFields(entry, HAIR));
    else entry.secondaryChains = (entry.secondaryChains || []).filter(chain => !HAIR_CHAIN_RE.test(chain.root));
  }
  const f = path.join(WORK, 'manifest.fragment.json');
  fs.writeFileSync(f, JSON.stringify(frag, null, 1));
  console.log(execFileSync('node', [A('tools/manifest-patch.mjs'), f, '--replace'], { encoding: 'utf8' }).trim());
  const back = JSON.parse(fs.readFileSync(A('assets/manifest.json'), 'utf8'));
  for (const [id, e] of Object.entries(frag)) if (!back[id] || back[id].file !== e.file || back[id].tris !== e.tris) throw new Error('manifest entry did not read back: ' + id);
  console.log('manifest read back: ' + Object.keys(frag).map((id) => `${id} -> ${back[id].file}`).join(', '));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  try { await build(); } catch (e) { console.error(e.stack || e.message); process.exit(1); }
}
