import type { ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/cn';

export interface GlassCardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children?: ReactNode;
  hoverable?: boolean;
}

export function GlassCard({ children, hoverable = true, className, ...props }: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={hoverable ? { scale: 1.02, y: -5 } : undefined}
      transition={{ duration: 0.3 }}
      className={cn(
        'rounded-2xl border border-white/40 bg-white/60 p-6 shadow-xl shadow-brand-900/5 backdrop-blur-lg',
        className,
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
