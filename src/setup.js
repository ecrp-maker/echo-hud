const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function isSealed(root) {
  return fs.existsSync(path.join(root, 'setup.lock'));
}

function buildSetupZip(root) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-setup-'));
  try {
    const dest = path.join(stage, 'ECHO HUD');
    fs.mkdirSync(path.join(dest, 'native'), { recursive: true });
    for (const name of ['src', 'public']) {
      fs.cpSync(path.join(root, name), path.join(dest, name), { recursive: true });
    }
    fs.cpSync(path.join(root, 'native', 'overlay'), path.join(dest, 'native', 'overlay'), { recursive: true });
    fs.copyFileSync(path.join(root, 'package.json'), path.join(dest, 'package.json'));
    fs.copyFileSync(path.join(root, 'ECHO HUD.bat'), path.join(dest, 'ECHO HUD.bat'));
    fs.writeFileSync(path.join(dest, 'setup.lock'), '{"sealed":true}\n');
    const zip = path.join(stage, 'ECHO-HUD-Setup.zip');
    execFileSync('tar', ['-a', '-c', '-f', zip, '-C', stage, 'ECHO HUD'], { windowsHide: true });
    return fs.readFileSync(zip);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

module.exports = { isSealed, buildSetupZip };
