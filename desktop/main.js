// Desktop shell for 魔女之旅: shows the built game (./dist next to this file) in its own window.
// The game is served through a private app:// scheme so its origin never changes (saves live in localStorage per origin).
const { app, BrowserWindow, Menu, shell, protocol, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DIST = path.join(__dirname, 'dist');
// MV_USERDATA=<dir>: run with a throw-away profile (self-tests must never touch the player's real save)
if (process.env.MV_USERDATA) app.setPath('userData', path.resolve(process.env.MV_USERDATA));

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    let p = decodeURIComponent(new URL(request.url).pathname);
    if (p === '/' || p === '') p = '/index.html';
    const file = path.normalize(path.join(DIST, p));
    if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response('not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 960, minHeight: 600,
    backgroundColor: '#05060d', autoHideMenuBar: true, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'View', submenu: [{ role: 'togglefullscreen' }, { role: 'reload' }, { role: 'toggleDevTools' }] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] },
  ]));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  // MV_SMOKE=1: hidden self-test (used when packaging) — load the game, wait for the title screen, print the result, quit.
  const SMOKE = process.env.MV_SMOKE === '1';
  if (!SMOKE) win.once('ready-to-show', () => win.show());
  // MV_SMOKE_QUERY: extra URL parameters for self-test A/B runs (e.g. boot=legacy)
  win.loadURL('app://majo-no-tabitabi/' + (SMOKE && process.env.MV_SMOKE_QUERY ? '?' + process.env.MV_SMOKE_QUERY : ''));
  if (SMOKE) {
    // times are from process start (process.uptime), i.e. what a player waits after double-clicking the app.
    // MV_SMOKE_PLAY=1 (only together with MV_USERDATA) also picks "new game" and waits for the first playable frame.
    const PLAY = process.env.MV_SMOKE_PLAY === '1' && !!process.env.MV_USERDATA;
    const gpuErrors=[];
    win.webContents.on('console-message', event => {
      const message=String(event.message || '');
      if (/shader error|VALIDATE_STATUS.*false|WebGL.*INVALID_(?:VALUE|OPERATION)/i.test(message))
        gpuErrors.push(message.slice(0,900));
    });
    const up = () => Math.round(process.uptime() * 1000);
    const readyMs = up();
    let done = false, titleMs = 0, menuMs = 0, pressed = false;
    const finish = (r, ok) => {
      done = true; clearInterval(poll);
      if(gpuErrors.length){ok=false;r={...r,errors:[...(r?.errors||[]),...gpuErrors]};}
      console.log('MV_SMOKE ' + JSON.stringify({ ok, ms: up(), appReadyMs: readyMs, titleMs, menuMs, ...(r || {}) }));
      app.quit();
    };
    const poll = setInterval(async () => {
      if (done) return;
      let r = null;
      try { r = await win.webContents.executeJavaScript("(function(){var g=window.__game;if(!g)return null;var b=window.__mvBoot;return {mode:g.mode,bootReady:g.bootReady!==false,started:!!g.started,playable:!!(b&&b.marks.some(function(m){return m[0]==='playable'})),errors:(g.errors||[]).map(function(e){return e.where+': '+e.message}),assets:Object.keys(g.assets&&g.assets.manifest||{}).length,renderer:!!g.renderer,marks:b?b.marks:null,warm:g.bootWarm||null,vis:document.visibilityState,heapMB:performance.memory?Math.round(performance.memory.usedJSHeapSize/1e6):null}})()"); } catch (e) { r = null; }
      // the title counts once its first frame is on screen (the 'titleShown' boot mark), not when the mode flips
      const shown = !!(r && r.marks && r.marks.some((m) => m[0] === 'titleShown'));
      if (shown && !titleMs) titleMs = up();
      if (shown && r.bootReady && !menuMs) menuMs = up();
      if (!PLAY && titleMs) return finish(r, true);
      if (PLAY && menuMs && !pressed) { pressed = true; setTimeout(() => win.webContents.executeJavaScript("window.__T&&window.__T.press('Enter',60)").catch(() => {}), 1300); }
      if (PLAY && r && r.playable) return finish(r, true);
      if (up() > 120000) finish(r, false);
    }, 50);
  }
});
app.on('window-all-closed', () => app.quit());
