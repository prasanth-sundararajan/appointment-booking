import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'gradient' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'danger-ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800',
  gradient:
    'bg-gradient-to-r from-brand-600 to-accent-600 text-white shadow-md shadow-brand-600/20 hover:shadow-lg hover:shadow-brand-600/30 hover:brightness-105',
  secondary: 'bg-brand-50 text-brand-700 hover:bg-brand-100 active:bg-brand-200',
  outline: 'border border-gray-300 bg-white text-gray-800 shadow-sm hover:border-gray-400 hover:bg-gray-50',
  ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 hover:text-gray-900',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800',
  'danger-ghost': 'bg-transparent text-red-700 hover:bg-red-50',
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
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    variants[variant],
    sizes[size],
    fullWidth && 'w-full',
    className,
  );
}
