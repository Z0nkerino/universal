// Packs dist-desktop/ into release/app-bundle.tar.gz and writes release/latest.json —
// the feed installed desktop apps read to update themselves (see electron/updater.cjs).
// Usage: node scripts/make-update-bundle.cjs ["release notes"]
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const pkg = require('../package.json');

const tag = `v${pkg.version}`;
const base = `https://github.com/${pkg.updates.repo}/releases/download/${tag}`;
fs.mkdirSync('release', { recursive: true });
execFileSync('tar', ['--format=gnu', '--owner=0', '--group=0', '-czf', 'release/app-bundle.tar.gz', '-C', 'dist-desktop', '.']);
const sha256 = crypto.createHash('sha256').update(fs.readFileSync('release/app-bundle.tar.gz')).digest('hex');

const feed = {
  version: pkg.version,
  shellVersion: pkg.updates.shellVersion,
  publishedAt: new Date().toISOString(),
  notes: process.argv[2] || '',
  bundle: { url: `${base}/app-bundle.tar.gz`, sha256 },
  downloads: {
    mac: `${base}/Universal-Planner-${pkg.version}-mac.dmg`,
    win: `${base}/Universal-Planner-${pkg.version}-windows-setup.exe`,
  },
};
fs.writeFileSync('release/latest.json', JSON.stringify(feed, null, 2));
console.log(`release/app-bundle.tar.gz  ${sha256}\nrelease/latest.json  ${tag}`);
