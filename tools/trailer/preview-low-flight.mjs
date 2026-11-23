// Play the north-shore comparison route from the saddle, using the game's normal controls.
// Run from the project root with node tools/trailer/preview-low-flight.mjs.
import { build, serveGame } from '../../build.mjs';

function startAtMeadow() {
  if (window.__mvReady === 'failed') return;
  if (window.__mvReady !== true) { requestAnimationFrame(startAtMeadow); return; }
  const G = window.__game;
  const x = 1854, z = -312, heading = -.61;
  G.world.setTrialLake(true);
  G.player.teleport(x,G.world.heightAt(x,z)+1.5,z);
  G.player.yaw = heading;
  G.player.mountBroom();
  G.cam.setBehind(heading);
  G.cam.pitch = -.32;
  G.cam.snap();
}

const { url } = await serveGame({ getBuild: async () => {
  const game = await build({});
  if (game.ok) {
    const launch = `<script>const params=new URLSearchParams(location.search);
      params.set('autostart','1'); params.set('nosave','1');
      history.replaceState(null,'','?'+params);
      requestAnimationFrame(${startAtMeadow.toString()});</script>`;
    game.html = game.html.replace('<script src="game.js">',launch+'<script src="game.js">');
  }
  return game;
} });
console.log(url);
