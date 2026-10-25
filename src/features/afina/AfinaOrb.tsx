import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { useIsDark, useReducedMotion } from '@/lib/hooks';
import { cn } from '@/lib/cn';

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

/** CSS-only orb used while 3D loads, without WebGL, or with reduced motion. */
export function CssOrb({ thinking, still }: { thinking?: boolean; still?: boolean }) {
  return (
    <motion.div
      className="relative h-[72%] w-[72%] rounded-full"
      animate={still ? undefined : { scale: thinking ? [1, 1.06, 1] : [1, 1.025, 1] }}
      transition={{ duration: thinking ? 1.1 : 4, repeat: Infinity, ease: 'easeInOut' }}
      style={{
        background:
          'radial-gradient(circle at 35% 40%, rgb(47 107 255 / .95), transparent 52%), radial-gradient(circle at 66% 62%, rgb(255 79 163 / .9), transparent 50%), radial-gradient(circle at 50% 50%, rgb(255 255 255 / .2), rgb(255 255 255 / .05))',
        boxShadow: 'inset 0 2px 6px rgb(255 255 255 / .7), inset 0 -10px 30px rgb(0 0 0 / .15), 0 20px 50px -10px rgb(47 107 255 / .45)',
        filter: 'saturate(1.2)',
      }}
    >
      <span className="absolute left-[18%] top-[10%] h-[22%] w-[38%] rotate-[-25deg] rounded-full bg-white/60 blur-[6px]" />
    </motion.div>
  );
}

/** Afina's floating glass orb. Breathes when idle, swirls when thinking, leans toward the pointer. */
export function AfinaOrb({ size = 160, thinking = false, className }: { size?: number; thinking?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: '100px' });
  const reduced = useReducedMotion();
  const dark = useIsDark();
  const [fast] = useState(() => hasFastWebGL());
  const idle = useIdle();
  const use3D = fast && idle;
  return (
    <div ref={ref} className={cn('relative flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }} role="img" aria-label={thinking ? 'Afina is thinking' : 'Afina'}>
      <div
        aria-hidden
        className="absolute inset-[12%] rounded-full opacity-70 blur-2xl"
        style={{ background: 'radial-gradient(circle at 40% 40%, rgb(47 107 255 / .55), rgb(255 79 163 / .45) 60%, transparent 75%)' }}
      />
      {use3D && !reduced ? (
        <Suspense fallback={<CssOrb thinking={thinking} />}>
          <div className="absolute inset-0">
            <Orb3D thinking={thinking} active={inView} dark={dark} />
          </div>
        </Suspense>
      ) : (
        <CssOrb thinking={thinking} still={reduced} />
      )}
    </div>
  );
}
