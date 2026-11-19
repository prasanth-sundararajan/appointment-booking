import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export interface PageWrapperProps {
  children: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Constrain width and add page padding (default true). */
  contained?: boolean;
}

export function PageWrapper({ children, title, subtitle, actions, className, contained = true }: PageWrapperProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={cn(contained && 'mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8', className)}
    >
      {(title || actions) && (
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            {title && <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">{title}</h1>}
            {subtitle && <p className="mt-1 text-gray-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
        </header>
      )}
      {children}
    </motion.div>
  );
}
