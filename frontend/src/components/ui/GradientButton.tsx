import { forwardRef, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

type GradientButtonSize = 'sm' | 'md' | 'lg';

const sizes: Record<GradientButtonSize, string> = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-3 text-sm',
  lg: 'px-8 py-4 text-base',
};

export interface GradientButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  size?: GradientButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
  children?: ReactNode;
}

export const GradientButton = forwardRef<HTMLButtonElement, GradientButtonProps>(function GradientButton(
  { size = 'md', isLoading = false, fullWidth = false, disabled, className, children, type = 'button', ...props },
  ref,
) {
  const isDisabled = disabled || isLoading;
  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={isDisabled}
      whileHover={isDisabled ? undefined : { scale: 1.02, y: -2 }}
      whileTap={isDisabled ? undefined : { scale: 0.98 }}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold text-white',
        'bg-gradient-to-r from-brand-500 to-pink-500 shadow-md shadow-brand-500/20',
        'transition-shadow hover:shadow-lg hover:shadow-brand-500/30',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-60',
        sizes[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {isLoading && <Spinner size="sm" className="text-white" />}
      {children}
    </motion.button>
  );
});
