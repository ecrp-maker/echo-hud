const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const REPO = 'ecrp-maker/echo-hud';
const ASSET = 'ECHO-HUD-Setup.zip';

function localVersion(root) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    return String(pkg.version || '0.0.0');
  } catch {
    return '0.0.0';
  }
}

function parseVersion(text) {
  const match = String(text || '').trim().replace(/^v/i, '').match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

function allowedHost(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'github.com'
      || host === 'api.github.com'
      || host === 'objects.githubusercontent.com'
      || host === 'release-assets.githubusercontent.com'
      || host.endsWith('.githubusercontent.com');
  } catch {
    return false;
  }
}

function request(url, headers, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (!allowedHost(url) || redirects > 5) {
      reject(new Error('adres kapalı'));
      return;
    }
    const req = https.get(url, { headers }, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).href;
        request(next, headers, redirects + 1).then(resolve, reject);
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ code, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('zaman aşımı')));
  });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    if (!allowedHost(url)) {
      reject(new Error('adres kapalı'));
      return;
    }
    const file = fs.createWriteStream(dest);
    const pull = (current, redirects) => {
      if (!allowedHost(current) || redirects > 5) {
        file.close();
        reject(new Error('adres kapalı'));
        return;
      }
      const req = https.get(current, { headers: { 'User-Agent': 'ECHO-HUD' } }, (res) => {
        const code = res.statusCode || 0;
        if (code >= 300 && code < 400 && res.headers.location) {
          res.resume();
          pull(new URL(res.headers.location, current).href, redirects + 1);
          return;
        }
        if (code !== 200) {
          res.resume();
          file.close();
          reject(new Error('indirme ' + code));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(dest)));
      });
      req.on('error', (err) => {
        file.close();
        reject(err);
      });
      req.setTimeout(120000, () => req.destroy(new Error('zaman aşımı')));
    };
    file.on('error', reject);
    pull(url, 0);
  });
}

async function check(root) {
  const current = localVersion(root);
  const response = await request('https://api.github.com/repos/' + REPO + '/releases/latest', {
    'User-Agent': 'ECHO-HUD',
    Accept: 'application/vnd.github+json',
  });
  if (response.code !== 200) {
    const err = new Error('sürüm bakılamadı');
    err.code = response.code;
    throw err;
  }
  const latest = JSON.parse(response.body.toString('utf8'));
  const version = String(latest.tag_name || '').replace(/^v/i, '');
  const asset = (latest.assets || []).find((item) => item && item.name === ASSET);
  const url = asset && asset.browser_download_url;
  return {
    current,
    version,
    newer: compareVersions(version, current) > 0,
    url: url && allowedHost(url) ? url : '',
  };
}

async function install(root, url, options = {}) {
  if (!url || !allowedHost(url)) throw new Error('paket yok');
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-update-'));
  try {
    const zip = path.join(stage, ASSET);
    await download(url, zip);
    execFileSync('tar', ['-xf', zip, '-C', stage], { windowsHide: true });
    const unpacked = path.join(stage, 'ECHO HUD');
    if (!fs.existsSync(path.join(unpacked, 'package.json'))) throw new Error('paket bozuk');
    for (const name of fs.readdirSync(unpacked)) {
      if (name === 'setup.lock' && !options.sealed) continue;
      fs.cpSync(path.join(unpacked, name), path.join(root, name), { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

function isPackaged() {
  const base = path.basename(process.execPath).toLowerCase();
  return base !== 'node.exe' && base !== 'node';
}

function relaunch(root) {
  const script = path.join(os.tmpdir(), 'echo-hud-restart.ps1');
  const main = path.join(root, 'src', 'main.js');
  const quote = (value) => "'" + String(value).replace(/'/g, "''") + "'";
  const launch = isPackaged()
    ? 'Start-Process -FilePath ' + quote(process.execPath) + ' -WorkingDirectory ' + quote(root)
    : 'Start-Process -FilePath ' + quote(process.execPath) + ' -ArgumentList ' + quote(main) + ' -WorkingDirectory ' + quote(root);
  const body = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    'Remove-Item Env:ECHO_NO_WINDOW -ErrorAction SilentlyContinue',
    '$deadline = (Get-Date).AddSeconds(25)',
    'while ((Get-Date) -lt $deadline) {',
    "  $hit = netstat -ano | Select-String '127.0.0.1:34820\\s+.*LISTENING'",
    '  if (-not $hit) { break }',
    '  Start-Sleep -Milliseconds 400',
    '}',
    launch,
  ].join('\r\n');
  fs.writeFileSync(script, body);
  spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();
}

module.exports = {
  localVersion,
  compareVersions,
  check,
  install,
  relaunch,
};
