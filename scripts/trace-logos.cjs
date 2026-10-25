// Traces the source PNG logos into single-path SVGs (fill = currentColor).
const potrace = require('potrace');
const fs = require('fs');
const path = require('path');
const jobs = [
  ['brand-src/universal-planner.png', 'src/ui/brand/up-path.json'],
  ['brand-src/eternal-inc.png', 'src/ui/brand/eternal-path.json'],
];
fs.mkdirSync('src/ui/brand', { recursive: true });
for (const [src, out] of jobs) {
  potrace.trace(src, { threshold: 128, turdSize: 20, optTolerance: 0.4 }, (err, svg) => {
    if (err) throw err;
    const d = [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).join(' ');
    const [, w, h] = svg.match(/width="(\d+)" height="(\d+)"/);
    fs.writeFileSync(out, JSON.stringify({ w: +w, h: +h, d }));
    console.log(out, d.length);
  });
}
