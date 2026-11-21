// Builds dist/<name>-<version>-firefox.zip and -chrome.zip from the shipped files.
// Chrome's copy drops browser_specific_settings, a Gecko-only key Chrome warns about.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SHIP = ['manifest.json', 'content', 'popup', 'icons'];
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const base = 'tesco-price-highlight-' + manifest.version;

fs.rmSync(DIST, { recursive: true, force: true });
for (const target of ['firefox', 'chrome']) {
  const dir = path.join(DIST, target);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of SHIP) fs.cpSync(path.join(ROOT, f), path.join(dir, f), { recursive: true });
  const m = { ...manifest };
  if (target === 'chrome') delete m.browser_specific_settings;
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');
  const zip = path.join(DIST, base + '-' + target + '.zip');
  execFileSync('zip', ['-qrX', zip, '.', '-x', '*.DS_Store'], { cwd: dir });
  console.log(path.relative(ROOT, zip), Math.round(fs.statSync(zip).size / 1024) + ' KB');
}
