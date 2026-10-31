const { execFile } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const NETCON_PORT = 2121;

const MARK_START = '// --- ECHO HUD ---';
const MARK_END = '// --- ECHO HUD END ---';

function writeExecFiles(dir) {
  for (const name of ['echo_hud_on.cfg', 'echo_hud_off.cfg']) {
    try { fs.unlinkSync(path.join(dir, name)); } catch { /* eski dosya yok */ }
  }
  const autoPath = path.join(dir, 'autoexec.cfg');
  let text = '';
  try { text = fs.readFileSync(autoPath, 'utf8'); } catch { text = ''; }
  const block = [MARK_START, 'con_enable "1"', 'bind "F8" "exec echo_cam"', MARK_END, ''].join('\r\n');
  if (text.includes(MARK_START)) {
    text = text.replace(new RegExp(`${MARK_START}[\\s\\S]*?${MARK_END}\\r?\\n?`), block);
  } else {
    if (text && !/\r?\n$/.test(text)) text += '\r\n';
    text += block;
  }
  fs.writeFileSync(autoPath, text, 'utf8');
}

function keyPlan(label) {
  const raw = String(label || '`').trim();
  const match = raw.match(/^f(1[0-2]|[1-9])$/i);
  if (match) return { vk: 0x6F + Number(match[1]), scan: 0 };
  return { vk: 0, scan: 0x29 };
}

let chain = Promise.resolve();
let netcon = null;
let netconConnect = null;

function allowedLine(text) {
  return text === 'cl_draw_only_deathnotices 1'
    || text === 'cl_draw_only_deathnotices 0'
    || /^spec_player "[^"\r\n;]{1,32}"$/.test(text);
}

function connectNetcon() {
  if (netcon && !netcon.destroyed) return Promise.resolve(netcon);
  if (netconConnect) return netconConnect;
  netconConnect = new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: NETCON_PORT });
    const fail = () => {
      socket.destroy();
      resolve(null);
    };
    const timer = setTimeout(fail, 500);
    socket.once('connect', () => {
      clearTimeout(timer);
      netcon = socket;
      socket.on('error', () => { if (netcon === socket) netcon = null; });
      socket.on('close', () => { if (netcon === socket) netcon = null; });
      resolve(socket);
    });
    socket.once('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
  }).finally(() => { netconConnect = null; });
  return netconConnect;
}

function sendLine(text) {
  if (!allowedLine(text)) return Promise.resolve({ ok: false, code: 'bad' });
  return connectNetcon().then((socket) => new Promise((resolve) => {
    if (!socket) {
      resolve({ ok: false, code: 'nocon' });
      return;
    }
    socket.write(text + '\n', (err) => {
      if (err) {
        netcon = null;
        resolve({ ok: false, code: 'nocon' });
        return;
      }
      resolve({ ok: true });
    });
  }));
}

function enqueue(task) {
  const run = chain.then(task, task);
  chain = run.then(() => {}, () => {});
  return run;
}

function sendkeyScript() {
  const candidates = [
    path.join(__dirname, 'sendkey.ps1'),
    path.join(path.dirname(process.execPath), 'src', 'sendkey.ps1'),
  ];
  return candidates.find((file) => fs.existsSync(file)) || candidates[0];
}

function sendCommand(text, consoleKey, stay, options) {
  const plan = keyPlan(consoleKey);
  const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = sendkeyScript();
  const extra = options || {};
  const args = [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', script,
    '-Text', text,
    '-Vk', String(extra.vk || plan.vk),
    '-Scan', String(extra.scan != null ? extra.scan : plan.scan),
  ];
  if (extra.tap) args.push('-Tap');
  if (extra.binds) args.push('-Binds');
  if (stay === 'layer') args.push('-Layer');
  else if (stay === 'back') args.push('-Back');
  else if (stay) args.push('-Stay');
  return new Promise((resolve) => {
    execFile(ps, args, { timeout: extra.binds ? 15000 : 8000, windowsHide: true }, (err, stdout) => {
      const line = String(stdout || '').trim().split(/\r?\n/).filter(Boolean).pop();
      try {
        resolve(JSON.parse(line));
      } catch {
        resolve({ ok: false, code: 'fail' });
      }
    });
  });
}

async function apply(hide, { cfgDir, consoleKey }) {
  if (cfgDir) {
    try { writeExecFiles(cfgDir); } catch { /* cfg temizliği şart değil */ }
  }
  const command = hide ? 'cl_draw_only_deathnotices 1' : 'cl_draw_only_deathnotices 0';
  const remote = await enqueue(() => sendLine(command));
  const result = remote.ok ? remote : await enqueue(() => sendCommand(command, consoleKey));
  if (result.ok) return { ok: true };
  if (result.code === 'nocs2') return { ok: false, code: 'nocs2', error: 'CS2 açık değil.' };
  if (result.code === 'nofocus') return { ok: false, code: 'nofocus', error: 'CS2 penceresine geçilemedi. Oyunu öne alıp tekrar dene.' };
  return { ok: false, code: result.code || 'fail', error: 'Oyun komutu girilemedi.' };
}

let cfgDir = '';
let armed = false;

function setCfgDir(dir) {
  const next = dir || '';
  if (next === cfgDir) return;
  cfgDir = next;
  armed = false;
}

function writeCam(name) {
  if (!cfgDir) return false;
  fs.writeFileSync(path.join(cfgDir, 'echo_cam.cfg'), `spec_player "${name}"\r\n`, 'utf8');
  return true;
}

function spectate(name, consoleKey) {
  const clean = String(name || '').replace(/["\r\n;\\]/g, '').trim().slice(0, 32);
  if (!clean) return Promise.resolve({ ok: false, code: 'bad' });
  return enqueue(async () => {
    const remote = await sendLine(`spec_player "${clean}"`);
    if (remote.ok) return remote;
    if (!writeCam(clean)) return { ok: false, code: 'nocfg' };
    if (!armed) {
      const bind = await sendCommand('bind "F8" "exec echo_cam"', consoleKey, 'layer');
      if (!bind || !bind.ok) return bind || { ok: false, code: 'fail' };
      armed = true;
    }
    return sendCommand('tap', consoleKey, 'layer', { tap: true, vk: 0x77, scan: 0x42 });
  });
}

module.exports = { apply, spectate, writeExecFiles, setCfgDir };
