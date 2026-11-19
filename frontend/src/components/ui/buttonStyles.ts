import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'gradient' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'danger-ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-brand-600 to-accent-600 text-white shadow-md shadow-brand-900/40 hover:from-brand-500 hover:to-accent-500 active:brightness-95',
  gradient:
    'bg-gradient-to-r from-brand-600 to-accent-600 text-white shadow-md shadow-brand-500/30 hover:shadow-lg hover:shadow-accent-500/30 hover:brightness-110',
  secondary: 'bg-brand-500/15 text-brand-200 ring-1 ring-inset ring-brand-400/30 hover:bg-brand-500/25 active:bg-brand-500/30',
  outline: 'border border-white/20 bg-white/5 text-ink shadow-sm hover:border-white/35 hover:bg-white/10',
  ghost: 'bg-transparent text-slate-200 hover:bg-white/10 hover:text-white',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800',
  'danger-ghost': 'bg-transparent text-red-300 hover:bg-red-500/10',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 gap-1.5 px-3 text-sm',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-6 text-base',
};

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

/** Class list shared by <Button> and <ButtonLink> so links and buttons look identical. */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
}: ButtonStyleOptions = {}): string {
  return cn(
    'inline-flex select-none items-center justify-center whitespace-nowrap rounded-control font-semibold transition-all duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    variants[variant],
    sizes[size],
    fullWidth && 'w-full',
    className,
  );
}
