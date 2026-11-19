import type { ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/cn';

export interface CardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children?: ReactNode;
  /** Lift on hover. Only use for cards that are themselves clickable. */
  hoverable?: boolean;
  padded?: boolean;
}

export function Card({ children, hoverable = false, padded = true, className, ...props }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={hoverable ? { y: -2 } : undefined}
      transition={{ duration: 0.2 }}
      className={cn(
        'rounded-card border border-gray-200 bg-white shadow-card',
        hoverable && 'transition-shadow hover:border-brand-200 hover:shadow-card-hover',
        padded && 'p-5 sm:p-6',
        className,
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  /** Heading level; pages use h1, so cards default to h2. */
  as?: 'h2' | 'h3';
}

export function CardHeader({ title, subtitle, action, as: Heading = 'h2' }: CardHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <Heading className="text-base font-semibold text-gray-900">{title}</Heading>
        {subtitle && <p className="mt-0.5 text-sm text-gray-600">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
