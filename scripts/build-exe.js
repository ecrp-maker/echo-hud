const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const bundle = path.join(dist, 'echo-hud.cjs');
const blob = path.join(dist, 'sea-prep.blob');
const config = path.join(dist, 'sea-config.json');
const staged = path.join(dist, 'echo-hud.exe');
const exe = path.join(root, 'ECHO HUD.exe');

fs.mkdirSync(dist, { recursive: true });
function npx(command) {
  execFileSync('cmd.exe', ['/d', '/s', '/c', command], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  });
}

npx('npx --yes esbuild src/main.js --bundle --platform=node --format=cjs --outfile=dist/echo-hud.cjs');

fs.writeFileSync(config, JSON.stringify({
  main: bundle,
  output: blob,
  disableExperimentalSEAWarning: true,
}, null, 2));
execFileSync(process.execPath, ['--experimental-sea-config', config], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});

fs.copyFileSync(process.execPath, staged);
npx('npx --yes postject dist/echo-hud.exe NODE_SEA_BLOB dist/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --overwrite');
fs.copyFileSync(staged, exe);

const version = execFileSync(exe, ['--version'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('exe surum vermedi: ' + version);
console.log('ECHO HUD.exe ' + version);
