import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { motion, useMotionValueEvent, useSpring, useTransform } from 'framer-motion';
import { cn } from '@/lib/cn';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Measures the active child (by data-index) inside a container, re-measuring on resize. */
export function useActiveRect(container: RefObject<HTMLElement>, index: number) {
  const [rect, setRect] = useState<Rect | null>(null);
  useLayoutEffect(() => {
    const el = container.current;
    if (!el) return;
    const measure = () => {
      const item = el.querySelector<HTMLElement>(`[data-index="${index}"]`);
      if (!item) return setRect(null);
      setRect({ x: item.offsetLeft, y: item.offsetTop, w: item.offsetWidth, h: item.offsetHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [container, index]);
  return rect;
}

/**
 * A blob that springs to the active item and stretches along its direction of travel
 * (and thins across it) in proportion to velocity — a liquid, not a sliding pill.
 */
export function LiquidIndicator({ rect, axis, className }: { rect: Rect | null; axis: 'x' | 'y'; className?: string }) {
  const cfg = { stiffness: 300, damping: 30, mass: 0.9 };
  const main = useSpring(0, cfg);
  const size = useSpring(0, cfg);
  const first = useRef(true);
  // Stretch follows speed, and relaxes back to 1 once the travel spring comes to rest.
  const stretch = useSpring(1, { stiffness: 420, damping: 32, restDelta: 0.001 });
  useMotionValueEvent(main, 'change', () => stretch.set(1 + Math.min(Math.abs(main.getVelocity()) / 2200, 0.55)));
  useMotionValueEvent(main, 'animationComplete', () => stretch.set(1));
  const thin = useTransform(stretch, (s) => 1 / Math.sqrt(s));

  useEffect(() => {
    if (!rect) return;
    const m = axis === 'x' ? rect.x : rect.y;
    const s = axis === 'x' ? rect.w : rect.h;
    if (first.current) {
      main.jump(m);
      size.jump(s);
      first.current = false;
    } else {
      main.set(m);
      size.set(s);
    }
  }, [rect, axis, main, size]);

  if (!rect) return null;
  const style =
    axis === 'x'
      ? { x: main, width: size, top: rect.y, height: rect.h, scaleX: stretch, scaleY: thin }
      : { y: main, height: size, left: rect.x, width: rect.w, scaleY: stretch, scaleX: thin };
  return <motion.span aria-hidden className={cn('pointer-events-none absolute left-0 top-0', className)} style={style} />;
}
