import type { Transition, Variants } from 'framer-motion';

/** The house spring. Everything moves on this unless there's a reason not to. */
export const spring: Transition = { type: 'spring', stiffness: 300, damping: 30, mass: 1 };
export const springSoft: Transition = { type: 'spring', stiffness: 220, damping: 28 };
export const springSnappy: Transition = { type: 'spring', stiffness: 500, damping: 34 };

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 14, filter: 'blur(6px)' },
  enter: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { ...spring, staggerChildren: 0.045, delayChildren: 0.04 } },
  exit: { opacity: 0, y: -8, filter: 'blur(4px)', transition: { duration: 0.16 } },
};

export const itemVariants: Variants = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  enter: { opacity: 1, y: 0, scale: 1, transition: spring },
};
