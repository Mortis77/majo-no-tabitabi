// In-game half of tools/costume/portraits.mjs (runs inside tools/play.mjs): a head-and-shoulders portrait of each speaker,
// rendered by the game itself. Same method as the wardrobe pictures (wardrobe-pics.shot.js): the figure and the lights on a
// layer of their own, the world hidden, drawn twice over a dark and a light flat ground so the cut-out solves exactly.
// Every portrait uses the same lens (28 deg), distance and framing round the head bone, so all speakers share one scale.
const P = G.player, sleep = (ms) => T.wait(ms), OUT = { shots: [], heads: {} };
const TH = G.THREE, LAYER = 7, FOV = 28, DIST = 2.6;
const IDS = (G.params.ids || 'elaina_apprentice,elaina_elaina,fran,saya,mother,father,exam,innkeeper').split(',');
try { G.env.setHour?.(10.5); } catch (e) { /* */ }
const hiddenDom = [];
const hideDom = () => { for (let n = G.renderer.domElement; n && n.parentElement; n = n.parentElement) for (const sib of n.parentElement.children) if (sib !== n && sib.style.opacity !== '0') { hiddenDom.push(sib); sib.style.opacity = '0'; } };
const gu = G.post?.pipe?.grade?.material?.uniforms;
const vigOff = (on) => { if (!gu?.uVig) return; if (on) Object.defineProperty(gu.uVig, 'value', { get: () => 0, set: () => {}, configurable: true }); else { delete gu.uVig.value; gu.uVig.value = 0; } };
// a portrait lens: the camera system keeps writing its own fov, so hold ours while shooting
const lens = (on) => { const c = G.camera; if (on) Object.defineProperty(c, 'fov', { get: () => FOV, set: () => {}, configurable: true }); else { delete c.fov; c.fov = 60; } c.updateProjectionMatrix(); };
let sun = null; G.scene.traverse((o) => { if (!sun && o.isDirectionalLight && o.intensity > 0) sun = o; });
const sunDir = sun ? sun.position.clone().sub(sun.target.position).setY(0).normalize() : new TH.Vector3(0, 0, 1);
T.teleport(2168, 92); await sleep(1500);
const home = P.pos.clone();

for (const id of IDS) {
  let rig = null;
  if (id.startsWith('elaina')) {
    T.teleport(home.x, home.z); await sleep(300);
    await P.setOutfit(id.split('_')[1] || 'elaina', { quiet: true }); await sleep(1500);
    P.yaw = Math.atan2(sunDir.x, sunDir.z) - 0.35;   // to the sun, a little to her right
    rig = P.rig;
  } else {
    const n = G.npcs?.get?.(id);
    if (!n) { OUT.shots.push({ id, ok: false, why: 'no such speaker' }); continue; }
    // she stands where the heroine was; the heroine steps three metres toward the sun, so the speaker turns to face the light
    n.anchor = n.anchor || 'home';
    n.pos.copy(home);
    T.teleport(home.x + sunDir.x * 3, home.z + sunDir.z * 3);
    for (let i = 0; i < 80 && !G.npcs.actor(id); i++) await sleep(150);
    rig = G.npcs.actor(id);
    if (!rig) { OUT.shots.push({ id, ok: false, why: 'actor did not load' }); continue; }
  }
  rig.fidgets = false; rig.play?.('idle', { restart: true }); await sleep(2200);
  const ts = G.time.scale; G.time.scale = 0; await T.frames(3);
  const head = new TH.Vector3();
  (rig.bones?.head || rig.group).getWorldPosition(head);
  const fw = rig.group.getWorldDirection(new TH.Vector3()).setY(0).normalize();
  // a gentle three-quarter: Elaina speaks from the left of the box, so she looks to the right of the picture; the others the other way
  const a = Math.atan2(fw.x, fw.z) + (id.startsWith('elaina') ? -0.38 : 0.38);
  const visible = [];
  rig.group.traverse((o) => { if (o.layers.test(G.camera.layers)) { visible.push(o); o.layers.enable(LAYER); } });
  const lights = []; G.scene.traverse((o) => { if (o.isLight && !o.layers.isEnabled(LAYER)) { o.layers.enable(LAYER); lights.push(o); } });
  const camMask = G.camera.layers.mask; G.camera.layers.set(LAYER); hideDom(); vigOff(true); lens(true);
  const sp = G.post?.pipe?.scenePass, keepShafts = sp?.shafts; if (sp) sp.shafts = false;
  const keepBg = G.scene.background, fog = G.scene.fog, keepFog = fog && { d: fog.density, n: fog.near, f: fog.far };
  if (fog) { if (fog.isFogExp2) fog.density = 0; else { fog.near = 1e5; fog.far = 2e5; } }
  const rs = []; rig.group.traverse((o) => { if (o.isMesh && o.receiveShadow) { o.receiveShadow = false; rs.push(o); } });
  const cam = () => T.viewCam(head.x + Math.sin(a) * DIST, head.y + 0.06, head.z + Math.cos(a) * DIST, head.x, head.y - 0.02, head.z);
  for (const [nm, c] of [['dark', 0x262626], ['light', 0xb4b4b4]]) {
    G.scene.background = new TH.Color(c);
    cam(); await T.frames(2); cam(); await T.shot(`${id}_${nm}`);
  }
  OUT.shots.push({ id, ok: true, asset: rig.assetId });
  G.scene.background = keepBg; if (fog) { if (fog.isFogExp2) fog.density = keepFog.d; else { fog.near = keepFog.n; fog.far = keepFog.f; } }
  if (sp) sp.shafts = keepShafts; for (const o of rs) o.receiveShadow = true; vigOff(false); lens(false); G.camera.layers.mask = camMask;
  for (const o of lights) o.layers.disable(LAYER); visible.forEach((o) => o.layers.disable(LAYER));
  G.time.scale = ts; T.cam();
}
for (const e of hiddenDom) e.style.opacity = '';
OUT.errors = T.errors();
return OUT;
