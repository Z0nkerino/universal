// Builds the source images @capacitor/assets turns into Android launcher icons and splash screens.
// Usage: node scripts/make-android-assets.cjs && npx capacitor-assets generate --android
const sharp = require('sharp');
const fs = require('node:fs');

const mark = fs.readFileSync('public/brand/universal-planner-white.svg');
const glow = (size) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs><radialGradient id="g" cx="50%" cy="54%" r="62%">
    <stop offset="0" stop-color="#22408F"/><stop offset=".45" stop-color="#4A2547"/><stop offset="1" stop-color="#121212"/>
  </radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);

async function markPng(size) {
  return sharp(mark, { density: 600 }).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

(async () => {
  fs.mkdirSync('assets', { recursive: true });
  // Adaptive icon: the mark sits inside the 66% safe zone so any launcher mask keeps it whole.
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await markPng(470), gravity: 'center' }]).png().toFile('assets/icon-foreground.png');
  await sharp(glow(1024)).png().toFile('assets/icon-background.png');
  await sharp('build/icon.png').resize(1024, 1024).png().toFile('assets/icon-only.png');
  const icon = await sharp('build/icon.png').resize(360, 360).png().toBuffer();
  for (const [name, bg] of [['splash.png', '#FFFFFF'], ['splash-dark.png', '#0A0A0A']]) {
    await sharp({ create: { width: 2732, height: 2732, channels: 4, background: bg } }).composite([{ input: icon, gravity: 'center' }]).png().toFile(`assets/${name}`);
  }
  console.log('assets/ ready');
})();
