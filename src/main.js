const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const store = require('./store');
const { normalize, emptyGame } = require('./gsi');
const demo = require('./demo');
const gamecmd = require('./gamecmd');
const { createObserver } = require('./observer');
const { faceitMaps } = require('./faceit');
const setupPack = require('./setup');
const updates = require('./update');
const license = require('./license');

const PORT = 34820;
const HOST = '127.0.0.1';
const root = path.resolve(__dirname, '..');
const publicDir = path.resolve(root, 'public');
const clients = new Set();
const demoStarted = Date.now();

let lastRaw = null;
let lastGsi = 0;
let announced = false;
let observerOn = false;
const observer = createObserver((name, consoleKey, names) => gamecmd.spectate(name, consoleKey, names));

function findBrowser() {
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const local = process.env.LOCALAPPDATA || '';
  const candidates = [
    path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    local ? path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
  ];
  return candidates.find((file) => file && fs.existsSync(file)) || null;
}

function openWindow(url, width, height) {
  const exe = findBrowser();
  if (!exe) return { ok: false, error: 'Edge veya Chrome bulunamadı.' };
  spawn(exe, [`--app=${url}`, `--window-size=${width},${height}`, '--new-window'], {
    detached: true,
    stdio: 'ignore',
  }).unref();
  return { ok: true };
}

