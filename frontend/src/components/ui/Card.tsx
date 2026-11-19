import type { ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/cn';

export interface CardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children?: ReactNode;
  /** Lift on hover (default true). */
  hoverable?: boolean;
  padded?: boolean;
}

export function Card({ children, hoverable = true, padded = true, className, ...props }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={hoverable ? { y: -4, boxShadow: '0 12px 24px -8px rgba(76, 29, 149, 0.18)' } : undefined}
      transition={{ duration: 0.25 }}
      className={cn('rounded-2xl border border-gray-100 bg-white shadow-sm', padded && 'p-6', className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
