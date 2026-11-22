// Build the episode cast from the shared humanoid bind pose. Silhouette and costume references:
// https://majotabi.jp/#character and the official Episode 1 and 2 stills at https://majotabi.jp/#story.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
import sharp from 'sharp';
import { Color } from 'three';
import { fitWornHair } from './hat-fit.mjs';
import { fittedStocking } from './stockings.mjs';
import { Tailor, TAU, head, chest, hips } from './tailor.mjs';
import { hair, hat } from './hair-hats.mjs';
import { ashTravellingCoat } from './ash-traveller.mjs';
import { father } from './householder.mjs';
import { garments, sleeves } from './garments.mjs';
import { eyes } from './eyes.mjs';
const io = new NodeIO(),
  base = 'assets/models/sculpt/akari_base.glb',
  traveller = 'assets/models/chars/char_akari_miko.glb';
const shapes = {
  father: {
    height: 1.148,
    skin: 1.112,
    iris: [76, 133, 137],
    col: [
      '#76726f',
      '#89837e',
      '#aaa49c',
      '#7f675d',
      '#62574f',
      '#e0dcd2',
      '#b2a499',
      '#655b59',
      '#8d7164',
      '#b4aaa0',
      '#614e46',
      '#403c44',
      '#8e8394',
      '#aa8e7c',
    ],
  },
  fran: {
    height: 1.095,
    skin: 0.968,
    iris: [82, 135, 170],
    col: [
      '#354653',
      '#3e525c',
      '#536372',
      '#28334b',
      '#1e2944',
      '#99aac3',
      '#c1c8d3',
      '#eee5d6',
      '#9d4559',
      '#aaaebc',
      '#232735',
      '#171c2a',
      '#51617c',
      '#b45963',
    ],
  },
  saya: {
    height: 0.978,
    skin: 1.045,
    iris: [48, 137, 147],
    col: [
      '#353743',
      '#3e404f',
      '#555969',
      '#424a5f',
      '#383b48',
      '#434b5a',
      '#727781',
      '#383749',
      '#ad748b',
      '#ddd8e0',
      '#ede9eb',
      '#302e3e',
      '#8e7c96',
      '#cda5bf',
    ],
  },
  mother: {
    height: 1.064,
    skin: 1.025,
    iris: [116, 113, 132],
    col: [
      '#c9c6ca',
      '#d8d5d7',
      '#eee8e4',
      '#655c6a',
      '#665a69',
      '#efe3c7',
      '#cbb994',
      '#776778',
      '#a26d6e',
      '#e7d7b4',
      '#5d484e',
      '#3c343b',
      '#837286',
      '#ad8092',
    ],
  },
  innkeeper: {
    height: 1.045,
    skin: 1.084,
    iris: [128, 102, 67],
    col: [
      '#65544d',
      '#796154',
      '#a38673',
      '#7e6458',
      '#71534a',
      '#d4c692',
      '#aa967a',
      '#687376',
      '#8d7164',
      '#baada0',
      '#64544c',
      '#393940',
      '#948377',
      '#be9a72',
    ],
  },
  exam: {
    height: 1.057,
    skin: 0.996,
    iris: [122, 96, 130],
    col: [
      '#795558',
      '#8d6266',
      '#b18483',
      '#66526d',
      '#3e3349',
      '#d7c4ce',
      '#b79ba8',
      '#adaaab',
      '#a35d77',
      '#bbb0be',
      '#4b3c4c',
      '#312836',
      '#847187',
      '#c28aa6',
    ],
  },
  elaina: { height: 1, iris: [133, 144, 218] },
  apprentice: { height: 1, iris: [133, 144, 218] },
};
function palette(spec) {
  const keys =
    'hair hairShade hairGlint coat lining collar edge skirt accent sash leather sole hatEdge hatRibbon'.split(
      ' ',
    );
  const pal = Object.fromEntries(keys.map((k, i) => [k, [spec.col[i]]]));
  Object.assign(pal, {
    blouse: [spec === shapes.fran ? '#eee8e1' : spec === shapes.saya ? '#aea7a3' : spec.col[5]],
    hat: [spec.col[3]],
    hatUnder: [spec.col[4]],
    starDust: ['#b6b5c9'],
    stockingEdge: ['#565568'],
    metal: ['#cfb274', 'brass'],
    gem: ['#94afd1', 'glass'],
  });
  return pal;
}
function writable(doc, h, type, array) {
  return doc.createAccessor().setBuffer(h).setType(type).setArray(array);
}
function crop(doc, prim, keep) {
  const pos = prim.getAttribute('POSITION').getArray(),
    ind = prim.getIndices().getArray(),
    out = [];
  for (let i = 0; i < ind.length; i += 3) {
    const a = ind[i] * 3,
      b = ind[i + 1] * 3,
      c = ind[i + 2] * 3;
    if (
      keep(
        (pos[a] + pos[b] + pos[c]) / 3,
        (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3,
        (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3,
      )
    )
      out.push(ind[i], ind[i + 1], ind[i + 2]);
  }
  prim.setIndices(writable(doc, doc.getRoot().listBuffers()[0], 'SCALAR', new ind.constructor(out)));
}
function faceShape(doc, who, spec) {
  const face = doc
      .getRoot()
      .listMeshes()
      .find((m) => m.getName() === 'akari_face'),
    seen = new Map();
  for (const p of face.listPrimitives()) {
    const attr = p.getAttribute('POSITION'),
      key = attr;
    if (seen.has(key)) {
      p.setAttribute('POSITION', seen.get(key));
      continue;
    }
    const a = attr.getArray().slice(),
      eye = /Eye/.test(p.getMaterial().getName());
    for (let i = 0; i < a.length; i += 3) {
      const y = a[i + 1],
        cheek = Math.max(0, 1 - Math.abs(y - 1.355) / 0.076);
      a[i] *= 1 + (spec.skin - 1) * (0.42 + 0.58 * cheek);
      if (who === 'fran') {
        a[i + 1] -= 0.0035 * cheek;
        if (eye) a[i + 1] = 1.399 + (a[i + 1] - 1.399) * 0.91;
      }
      if (who === 'saya' && eye) {
        a[i + 1] = 1.398 + (a[i + 1] - 1.398) * 1.055;
        a[i + 2] += 0.0006;
      }
      if (who === 'father') {
        a[i] *= 1 + 0.04 * cheek;
        if (eye) {
          a[i + 1] = 1.4 + (a[i + 1] - 1.4) * 0.72;
        } else if (y < 1.385) {
          a[i + 1] -= 0.01 * cheek;
          a[i + 2] += 0.005 * cheek;
        }
      }
      if (who === 'innkeeper') a[i + 2] += 0.004 * cheek;
    }
    const out = writable(doc, doc.getRoot().listBuffers()[0], 'VEC3', a);
    seen.set(key, out);
    p.setAttribute('POSITION', out);
  }
}
async function elaina(doc, g) {
  const r = doc.getRoot(),
    sw = g.switchJoint('Journey_Brooch', chest),
    j = g.joints.get(sw),
    buf = r.listBuffers()[0];
  const coat = r.listMeshes().find((m) => m.getName() === 'traveller_coat');
  for (const p of coat.listPrimitives().slice(6)) {
    const n = p.getAttribute('POSITION').getCount(),
      js = new Uint16Array(4 * n),
      ws = new Float32Array(4 * n);
    for (let i = 0; i < n; i++) {
      js[4 * i] = j;
      ws[4 * i] = 1;
    }
    p.setAttribute('JOINTS_0', writable(doc, buf, 'VEC4', js)).setAttribute(
      'WEIGHTS_0',
      writable(doc, buf, 'VEC4', ws),
    );
  }
  g.palette = {
    metal: ['#e5c184', 'brass'],
    gem: ['#bfcfe9', 'glass'],
    paper: ['#e6d6a9'],
    book: ['#784b51', 'leather'],
    stitch: ['#c39882'],
    rose: ['#ce9bbc'],
    hairGlint: ['#d5d6ed'],
  };
  const hat = r
      .listMeshes()
      .find((m) => m.getName() === 'akari_witch_hat')
      .listPrimitives()[0],
    a = hat.getAttribute('POSITION').getArray();
  for (let i = 0; i < a.length; i += 3) {
    const x = a[i],
      y = a[i + 1],
      z = a[i + 2],
      rho = Math.hypot(x, z);
    if (y < 1.583 && rho > 0.12) {
      const k = Math.min(1, (rho - 0.12) / 0.15);
      a[i] *= 1 + 0.13 * k;
      a[i + 2] *= 1 + 0.07 * k;
      a[i + 1] += 0.009 * k * Math.sin(x * 13 + 0.5);
    }
    if (y > 1.6 && x < -0.05) {
      a[i] += 0.19 * (x + 0.05);
      a[i + 1] += 0.14 * (x + 0.05);
    }
  }
  g.wire(
    'metal',
    [
      [-0.216, 1.644, -0.009],
      [-0.218, 1.636, -0.006],
      [-0.218, 1.622, -0.004],
    ],
    0.0018,
    head,
  );
  g.orb('metal', [-0.218, 1.628, -0.005], [0.004, 0.006, 0.004], head);
  g.sweep(
    'gem',
    [
      [-0.218, 1.623, -0.005],
      [-0.218, 1.618, -0.005],
      [-0.218, 1.608, -0.005],
    ],
    (t) => 0.004 * Math.sin(Math.PI * t) + 0.0004,
    (t) => 0.003 * Math.sin(Math.PI * t) + 0.0004,
    [0, 0, 1],
    head,
  );
  // Two folios peek from the satchel on the traveller's right hip. The visible fore edge,
  // bound covers and narrow ribbon mark remain readable while she runs.
  const ctr = [-0.204, 0.915, 0.002];
  for (const [size, off, tone] of [
    [0.066, -0.014, 'book'],
    [0.063, -0.01, 'paper'],
    [0.065, -0.006, 'book'],
  ])
    g.rings(
      tone,
      [
        [ctr[1] + size, 0.009, 0.059, ctr[2]],
        [ctr[1] + size - 0.004, 0.01, 0.059, ctr[2]],
        [ctr[1] - 0.045, 0.009, 0.056, ctr[2]],
      ],
      { weight: hips, center: ctr[0] + off, seg: 16 },
    );
  for (let k = 0; k < 3; k++)
    g.wire(
      'stitch',
      [
        [ctr[0] - 0.005, 0.974 - k * 0.002, -0.046],
        [ctr[0] - 0.007, 0.974 - k * 0.002, -0.003],
        [ctr[0] - 0.005, 0.973 - k * 0.002, 0.043],
      ],
      0.00055,
      hips,
    );
  g.sweep(
    'rose',
    [
      [-0.208, 0.98, 0.021],
      [-0.217, 0.976, 0.03],
      [-0.22, 0.956, 0.04],
      [-0.219, 0.941, 0.047],
    ],
    (t) => 0.002 + 0.001 * Math.sin(Math.PI * t),
    0.001,
    [1, 0, 0],
    hips,
  );
  const boots = r.listNodes().find((n) => n.getMesh()?.getName() === 'traveller_boots');
  const old = boots.getMesh();
  boots.dispose();
  old.dispose();
  const donor = (await io.read(base))
      .getRoot()
      .listMeshes()
      .find((m) => m.getName() === 'akari_body')
      .listPrimitives()[0],
    body = r
      .listMeshes()
      .find((m) => m.getName() === 'akari_body')
      .listPrimitives()[0];
  const source = donor.getIndices().getArray(),
    kept = Array.from(body.getIndices().getArray()),
    verts = donor.getAttribute('POSITION').getArray(),
    existing = new Set();
  for (let i = 0; i < kept.length; i += 3) existing.add([kept[i], kept[i + 1], kept[i + 2]].join('/'));
  for (let i = 0; i < source.length; i += 3) {
    const tri = [source[i], source[i + 1], source[i + 2]],
      y = tri.reduce((acc, n) => acc + verts[n * 3 + 1], 0) / 3;
    if (y > 0.148 && y < 0.43 && !existing.has(tri.join('/'))) kept.push(...tri);
  }
  body.setIndices(writable(doc, buf, 'SCALAR', new Uint16Array(kept)));
  ashTravellingCoat(g);
}
const manifestRows = {};
// --only apprentice,fran  rebuilds just those cast members (the manifest rows of the others are left as they are)
const onlyArg = process.argv.indexOf('--only'),
  only = onlyArg > 0 ? new Set(process.argv[onlyArg + 1].split(',')) : null;
for (const [who, spec] of Object.entries(shapes)) {
  if (only && !only.has(who)) continue;
  const d = await io.read(
      who === 'elaina' ? traveller : who === 'apprentice' ? 'assets/models/journey/elaina.glb' : base,
    ),
    r = d.getRoot(),
    skin = r.listSkins()[0],
    g = new Tailor(d, skin, who),
    id =
      who === 'father'
        ? 'char_elaina_father'
        : who === 'mother'
          ? 'char_elaina_mother'
          : who === 'exam'
            ? 'char_exam_witch'
            : who === 'apprentice'
              ? 'char_elaina_apprentice'
              : 'char_' + who;
  if (who !== 'apprentice') await eyes(d, spec.iris);
  if (who === 'elaina') {
    await elaina(d, g);
    console.log('fitted hair', fitWornHair(d));
  } else if (who === 'apprentice') {
    const loose = (await io.read(traveller))
        .getRoot()
        .listMeshes()
        .find((m) => m.getName() === 'akari_hair')
        .listPrimitives()[0],
      fitted = r
        .listMeshes()
        .find((m) => m.getName() === 'akari_hair')
        .listPrimitives()[0];
    for (const k of ['POSITION', 'NORMAL', 'JOINTS_0', 'WEIGHTS_0']) {
      const a = loose.getAttribute(k);
      fitted.setAttribute(k, writable(d, r.listBuffers()[0], a.getType(), a.getArray().slice()));
    }
    const keep = new Set([
      'akari_face',
      'akari_hair',
      'akari_ribbon',
      'akari_body',
      'traveller_skirt',
      'traveller_blouse',
      'elaina_ankle',
      'elaina_roseToe',
      'elaina_outsole',
    ]);
    for (const n of r.listNodes().filter((n) => n.getMesh() && !keep.has(n.getMesh().getName()))) {
      const m = n.getMesh();
      n.dispose();
      m.dispose();
    }
    g.palette = { blouse: ['#f3efe9'], collar: ['#e9e1d3'], hair: ['#c9c8da'], hairGlint: ['#dedbe8'] };
    sleeves(g, 'apprentice');
    const curl = [
      [0.01, 1.502, 0.018],
      [0.016, 1.529, 0.019],
      [-0.002, 1.555, 0.024],
      [-0.03, 1.561, 0.032],
      [-0.048, 1.546, 0.041],
      [-0.036, 1.535, 0.046],
    ];
    g.sweep(
      'hair',
      curl,
      (t) => 0.0048 * Math.sin(Math.PI * t) ** 0.54 + 0.00022,
      (t) => 0.0031 * Math.sin(Math.PI * t) ** 0.65 + 0.00018,
      [0, 0, 1],
      head,
      25,
      8,
    );
    g.sweep(
      'hairGlint',
      curl.map(([x, y, z]) => [x, y + 0.0006, z + 0.0017]),
      (t) => 0.001 * Math.sin(Math.PI * t) + 0.00006,
      0.00024,
      [0, 0, 1],
      head,
      25,
      6,
    );
  } else {
    for (const n of r
      .listNodes()
      .filter((n) => ['akari_hair', 'akari_under', 'akari_ribbon'].includes(n.getMesh()?.getName()))) {
      const m = n.getMesh();
      n.dispose();
      m.dispose();
    }
    const body = r.listMeshes().find((m) => m.getName() === 'akari_body'),
      p = body.listPrimitives()[0];
    if (who === 'saya') {
      const stock = d
        .createMaterial('cloth_saya_stockings')
        .setBaseColorFactor([...new Color('#373647').toArray(), 1])
        .setRoughnessFactor(0.91);
      fittedStocking(d, body, stock);
    }
    crop(
      d,
      p,
      (x, y) => y > 1.266 || (Math.abs(x) > 0.473 && y > 1.14) || (who === 'saya' && y >= 0.664 && y < 0.79),
    );
    faceShape(d, who, spec);
    g.palette = palette(spec);
    if (who === 'father') father(g);
    else {
      hair(g, who);
      garments(g, who);
    }
    if (who === 'fran' || who === 'exam') hat(g, who);
    if (who === 'saya') hat(g, who, g.switchJoint('Journey_ApprenticeHat', head));
  }
  await g.bake();
  if (who === 'apprentice') {
    // one garment: the sleeves keep their own woven map (the bodice's linen texture is an atlas laid out for the
    // bodice UVs) but take the bodice's white and its cel-shading parameters (shade colour, garment, finish)
    const linen = r.listMaterials().find((m) => m.getName() === 'cloth_traveller_linen'),
      sleeve = r.listMeshes().find((m) => m.getName() === 'apprentice_blouse');
    if (linen && sleeve) for (const p of sleeve.listPrimitives()) p.getMaterial().setExtras({ ...linen.getExtras() });
  }
  r.listScenes()[0].setName(id);
  await d.transform(
    prune({
      keepLeaves: true,
      keepAttributes: true,
      propertyTypes: [
        PropertyType.ACCESSOR,
        PropertyType.MATERIAL,
        PropertyType.TEXTURE,
        PropertyType.PRIMITIVE,
        PropertyType.MESH,
      ],
    }),
  );
  const file = 'models/journey/' + id.slice(5) + '.glb';
  await io.write('assets/' + file, d);
  const bytes = (await fs.stat('assets/' + file)).size,
    meshes = r.listMeshes(),
    tris = meshes.reduce(
      (a, m) =>
        a +
        m
          .listPrimitives()
          .reduce((n, p) => n + (p.getIndices()?.getCount() || p.getAttribute('POSITION').getCount()) / 3, 0),
      0,
    ),
    entry = {
      file,
      bytes,
      tris,
      meshes: meshes.map((m) => m.getName()),
      materials: r.listMaterials().map((m) => m.getName()),
      scale: spec.height,
    };
  const bounds = [0, 1, 2].map((i) => {
    let lo = Infinity,
      hi = -Infinity;
    for (const m of meshes)
      for (const p of m.listPrimitives()) {
        const a = p.getAttribute('POSITION');
        lo = Math.min(lo, a.getMin([])[i]);
        hi = Math.max(hi, a.getMax([])[i]);
      }
    return +((hi - lo) * spec.height).toFixed(3);
  });
  entry.size = bounds;
  manifestRows[id] = entry;
  console.log(id, tris, bytes);
}
const man = JSON.parse(await fs.readFile('assets/manifest.json', 'utf8')),
  template = man.char_akari,
  patch = {};
for (const [id, entry] of Object.entries(manifestRows)) {
  const { file, bytes, tris, size, meshes, materials, scale } = entry;
  patch[id] = {
    file,
    type: 'model',
    license:
      'Original mesh and garment construction inspired by the anime character design. Humanoid skeleton based on pixiv VRoid HairSample_Female (CC0).',
    author: 'Journey character team',
    source: 'tools/journey/build-cast.mjs',
    bytes,
    tris,
    size,
    meshes,
    materials,
    scale,
    clipsFrom: template.clipsFrom,
    bones: template.bones,
    hipsHeight: template.hipsHeight,
    morphs: template.morphs,
    morphMesh: template.morphMesh,
    preload: id === 'char_elaina' || id === 'char_elaina_apprentice',
    ...(id === 'char_elaina' || id === 'char_elaina_apprentice'
      ? { secondaryChains: template.secondaryChains, springDefaults: template.springDefaults }
      : {}),
  };
}
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'journey-models-'));
try {
  const fragment = path.join(temp, 'cast.json');
  await fs.writeFile(fragment, JSON.stringify(patch));
  execFileSync(
    process.execPath,
    [
      'tools/manifest-patch.mjs',
      fragment,
      '--replace',
      '--set',
      'char_akari.preload=false',
      '--set',
      'prop_gohei.preload=false',
      '--set',
      'prop_broom.preload=false',
      '--set',
      'sculpt_prop_broom.preload=false',
      '--set',
      'sculpt_prop_gohei.preload=false',
      '--set',
      'sculpt_hip_lantern.preload=false',
    ],
    { stdio: 'inherit' },
  );
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