function cookies(req) {
  const out = {};
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

function userFrom(req) {
  return store.userBySession(cookies(req).echo);
}

function send(res, code, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

function readRaw(req, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function readBody(req, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function withClock(game) {
  const dt = (Date.now() - lastGsi) / 1000;
  if (!Number.isFinite(dt) || dt < 0) return game;
  const bomb = { ...(game.bomb || {}) };
  return {
    ...game,
    time: game.time == null ? null : Math.max(0, game.time - dt),
    bomb: {
      ...bomb,
      countdown: bomb.countdown == null ? null : Math.max(0, bomb.countdown - dt),
    },
  };
}

function snapshot() {
  const settings = store.publicSettings();
  const recent = lastRaw && Date.now() - lastGsi < 20000;
  const liveGame = recent ? normalize(lastRaw, settings) : null;
  let source = 'idle';
  let game;
  if (liveGame && liveGame.map) {
    source = 'live';
    game = withClock(liveGame);
  } else if (settings.demo) {
    source = 'demo';
    game = demo.build((Date.now() - demoStarted) / 1000, settings);
  } else {
    game = emptyGame(settings);
  }
  const watching = settings.started || settings.aiObserver;
  return {
    hud: settings.hud,
    started: settings.started,
    source,
    settings,
    game,
    observer: {
      enabled: watching,
      target: source === 'live' ? observer.state().target : '',
      players: source === 'live' ? observer.state().players : 0,
    },
    board: store.publicBoard(),
    side: store.publicSide(),
    license: license.publicState(),
  };
}

function broadcast() {
  const packet = `data: ${JSON.stringify(snapshot())}\n\n`;
  for (const res of clients) {
    try { res.write(packet); } catch { clients.delete(res); }
  }
}

function cs2Running() {
  try {
    const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq cs2.exe', '/NH'], { encoding: 'utf8', windowsHide: true });
    return /cs2\.exe/i.test(out);
  } catch {
    return false;
  }
}

function steamExe() {
  const candidates = [];
  const steam = steamPath();
  if (steam) candidates.push(path.join(steam, 'steam.exe'));
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  candidates.push(path.join(pf86, 'Steam', 'steam.exe'));
  candidates.push(path.join(pf, 'Steam', 'steam.exe'));
  return candidates.find((file) => file && fs.existsSync(file)) || '';
}

function launchCs2() {
  if (cs2Running()) return { ok: true, already: true };
  const exe = steamExe();
  if (!exe) return { ok: false, error: 'Steam bulunamadı.' };
  spawn(exe, ['-applaunch', '730'], { detached: true, stdio: 'ignore' }).unref();
  return { ok: true, already: false };
}

let overlayProc = null;
let overlayHud = '';

function stopOverlay() {
  const proc = overlayProc;
  overlayProc = null;
  overlayHud = '';
  if (proc && proc.exitCode == null) {
    try { proc.kill(); } catch { /* katman zaten kapalı */ }
  }
}

function startOverlay(hud) {
  const name = hud === 'noir' ? 'noir' : 'apex';
  if (overlayProc && overlayProc.exitCode == null && overlayHud === name) return { ok: true };
  stopOverlay();
  const exe = path.join(root, 'native', 'overlay', 'Overlay.exe');
  if (!fs.existsSync(exe)) return { ok: false, error: 'Oyun üstü HUD kurulmadı.' };
  const child = spawn(exe, [`http://${HOST}:${PORT}/hud/${name}?overlay=1`], {
    windowsHide: true,
    stdio: 'ignore',
  });
  overlayProc = child;
  overlayHud = name;
  child.on('exit', () => {
    if (overlayProc === child) {
      overlayProc = null;
      overlayHud = '';
    }
  });
  return { ok: true };
}

function steamPath() {
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { encoding: 'utf8' });
    const match = out.match(/SteamPath\s+REG_SZ\s+(.+)/i);
    return match ? match[1].trim() : '';
  } catch {
    return '';
  }
}

function looksLikeCfg(dir) {
  try {
    if (!fs.statSync(dir).isDirectory()) return false;
    return fs.readdirSync(dir).some((name) => name.toLowerCase().endsWith('.cfg'));
  } catch {
    return false;
  }
}

function libraryFolders() {
  const dirs = new Set();
  const steam = steamPath();
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  if (steam) dirs.add(steam);
  dirs.add(path.join(pf86, 'Steam'));
  dirs.add(path.join(pf, 'Steam'));
  if (steam) {
    const vdf = path.join(steam, 'steamapps', 'libraryfolders.vdf');
    if (fs.existsSync(vdf)) {
      const text = fs.readFileSync(vdf, 'utf8');
      for (const match of text.matchAll(/"path"\s+"([^"]+)"/g)) {
        dirs.add(match[1].replace(/\\\\/g, '\\'));
      }
    }
  }
  return [...dirs];
}

function findCfg(manual) {
  if (manual) {
    const raw = String(manual).trim().replace(/^"|"$/g, '');
    const tries = [
      raw,
      path.join(raw, 'cfg'),
      path.join(raw, 'game', 'csgo', 'cfg'),
      path.join(raw, 'csgo', 'cfg'),
    ];
    for (const dir of tries) {
      if (looksLikeCfg(dir)) return dir;
    }
  }
  for (const lib of libraryFolders()) {
    const tries = [
      path.join(lib, 'steamapps', 'common', 'Counter-Strike Global Offensive', 'game', 'csgo', 'cfg'),
      path.join(lib, 'steamapps', 'common', 'Counter-Strike Global Offensive', 'csgo', 'cfg'),
    ];
    for (const dir of tries) {
      if (looksLikeCfg(dir)) return dir;
    }
  }
  return '';
}

function cfgText(token) {
  return [
    '"ECHO HUD"',
    '{',
    `    "uri"          "http://${HOST}:${PORT}/gsi"`,
    '    "timeout"      "5.0"',
    '    "buffer"       "0.1"',
    '    "throttle"     "0.1"',
    '    "heartbeat"    "10.0"',
    '    "auth"',
    '    {',
    `        "token"    "${token}"`,
    '    }',
    '    "data"',
    '    {',
    '        "provider"               "1"',
    '        "map"                    "1"',
    '        "map_round_wins"         "1"',
    '        "round"                  "1"',
    '        "player_id"              "1"',
    '        "player_state"           "1"',
    '        "player_weapons"         "1"',
    '        "player_match_stats"     "1"',
    '        "allplayers_id"          "1"',
    '        "allplayers_state"       "1"',
    '        "allplayers_weapons"     "1"',
    '        "allplayers_match_stats" "1"',
    '        "allplayers_position"    "1"',
    '        "phase_countdowns"       "1"',
    '        "bomb"                   "1"',
    '    }',
    '}',
    '',
  ].join('\r\n');
}

function installCfg(manual) {
  const dir = findCfg(manual);
  const text = cfgText(store.getToken());
  if (!dir) {
    return {
      ok: false,
      error: 'CS2 cfg klasörü bulunamadı. Klasör yolunu yapıştır.',
      cfg: text,
    };
  }
  const file = path.join(dir, 'gamestate_integration_echohud.cfg');
  try {
    fs.writeFileSync(file, text, 'utf8');
  } catch {
    return {
      ok: false,
      error: 'Cfg yazılamadı. CS2 kapalıyken tekrar dene.',
      path: file,
      cfg: text,
    };
  }
  try { gamecmd.writeExecFiles(dir); } catch { /* gsi cfg yazıldı, exec dosyası sonra denenecek */ }
  if (manual) store.updateSettings({ cfgPath: manual });
  return { ok: true, path: file };
}

function safeFile(urlPath) {
  let decoded = urlPath;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  const rel = decoded.replace(/^[/\\]+/, '');
  if (!rel) return null;
  const full = path.resolve(publicDir, rel);
  const relative = path.relative(publicDir, full);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return full;
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

const brandTypes = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function adDir() {
  const dir = path.join(publicDir, 'ads');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function migrateAds() {
  const legacy = path.join(store.dataDir(), 'ads');
  if (!fs.existsSync(legacy)) return;
  const next = adDir();
  for (const name of fs.readdirSync(legacy)) {
    if (!/^(board|side)\./i.test(name)) continue;
    const dest = path.join(next, name);
    if (fs.existsSync(dest)) continue;
    try { fs.copyFileSync(path.join(legacy, name), dest); } catch { /* eski kopya durur */ }
  }
}

function adoptAds() {
  const dir = adDir();
  const exts = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
  for (const file of ['board', 'side']) {
    const current = file === 'board' ? store.publicBoard() : store.publicSide();
    if (current.media) continue;
    const name = exts.map((ext) => file + '.' + ext).find((item) => fs.existsSync(path.join(dir, item)));
    if (!name) continue;
    if (file === 'board') store.setBoard('/ad/' + name, 'image');
    else store.setSide('/ad/' + name, 'image');
  }
}

function clearNamedAd(file) {
  const dir = adDir();
  const pattern = new RegExp('^' + file + '\\.', 'i');
  for (const name of fs.readdirSync(dir)) {
    if (pattern.test(name)) {
      try { fs.unlinkSync(path.join(dir, name)); } catch { /* sonraki yazım üstüne geçer */ }
    }
  }
}

function brandDir() {
  const dir = path.join(store.dataDir(), 'brand');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function clearBrandFiles() {
  const dir = brandDir();
  for (const name of fs.readdirSync(dir)) {
    if (/^spot\./i.test(name)) {
      try { fs.unlinkSync(path.join(dir, name)); } catch { /* sonraki yazım üstüne geçer */ }
    }
  }
}

function sendStream(req, res, file) {
  const stat = fs.statSync(file);
  const ext = path.extname(file).toLowerCase();
  const type = types[ext] || 'application/octet-stream';
  const range = String(req.headers.range || '');
  const match = /^bytes=(\d+)-(\d*)$/.exec(range);
  if (match) {
    const start = Number(match[1]);
    const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
    if (start >= stat.size || end < start) {
      res.writeHead(416, { 'Content-Range': 'bytes */' + stat.size });
      res.end();
      return;
    }
    res.writeHead(206, {
      'Content-Type': type,
      'Content-Range': 'bytes ' + start + '-' + end + '/' + stat.size,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Content-Length': stat.size,
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(file).pipe(res);
}

const pages = {
  '/panel': 'panel/index.html',
  '/hud/apex': 'huds/apex/index.html',
  '/hud/noir': 'huds/noir/index.html',
};

function sendFile(res, file) {
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('yok');
    return;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': types[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(file).pipe(res);
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const pathname = url.pathname;

  if (req.method === 'GET' && pathname === '/api/health') {
    send(res, 200, { ok: true, app: 'echo-hud' });
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/brand/')) {
    const name = path.basename(pathname);
    if (!/^spot\.(mp4|webm|png|jpe?g|webp|gif)$/i.test(name)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('yok');
      return;
    }
    const file = path.join(brandDir(), name);
    if (!fs.existsSync(file)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('yok');
      return;
    }
    sendStream(req, res, file);
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/ad/')) {
    const name = path.basename(pathname);
    if (!/^(board|side)\.(png|jpe?g|webp|gif)$/i.test(name)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('yok');
      return;
    }
    const file = path.join(adDir(), name);
    if (!fs.existsSync(file)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('yok');
      return;
    }
    sendStream(req, res, file);
    return;
  }

  if (req.method === 'GET' && pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('\n');
    clients.add(res);
    res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (req.method === 'POST' && pathname === '/gsi') {
    const text = await readBody(req);
    let payload;
    try { payload = JSON.parse(text || '{}'); } catch {
      send(res, 400, { ok: false });
      return;
    }
    const token = payload.auth && payload.auth.token;
    if (token !== store.getToken()) {
      send(res, 403, { ok: false });
      return;
    }
    lastRaw = payload;
    lastGsi = Date.now();
    if (!announced) {
      announced = true;
      console.log('CS2 baglandi.');
    }
    const settings = store.getSettings();
    if (settings.started || settings.aiObserver) {
      observerOn = true;
      gamecmd.setCfgDir(findCfg(settings.cfgPath));
      observer.tick(normalize(payload, settings), settings.consoleKey);
    } else if (observerOn) {
      observerOn = false;
      observer.reset();
    }
    broadcast();
    send(res, 200, { ok: true });
    return;
  }

  if (pathname.startsWith('/api/')) {
    await api(req, res, pathname);
    return;
  }

  if (req.method === 'GET' && pathname === '/favicon.ico') {
    sendFile(res, path.join(publicDir, 'logo.png'));
    return;
  }

  if (req.method === 'GET' && pages[pathname]) {
    sendFile(res, path.join(publicDir, pages[pathname]));
    return;
  }

  if (req.method === 'GET') {
    sendFile(res, safeFile(pathname));
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('yok');
}

async function api(req, res, pathname) {
  if (req.method === 'POST' && (pathname === '/api/login' || pathname === '/api/register')) {
    let body = {};
    try { body = JSON.parse(await readBody(req, 20_000) || '{}'); } catch { body = {}; }
    if (pathname === '/api/register') {
      const created = store.createUser(body.name, body.password);
      if (created.error) {
        send(res, 400, { error: created.error });
        return;
      }
    }
    const session = store.login(body.name, body.password);
    if (session.error) {
      send(res, 401, { error: session.error });
      return;
    }
    const ident = license.identity(body.name, body.password);
    store.setIdentity(session.user.id, ident);
    license.afterLogin(ident).catch(() => {});
    send(res, 200, { name: session.user.name, founder: store.isFounder(session.user), sealed: setupPack.isSealed(root), version: updates.localVersion(root) }, {
      'Set-Cookie': `echo=${session.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 60 * 60}`,
    });
    return;
  }

  const user = userFrom(req);
  if (!user) {
    send(res, 401, { error: 'Giriş gerekli.' });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/license') {
    let body = {};
    try { body = JSON.parse(await readBody(req, 20_000) || '{}'); } catch { body = {}; }
    if (!user.identity) {
      send(res, 400, { error: 'Üyelikten çıkıp tekrar gir, sonra lisansı yaz.' });
      return;
    }
    try {
      const result = await license.redeem(user.identity, body.key);
      if (result.error) {
        send(res, 400, result);
        return;
      }
      broadcast();
      send(res, 200, { ok: true });
    } catch (err) {
      send(res, 502, { error: err.message || 'Lisans kaydı yazılamadı.' });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/license/mint') {
    if (!user.founder) {
      send(res, 403, { error: 'Lisansı yalnız kurucu üretir.' });
      return;
    }
    try {
      send(res, 200, await license.mint());
    } catch {
      send(res, 502, { error: 'Lisans üretilemedi.' });
    }
    return;
  }

  if (license.publicState().locked && pathname !== '/api/logout' && pathname !== '/api/me') {
    send(res, 403, { error: 'Lisans girin.' });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/me') {
    send(res, 200, { name: user.name, founder: !!user.founder, sealed: setupPack.isSealed(root), version: updates.localVersion(root) });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/logout') {
    store.logout(cookies(req).echo);
    send(res, 200, { ok: true }, { 'Set-Cookie': 'echo=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/update') {
    try {
      const info = await updates.check(root);
      send(res, 200, { current: info.current, version: info.version, newer: info.newer });
    } catch {
      send(res, 502, { error: 'Güncellemelere bakılamadı.' });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/update') {
    let info;
    try {
      info = await updates.check(root);
    } catch {
      send(res, 502, { error: 'Güncellemelere bakılamadı.' });
      return;
    }
    if (!info.newer || !info.url) {
      send(res, 200, { ok: true, newer: false, current: info.current, version: info.version });
      return;
    }
    try {
      stopOverlay();
      await updates.install(root, info.url, { sealed: setupPack.isSealed(root) });
    } catch {
      send(res, 500, { error: 'Güncelleme kurulamadı.' });
      return;
    }
    send(res, 200, { ok: true, newer: true, version: info.version });
    setTimeout(() => {
      updates.relaunch(root);
      process.exit(0);
    }, 700);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/setup') {
    if (setupPack.isSealed(root)) {
      send(res, 403, { error: 'Bu setup kilitli.' });
      return;
    }
    if (!user.founder) {
      send(res, 403, { error: 'Setup’u yalnız kurucu oluşturur.' });
      return;
    }
    let zip;
    try {
      zip = setupPack.buildSetupZip(root);
    } catch {
      send(res, 500, { error: 'Setup oluşmadı.' });
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="ECHO-HUD-Setup.zip"',
      'Content-Length': zip.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(zip);
    return;
  }

  if (req.method === 'POST' && /^\/api\/(ad|side)(\/clear)?$/.test(pathname)) {
    if (setupPack.isSealed(root)) {
      send(res, 403, { error: 'Bu setupta reklamlar kilitli.' });
      return;
    }
    if (!user.founder) {
      send(res, 403, { error: 'Bu alanı yalnız kurucu doldurur.' });
      return;
    }
    const side = pathname.startsWith('/api/side');
    const file = side ? 'side' : 'board';
    if (pathname.endsWith('/clear')) {
      clearNamedAd(file);
      const spot = side ? store.setSide('', '') : store.setBoard('', '');
      broadcast();
      send(res, 200, side ? { ok: true, side: spot } : { ok: true, board: spot });
      return;
    }
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const hinted = { png: '.png', jpg: '.jpg', jpeg: '.jpg', webp: '.webp', gif: '.gif' }[String(req.headers['x-ad-ext'] || '').toLowerCase()];
    const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' }[type] || hinted;
    if (!ext) {
      send(res, 400, { error: 'png, jpg, webp veya gif seç.' });
      return;
    }
    let raw;
    try {
      raw = await readRaw(req, 8 * 1024 * 1024);
    } catch {
      send(res, 413, { error: 'Dosya 8 MB sınırını aşıyor.' });
      return;
    }
    if (!raw.length) {
      send(res, 400, { error: 'Dosya boş.' });
      return;
    }
    clearNamedAd(file);
    const name = file + ext;
    fs.writeFileSync(path.join(adDir(), name), raw);
    const spot = side ? store.setSide('/ad/' + name, 'image') : store.setBoard('/ad/' + name, 'image');
    broadcast();
    send(res, 200, side ? { ok: true, side: spot } : { ok: true, board: spot });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/brand') {
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const hinted = {
      mp4: '.mp4', webm: '.webm', png: '.png', jpg: '.jpg', jpeg: '.jpg', webp: '.webp', gif: '.gif',
    }[String(req.headers['x-brand-ext'] || '').toLowerCase()];
    const ext = brandTypes[type] || hinted;
    if (!ext) {
      send(res, 400, { error: 'mp4, webm, png, jpg, webp veya gif seç.' });
      return;
    }
    let raw;
    try {
      raw = await readRaw(req, 24 * 1024 * 1024);
    } catch {
      send(res, 413, { error: 'Dosya 24 MB sınırını aşıyor.' });
      return;
    }
    if (!raw.length) {
      send(res, 400, { error: 'Dosya boş.' });
      return;
    }
    clearBrandFiles();
    const name = 'spot' + ext;
    fs.writeFileSync(path.join(brandDir(), name), raw);
    const kind = ext === '.mp4' || ext === '.webm' ? 'video' : 'image';
    store.updateSettings({ brandMedia: '/brand/' + name, brandKind: kind });
    broadcast();
    send(res, 200, { ok: true, settings: store.publicSettings() });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/brand/clear') {
    clearBrandFiles();
    store.updateSettings({ brandMedia: '', brandKind: '' });
    broadcast();
    send(res, 200, { ok: true, settings: store.publicSettings() });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/settings') {
    const before = store.getSettings();
    const body = JSON.parse(await readBody(req, 20_000) || '{}');
    store.updateSettings(body);
    const after = store.getSettings();
    if (!after.started) stopOverlay();
    else if (!before.started || before.hud !== after.hud) startOverlay(after.hud);
    broadcast();
    send(res, 200, { ok: true, settings: store.publicSettings() });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/preview') {
    const body = JSON.parse(await readBody(req, 20_000) || '{}');
    const hud = body.hud === 'noir' ? 'noir' : 'apex';
    const pause = body.pause ? '&pause=1' : '';
    const opened = openWindow(`http://${HOST}:${PORT}/hud/${hud}?preview=1${pause}`, 1280, 760);
    send(res, opened.ok ? 200 : 500, opened);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/faceit-maps') {
    const body = JSON.parse(await readBody(req, 20_000) || '{}');
    const found = await faceitMaps(body.link);
    send(res, 200, found);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/launch') {
    send(res, 200, launchCs2());
    return;
  }

  if (req.method === 'POST' && pathname === '/api/overlay') {
    let body = {};
    try { body = JSON.parse(await readBody(req, 20_000) || '{}'); } catch { body = {}; }
    if (body.stop) {
      stopOverlay();
      send(res, 200, { ok: true });
      return;
    }
    const hud = body.hud || store.getSettings().hud;
    send(res, 200, startOverlay(hud));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/gamehud') {
    let body = {};
    try { body = JSON.parse(await readBody(req, 20_000) || '{}'); } catch { body = {}; }
    const settings = store.getSettings();
    const cfgDir = findCfg(body.cfgPath || settings.cfgPath);
    const result = await gamecmd.apply(!!body.hide, {
      cfgDir,
      consoleKey: settings.consoleKey,
    });
    send(res, 200, result);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/cfg') {
    const body = JSON.parse(await readBody(req, 20_000) || '{}');
    const manual = body.cfgPath || store.getSettings().cfgPath;
    send(res, 200, installCfg(manual));
    return;
  }

  send(res, 404, { error: 'Yok.' });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    if (err && err.message === 'large') return;
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('hata');
    }
  });
});

setInterval(() => {
  if (clients.size) broadcast();
}, 250);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    if (!process.env.ECHO_NO_WINDOW) openWindow(`http://${HOST}:${PORT}/panel`, 1180, 800);
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});

license.bindContext({
  founder: () => store.sessionContext().founder,
  identity: () => store.sessionContext().identity,
});
license.start();
migrateAds();
adoptAds();

server.listen(PORT, HOST, () => {
  console.log('ECHO HUD calisiyor');
  console.log(`Panel: http://${HOST}:${PORT}/panel`);
  console.log('Pencereyi kapatirsan program durur.');
  if (store.getSettings().started) startOverlay(store.getSettings().hud);
  if (!process.env.ECHO_NO_WINDOW) openWindow(`http://${HOST}:${PORT}/panel`, 1180, 800);
});

process.on('exit', stopOverlay);
