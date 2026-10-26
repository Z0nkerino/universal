import { useRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion';
import { LiquidIndicator, useActiveRect } from './LiquidIndicator';

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  className?: string;
}) {
  // A measured, springy pill (not a shared-layout layoutId, which can stall page exits).
  const ref = useRef<HTMLDivElement>(null);
  const rect = useActiveRect(ref, options.findIndex((o) => o.value === value));
  return (
    <div ref={ref} role="radiogroup" aria-label={label} className={cn('relative inline-flex rounded-[14px] bg-fg/[0.06] p-1', className)}>
      <LiquidIndicator rect={rect} axis="x" className="rounded-[10px] bg-bg shadow-[0_1px_2px_rgb(0_0_0/.08),0_2px_8px_rgb(0_0_0/.06)] dark:bg-white/[0.14]" />
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            data-index={i}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn('relative h-8 whitespace-nowrap rounded-[10px] px-3.5 text-[13px] font-semibold transition-colors', active ? 'text-fg' : 'text-fg/55 hover:text-fg/80')}
          >
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-[31px] w-[51px] shrink-0 rounded-full p-[2px] transition-colors duration-300', checked ? 'bg-brand' : 'bg-fg/15')}
    >
      <motion.span
        layout
        transition={spring}
        className="block h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgb(0_0_0/.15),0_1px_1px_rgb(0_0_0/.16)]"
        style={{ marginLeft: checked ? 20 : 0 }}
      />
    </button>
  );
}
