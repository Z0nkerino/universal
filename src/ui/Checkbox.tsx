import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { springSnappy } from '@/lib/motion';
import { useReducedMotion } from '@/lib/hooks';

const COLORS = ['rgb(var(--blue-rgb))', 'rgb(var(--pink-rgb))', 'rgb(var(--blue-2-rgb))', 'rgb(var(--pink-2-rgb))'];

function Burst() {
  const parts = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
    const d = 16 + Math.random() * 10;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, c: COLORS[i % COLORS.length], s: 3 + Math.random() * 2.5 };
  });
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {parts.map((p, i) => (
        <motion.span
          key={i}
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{ width: p.s, height: p.s, marginLeft: -p.s / 2, marginTop: -p.s / 2, background: p.c }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 0.4 }}
          transition={{ duration: 0.55, ease: [0.2, 0.8, 0.3, 1] }}
        />
      ))}
    </span>
  );
}

export interface CheckboxProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  size?: number;
  className?: string;
}

/** Round check with a drawn-in tick and a small blue/pink particle burst. */
export function Checkbox({ checked, onChange, label, size = 24, className }: CheckboxProps) {
  const reduced = useReducedMotion();
  const [burst, setBurst] = useState(0);
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      whileTap={{ scale: 0.85 }}
      transition={springSnappy}
      onClick={() => {
        if (!checked && !reduced) setBurst((b) => b + 1);
        onChange(!checked);
      }}
      className={cn('relative inline-flex shrink-0 items-center justify-center rounded-full', className)}
      style={{ width: size, height: size }}
    >
      <motion.span
        className="absolute inset-0 rounded-full bg-brand"
        initial={false}
        animate={{ opacity: checked ? 1 : 0 }}
        transition={{ duration: 0.2 }}
      />
      <motion.span
        className="absolute inset-0 rounded-full"
        initial={false}
        animate={{
          boxShadow: checked ? 'inset 0 0 0 0px rgb(var(--fg) / 0)' : 'inset 0 0 0 1.75px rgb(var(--fg) / 0.28)',
          scale: checked ? [1, 1.18, 1] : 1,
        }}
        transition={{ duration: 0.35 }}
      />
      <svg viewBox="0 0 24 24" width={size} height={size} className="relative">
        <motion.path
          d="M7 12.5l3.2 3.2L17.2 8.6"
          fill="none"
          stroke="white"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={{ pathLength: { type: 'spring', stiffness: 260, damping: 24, delay: 0.05 }, opacity: { duration: 0.1 } }}
        />
      </svg>
      <AnimatePresence>{burst > 0 && checked && <Burst key={burst} />}</AnimatePresence>
    </motion.button>
  );
}
