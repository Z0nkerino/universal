import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { useIsDark, useReducedMotion } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { useSettings, type AfinaPrefs } from '@/lib/settings';
import { accentPair } from '@/lib/appearance';

const Orb3D = lazy(() => import('./Orb3D'));

let webglOk: boolean | undefined;
/** True only for hardware-accelerated WebGL; software rasterizers can't render glass at 60fps. */
function hasFastWebGL() {
  if (webglOk === undefined) {
    try {
      const c = document.createElement('canvas');
      const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
      if (!gl) webglOk = false;
      else {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
        webglOk = !/swiftshader|llvmpipe|software|basic render/i.test(renderer);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
    } catch {
      webglOk = false;
    }
  }
  return webglOk;
}

/** Resolves once the browser is idle after first paint, so 3D never delays the page. */
function useIdle() {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setIdle(true), { timeout: 1500 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(() => setIdle(true), 300);
    return () => clearTimeout(id);
  }, []);
  return idle;
}

export type AfinaPalette = AfinaPrefs['palette'];

/** Afina's own color pairs; 'match' borrows the app's accent colors. */
export const AFINA_PALETTES: Record<Exclude<AfinaPalette, 'match'>, { name: string; colors: [string, string] }> = {
  ocean: { name: 'Ocean', colors: ['#2F6BFF', '#FF4FA3'] },
  aurora: { name: 'Aurora', colors: ['#22D3EE', '#A855F7'] },
  sunset: { name: 'Sunset', colors: ['#FB923C', '#F43F5E'] },
  forest: { name: 'Forest', colors: ['#34D399', '#22D3EE'] },
  mono: { name: 'Moon', colors: ['#C7CBD4', '#6B7280'] },
};

/** Afina's look from settings. Pass `override` to preview choices before saving them. */
export function useAfinaLook(override?: Partial<AfinaPrefs>) {
  const prefs = useSettings((s) => s.afina);
  const palette = useSettings((s) => s.palette);
  const custom = useSettings((s) => s.customAccent);
  const dark = useIsDark();
  const look = { ...prefs, ...override };
  const colors = look.palette === 'match' ? accentPair(palette, custom, dark) : AFINA_PALETTES[look.palette].colors;
  return { ...look, colors };
}

const rgba = (hex: string, a: number) => hex + Math.round(a * 255).toString(16).padStart(2, '0');

/** CSS-only orb used while 3D loads, without WebGL, or with reduced motion. */
export function CssOrb({ thinking, still, colors = ['#2F6BFF', '#FF4FA3'], pace = 1 }: { thinking?: boolean; still?: boolean; colors?: [string, string]; pace?: number }) {
  const [a, b] = colors;
  return (
    <motion.div
      className="relative h-[72%] w-[72%] rounded-full"
      animate={still ? undefined : { scale: thinking ? [1, 1.06, 1] : [1, 1.025, 1] }}
      transition={{ duration: (thinking ? 1.1 : 4) / pace, repeat: Infinity, ease: 'easeInOut' }}
      style={{
        background: `radial-gradient(circle at 35% 40%, ${rgba(a, 0.95)}, transparent 52%), radial-gradient(circle at 66% 62%, ${rgba(b, 0.9)}, transparent 50%), radial-gradient(circle at 50% 50%, rgb(255 255 255 / .2), rgb(255 255 255 / .05))`,
        boxShadow: `inset 0 2px 6px rgb(255 255 255 / .7), inset 0 -10px 30px rgb(0 0 0 / .15), 0 20px 50px -10px ${rgba(a, 0.45)}`,
        filter: 'saturate(1.2)',
      }}
    >
      <span className="absolute left-[18%] top-[10%] h-[22%] w-[38%] rotate-[-25deg] rounded-full bg-white/60 blur-[6px]" />
    </motion.div>
  );
}

/** A quiet ring: a gradient halo that turns slowly and quickens while Afina thinks. */
function RingOrb({ thinking, still, colors, pace }: { thinking?: boolean; still?: boolean; colors: [string, string]; pace: number }) {
  const [a, b] = colors;
  return (
    <div className="relative h-[70%] w-[70%]">
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(from 0deg, ${a}, ${b}, ${a})`,
          WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 7px), #000 calc(100% - 6px))',
          mask: 'radial-gradient(farthest-side, transparent calc(100% - 7px), #000 calc(100% - 6px))',
        }}
        animate={still ? undefined : { rotate: 360 }}
        transition={{ duration: (thinking ? 1.6 : 9) / pace, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute inset-[30%] rounded-full"
        style={{ background: `radial-gradient(circle at 40% 40%, ${a}, ${b})` }}
        animate={still ? undefined : { scale: thinking ? [0.85, 1.1, 0.85] : [0.92, 1, 0.92] }}
        transition={{ duration: (thinking ? 0.9 : 3.5) / pace, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

/** Afina's floating orb. Breathes when idle, swirls when thinking, leans toward the pointer. */
export function AfinaOrb({ size = 160, thinking = false, className, preview }: { size?: number; thinking?: boolean; className?: string; preview?: Partial<AfinaPrefs> }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: '100px' });
  const reduced = useReducedMotion();
  const dark = useIsDark();
  const [fast] = useState(() => hasFastWebGL());
  const idle = useIdle();
  const look = useAfinaLook(preview);
  const still = reduced || look.motion === 'still';
  const pace = look.motion === 'calm' ? 0.55 : 1;
  const [a, b] = look.colors;
  const use3D = look.style === 'glass' && fast && idle && !still;
  return (
    <div ref={ref} className={cn('relative flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }} role="img" aria-label={thinking ? 'Afina is thinking' : 'Afina'}>
      {look.style !== 'minimal' && (
        <div aria-hidden className="absolute inset-[12%] rounded-full opacity-70 blur-2xl" style={{ background: `radial-gradient(circle at 40% 40%, ${rgba(a, 0.55)}, ${rgba(b, 0.45)} 60%, transparent 75%)` }} />
      )}
      {look.style === 'minimal' ? (
        <RingOrb thinking={thinking} still={still} colors={look.colors} pace={pace} />
      ) : use3D ? (
        <Suspense fallback={<CssOrb thinking={thinking} colors={look.colors} pace={pace} />}>
          <div className="absolute inset-0">
            <Orb3D thinking={thinking} active={inView} dark={dark} colors={look.colors} speed={pace} />
          </div>
        </Suspense>
      ) : (
        <CssOrb thinking={thinking} still={still} colors={look.colors} pace={pace} />
      )}
    </div>
  );
}
