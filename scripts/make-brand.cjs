// Builds public/brand/*.svg + PNG app icons from the traced logo paths.
const fs = require('fs');
const { chromium } = require('playwright');
const up = require('../src/ui/brand/up-path.json');
const et = require('../src/ui/brand/eternal-path.json');
const out = 'public/brand';
fs.mkdirSync(out, { recursive: true });

const mark = (p, box, fill) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}"><path fill="${fill}" fill-rule="evenodd" d="${p.d}"/></svg>`;
const UP_BOX = '452 452 1096 1096';
const ET_BOX = '541 468 1066 1066';
fs.writeFileSync(`${out}/universal-planner.svg`, mark(up, UP_BOX, '#0A0A0A'));
fs.writeFileSync(`${out}/universal-planner-white.svg`, mark(up, UP_BOX, '#FFFFFF'));
fs.writeFileSync(`${out}/eternal-inc.svg`, mark(et, ET_BOX, '#0A0A0A'));
fs.writeFileSync(`${out}/eternal-inc-white.svg`, mark(et, ET_BOX, '#FFFFFF'));

// App icon: ink squircle, white tulip mark, soft brand glow behind it.
const icon = (size, pad, rounded) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 2000 2000">
<defs>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2F6BFF"/><stop offset="1" stop-color="#FF4FA3"/></linearGradient>
  <radialGradient id="glow" cx="0.5" cy="0.55" r="0.55"><stop offset="0" stop-color="#2F6BFF" stop-opacity=".55"/><stop offset=".55" stop-color="#FF4FA3" stop-opacity=".22"/><stop offset="1" stop-color="#0A0A0A" stop-opacity="0"/></radialGradient>
  <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
</defs>
<rect width="2000" height="2000" rx="${rounded ? 450 : 0}" fill="#0A0A0A"/>
<rect width="2000" height="2000" rx="${rounded ? 450 : 0}" fill="url(#glow)"/>
<rect width="2000" height="2000" rx="${rounded ? 450 : 0}" fill="url(#sheen)"/>
<g transform="translate(1000 1000) scale(${pad}) translate(-1000 -1000)"><path fill="#FFFFFF" fill-rule="evenodd" d="${up.d}"/></g>
</svg>`;
fs.writeFileSync('public/favicon.svg', icon(64, 1.05, true));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const render = async (svg, size, file) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)}</body></html>`);
    await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  };
  await render(icon(512, 1.05, true), 192, `${out}/icon-192.png`);
  await render(icon(512, 1.05, true), 512, `${out}/icon-512.png`);
  await render(icon(512, 0.8, false), 512, `${out}/icon-maskable-512.png`);
  await render(icon(512, 1.05, false), 180, `${out}/apple-touch-icon.png`);
  await render(icon(1024, 1.05, true), 1024, `${out}/icon-1024.png`);
  await browser.close();
  console.log('brand assets written');
})();
