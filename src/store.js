const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  hud: 'apex',
  matchLink: '',
  matchTitle: '',
  map1: '',
  map2: '',
  map3: '',
  mapCaption: '',
  map1Logo: '',
  map2Logo: '',
  map3Logo: '',
  ctName: '',
  tName: '',
  ctLogo: '',
  tLogo: '',
  ctColor: '#8ecbff',
  tColor: '#f0b45a',
  showMoney: true,
  showKd: true,
  showBomb: true,
  showAmmo: true,
  demo: true,
  hideGameHud: true,
  aiObserver: false,
  consoleKey: '`',
  cfgPath: '',
  brandMedia: '',
  brandKind: '',
  pauseWidget: 200,
  pauseBrand: 360,
  pauseBrandX: 0,
  pauseBrandY: 0,
  pauseText: '',
  pauseTextSize: 64,
  pauseTextX: 0,
  pauseTextY: 260,
  liveBrandW: 420,
  liveBrandH: 164,
  liveBrandRight: 14,
  liveBrandTop: -28,
  liveText: '',
  liveTextSize: 42,
  liveTextRight: 36,
  liveTextTop: 168,
  started: false,
};

function dataDir() {
  const base = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'ECHO HUD')
    : path.join(__dirname, '..', '.echo-data');
  fs.mkdirSync(base, { recursive: true });
  return base;
}

function dataFile() {
  return path.join(dataDir(), 'data.json');
}

function blank() {
  return {
    token: crypto.randomBytes(16).toString('hex'),
    users: [],
    sessions: [],
    settings: { ...DEFAULTS },
    board: { media: '', kind: '', rev: 0 },
    side: { media: '', kind: '', rev: 0 },
  };
}

function load() {
  const file = dataFile();
  if (!fs.existsSync(file)) return blank();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('bozuk');
    if (!parsed.token) parsed.token = crypto.randomBytes(16).toString('hex');
    parsed.users = Array.isArray(parsed.users) ? parsed.users : [];
    parsed.sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
    parsed.settings = { ...DEFAULTS, ...(parsed.settings || {}) };
    parsed.board = parsed.board && typeof parsed.board === 'object' ? parsed.board : { media: '', kind: '', rev: 0 };
    parsed.side = parsed.side && typeof parsed.side === 'object' ? parsed.side : { media: '', kind: '', rev: 0 };
    return parsed;
  } catch {
    const broken = file + '.bak';
    try { fs.renameSync(file, broken); } catch { /* keep going */ }
    return blank();
  }
}

let db = load();

function save() {
  const file = dataFile();
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, file);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  try {
    const check = crypto.scryptSync(password, salt, 32);
    const known = Buffer.from(hash, 'hex');
    if (known.length !== check.length) return false;
    return crypto.timingSafeEqual(check, known);
  } catch {
    return false;
  }
}

function cleanName(name) {
  return String(name || '').trim().slice(0, 16);
}

function findUser(name) {
  const key = cleanName(name).toLocaleLowerCase('tr');
  return db.users.find((user) => user.name.toLocaleLowerCase('tr') === key) || null;
}

