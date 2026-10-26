import { forwardRef } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { springSnappy } from '@/lib/motion';
import { useT } from '@/lib/i18n';

type Variant = 'primary' | 'brand' | 'glass' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends HTMLMotionProps<'button'> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
}

const variants: Record<Variant, string> = {
  primary: 'bg-fg text-bg hover:bg-fg/90',
  brand: 'bg-brand text-white shadow-[0_8px_24px_-6px_rgb(47_107_255/0.5)] hover:brightness-110',
  glass: 'glass text-fg hover:bg-fg/[0.04]',
  ghost: 'text-fg/80 hover:text-fg hover:bg-fg/[0.06]',
  danger: 'bg-[#E5484D] text-white hover:brightness-110',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-xl',
  md: 'h-10 px-4 text-[15px] gap-2 rounded-2xl',
  lg: 'h-12 px-6 text-base gap-2 rounded-[18px]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon: Icon, iconRight: IconRight, className, children, type = 'button', ...rest },
  ref,
) {
  const t = useT();
  const is = size === 'sm' ? 15 : size === 'md' ? 17 : 19;
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={{ scale: 0.96 }}
      transition={springSnappy}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-semibold tracking-[-0.01em] transition-[background,filter,color] disabled:pointer-events-none disabled:opacity-40',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon size={is} strokeWidth={2.2} aria-hidden />}
      {typeof children === 'string' ? t(children) : (children as React.ReactNode)}
      {IconRight && <IconRight size={is} strokeWidth={2.2} aria-hidden />}
    </motion.button>
  );
});

export function IconButton({ icon: Icon, label, className, size = 40, ...rest }: Omit<HTMLMotionProps<'button'>, 'children'> & { icon: LucideIcon; label: string; size?: number }) {
  const t = useT();
  return (
    <motion.button
      type="button"
      aria-label={t(label)}
      title={t(label)}
      whileTap={{ scale: 0.9 }}
      transition={springSnappy}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full text-fg/70 transition-colors hover:bg-fg/[0.06] hover:text-fg', className)}
      style={{ width: size, height: size }}
      {...rest}
    >
      <Icon size={Math.round(size * 0.48)} strokeWidth={2} aria-hidden />
    </motion.button>
  );
}
