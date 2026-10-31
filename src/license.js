const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { execFileSync } = require('child_process');

const TRIAL_MS = 10 * 60 * 1000;
const REPO = 'ecrp-maker/echo-hud';
const FILE = 'licenses.json';
const BRANCH = 'main';

let machine = '';
let remote = { keys: {}, trials: {} };
let remoteSha = '';
let ready = false;
let queue = Promise.resolve();
let founderCheck = () => false;
let identityCheck = () => '';

function dataDir() {
  const base = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'ECHO HUD')
    : path.join(__dirname, '..', '.echo-data');
  fs.mkdirSync(base, { recursive: true });
  return base;
}

function identity(name, password) {
  const text = String(name || '').trim().toLocaleLowerCase('tr') + ':' + String(password || '');
  return crypto.createHash('sha256').update(text).digest('hex');
}

function machineId() {
  if (machine) return machine;
  let raw = '';
  try {
    const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000,
    });
    const match = out.match(/MachineGuid\s+REG_SZ\s+(\S+)/i);
    if (match) raw = match[1];
  } catch { /* makine kimliği yok */ }
  if (!raw) raw = require('os').hostname();
  machine = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
  return machine;
}

function normalizeKey(value) {
  const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!raw.startsWith('ECHO') || raw.length !== 16) return '';
  const body = raw.slice(4);
  return 'ECHO-' + body.slice(0, 4) + '-' + body.slice(4, 8) + '-' + body.slice(8, 12);
}

function makeKey() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(12);
  let body = '';
  for (const byte of bytes) body += alphabet[byte % alphabet.length];
  return 'ECHO-' + body.slice(0, 4) + '-' + body.slice(4, 8) + '-' + body.slice(8, 12);
}

function blank() {
  return { keys: {}, trials: {} };
}

function cloneDb(db) {
  return {
    keys: { ...(db && db.keys) },
    trials: { ...(db && db.trials) },
  };
}

function readLocalTrial() {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dataDir(), 'trial.json'), 'utf8'));
    const start = Number(parsed && parsed.start);
    return Number.isFinite(start) ? start : 0;
  } catch {
    return 0;
  }
}

function writeLocalTrial(start) {
  const file = path.join(dataDir(), 'trial.json');
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ start }));
  fs.renameSync(tmp, file);
}

function trialStart(db, id, now) {
  const remoteStart = Number(db.trials && db.trials[id]) || 0;
  const localStart = readLocalTrial();
  const known = [remoteStart, localStart].filter((item) => item > 0);
  if (known.length) return Math.min(...known);
  db.trials[id] = now;
  writeLocalTrial(now);
  return now;
}

function statusOf(db, ctx, now) {
  const clock = Number.isFinite(now) ? now : Date.now();
  if (ctx && ctx.founder) {
    return { locked: false, licensed: true, founder: true, trial: false, remaining: 0 };
  }
  const rows = Object.values((db && db.keys) || {});
  const identity = ctx && ctx.identity;
  const machineKey = ctx && ctx.machine;
  const byAccount = !!identity && rows.some((row) => row && row.account === identity);
  const byMachine = !!machineKey && rows.some((row) => row && row.account && row.machine === machineKey);
  if (byAccount || byMachine) {
    return { locked: false, licensed: true, founder: false, trial: false, remaining: 0 };
  }
  const start = trialStart(db || blank(), machineKey || 'local', clock);
  const remaining = Math.max(0, TRIAL_MS - (clock - start));
  return { locked: remaining <= 0, licensed: false, founder: false, trial: true, remaining };
}

function redeemInto(db, key, accountId, machineKey, now) {
  const id = normalizeKey(key);
  if (!id || !db.keys || !db.keys[id]) return { error: 'Lisans geçersiz.' };
  if (!accountId) return { error: 'Önce üyelik aç.' };
  const row = db.keys[id];
  if (row.account && row.account !== accountId) return { error: 'Bu lisans başka üyeliğe bağlı.' };
  db.keys[id] = { account: accountId, machine: machineKey, at: now || Date.now() };
  return { key: id };
}

function rebindInto(db, accountId, machineKey, now) {
  if (!accountId) return false;
  let changed = false;
  for (const id of Object.keys(db.keys || {})) {
    const row = db.keys[id];
    if (!row || row.account !== accountId) continue;
    if (row.machine !== machineKey) {
      db.keys[id] = { account: accountId, machine: machineKey, at: now || Date.now() };
      changed = true;
    }
  }
  return changed;
}

function mintInto(db, now) {
  let key = makeKey();
  while (db.keys[key]) key = makeKey();
  db.keys[key] = { account: '', machine: '', at: now || Date.now() };
  return key;
}

function ghToken() {
  const file = path.join(dataDir(), 'license.token');
  try {
    const saved = fs.readFileSync(file, 'utf8').trim();
    if (saved) return saved;
  } catch { /* kayıtlı anahtar yok */ }
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', windowsHide: true, timeout: 8000 }).trim();
  } catch {
    return '';
  }
}

function request(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ code: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('zaman aşımı')));
    if (body) req.write(body);
    req.end();
  });
}