function publicSettings(settings = db.settings) {
  return {
    hud: settings.hud,
    matchLink: settings.matchLink,
    matchTitle: settings.matchTitle,
    map1: settings.map1 || '',
    map2: settings.map2 || '',
    map3: settings.map3 || '',
    mapCaption: settings.mapCaption || '',
    map1Logo: settings.map1Logo || '',
    map2Logo: settings.map2Logo || '',
    map3Logo: settings.map3Logo || '',
    ctName: settings.ctName,
    tName: settings.tName,
    ctLogo: settings.ctLogo || '',
    tLogo: settings.tLogo || '',
    ctColor: settings.ctColor,
    tColor: settings.tColor,
    showMoney: !!settings.showMoney,
    showKd: !!settings.showKd,
    showBomb: !!settings.showBomb,
    showAmmo: !!settings.showAmmo,
    demo: !!settings.demo,
    hideGameHud: settings.hideGameHud !== false,
    aiObserver: !!settings.aiObserver,
    consoleKey: settings.consoleKey || '`',
    cfgPath: settings.cfgPath || '',
    brandMedia: settings.brandMedia || '',
    brandKind: settings.brandKind || '',
    pauseWidget: clampNum(settings.pauseWidget, 80, 280, 200),
    pauseBrand: clampNum(settings.pauseBrand, 80, 900, 360),
    pauseBrandX: clampNum(settings.pauseBrandX, -800, 800, 0),
    pauseBrandY: clampNum(settings.pauseBrandY, -200, 900, 0),
    pauseText: clipLine(settings.pauseText, 80),
    pauseTextSize: clampNum(settings.pauseTextSize, 18, 220, 64),
    pauseTextX: clampNum(settings.pauseTextX, -800, 800, 0),
    pauseTextY: clampNum(settings.pauseTextY, -200, 900, 260),
    liveBrandW: clampNum(settings.liveBrandW, 40, 1400, 420),
    liveBrandH: clampNum(settings.liveBrandH, 40, 600, 164),
    liveBrandRight: clampNum(settings.liveBrandRight, -400, 1600, 14),
    liveBrandTop: clampNum(settings.liveBrandTop, -300, 800, -28),
    liveText: clipLine(settings.liveText, 80),
    liveTextSize: clampNum(settings.liveTextSize, 16, 220, 42),
    liveTextRight: clampNum(settings.liveTextRight, -400, 1600, 36),
    liveTextTop: clampNum(settings.liveTextTop, -300, 800, 168),
    started: !!settings.started,
  };
}

function hexColor(value, fallback) {
  return /^#[0-9a-fA-F]{6}$/.test(value || '') ? value : fallback;
}

function clipLine(value, max) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}

