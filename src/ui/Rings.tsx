import { useId } from 'react';
import { motion } from 'framer-motion';
import { springSoft } from '@/lib/motion';

export interface Ring {
  value: number; // 0–1 (values above 1 wrap like Apple Watch rings)
  from: string;
  to: string;
  label: string;
}

export const RING_PRESETS = {
  blue: { from: '#2F6BFF', to: '#6E97FF' },
  pink: { from: '#FF4FA3', to: '#FF8CC4' },
  brand: { from: '#2F6BFF', to: '#FF4FA3' },
};

/** Concentric activity rings, outermost first. */
export function Rings({ rings, size = 120, stroke = 12, gap = 3 }: { rings: Ring[]; size?: number; stroke?: number; gap?: number }) {
  const id = useId();
  const c = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={rings.map((r) => `${r.label} ${Math.round(r.value * 100)}%`).join(', ')}>
      <defs>
        {rings.map((r, i) => (
          <linearGradient key={i} id={`${id}-${i}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={r.from} />
            <stop offset="1" stopColor={r.to} />
          </linearGradient>
        ))}
      </defs>
      {rings.map((r, i) => {
        const rad = c - stroke / 2 - i * (stroke + gap);
        if (rad <= stroke / 2) return null;
        const circ = 2 * Math.PI * rad;
        const v = Math.max(0, Math.min(r.value, 1));
        return (
          <g key={i} transform={`rotate(-90 ${c} ${c})`}>
            <circle cx={c} cy={c} r={rad} fill="none" stroke={r.from} strokeOpacity={0.16} strokeWidth={stroke} />
            <motion.circle
              cx={c}
              cy={c}
              r={rad}
              fill="none"
              stroke={`url(#${id}-${i})`}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circ}
              initial={{ strokeDashoffset: circ }}
              animate={{ strokeDashoffset: circ * (1 - v) }}
              transition={{ ...springSoft, delay: 0.1 + i * 0.08 }}
              style={{ opacity: v === 0 ? 0 : 1 }}
            />
          </g>
        );
      })}
    </svg>
  );
}