async function pullRemote() {
  const token = ghToken();
  if (!token) {
    const open = await request('https://raw.githubusercontent.com/' + REPO + '/' + BRANCH + '/' + FILE + '?t=' + Date.now(), {
      method: 'GET',
      headers: { 'User-Agent': 'ECHO-HUD' },
    });
    if (open.code === 404) return { db: blank(), sha: '' };
    if (open.code !== 200) throw new Error('liste okunamadı');
    const parsed = JSON.parse(open.body);
    return { db: { keys: parsed.keys || {}, trials: parsed.trials || {} }, sha: '' };
  }
  const response = await request('https://api.github.com/repos/' + REPO + '/contents/' + FILE + '?ref=' + BRANCH, {
    method: 'GET',
    headers: {
      'User-Agent': 'ECHO-HUD',
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
    },
  });
  if (response.code === 404) return { db: blank(), sha: '' };
  if (response.code !== 200) throw new Error('liste okunamadı');
  const payload = JSON.parse(response.body);
  const text = Buffer.from(String(payload.content || '').replace(/\n/g, ''), 'base64').toString('utf8');
  const parsed = JSON.parse(text || '{}');
  return { db: { keys: parsed.keys || {}, trials: parsed.trials || {} }, sha: payload.sha || '' };
}

async function pushRemote(db, sha) {
  const token = ghToken();
  if (!token) throw new Error('Lisans kaydı yazılamadı.');
  const content = Buffer.from(JSON.stringify({ keys: db.keys, trials: db.trials }, null, 2)).toString('base64');
  const response = await request('https://api.github.com/repos/' + REPO + '/contents/' + FILE, {
    method: 'PUT',
    headers: {
      'User-Agent': 'ECHO-HUD',
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
  }, JSON.stringify({
    message: 'Lisans kaydini guncelle',
    content,
    branch: BRANCH,
    sha: sha || undefined,
  }));
  if (response.code === 409 || response.code === 422) {
    const err = new Error('çakışma');
    err.conflict = true;
    throw err;
  }
  if (response.code !== 200 && response.code !== 201) throw new Error('Lisans kaydı yazılamadı.');
  const payload = JSON.parse(response.body);
  return (payload.content && payload.content.sha) || sha || '';
}

function rememberCache() {
  try {
    const file = path.join(dataDir(), 'license-cache.json');
    fs.writeFileSync(file, JSON.stringify(remote));
  } catch { /* önbellek durur */ }
}

async function refresh() {
  try {
    const pulled = await pullRemote();
    remote = pulled.db;
    remoteSha = pulled.sha;
    ready = true;
    const id = machineId();
    const localStart = readLocalTrial();
    const remoteStart = Number(remote.trials && remote.trials[id]) || 0;
    if (!founderCheck() && localStart && (!remoteStart || localStart < remoteStart)) {
      remote.trials[id] = localStart;
      if (ghToken()) await commitChange();
    } else if (remoteStart && (!localStart || remoteStart < localStart)) {
      writeLocalTrial(remoteStart);
    }
    rememberCache();
  } catch {
    if (!ready) {
      try {
        remote = JSON.parse(fs.readFileSync(path.join(dataDir(), 'license-cache.json'), 'utf8'));
      } catch {
        remote = blank();
      }
      ready = true;
    }
  }
}

async function commitChange() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      remoteSha = await pushRemote(remote, remoteSha);
      rememberCache();
      return;
    } catch (err) {
      if (!err.conflict || attempt === 2) throw err;
      const pulled = await pullRemote();
      const mine = remote;
      remote = pulled.db;
      remoteSha = pulled.sha;
      for (const id of Object.keys(mine.keys || {})) {
        const row = mine.keys[id];
        const current = remote.keys[id];
        if (!current) remote.keys[id] = row;
        else if (!current.account && row.account) remote.keys[id] = row;
        else if (current.account && row.account === current.account && row.machine) remote.keys[id] = row;
      }
      for (const id of Object.keys(mine.trials || {})) {
        const start = Number(mine.trials[id]) || 0;
        const current = Number(remote.trials[id]) || 0;
        if (start && (!current || start < current)) remote.trials[id] = start;
      }
    }
  }
}

function enqueue(fn) {
  const run = queue.then(fn, fn);
  queue = run.then(() => {}, () => {});
  return run;
}

let trialQueued = false;

function publicState() {
  const id = machineId();
  if (founderCheck()) {
    return statusOf(remote, { founder: true, identity: identityCheck(), machine: id }, Date.now());
  }
  if (!Number(remote.trials[id]) && !readLocalTrial()) {
    const start = Date.now();
    remote.trials[id] = start;
    writeLocalTrial(start);
    if (!trialQueued) {
      trialQueued = true;
      enqueue(() => commitChange().catch(() => { trialQueued = false; }));
    }
  }
  return statusOf(remote, { founder: false, identity: identityCheck(), machine: id }, Date.now());
}

function bindContext(ctx) {
  founderCheck = ctx.founder || (() => false);
  identityCheck = ctx.identity || (() => '');
}

function start() {
  machineId();
  refresh();
  setInterval(() => { refresh(); }, 30000);
}

function afterLogin(accountId) {
  return enqueue(async () => {
    await refresh();
    if (!accountId) return;
    if (rebindInto(remote, accountId, machineId(), Date.now())) await commitChange();
  });
}

function redeem(accountId, key) {
  return enqueue(async () => {
    await refresh();
    const decision = redeemInto(remote, key, accountId, machineId(), Date.now());
    if (decision.error) return decision;
    await commitChange();
    return { ok: true, key: decision.key };
  });
}

function mint() {
  return enqueue(async () => {
    await refresh();
    const key = mintInto(remote, Date.now());
    await commitChange();
    return { ok: true, key };
  });
}

module.exports = {
  TRIAL_MS,
  identity,
  machineId,
  normalizeKey,
  statusOf,
  redeemInto,
  rebindInto,
  mintInto,
  publicState,
  bindContext,
  start,
  afterLogin,
  redeem,
  mint,
};
