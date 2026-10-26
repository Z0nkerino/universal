import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const base =
  'w-full rounded-[14px] bg-fg/[0.05] px-3.5 text-[15px] text-fg placeholder:text-fg/40 transition-[background,box-shadow] hover:bg-fg/[0.07] focus:bg-fg/[0.07] focus:shadow-[0_0_0_2px_rgb(47_107_255/0.55)] focus-visible:outline-none';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(base, 'h-11', className)} {...rest} />;
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(base, 'min-h-[88px] resize-y py-2.5 leading-relaxed', className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(base, 'h-11 appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
}

export function Field({ label, htmlFor, hint, children, className }: { label: string; htmlFor?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="px-1 text-[13px] font-semibold text-fg/60">
        {label}
      </label>
      {children}
      {hint && <p className="px-1 text-[12px] text-fg/45">{hint}</p>}
    </div>
  );
}

/** A pill toggle used for priority, energy, colors and filters. */
export function Chip({ active, onClick, children, className, title, tone = 'neutral' }: { active?: boolean; onClick?: () => void; children: ReactNode; className?: string; title?: string; tone?: 'neutral' | 'blue' | 'pink' }) {
  const activeCls = tone === 'pink' ? 'bg-pink text-white' : tone === 'blue' ? 'bg-blue text-white' : 'bg-fg text-bg';
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn('inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors', active ? activeCls : 'bg-fg/[0.06] text-fg/65 hover:bg-fg/[0.1] hover:text-fg', className)}
    >
      {children}
    </button>
  );
}
