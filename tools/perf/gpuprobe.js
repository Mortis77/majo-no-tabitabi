// GPU probes (docs/api/perf.md "GPU pass"). Evaluated in the page by tools/perf.mjs (--probe a,b,...) BEFORE
// inpage.js; defines window.__gpuProbe(list, ctx) which inpage.js calls per scene after its normal sample.
// Every timing is SERIAL: the GPU is drained (1-pixel readPixels), the work is issued, the GPU is drained again, in one
// synchronous JS task (no rAF in between), N repeats, median + mean. Experiments:
//   split    whole frame vs its parts: main scene pass alone (no shadow maps), each shadow cascade (main+cascade - main),
//            water mirror, half-res sky, post chain (frame - the rest) and each post step (A/B on the whole frame)
//   hook     the main pass with the lighting hook's debug variants (flat = constant colour; noshadow, onetap, noblend,
//            nofog, nocontact, nosun, noamb) and the uniform switches (detail, fine, clouds) -> what each term costs
//   res      pixel ratio 1.5 / 1.0 / 0.75 / 0.5 x MSAA 4 / 2 / 0: main pass + whole frame
//   resflat  the same sweep with the flat hook (raster + vertex vs shading)
//   layers   main pass (no shadow maps) with each layer hidden -> main-pass cost per layer
//   casters  triangles / draws per pass (main, each cascade)
//   overdraw additive count (depth test on = fragments that pass in submission order; off = all layers) at 480x300
window.__gpuProbe = async (list, ctx) => {
  const { G, T } = ctx;
  const R = G.renderer, gl = R.getContext(), THREE = G.THREE;
  const px = new Uint8Array(4);
  // read from the canvas: a readPixels on the bound MSAA scene target is an error and would not wait
  // ANGLE-Metal waits only for the resource it reads: drain from the target the timed work wrote last (the MSAA scene
  // target's resolved texture for the scene pass; the canvas for whole frames)
  const hbuf = new Uint16Array(4), fbuf = new Float32Array(4);
  let drainRT = null;
  const drain = () => {
    if (drainRT) { R.readRenderTargetPixels(drainRT, 0, 0, 1, 1, drainRT.texture.type === THREE.FloatType ? fbuf : drainRT.texture.type === THREE.HalfFloatType ? hbuf : px); return; }
    R.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  };
  const now = () => performance.now();
  const sky = G.sys.sky.state, pipe = sky.pipe, sp = pipe.scenePass, sh = G.look.shadows;
  const N = ctx.n || 14;
  const r2 = (x) => Math.round(x * 100) / 100;
  function time(fn, n = N, warm = 2) {
    drainRT = fn.rt || null;
    for (let i = 0; i < warm; i++) fn();
    drain();
    const a = [];
    for (let i = 0; i < n; i++) { const t = now(); fn(); drain(); a.push(now() - t); }
    a.sort((x, y) => x - y);
    return { med: r2(a[a.length >> 1]), mean: r2(a.reduce((s, x) => s + x, 0) / a.length), min: r2(a[0]) };
  }
  // ---- primitives
  const frame = () => G.renderFrame();
  const shadowFlags = () => ({ auto: R.shadowMap.autoUpdate, need: R.shadowMap.needsUpdate, l: sh.cascades.map((k) => [k.l.shadow.autoUpdate, k.l.shadow.needsUpdate]) });
  const setShadows = (which) => { // which: null = none, array of cascade indices
    R.shadowMap.autoUpdate = !!(which && which.length); R.shadowMap.needsUpdate = false;
    sh.cascades.forEach((k, i) => { const on = !!which && which.includes(i); k.l.shadow.autoUpdate = on; k.l.shadow.needsUpdate = on; });
  };
  const restoreShadows = (f) => { R.shadowMap.autoUpdate = f.auto; R.shadowMap.needsUpdate = f.need; sh.cascades.forEach((k, i) => { k.l.shadow.autoUpdate = f.l[i][0]; k.l.shadow.needsUpdate = f.l[i][1]; }); };
  const main = (which = null) => {
    const f = () => { setShadows(which); R.setRenderTarget(sp.sceneRT); R.clear(); R.render(G.scene, G.camera); };
    f.rt = sp.sceneRT; // three resolves the MSAA target at the end of render(): reading it waits for every draw
    return f;
  };
  const info = () => ({ calls: R.info.render.calls, tris: R.info.render.triangles });
  const countOf = (fn) => { R.info.reset(); fn(); return info(); };
  // a view-only test camera (T.viewCam) is applied by the loop only while it draws; probes draw outside the loop
  const fc = G.debug?.fixedCam?.view ? G.debug.fixedCam : null;
  const camSave = [G.camera.position.clone(), G.camera.quaternion.clone()];
  const useView = () => { if (!fc) return; G.camera.position.copy(fc.pos); G.camera.lookAt(fc.look); G.camera.updateMatrixWorld(); };
  async function settle(n = 4) { await T.frames(n); useView(); }
  useView();
  const out = {};
  const f0 = shadowFlags();

  if (list.includes('split')) {
    const o = out.split = {};
    o.frame = time(frame);
    const fl = shadowFlags();
    o.main = time(main(null)); o.mainCount = countOf(main(null));
    sh.cascades.forEach((k, i) => {
      const t = time(main([i]));
      o['casc' + i] = { ...t, d: r2(t.med - o.main.med), ...(() => { const c = countOf(main([i])); return { calls: c.calls - o.mainCount.calls, tris: c.tris - o.mainCount.tris }; })() };
    });
    restoreShadows(fl);
    // post steps: whole frame with one step off
    const tog = {
      ao: [() => { const w = sp.ao; sp.ao = false; return () => { sp.ao = w; }; }],
      bloom: [() => { const w = pipe.bloom.enabled; pipe.bloom.enabled = false; return () => { pipe.bloom.enabled = w; }; }],
      shafts: [() => { const w = sp.shafts; sp.shafts = false; G.post.flags.shafts = false; return () => { sp.shafts = w; G.post.flags.shafts = w; }; }],
      smaa: [() => { const w = pipe.smaa.enabled; pipe.smaa.enabled = false; return () => { pipe.smaa.enabled = w; }; }],
      sharpen: [() => { const u = pipe.grade.material.uniforms.uSharp, w = u.value; u.value = 0; return () => { u.value = w; }; }],
      mirror: [() => { const w = G.water?.reflect; if (!G.water) return () => {}; G.water.reflect = false; return () => { G.water.reflect = w; }; }],
    };
    o.post = {};
    for (const [k, [ap]] of Object.entries(tog)) {
      const undo = ap();
      const off = time(frame);
      undo();
      const on = time(frame);
      o.post[k] = { on: on.med, off: off.med, d: r2(on.med - off.med) };
    }
    // the post chain alone: composer passes after the scene pass (scene pass draws the scene: replace it by its post part)
    const sr = R.render.bind(R);
    const realRender = R.render;
    R.render = function (s, c) { if (s === G.scene && R.getRenderTarget() === sp.sceneRT) return; return sr(s, c); };
    o.postOnly = time(() => pipe.render());
    R.render = realRender;
  }

  if (list.includes('ab')) {
    // interleaved A/B of GPU-pass switches in one page (recompiles between variants): main pass + whole frame
    const o = out.ab = {};
    const V = ctx.ab || [['old', { old: true, sc: false, tap: false, ao: false }], ['new', { old: false, sc: true, tap: false, ao: true }]];
    const acc = {};
    for (let round = 0; round < 3; round++) {
      for (const [name, sw] of V) {
        G.look.gpuSwitch(sw); await settle(4);
        const m = time(main(null)).med, f = time(frame).med;
        (acc[name] || (acc[name] = { main: [], frame: [] })).main.push(m); acc[name].frame.push(f);
      }
    }
    G.look.gpuSwitch(V[V.length - 1][1]); await settle(4);
    const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
    for (const [k, v] of Object.entries(acc)) o[k] = { main: r2(med(v.main)), frame: r2(med(v.frame)), all: v };
  }

  if (list.includes('top')) {
    // biggest triangle owners in the main pass: hook renderBufferDirect for one main render
    const o = out.top = [];
    const rbd = R.renderBufferDirect, cam = G.camera, agg = new Map();
    R.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
      if (camera === cam) {
        const idx = geometry.index, n = (group ? group.count : (idx ? idx.count : geometry.attributes.position.count));
        const inst = object.isInstancedMesh ? object.count : (geometry.isInstancedBufferGeometry ? Math.min(geometry.instanceCount, 1e7) : 1);
        let tris = Math.min(n, idx ? idx.count : geometry.attributes.position.count) / 3 * inst;
        if (object.isBatchedMesh) tris = R.info.render.triangles; // approximate below
        let r = object; while (r.parent && r.parent !== G.scene) r = r.parent;
        const key = (r.name || r.userData.__sys || r.type) + ' / ' + (object.name || object.type) + ' / ' + (material.name || material.type);
        const e = agg.get(key) || { key, calls: 0, ktris: 0, dist: 0, inst: 0 };
        const t0 = R.info.render.triangles;
        rbd.apply(this, arguments);
        e.calls++; e.ktris += (object.isBatchedMesh ? (R.info.render.triangles - t0) : tris) / 1000; e.inst += inst;
        e.dist = Math.round(object.getWorldPosition(new THREE.Vector3()).distanceTo(cam.position));
        agg.set(key, e); return;
      }
      return rbd.apply(this, arguments);
    };
    try { main(null)(); } finally { R.renderBufferDirect = rbd; }
    o.push(...[...agg.values()].sort((a, b) => b.ktris - a.ktris).slice(0, 25).map((e) => ({ ...e, ktris: Math.round(e.ktris) })));
  }

  if (list.includes('pace')) {
    // the real frame interval (rAF) in different states: what the frame is bound by outside the WebGL work
    const o = out.pace = {};
    const iv = async (n = 50) => { const t = []; await new Promise((res) => { let k = 0, last = 0; const f = () => { const ts = performance.now(); if (last) t.push(ts - last); last = ts; if (++k <= n) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); t.sort((a, b) => a - b); return r2(t[t.length >> 1]); };
    o.normal = await iv();
    const ui = G.uiRoot, d0 = ui ? ui.style.display : '';
    if (ui) { ui.style.display = 'none'; o.noUI = await iv(); ui.style.display = d0; }
    const rf = G.renderFrame;
    G.renderFrame = () => {}; o.noRender = await iv(); G.renderFrame = rf;
    // render but no game update: the systems' CPU time vs the GPU
    o.normal2 = await iv();
    const ts = G.time.scale; G.time.scale = 0; o.paused = await iv(); G.time.scale = ts;
    const pr = R.getPixelRatio(); G.post.setRenderScale(pr * 0.5); await settle(3); o.halfRes = await iv(); G.post.setRenderScale(null); await settle(3);
    o.normal3 = await iv();
  }

  if (list.includes('exp')) {
    // one-off experiments: empty main pass (clear + MSAA store / resolve), no depth resolve, 11-11-10 float colour target,
    // GTAO sample count
    const o = out.exp = {};
    o.main = time(main(null)).med;
    const saved = [];
    for (const c of G.scene.children) c.traverse((x) => { if (x.isMesh || x.isPoints || x.isLine || x.isSprite) { saved.push([x, x.layers.mask]); x.layers.mask = 0; } });
    o.empty = time(main(null)).med;
    for (const [x, m] of saved) x.layers.mask = m;
    const rt = sp.sceneRT;
    rt.resolveDepthBuffer = false; o.noDepthResolve = time(main(null)).med; rt.resolveDepthBuffer = true;
    o.main2 = time(main(null)).med;
    o.frame = time(frame).med;
    rt.texture.internalFormat = 'R11F_G11F_B10F'; rt.dispose(); await settle(3);
    o.r11Main = time(main(null)).med; o.r11Frame = time(frame).med;
    rt.texture.internalFormat = null; rt.dispose(); await settle(3);
    o.main3 = time(main(null)).med; o.frame3 = time(frame).med;
    const g = sp.gtao;
    if (g) {
      const t = (fn, r) => { fn.rt = r; return time(fn).med; };
      o.gtao12 = t(() => g._renderPass(R, g.gtaoMaterial, g.gtaoRenderTarget, 0xffffff, 1.0), g.gtaoRenderTarget);
      g.updateGtaoMaterial({ samples: 6 }); await settle(2);
      o.gtao6 = t(() => g._renderPass(R, g.gtaoMaterial, g.gtaoRenderTarget, 0xffffff, 1.0), g.gtaoRenderTarget);
      g.updateGtaoMaterial({ samples: 12 }); await settle(2);
      o.pd = t(() => g._renderPass(R, g.pdMaterial, g.pdRenderTarget, 0xffffff, 1.0), g.pdRenderTarget);
    }
  }

  if (list.includes('post')) {
    // each post pass alone at its real size (inputs are this frame's targets)
    const o = out.post = {};
    frame();
    const C = pipe.composer, rb = C.readBuffer, wb = C.writeBuffer, g = sp.gtao;
    const t = (fn, rt) => { fn.rt = rt; return time(fn).med; };
    if (g) {
      if (sp.aoNormalMat) o.aoNormal = t(() => sp._draw(R, sp.aoNormalMat, sp.aoNormalRT), sp.aoNormalRT);
      o.gtao = t(() => g._renderPass(R, g.gtaoMaterial, g.gtaoRenderTarget, 0xffffff, 1.0), g.gtaoRenderTarget);
      o.aoDenoise = t(() => g._renderPass(R, g.pdMaterial, g.pdRenderTarget, 0xffffff, 1.0), g.pdRenderTarget);
      o.aoSize = [g.gtaoRenderTarget.width, g.gtaoRenderTarget.height];
    }
    o.shafts = t(() => sp.cloudShafts.draw(R), sp.cloudShafts.target);
    o.comp = t(() => sp._draw(R, sp.compMat, wb), wb);
    o.bloom = t(() => pipe.bloom.render(R, wb, rb, 0.016, false), rb);
    o.grade = t(() => pipe.grade.render(R, wb, rb, 0.016, false), wb);
    const u = pipe.grade.material.uniforms.uSharp, w0 = u.value; u.value = 0;
    o.gradeNoSharpen = t(() => pipe.grade.render(R, wb, rb, 0.016, false), wb);
    u.value = w0;
    o.smaa = t(() => pipe.smaa.render(R, wb, rb), wb);
    o.size = [rb.width, rb.height];
    frame();
  }

  if (list.includes('hooklow')) {
    // the same variants at pixel ratio 0.5 vs native: what scales with pixels and what with vertices / triangles
    const o = out.hooklow = {};
    for (const pr of [null, 0.5]) {
      G.post.setRenderScale(pr); await settle(2);
      for (const [name, v] of [['normal', 0], ['flat', ['flat']], ['flatvary', ['flatvary']], ['noshadow', ['noshadow']], ['normal2', 0]]) {
        G.look.hookDebug(v); await settle(3);
        o[(pr || 'native') + '_' + name] = time(main(null));
      }
    }
    G.post.setRenderScale(null); G.look.hookDebug(0); await settle(3);
  }
  if (list.includes('hook')) {
    const o = out.hook = {};
    const variants = [['normal', 0], ['flat', ['flat']], ['noshadow', ['noshadow']], ['onetap', ['onetap']], ['noblend', ['noblend']],
      ['nofog', ['nofog']], ['nocontact', ['nocontact']], ['nosun', ['nosun']], ['noamb', ['noamb']],
      ['allcheap', ['noshadow', 'nofog', 'nocontact', 'nosun', 'noamb']]];
    const q = G.look.uniforms.mvQ.value, q0 = q.clone();
    for (const [name, v] of variants) {
      G.look.hookDebug(v);
      await settle(3); // recompile
      o[name] = time(main(null));
    }
    G.look.hookDebug(0); await settle(3);
    for (const [name, k] of [['nodetail', 'x'], ['nofine', 'y'], ['noclouds', 'z']]) {
      q[k] = 0; o[name] = time(main(null)); q.copy(q0);
    }
    o.normal2 = time(main(null));
    const base = (o.normal.med + o.normal2.med) / 2;
    o.delta = Object.fromEntries(Object.entries(o).filter(([k]) => !/^normal/.test(k)).map(([k, v]) => [k, r2(base - v.med)]));
  }

  const sweep = async (flat) => {
    const res = {};
    const prs = [1.5, 1.0, 0.75, 0.5];
    const rt = sp.sceneRT, s0 = rt.samples;
    if (flat) { G.look.hookDebug(['flat']); await settle(3); }
    for (const ms of [4, 2, 0]) {
      rt.samples = ms; rt.dispose();
      for (const pr of prs) {
        G.post.setRenderScale(pr); await settle(2);
        res[`pr${pr}_ms${ms}`] = { main: time(main(null)).med, frame: time(frame).med, size: [pipe.size.x, pipe.size.y] };
      }
    }
    rt.samples = s0; rt.dispose();
    G.post.setRenderScale(null);
    if (flat) G.look.hookDebug(0);
    await settle(3);
    return res;
  };
  if (list.includes('res')) out.res = await sweep(false);
  if (list.includes('resflat')) out.resflat = await sweep(true);

  if (list.includes('layers')) {
    const o = out.layers = {};
    const L = ctx.layerOf;
    const base = time(main(null)); o._base = base;
    const names = ['terrain', 'grass', 'flora', 'impostors', 'structures', 'props', 'landforms', 'life', 'characters', 'gameplay', 'water', 'sky', 'fx', 'other'];
    for (const n of names) {
      const saved = new Map();
      for (const c of G.scene.children) if (L(c) === n) c.traverse((x) => { if (x.isMesh || x.isPoints || x.isLine || x.isSprite) { saved.set(x, x.layers.mask); x.layers.mask = 0; } });
      if (!saved.size) continue;
      const c1 = countOf(main(null));
      const t = time(main(null));
      for (const [x, m] of saved) x.layers.mask = m;
      const c0 = countOf(main(null));
      const t0 = time(main(null));
      o[n] = { d: r2(t0.med - t.med), calls: c0.calls - c1.calls, ktris: Math.round((c0.tris - c1.tris) / 1000) };
    }
  }

  if (list.includes('overdraw')) {
    const o = out.overdraw = {};
    const W = 480, H = 300;
    const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType });
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0, 0), blending: THREE.AdditiveBlending, depthTest: true, depthWrite: true, transparent: false });
    m.colorWrite = true;
    const buf = new Float32Array(W * H * 4);
    for (const [k, dt] of [['passing', true], ['layers', false]]) {
      m.depthTest = dt; m.depthWrite = dt;
      setShadows(null);
      const ov = G.scene.overrideMaterial;
      G.scene.overrideMaterial = m;
      R.setRenderTarget(rt); R.setClearColor(0x000000, 1); R.clear(); R.render(G.scene, G.camera);
      G.scene.overrideMaterial = ov;
      R.readRenderTargetPixels(rt, 0, 0, W, H, buf);
      let s = 0, mx = 0; const hist = [0, 0, 0, 0, 0, 0];
      for (let i = 0; i < W * H; i++) { const v = buf[i * 4]; s += v; if (v > mx) mx = v; hist[Math.min(5, Math.round(v))]++; }
      o[k] = { mean: r2(s / (W * H)), max: mx, hist: hist.map((h) => r2(h / (W * H) * 100)) };
    }
    R.setRenderTarget(null);
    rt.dispose(); m.dispose();
  }

  if (list.includes('casters')) {
    const o = out.casters = {};
    o.main = countOf(main(null));
    sh.cascades.forEach((k, i) => { const c = countOf(main([i])); o['casc' + i] = { calls: c.calls - o.main.calls, ktris: Math.round((c.tris - o.main.tris) / 1000) }; });
  }
  restoreShadows(f0);
  R.setRenderTarget(null);
  if (fc) { G.camera.position.copy(camSave[0]); G.camera.quaternion.copy(camSave[1]); G.camera.updateMatrixWorld(); }
  await settle(4);
  return out;
};
