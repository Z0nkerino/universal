import { useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Glass, type GlassProps } from './Glass';
import { useFinePointer, useReducedMotion } from '@/lib/hooks';

/** A glass card that tilts gently toward the pointer, with depth parallax. */
export function TiltCard({ style, max = 6, children, ...rest }: GlassProps & { max?: number }) {
  const fine = useFinePointer();
  const reduced = useReducedMotion();
  const enabled = fine && !reduced;
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const cfg = { stiffness: 300, damping: 30 };
  const rotateX = useSpring(useTransform(py, [0, 1], [max, -max]), cfg);
  const rotateY = useSpring(useTransform(px, [0, 1], [-max, max]), cfg);

  return (
    <Glass
      {...rest}
      style={enabled ? { ...style, rotateX, rotateY, transformPerspective: 900 } : style}
      onPointerMove={(e) => {
        if (!enabled) return;
        const r = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width);
        py.set((e.clientY - r.top) / r.height);
        rest.onPointerMove?.(e);
      }}
      onPointerLeave={(e) => {
        px.set(0.5);
        py.set(0.5);
        rest.onPointerLeave?.(e);
      }}
    >
      {children}
    </Glass>
  );
}
