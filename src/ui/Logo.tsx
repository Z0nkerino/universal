import { useId } from 'react';
import up from './brand/up-path.json';
import eternal from './brand/eternal-path.json';
import { useT, tNow } from '@/lib/i18n';
import { cn } from '@/lib/cn';

interface MarkProps {
  size?: number;
  className?: string;
  /** Fill with the blue→pink gradient instead of currentColor. */
  gradient?: boolean;
  title?: string;
}

function Mark({ d, box, size = 32, className, gradient, title }: MarkProps & { d: string; box: string }) {
  const id = useId();
  return (
    <svg viewBox={box} width={size} height={size} className={className} role="img" aria-label={title} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      {gradient && (
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2F6BFF" />
            <stop offset="1" stopColor="#FF4FA3" />
          </linearGradient>
        </defs>
      )}
      <path d={d} fillRule="evenodd" fill={gradient ? `url(#${id})` : 'currentColor'} />
    </svg>
  );
}

/** The Universal Planner tulip mark. */
export const PlannerMark = (p: MarkProps) => <Mark d={up.d} box="452 452 1096 1096" {...p} />;
/** The Eternal Inc. mark. */
export const EternalMark = (p: MarkProps) => <Mark d={eternal.d} box="541 468 1066 1066" {...p} />;

/** App icon: tulip on an ink squircle with a soft brand glow — matches the installed icon. */
export function AppIcon({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-ink text-white', className)}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.225,
        backgroundImage: 'radial-gradient(circle at 50% 55%, rgb(47 107 255 / .55), rgb(255 79 163 / .22) 55%, transparent 100%)',
        boxShadow: 'inset 0 1px 0 rgb(255 255 255 / .18), 0 4px 14px -4px rgb(10 10 10 / .4)',
      }}
    >
      <PlannerMark size={size * 0.58} />
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <AppIcon size={32} />
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-bold tracking-[-0.02em]">Universal Planner</span>
        <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-fg/55">
          {tNow('by')} <EternalMark size={11} className="text-fg/70" /> Eternal Inc.
        </span>
      </span>
    </span>
  );
}

export function EternalCredit({ className }: { className?: string }) {
  const t = useT();
  return (
    <a
      href="#/settings"
      className={cn('inline-flex items-center gap-1.5 text-[12px] font-medium text-fg/55 transition-colors hover:text-fg/70', className)}
    >
      <EternalMark size={16} className="text-fg/80" />
      <span>
        {t('A product of')} <span className="font-semibold text-fg/70">Eternal Inc.</span>
      </span>
    </a>
  );
}
