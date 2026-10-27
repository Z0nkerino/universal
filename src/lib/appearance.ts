// Turns appearance settings into CSS variables and data attributes on <html>.

export type PaletteId = 'ocean' | 'violet' | 'forest' | 'sunset' | 'rose' | 'mono' | 'custom';
export type FontId = 'system' | 'inter' | 'rounded' | 'serif' | 'mono' | 'legible';
export type BackgroundId = 'aurora' | 'soft' | 'plain';
export type GlassId = 'frosted' | 'clear' | 'solid';

interface Pair {
  light: [string, string];
  dark: [string, string];
}
const same = (a: string, b: string): Pair => ({ light: [a, b], dark: [a, b] });

/** Accent pairs: the main accent (buttons, links, rings) and its partner in the brand gradient. */
export const PALETTES: Record<Exclude<PaletteId, 'custom'>, Pair & { name: string }> = {
  ocean: { name: 'Ocean', ...same('#2F6BFF', '#FF4FA3') },
  violet: { name: 'Violet', ...same('#7C5CFF', '#FF5FA2') },
  forest: { name: 'Forest', light: ['#0F9D58', '#0EA5A0'], dark: ['#22C55E', '#2DD4BF'] },
  sunset: { name: 'Sunset', light: ['#E8590C', '#E8436E'], dark: ['#FB7A2E', '#FF5C86'] },
  rose: { name: 'Rose', light: ['#D6336C', '#F76707'], dark: ['#F0568C', '#FF8A3D'] },
  mono: { name: 'Graphite', light: ['#2C2C2E', '#8E8E93'], dark: ['#F2F2F7', '#8E8E93'] },
};

export const FONTS: Record<FontId, { name: string; stack: string; load?: () => Promise<unknown> }> = {
  system: { name: 'System', stack: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Inter Variable', Inter, system-ui, sans-serif" },
  inter: { name: 'Inter', stack: "'Inter Variable', Inter, system-ui, sans-serif" },
  rounded: { name: 'Rounded', stack: "'Nunito Variable', ui-rounded, system-ui, sans-serif", load: () => import('@fontsource-variable/nunito') },
  serif: { name: 'Serif', stack: "'Source Serif 4 Variable', ui-serif, Georgia, serif", load: () => import('@fontsource-variable/source-serif-4') },
  mono: { name: 'Mono', stack: "'JetBrains Mono Variable', ui-monospace, Menlo, monospace", load: () => import('@fontsource-variable/jetbrains-mono') },
  legible: {
    name: 'Hyperlegible',
    stack: "'Atkinson Hyperlegible', system-ui, sans-serif",
    load: () => Promise.all([import('@fontsource/atkinson-hyperlegible/400.css'), import('@fontsource/atkinson-hyperlegible/700.css')]),
  },
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (rgb: number[]) => '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

export function isHex(s: string) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s);
}

/** A partner color for a custom accent: the same color turned 50° around the hue wheel. */
export function partnerOf(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 50 + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255]);
}

export function accentPair(palette: PaletteId, custom: string, dark: boolean): [string, string] {
  if (palette === 'custom') {
    const main = isHex(custom) ? toHex(hexToRgb(custom)) : '#2F6BFF';
    return [main, partnerOf(main)];
  }
  const p = PALETTES[palette] ?? PALETTES.ocean;
  return dark ? p.dark : p.light;
}

export interface Look {
  palette: PaletteId;
  customAccent: string;
  font: FontId;
  background: BackgroundId;
  glass: GlassId;
}

/** Applies the look to <html> and remembers it so the next launch paints with it right away. */
export function applyLook(look: Look, dark: boolean) {
  const root = document.documentElement;
  const [a, b] = accentPair(look.palette, look.customAccent, dark);
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  const white = [255, 255, 255];
  const vars: Record<string, string> = {
    '--blue': a,
    '--pink': b,
    '--blue-rgb': ra.join(' '),
    '--pink-rgb': rb.join(' '),
    '--blue-2-rgb': mix(ra, white, 0.35).map(Math.round).join(' '),
    '--pink-2-rgb': mix(rb, white, 0.35).map(Math.round).join(' '),
    '--font-sans': (FONTS[look.font] ?? FONTS.system).stack,
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.bg = look.background;
  root.dataset.glass = look.glass;
  void FONTS[look.font]?.load?.();
  try {
    localStorage.setItem('up.look', JSON.stringify({ vars, bg: look.background, glass: look.glass }));
  } catch {
    /* storage unavailable */
  }
}
