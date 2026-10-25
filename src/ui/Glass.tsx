import { forwardRef, type PointerEvent } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/cn';

export interface GlassProps extends HTMLMotionProps<'div'> {
  /** Stronger, more opaque fill — for sheets and menus that sit over content. */
  strong?: boolean;
  /** Pointer-following refraction shimmer + rim light. */
  shimmer?: boolean;
  radius?: 'md' | 'lg' | 'xl';
}

const radii = { md: 'rounded-[20px]', lg: 'rounded-[24px]', xl: 'rounded-[28px]' };

function track(e: PointerEvent<HTMLDivElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--lx', `${e.clientX - r.left}px`);
  el.style.setProperty('--ly', `${e.clientY - r.top}px`);
}

export const Glass = forwardRef<HTMLDivElement, GlassProps>(function Glass(
  { strong, shimmer = true, radius = 'lg', className, children, onPointerMove, onPointerEnter, onPointerLeave, ...rest },
  ref,
) {
  return (
    <motion.div
      ref={ref}
      data-shimmer={shimmer ? '' : undefined}
      className={cn('glass', strong && 'glass-strong', radii[radius], className)}
      onPointerMove={(e) => {
        if (shimmer && e.pointerType === 'mouse') track(e);
        onPointerMove?.(e);
      }}
      onPointerEnter={(e) => {
        if (shimmer && e.pointerType === 'mouse') e.currentTarget.style.setProperty('--sh-o', '1');
        onPointerEnter?.(e);
      }}
      onPointerLeave={(e) => {
        e.currentTarget.style.setProperty('--sh-o', '0');
        onPointerLeave?.(e);
      }}
      {...rest}
    >
      {shimmer && <span aria-hidden className="glass-rim-light" />}
      {children as React.ReactNode}
    </motion.div>
  );
});
