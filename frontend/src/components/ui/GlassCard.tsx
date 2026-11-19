import type { ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/cn';

export interface GlassCardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children?: ReactNode;
  hoverable?: boolean;
}

/** Translucent card for pages that sit on <MeshBackground />. */
export function GlassCard({ children, hoverable = false, className, ...props }: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={hoverable ? { y: -3 } : undefined}
      transition={{ duration: 0.25 }}
      className={cn(
        'rounded-2xl border border-white/70 bg-white/80 p-6 shadow-xl shadow-brand-900/5 backdrop-blur-lg sm:p-8',
        className,
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