function clampNum(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function sanitize(key, value) {
  if (key === 'hud') return value === 'noir' ? 'noir' : 'apex';
  if (key === 'ctColor') return hexColor(value, DEFAULTS.ctColor);
  if (key === 'tColor') return hexColor(value, DEFAULTS.tColor);
  if (key === 'showMoney' || key === 'showKd' || key === 'showBomb' || key === 'showAmmo' || key === 'demo' || key === 'hideGameHud' || key === 'aiObserver' || key === 'started') {
    return !!value;
  }
  if (key === 'consoleKey') {
    const raw = String(value || '').trim().slice(0, 3);
    if (/^f(1[0-2]|[1-9])$/i.test(raw) || /^[`~öÖ"'¨]$/.test(raw)) return raw;
    return '`';
  }
  if (key === 'brandMedia') {
    const media = String(value || '').trim();
    return /^\/brand\/spot\.(mp4|webm|png|jpe?g|webp|gif)$/i.test(media) ? media : '';
  }
  if (key === 'brandKind') return value === 'video' || value === 'image' ? value : '';
  if (key === 'pauseWidget') return clampNum(value, 80, 280, 200);
  if (key === 'pauseBrand') return clampNum(value, 80, 900, 360);
  if (key === 'pauseBrandX') return clampNum(value, -800, 800, 0);
  if (key === 'pauseBrandY') return clampNum(value, -200, 900, 0);
  if (key === 'pauseText' || key === 'liveText') return clipLine(value, 80);
  if (key === 'pauseTextSize') return clampNum(value, 18, 220, 64);
  if (key === 'pauseTextX') return clampNum(value, -800, 800, 0);
  if (key === 'pauseTextY') return clampNum(value, -200, 900, 260);
  if (key === 'liveTextSize') return clampNum(value, 16, 220, 42);
  if (key === 'liveTextRight') return clampNum(value, -400, 1600, 36);
  if (key === 'liveTextTop') return clampNum(value, -300, 800, 168);
  if (key === 'liveBrandW') return clampNum(value, 40, 1400, 420);
  if (key === 'liveBrandH') return clampNum(value, 40, 600, 164);
  if (key === 'liveBrandRight') return clampNum(value, -400, 1600, 14);
  if (key === 'liveBrandTop') return clampNum(value, -300, 800, -28);
  if (/^map[123]Logo$/.test(key) || key === 'ctLogo' || key === 'tLogo') {
    const url = String(value || '').trim().slice(0, 400);
    return /^https:\/\//i.test(url) ? url : '';
  }
  const limits = { matchLink: 400, matchTitle: 60, mapCaption: 48, ctName: 24, tName: 24, cfgPath: 260, map1: 16, map2: 16, map3: 16 };
  if (limits[key]) return String(value || '').trim().slice(0, limits[key]);
  return undefined;
}

function createUser(name, password) {
  const clean = cleanName(name);
  if (clean.length < 2) return { error: 'Çağrı adı en az 2 karakter.' };
  if (String(password || '').length < 4) return { error: 'Şifre en az 4 karakter.' };
  if (findUser(clean)) return { error: 'Bu çağrı adı kayıtlı.' };
  const { salt, hash } = hashPassword(String(password));
  const user = { id: crypto.randomBytes(8).toString('hex'), name: clean, salt, hash };
  db.users.push(user);
  save();
  return { user };
}

function login(name, password) {
  const user = findUser(name);
  if (!user || !verifyPassword(String(password || ''), user.salt, user.hash)) {
    return { error: 'Ad veya şifre hatalı.' };
  }
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions = db.sessions.filter((session) => session.exp > Date.now() && session.userId !== user.id);
  db.sessions.push({ token, userId: user.id, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 });
  save();
  return { token, user };
}

function logout(token) {
  db.sessions = db.sessions.filter((session) => session.token !== token);
  save();
}

function setIdentity(userId, identity) {
  const user = db.users.find((item) => item.id === userId);
  if (!user || !identity || user.identity === identity) return;
  user.identity = identity;
  save();
}

function userBySession(token) {
  if (!token) return null;
  const now = Date.now();
  const session = db.sessions.find((item) => item.token === token && item.exp > now);
  if (!session) return null;
  const user = db.users.find((item) => item.id === session.userId);
  return user ? { id: user.id, name: user.name, founder: isFounder(user), identity: user.identity || '' } : null;
}

function sessionContext() {
  const now = Date.now();
  let founder = false;
  let identity = '';
  for (const session of db.sessions) {
    if (session.exp <= now) continue;
    const user = db.users.find((item) => item.id === session.userId);
    if (!user) continue;
    if (isFounder(user)) founder = true;
    if (user.identity) identity = user.identity;
  }
  return { founder, identity };
}

function isFounder(user) {
  return !!user && String(user.name || '').toLocaleLowerCase('tr') === 'fero';
}

function publicSpot(record, file) {
  const media = String((record && record.media) || '');
  const ok = new RegExp('^/ad/' + file + '\\.(png|jpe?g|webp|gif)$', 'i').test(media);
  return {
    media: ok ? media : '',
    kind: ok && record.kind === 'image' ? 'image' : '',
    rev: Number(record && record.rev) || 0,
  };
}

function publicBoard() {
  return publicSpot(db.board, 'board');
}

function publicSide() {
  return publicSpot(db.side, 'side');
}

function setBoard(media, kind) {
  db.board = { media: media || '', kind: kind || '', rev: Date.now() };
  save();
  return publicBoard();
}

function setSide(media, kind) {
  db.side = { media: media || '', kind: kind || '', rev: Date.now() };
  save();
  return publicSide();
}

function getSettings() {
  db.settings = { ...DEFAULTS, ...(db.settings || {}) };
  if (db.settings.hud !== 'noir' && db.settings.hud !== 'apex') {
    db.settings.hud = 'apex';
    save();
  }
  return db.settings;
}

function updateSettings(partial) {
  const next = { ...getSettings() };
  if (!partial || typeof partial !== 'object') return publicSettings(next);
  for (const key of Object.keys(DEFAULTS)) {
    if (partial[key] === undefined) continue;
    const value = sanitize(key, partial[key]);
    if (value !== undefined) next[key] = value;
  }
  db.settings = next;
  save();
  return publicSettings(next);
}

function getToken() {
  return db.token;
}

module.exports = {
  DEFAULTS,
  getToken,
  createUser,
  login,
  logout,
  setIdentity,
  userBySession,
  sessionContext,
  isFounder,
  publicBoard,
  publicSide,
  setBoard,
  setSide,
  getSettings,
  updateSettings,
  publicSettings,
  dataDir,
};
