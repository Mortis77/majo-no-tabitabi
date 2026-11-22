// In-game half of tools/costume/wardrobe-pics.mjs (runs inside tools/play.mjs): Elaina in each outfit, standing, front three-
// quarter, everything else hidden, drawn twice over two flat grounds (dark / light) so the cut-out can be solved exactly
// (difference matting: edges, ink lines and soft shading keep their true alpha). No UI, no text in the frame.
const P = G.player, sleep = (ms) => T.wait(ms), OUT = { shots: [] };
const IDS = (G.params.ids || 'apprentice,elaina,swim_a,swim_b').split(',');
try { G.env.setHour?.(10.5); } catch (e) { /* */ }
// no UI: hide every page element beside the game canvas (and its ancestors' other children)
const hiddenDom = [];
const hideDom = () => { for (let n = G.renderer.domElement; n && n.parentElement; n = n.parentElement) for (const sib of n.parentElement.children) if (sib !== n && sib.style.opacity !== '0') { hiddenDom.push(sib); sib.style.opacity = '0'; } };
// no vignette (the two grounds must stay flat to the corners): the grade's uVig held at 0 while shooting
const gu = G.post?.pipe?.grade?.material?.uniforms;
const vigOff = (on) => { if (!gu?.uVig) return; if (on) Object.defineProperty(gu.uVig, 'value', { get: () => 0, set: () => {}, configurable: true }); else { delete gu.uVig.value; gu.uVig.value = 0; } };
// only her: her model (and the props on her bones) and the lights go on a layer of their own, the camera draws that layer
const LAYER = 7;
const TH = G.THREE;
for (const id of IDS) {
  const ok = await P.setOutfit(id, { quiet: true }); await sleep(1500);
  // she turns to the sun, a little to her right, so the three-quarter view sees her lit side
  { let sun = null; G.scene.traverse((o) => { if (!sun && o.isDirectionalLight && o.intensity > 0) sun = o; });
    if (sun) { const d = sun.position.clone().sub(sun.target.position); P.yaw = Math.atan2(d.x, d.z) - 0.35; } }
  P.rig.fidgets = false; P.rig.play?.('idle', { restart: true }); await sleep(2000);
  OUT.shots.push({ id, ok, asset: P.rig.assetId });
  // hold the pose and hide the world (lights stay)
  const ts = G.time.scale; G.time.scale = 0; await T.frames(3);   // the world holds still: pose, springs (sleeves, skirt, hair) and shaders
  // Keep meshes reserved for the shadow map out of the portrait.
  const visible = [];
  P.rig.group.traverse((o) => { if (o.layers.test(G.camera.layers)) { visible.push(o); o.layers.enable(LAYER); } });
  const lights = []; G.scene.traverse((o) => { if (o.isLight && !o.layers.isEnabled(LAYER)) { o.layers.enable(LAYER); lights.push(o); } });
  const camMask = G.camera.layers.mask; G.camera.layers.set(LAYER); hideDom(); vigOff(true);
  // no light shafts (they streak the flat grounds radially from the sun and break the matting)
  const sp = G.post?.pipe?.scenePass, keepShafts = sp?.shafts; if (sp) sp.shafts = false;
  const keepBg = G.scene.background, fog = G.scene.fog, keepFog = fog && { d: fog.density, n: fog.near, f: fog.far };
  if (fog) { if (fog.isFogExp2) fog.density = 0; else { fog.near = 1e5; fog.far = 2e5; } }   // (the renderer reads scene.fog: thin it out, never remove it)
  // no cast shadow of the (hidden) world on her: a tree's shadow made her grey
  const rs = []; P.rig.group.traverse((o) => { if (o.isMesh && o.receiveShadow) { o.receiveShadow = false; rs.push(o); } });
  const fw = P.rig.group.getWorldDirection(new TH.Vector3());   // where she faces now (the model's +z)
  const p = P.pos, a = Math.atan2(fw.x, fw.z) + 0.62;           // her front, turned to her left by ~35 deg (three-quarter)
  const cam = () => T.viewCam(p.x + Math.sin(a) * 2.5, p.y + 0.98, p.z + Math.cos(a) * 2.5, p.x, p.y + 0.84, p.z);
  for (const [nm, c] of [['dark', 0x262626], ['light', 0xb4b4b4]]) {
    G.scene.background = new TH.Color(c);
    cam(); await T.frames(2); cam(); await T.shot(`${id}_${nm}`);
  }
  G.scene.background = keepBg; if (fog) { if (fog.isFogExp2) fog.density = keepFog.d; else { fog.near = keepFog.n; fog.far = keepFog.f; } }
  if (sp) sp.shafts = keepShafts; for (const o of rs) o.receiveShadow = true; vigOff(false); G.camera.layers.mask = camMask; for (const o of lights) o.layers.disable(LAYER); visible.forEach((o) => o.layers.disable(LAYER));
  G.time.scale = ts; T.cam();
}
for (const e of hiddenDom) e.style.opacity = '';
OUT.errors = T.errors();
return OUT;
