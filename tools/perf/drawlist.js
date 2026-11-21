// In-page draw-call probe (docs/api/perf.md "Draw-call pass"). Prepend this file to a play.mjs script:
//   cat tools/perf/drawlist.js my-scenes.js > .tmp/x.js && node tools/play.mjs --script .tmp/x.js ...
// It defines DL in the script's scope:
//   const r = await DL.capture()        records every renderBufferDirect of the next rendered frame and returns
//                                       { main, shadow, refl, post, tris: {main, shadow}, byOwner, byMat, top }
//   (r.byDist: main draws by camera distance bucket; r.far: owners of the draws 150 m+ away)
//   DL.table(r, n)                      a readable text summary (top n groups per pass)
// Pass: scene === null -> 'shadow' (WebGLShadowMap); camera that drew the most scene objects -> 'main';
// other perspective cameras -> 'refl' (water mirror); objects not under G.scene -> 'post'.
// Owner: '<top-level child of G.scene>/<next level>' by name (or type); material: name || type.
const DL = (() => {
  const THREE_V = G.camera.position.constructor;
  const R = G.renderer;
  let rec = null;
  const _v = new THREE_V(), _w = new THREE_V();
  if (!R.__dlWrapped) {
    R.__dlWrapped = true;
    const orig = R.renderBufferDirect;
    R.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
      if (rec) {
        const idx = geometry.index, pos = geometry.attributes.position;
        let n = idx ? idx.count : pos ? pos.count : 0;
        if (group) n = Math.min(n, group.count);
        else if (geometry.drawRange && isFinite(geometry.drawRange.count)) n = Math.min(n, geometry.drawRange.count);
        const inst = object.isInstancedMesh ? object.count : (geometry.isInstancedBufferGeometry ? geometry.instanceCount : 1);
        rec.push({ cam: camera, shadow: scene === null, obj: object, mat: material, tris: object.isMesh ? Math.round(n / 3) * inst : 0 });
      }
      return orig.call(this, camera, scene, geometry, material, object, group);
    };
  }
  const ownerOf = (o) => {
    const chain = [];
    let s = o;
    while (s && s.parent && s !== G.scene) { chain.push(s); s = s.parent; }
    if (s !== G.scene) return null;
    const top = chain[chain.length - 1], second = chain[chain.length - 2];
    const nm = (x) => (x ? (x.name || x.userData?.__sys || x.type) : '');
    return nm(top) + (second ? '/' + nm(second) : '');
  };
  async function capture() {
    await T.frames(2);
    rec = [];
    await T.frames(1);
    const all = rec; rec = null;
    const camN = new Map();
    for (const d of all) if (!d.shadow) camN.set(d.cam, (camN.get(d.cam) || 0) + 1);
    let mainCam = null, best = -1;
    for (const [c, n] of camN) if (c.isPerspectiveCamera && n > best) { best = n; mainCam = c; }
    const out = { main: 0, shadow: 0, refl: 0, post: 0, tris: { main: 0, shadow: 0, refl: 0 }, byOwner: {}, byMat: {}, byOwnerShadow: {}, objects: {}, byDist: {}, far: {} };
    for (const d of all) {
      const owner = ownerOf(d.obj);
      let pass = d.shadow ? 'shadow' : owner === null ? 'post' : d.cam === mainCam ? 'main' : 'refl';
      out[pass]++;
      if (out.tris[pass] != null) out.tris[pass] += d.tris;
      if (pass === 'main' || pass === 'shadow') {
        const bo = pass === 'main' ? out.byOwner : out.byOwnerShadow;
        const k = owner || '?';
        (bo[k] || (bo[k] = { n: 0, tris: 0 })).n++; bo[k].tris += d.tris;
        if (pass === 'main') {
          const mk = (d.mat.name || d.mat.type) + (d.obj.isInstancedMesh ? ' [inst]' : '');
          (out.byMat[mk] || (out.byMat[mk] = { n: 0, tris: 0 })).n++; out.byMat[mk].tris += d.tris;
          const ok = k + ' :: ' + (d.obj.name || d.obj.type) + ' :: ' + mk;
          out.objects[ok] = (out.objects[ok] || 0) + 1;
          // distance of the drawn object from the camera (bounding-sphere centre): what a distance cut could remove
          const gs = d.obj.geometry?.boundingSphere;
          _v.copy(gs ? gs.center : _v.set(0, 0, 0)).applyMatrix4(d.obj.matrixWorld);
          const dist = _v.distanceTo(d.cam.getWorldPosition(_w)), b = dist < 60 ? '<60' : dist < 150 ? '<150' : dist < 300 ? '<300' : '300+';
          out.byDist[b] = (out.byDist[b] || 0) + 1;
          if (dist >= 150) { const fk = k + ' @' + b; out.far[fk] = (out.far[fk] || 0) + 1; }
        }
      }
    }
    return out;
  }
  const sortObj = (o, n) => Object.entries(o).sort((a, b) => (b[1].n ?? b[1]) - (a[1].n ?? a[1])).slice(0, n);
  function table(r, n = 25) {
    const L = [`main ${r.main}  shadow ${r.shadow}  refl ${r.refl}  post ${r.post}  tris main ${r.tris.main} shadow ${r.tris.shadow}`];
    L.push('-- main by owner'); for (const [k, v] of sortObj(r.byOwner, n)) L.push(`${String(v.n).padStart(5)} ${String(v.tris).padStart(8)}  ${k}`);
    L.push('-- shadow by owner'); for (const [k, v] of sortObj(r.byOwnerShadow, n)) L.push(`${String(v.n).padStart(5)} ${String(v.tris).padStart(8)}  ${k}`);
    L.push('-- main by material'); for (const [k, v] of sortObj(r.byMat, n)) L.push(`${String(v.n).padStart(5)} ${String(v.tris).padStart(8)}  ${k}`);
    L.push('-- main by camera distance ' + JSON.stringify(r.byDist));
    L.push('-- main draws 150 m+ away by owner'); for (const [k, v] of sortObj(r.far, n)) L.push(`${String(v).padStart(5)}  ${k}`);
    L.push('-- main objects'); for (const [k, v] of sortObj(r.objects, n)) L.push(`${String(v).padStart(5)}  ${k}`);
    return L.join('\n');
  }
  return { capture, table };
})();
